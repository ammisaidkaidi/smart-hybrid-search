/**
 * Central tuning for the whole search engine.
 * The VIEW never imports this directly for logic — it goes through
 * SearchService / useSearch. Keeping weights here makes the engine
 * easy to tune (and easy to move to a backend unchanged).
 */
export const SEARCH_CONFIG = {
  // Hybrid ranking weights — must be understandable, not magic.
  // Final score = Σ(weight × normalised sub-score) + boosts.
  weights: {
    lexical: 0.42, // BM25 over title / brand / category / description
    semantic: 0.28, // shared concepts (multilingual ontology + TF-IDF cosine)
    fuzzy: 0.18, // trigram similarity — last safety net for typos
    popularity: 0.12, // log(sales) + rating — breaks ties, never dominates
  },

  bm25: { k1: 1.4, b: 0.72 },

  spelling: {
    maxEditDistanceShort: 1, // words  < 5 chars
    maxEditDistanceLong: 2, // words >= 5 chars
    minConfidenceToAutoCorrect: 0.62,
    maxCandidatesPerToken: 5,
  },

  performance: {
    debounceMs: 180,
    pageSize: 24,
    cacheSize: 60, // LRU query cache — repeated queries are ~0 ms
    maxCandidates: 2500, // never rank the whole catalog — candidates only
  },
}

/** Field boosts used by BM25: a hit in the title matters more. */
export const FIELD_BOOSTS = {
  title: 3.0,
  brand: 2.4,
  category: 2.0,
  tags: 1.6,
  description: 1.0,
}
