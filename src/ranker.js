/**
 * HYBRID RANKER
 * -------------
 * Every candidate document gets FOUR explainable sub-scores; the UI
 * shows this breakdown so users (and developers) can see WHY a
 * product ranked where it did. No black box.
 *
 *   final = 0.42·BM25 + 0.28·semantic + 0.18·fuzzy + 0.12·popularity
 *           + exact-phrase boost + in-stock boost
 */
import { SEARCH_CONFIG } from './config.js'
import { idf } from './indexer.js'
import { semanticScore } from './semantic.js'
import { trigrams } from './normalize.js'

function dice(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const g of a) if (b.has(g)) inter++
  return (2 * inter) / (a.size + b.size)
}

function tokenGrams(index, token) {
  let grams = index.tokenTrigramCache.get(token)
  if (!grams) index.tokenTrigramCache.set(token, (grams = trigrams(token)))
  return grams
}

function bm25(index, queryTokens, docIdx) {
  const { k1, b } = SEARCH_CONFIG.bm25
  const docVec = index.docVectors[docIdx]
  const dl = index.docLengths[docIdx] || 1
  let score = 0
  for (const token of new Set(queryTokens)) {
    const tf = docVec?.get(token)
    if (!tf) continue
    const w = idf(index, token)
    score += w * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / index.avgDocLength)))
  }
  return score
}

function fuzzyScore(index, queryGrams, docIdx) {
  if (!queryGrams.length) return 0
  const titleTokens = index.docTitleTokens[docIdx] ?? []
  let bestSum = 0
  for (const qg of queryGrams) {
    let best = 0
    for (const tt of titleTokens) best = Math.max(best, dice(qg, tokenGrams(index, tt)))
    bestSum += best
  }
  return bestSum / queryGrams.length
}

export function rankCandidates(index, candidateIds, query) {
  const { weights } = SEARCH_CONFIG
  const queryGrams = query.tokens.map((t) => trigrams(t)) // built once, reused per doc
  const rows = []

  // First pass: raw BM25 to normalise against this query's maximum
  const raw = candidateIds.map((docIdx) => ({ docIdx, bm25: bm25(index, query.tokens, docIdx) }))
  const maxBm25 = Math.max(...raw.map((r) => r.bm25), 0.0001)
  const phrase = query.tokens.join(' ')

  for (const { docIdx, bm25: rawBm25 } of raw) {
    const product = index.products[docIdx]
    const lexical = rawBm25 / maxBm25
    const semantic = semanticScore(index, query.tokens, query.concepts, docIdx)
    const fuzzy = fuzzyScore(index, queryGrams, docIdx)
    const popularity = Math.min(1, (Math.log10(1 + product.sales) / 5) * 0.7 + (product.rating / 5) * 0.3)

    let score = weights.lexical * lexical + weights.semantic * semantic + weights.fuzzy * fuzzy + weights.popularity * popularity
    const reasons = []
    if (phrase.length > 3 && (index.docNormalizedTitles[docIdx] ?? '').includes(phrase)) {
      score += 0.12
      reasons.push('Exact phrase in title')
    }
    if (product.stock > 0) score += 0.02
    score = Math.min(1, score)
    if (lexical > 0.65) reasons.push('Strong keyword match')
    if (semantic > 0.45) reasons.push('Semantic / concept match')
    if (fuzzy > 0.6 && lexical < 0.4) reasons.push('Fuzzy match (typo-tolerant)')
    if (popularity > 0.75) reasons.push('Popular & well rated')

    rows.push({
      product,
      score,
      scores: {
        lexical: Number(lexical.toFixed(3)),
        semantic: Number(semantic.toFixed(3)),
        fuzzy: Number(fuzzy.toFixed(3)),
        popularity: Number(popularity.toFixed(3)),
      },
      reasons,
    })
  }

  return rows.sort((a, b) => b.score - a.score)
}
