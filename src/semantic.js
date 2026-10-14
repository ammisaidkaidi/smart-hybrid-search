/**
 * LIGHTWEIGHT SEMANTICS (browser-friendly, backend-replaceable)
 * ------------------------------------------------------------
 * We approximate embeddings with two sparse vector spaces:
 *
 *  1) CONCEPT space — multilingual ontology (see dictionaries.js).
 *     "écouteurs sans fil" and "سماعات لاسلكية" share {headphones,
 *     wireless} even though they share ZERO characters. This is what
 *     makes Arabic ↔ French ↔ English cross-language search work.
 *
 *  2) TF-IDF token space — cosine between query vector and document
 *     vector, computed ONLY over the candidate pool (never the whole catalog).
 *
 * Backend upgrade path: replace `conceptVectorForQuery` with real
 * embeddings (e.g. multilingual-e5 via API) and keep the same
 * { semanticScore(doc) } interface — the ranker does not care.
 */
import { TERM_TO_CONCEPT, conceptForToken } from './dictionaries.js'
import { idf } from './indexer.js'
import { normalizeForIndex } from './normalize.js'

export function conceptsForTokens(tokens, rawText = '') {
  const concepts = new Set()
  for (const token of tokens) {
    const c = conceptForToken(token)
    if (c) concepts.add(c)
  }
  const normalised = normalizeForIndex(rawText)
  for (const [phrase, concept] of TERM_TO_CONCEPT) {
    if (phrase.includes(' ') && normalised.includes(phrase)) concepts.add(concept)
  }
  return concepts
}

/** Concept overlap → 0..1 (Jaccard weighted toward query coverage). */
export function conceptScore(queryConcepts, docConcepts) {
  if (!queryConcepts.size || !docConcepts?.size) return 0
  let inter = 0
  for (const c of queryConcepts) if (docConcepts.has(c)) inter++
  return inter / queryConcepts.size
}

function docNorm(index, docIdx, docVec) {
  let norm = index.docNormCache.get(docIdx)
  if (norm !== undefined) return norm
  let sum = 0
  let counted = 0
  for (const [token, tf] of docVec) {
    if (counted++ > 40) break
    const w = idf(index, token)
    sum += Math.pow(w * Math.log(1 + tf), 2)
  }
  norm = Math.sqrt(sum)
  index.docNormCache.set(docIdx, norm)
  return norm
}

/** Sparse TF-IDF cosine between the query and ONE document vector. */
export function tfidfCosine(index, queryTokens, docIdx) {
  const docVec = index.docVectors[docIdx]
  if (!docVec) return 0
  let dot = 0
  let qNorm = 0
  const seen = new Set()
  for (const token of queryTokens) {
    if (seen.has(token)) continue
    seen.add(token)
    const w = idf(index, token)
    qNorm += w * w
    const tf = docVec.get(token)
    if (tf) dot += w * w * Math.log(1 + tf)
  }
  const dNorm = docNorm(index, docIdx, docVec)
  if (!qNorm || !dNorm) return 0
  return dot / (Math.sqrt(qNorm) * dNorm)
}

export function semanticScore(index, queryTokens, queryConcepts, docIdx) {
  const concept = conceptScore(queryConcepts, index.docConcepts[docIdx])
  const cosine = tfidfCosine(index, queryTokens, docIdx)
  // Concepts carry cross-language meaning; cosine refines within language.
  return Math.min(1, concept * 0.72 + cosine * 0.55)
}
