/**
 * Example 03 — Production: same UI code, search runs on YOUR server.
 * HttpSearchService has the exact same interface as SearchService.
 * Your backend must implement POST /search and GET /suggest —
 * see the "Backend" section of the README for the contract.
 */
import { HttpSearchService } from '../src/index.js'

const search = new HttpSearchService(process.env.SEARCH_API_URL ?? 'http://localhost:8000/api')

// Identical call shape to the in-browser SearchService:
const result = await search.search('samsumg galaxy', { page: 1, pageSize: 24 })
console.log(result.correctedQuery, result.total, result.results[0]?.product.title)
