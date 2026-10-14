/**
 * PRODUCTION DROP-IN REPLACEMENT (not used by the demo by default).
 *
 * Same public interface as SearchService — the Vue components and the
 * useSearch composable do not change at all. Point VITE_API_URL to a
 * backend implementing the contract in server-example/README.md
 * (FastAPI + OpenSearch + Qdrant/pgvector recommended at 60k+ docs,
 * though honestly Postgres FTS + pgvector also handles 60k easily).
 */
export class HttpSearchService {
  constructor(baseUrl = import.meta.env.VITE_API_URL ?? '/api') {
    this.baseUrl = baseUrl
    this.stats = { totalDocs: 0, vocabSize: 0, buildMs: 0 }
  }

  async search(rawQuery = '', { filters = {}, page = 1, pageSize = 24 } = {}) {
    const res = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: rawQuery, filters, page, pageSize }),
    })
    if (!res.ok) throw new Error(`Search API ${res.status}`)
    return res.json() // must match SearchService.search() return shape
  }

  async suggest(prefix = '', limit = 8) {
    const res = await fetch(`${this.baseUrl}/suggest?q=${encodeURIComponent(prefix)}&limit=${limit}`)
    if (!res.ok) return []
    return res.json()
  }

  get facets() {
    return { categories: [], brands: [] } // fetch from /facets in real app
  }
}
