export interface Product {
  id: number | string
  sku?: string
  title: string
  brand: string
  category: string
  categoryLabels: string[]
  description: string
  price: number
  oldPrice?: number | null
  rating: number
  sales: number
  stock: number
  tags: string[]
  [key: string]: unknown
}

export interface SearchFilters {
  category?: string
  brand?: string
  maxPrice?: number
  inStock?: boolean
}

export interface Correction {
  original: string
  corrected: string
  method: string
  confidence: number
  alternatives: string[]
}

export interface RankedResult {
  product: Product
  score: number
  scores: { lexical: number; semantic: number; fuzzy: number; popularity: number }
  reasons: string[]
}

export interface SearchResult {
  results: RankedResult[]
  total: number
  page: number
  pageSize: number
  correctedQuery: string
  corrections: Correction[]
  concepts: string[]
  pipeline: Array<{ name: string; detail: string; ms: number }>
  candidatesScanned: number
  tookMs: number
  fromCache: boolean
}

export interface Suggestion {
  text: string
  freq: number
  type: string
}

export class SearchService {
  constructor(products: Product[])
  stats: { totalDocs: number; vocabSize: number; buildMs: number }
  search(
    query?: string,
    options?: { filters?: SearchFilters; page?: number; pageSize?: number },
  ): SearchResult
  suggest(prefix?: string, limit?: number): Suggestion[]
  readonly facets: {
    categories: Array<{ id: string; count: number }>
    brands: Array<{ id: string; count: number }>
  }
}

export class HttpSearchService {
  constructor(baseUrl?: string)
  search(
    query?: string,
    options?: { filters?: SearchFilters; page?: number; pageSize?: number },
  ): Promise<SearchResult>
  suggest(prefix?: string, limit?: number): Promise<Suggestion[]>
}

export const SEARCH_CONFIG: {
  weights: { lexical: number; semantic: number; fuzzy: number; popularity: number }
  spelling: { minConfidenceToAutoCorrect: number; [key: string]: unknown }
  performance: { debounceMs: number; pageSize: number; cacheSize: number; maxCandidates: number }
  [key: string]: unknown
}

export const CONCEPTS: Record<string, { terms: string[] }>
export const STOPWORDS: Set<string>
export const TRANSLITERATION_ALIASES: Map<string, string>
export function normalizeForIndex(text?: string): string
export function tokenize(text?: string): string[]
export function detectScript(token?: string): 'ar' | 'latin' | 'other'
export function buildIndex(products: Product[]): unknown
export class SpellCorrector {
  constructor(vocabStats: Map<string, unknown>)
  correct(
    tokens: string[],
    contextCategories?: Set<string>,
  ): { tokens: string[]; corrections: Correction[] }
}
