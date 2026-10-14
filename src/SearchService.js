/**
 * SearchService — THE public interface of the search engine.
 * ==========================================================
 * The Vue view only ever calls:
 *
 *     const service = new SearchService(products)
 *     const page = service.search(query, { filters, page })
 *     const ideas = service.suggest(prefix)
 *
 * Nothing in components/ knows about BM25, trigrams or correction.
 * To go to production you swap this class for HttpSearchService
 * (same methods, fetch() to your API) — the UI does not change.
 * See server-example/ for the matching backend contract.
 *
 * PIPELINE (each step timed, shown in the UI):
 *  1 normalise → 2 tokenise → 3 detect context → 4 correct spelling
 *  → 5 expand concepts/synonyms → 6 gather candidates (inverted +
 *  trigram indexes, never a full catalog scan) → 7 hybrid rank →
 *  8 filter + paginate
 */
import { SEARCH_CONFIG } from './config.js'
import { STOPWORDS } from './dictionaries.js'
import { buildIndex } from './indexer.js'
import { tokenize, trigrams } from './normalize.js'
import { rankCandidates } from './ranker.js'
import { conceptsForTokens } from './semantic.js'
import { SpellCorrector } from './spellCorrector.js'

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class SearchService {
  constructor(products) {
    const t0 = now()
    this.index = buildIndex(products)
    this.corrector = new SpellCorrector(this.index.vocab)
    this.cache = new Map()
    this.buildMs = Math.round(now() - t0)
    this.stats = {
      totalDocs: this.index.totalDocs,
      vocabSize: this.index.vocab.size,
      buildMs: this.buildMs,
    }
  }

  #cached(key, compute) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key)
      this.cache.delete(key)
      this.cache.set(key, value) // LRU touch
      return { ...value, fromCache: true, tookMs: 0 }
    }
    const value = compute()
    this.cache.set(key, value)
    if (this.cache.size > SEARCH_CONFIG.performance.cacheSize) {
      this.cache.delete(this.cache.keys().next().value)
    }
    return value
  }

  /** Candidate docIds from exact tokens + concept postings + trigrams. */
  #gatherCandidates(tokens, concepts) {
    const ids = new Set()
    const { inverted, trigramIndex, docConcepts } = this.index

    for (const token of tokens) {
      for (const id of inverted.get(token) ?? []) ids.add(id)
      // Fuzzy pool: vocab tokens sharing trigrams with the query token
      // (Dice > 0.35), expanded through the inverted index.
      const queryGrams = trigrams(token)
      const counts = new Map()
      for (const g of queryGrams) {
        for (const vocabToken of trigramIndex.get(g) ?? []) {
          counts.set(vocabToken, (counts.get(vocabToken) ?? 0) + 1)
        }
      }
      for (const [vocabToken, shared] of counts) {
        if (vocabToken === token) continue
        const dice = (2 * shared) / (queryGrams.size + trigrams(vocabToken).size)
        if (dice > 0.35) for (const id of inverted.get(vocabToken) ?? []) ids.add(id)
      }
    }
    // Semantic pool: every doc sharing a concept (capped for safety)
    if (concepts.size) {
      let added = 0
      for (const [docIdx, docConceptsSet] of docConcepts.entries()) {
        if (added > 4000) break
        for (const c of concepts) {
          if (docConceptsSet.has(c)) {
            if (!ids.has(docIdx)) added++
            ids.add(docIdx)
            break
          }
        }
      }
    }
    return [...ids].slice(0, SEARCH_CONFIG.performance.maxCandidates * 2)
  }

  search(rawQuery = '', { filters = {}, page = 1, pageSize = SEARCH_CONFIG.performance.pageSize } = {}) {
    const cacheKey = JSON.stringify({ rawQuery, filters, page, pageSize })
    return this.#cached(cacheKey, () => {
      const started = now()
      const pipeline = []
      const step = (name, detail, t0) => pipeline.push({ name, detail, ms: Number((now() - t0).toFixed(2)) })

      // 1–2 · Normalise + tokenise (stopwords kept for correction display, dropped for ranking)
      let t = now()
      const allTokens = tokenize(rawQuery)
      const tokens0 = allTokens.filter((w) => !STOPWORDS.has(w))
      step('Normalise & tokenise', `${allTokens.length} token(s), accents/diacritics folded`, t)

      // 3 · Context: guess likely categories from exact tokens (helps correction step 6)
      t = now()
      const contextCategories = new Set()
      for (const token of tokens0) {
        const stats = this.index.vocab.get(token)
        if (stats) {
          const top = [...stats.categories.entries()].sort((a, b) => b[1] - a[1])[0]
          if (top) contextCategories.add(top[0])
        }
      }
      step('Detect context', contextCategories.size ? `likely: ${[...contextCategories].join(', ')}` : 'no strong context', t)

      // 4 · Multi-step spelling correction
      t = now()
      const { tokens: correctedTokens, corrections } = this.corrector.correct(tokens0, contextCategories)
      const correctedQuery = correctedTokens.join(' ')
      step(
        'Correct spelling (multi-step)',
        corrections.length ? corrections.map((c) => `${c.original}→${c.corrected} (${c.method})`).join(' · ') : 'no correction needed',
        t,
      )

      // 5 · Semantic expansion (concepts / synonyms, AR-FR-EN)
      t = now()
      const concepts = conceptsForTokens(correctedTokens, correctedQuery)
      step('Semantic expansion', concepts.size ? `concepts: ${[...concepts].join(', ')}` : 'no concept matched', t)

      // 6 · Candidates (index lookups only)
      t = now()
      const queryTokens = correctedTokens.length ? correctedTokens : tokens0
      const candidateIds = rawQuery.trim() ? this.#gatherCandidates(queryTokens, concepts) : this.index.products.map((_, i) => i)
      step('Gather candidates', `${candidateIds.length} candidate(s) from ${this.stats.totalDocs.toLocaleString()} products (no full scan)`, t)

      // 7 · Hybrid ranking
      t = now()
      const ranked = rawQuery.trim()
        ? rankCandidates(this.index, candidateIds, { tokens: queryTokens, concepts })
        : this.index.products.map((product) => ({
            product,
            score: product.sales / 30000,
            scores: { lexical: 0, semantic: 0, fuzzy: 0, popularity: Number(Math.min(1, product.sales / 22000).toFixed(3)) },
            reasons: ['Popular product'],
          })).sort((a, b) => b.score - a.score)
      step('Hybrid rank (BM25 + semantic + fuzzy + popularity)', `${ranked.length} ranked`, t)

      // 8 · Filter + paginate
      t = now()
      const filtered = ranked.filter(({ product }) => {
        if (filters.category && product.category !== filters.category) return false
        if (filters.brand && product.brand !== filters.brand) return false
        if (filters.maxPrice && product.price > filters.maxPrice) return false
        if (filters.inStock && product.stock <= 0) return false
        return true
      })
      const total = filtered.length
      const results = filtered.slice((page - 1) * pageSize, page * pageSize)
      step('Filter & paginate', `${total} after filters · page ${page}`, t)

      return {
        results,
        total,
        page,
        pageSize,
        correctedQuery,
        corrections,
        concepts: [...concepts],
        pipeline,
        candidatesScanned: candidateIds.length,
        tookMs: Number((now() - started).toFixed(2)),
        fromCache: false,
      }
    })
  }

  /** Autocomplete: vocab prefixes + brands + categories, frequency-ordered. */
  suggest(prefix = '', limit = 8) {
    const p = tokenize(prefix).pop() ?? ''
    if (p.length < 2) return []
    const out = []
    for (const [token, stats] of this.index.vocab) {
      if (token.startsWith(p) && token !== p) out.push({ text: token, freq: stats.freq, type: 'word' })
    }
    return out.sort((a, b) => b.freq - a.freq).slice(0, limit)
  }

  get facets() {
    const categories = new Map()
    const brands = new Map()
    for (const p of this.index.products) {
      categories.set(p.category, (categories.get(p.category) ?? 0) + 1)
      brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1)
    }
    return {
      categories: [...categories.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
      brands: [...brands.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 18),
    }
  }
}
