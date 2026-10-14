/**
 * INDEXING — done ONCE at startup (or once per DB sync in production).
 *
 * For a large catalog a naive "scan everything per keystroke" is too
 * slow, so we build:
 *  - inverted index   token → [docIds]           (lexical / BM25)
 *  - trigram index    trigram → [docIds]        (fuzzy candidate pool,
 *                        title/brand/category tokens only — enough for
 *                        typo tolerance, far cheaper to build)
 *  - vocabulary stats token → { freq, categories } (spelling correction)
 *  - concept sets     docId → Set(conceptId)     (lightweight semantics)
 *  - doc TF vectors   docId → Map(token → tf)    (TF-IDF cosine on candidates)
 *
 * Posting lists are added once per DISTINCT token per document; term
 * frequency lives in the TF vector. That keeps large builds fast.
 *
 * A real backend does the same job with Elasticsearch/OpenSearch +
 * a vector DB (Qdrant/pgvector).
 */
import { FIELD_BOOSTS } from './config.js'
import { TERM_TO_CONCEPT, conceptForToken } from './dictionaries.js'
import { normalizeForIndex, tokenize, trigrams } from './normalize.js'

const PHRASE_CONCEPTS = [...TERM_TO_CONCEPT.entries()].filter(([phrase]) => phrase.includes(' '))

export function searchableFields(product) {
  return [
    { name: 'title', text: product.title, boost: FIELD_BOOSTS.title },
    { name: 'brand', text: product.brand, boost: FIELD_BOOSTS.brand },
    { name: 'category', text: product.categoryLabels.join(' '), boost: FIELD_BOOSTS.category },
    { name: 'tags', text: product.tags.join(' '), boost: FIELD_BOOSTS.tags },
    { name: 'description', text: product.description, boost: FIELD_BOOSTS.description },
  ]
}

export function buildIndex(products) {
  const inverted = new Map()
  const trigramIndex = new Map()
  const vocab = new Map()
  const docConcepts = new Array(products.length)
  const docVectors = new Array(products.length)
  const docTitleTokens = new Array(products.length)
  const docNormalizedTitles = new Array(products.length)
  const docLengths = new Float32Array(products.length)
  let totalLength = 0

  const addTo = (map, key, docIdx) => {
    let arr = map.get(key)
    if (!arr) map.set(key, (arr = []))
    arr.push(docIdx)
  }

  // Tokenisation cache: catalog text repeats a LOT (categories, brands,
  // templated descriptions). Caching per string keeps large builds fast.
  const tokenCache = new Map()
  const tokenizeCached = (text) => {
    let tokens = tokenCache.get(text)
    if (!tokens) tokenCache.set(text, (tokens = tokenize(text)))
    return tokens
  }

  products.forEach((product, docIdx) => {
    const tf = new Map()
    const uniqueTokens = new Set()
    const concepts = new Set()
    let length = 0

    for (const field of searchableFields(product)) {
      for (const token of tokenizeCached(field.text)) {
        length++
        tf.set(token, (tf.get(token) ?? 0) + field.boost)
        uniqueTokens.add(token)
        const concept = conceptForToken(token)
        if (concept) concepts.add(concept)
      }
    }

    // Multi-word concepts, e.g. "pas cher", "sans fil": all phrase
    // tokens present in the doc (order-insensitive — good enough here).
    for (const [phrase, concept] of PHRASE_CONCEPTS) {
      if (phrase.split(' ').every((w) => uniqueTokens.has(w))) concepts.add(concept)
    }

    for (const token of uniqueTokens) {
      addTo(inverted, token, docIdx)
      let v = vocab.get(token)
      if (!v) vocab.set(token, (v = { freq: 0, categories: new Map() }))
      v.freq++ // document frequency — better than raw count for correction
      v.categories.set(product.category, (v.categories.get(product.category) ?? 0) + 1)
    }
    docLengths[docIdx] = length
    totalLength += length
    docConcepts[docIdx] = concepts
    docVectors[docIdx] = tf
    docTitleTokens[docIdx] = tokenize(`${product.title} ${product.brand}`)
    docNormalizedTitles[docIdx] = normalizeForIndex(product.title)
  })

  // Vocabulary-level trigram index (trigram → vocab tokens), built once
  // over the vocabulary instead of once per document. Fuzzy candidate
  // generation resolves query trigrams → similar vocab tokens → their
  // inverted postings. Same results, a fraction of the build cost.
  for (const token of vocab.keys()) {
    for (const g of trigrams(token)) addTo(trigramIndex, g, token)
  }

  return {
    products,
    inverted,
    trigramIndex,
    idfCache: new Map(),
    tokenTrigramCache: new Map(),
    vocab,
    docConcepts,
    docVectors,
    docTitleTokens,
    docNormalizedTitles,
    docLengths,
    docNormCache: new Map(), // TF-IDF doc norms, computed lazily once per doc
    avgDocLength: totalLength / Math.max(products.length, 1),
    totalDocs: products.length,
  }
}

/** IDF with smoothing — rare tokens (brand/model) weigh more. */
export function idf(index, token) {
  let value = index.idfCache.get(token)
  if (value === undefined) {
    const df = index.inverted.get(token)?.length ?? 0
    value = Math.log(1 + (index.totalDocs - df + 0.5) / (df + 0.5))
    index.idfCache.set(token, value)
  }
  return value
}
