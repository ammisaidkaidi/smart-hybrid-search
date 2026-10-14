// smart-hybrid-search — public entry point.
// Framework-agnostic (no Vue/React/DOM imports): use it in Node,
// in any browser bundle, or behind an HTTP API.
export { SearchService } from './SearchService.js'
export { HttpSearchService } from './httpSearchService.js'
export { SEARCH_CONFIG } from './config.js'

// Advanced / extension points
export { CONCEPTS, STOPWORDS, TRANSLITERATION_ALIASES } from './dictionaries.js'
export { normalizeForIndex, tokenize, detectScript } from './normalize.js'
export { buildIndex } from './indexer.js'
export { SpellCorrector } from './spellCorrector.js'
