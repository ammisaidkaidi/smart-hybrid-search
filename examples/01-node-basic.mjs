/**
 * Example 01 — Node.js basic usage
 * Run:  npm run example        (or: node examples/01-node-basic.mjs)
 */
import { readFile } from 'node:fs/promises'
import { SearchService } from '../src/index.js'

const products = JSON.parse(await readFile(new URL('./products.sample.json', import.meta.url), 'utf8'))

// 1) Build the index once (inverted index + vocabulary + concepts)
const search = new SearchService(products)
console.log(`Indexed ${search.stats.totalDocs} products, vocabulary: ${search.stats.vocabSize} words\n`)

// 2) Search — typos, Arabic, French and semantic queries all work
const queries = [
  'samsumg galaxy', // keyboard typo -> samsung
  'iphnoe 15 pro', // transposition -> iphone
  'sony casque bluetooth', // French + brand
  'سماعات بلوتوت', // Arabic typo -> سماعات بلوتوث
  'تلفون سامسونق', // Arabic transliteration -> telephone samsung
  'cheap wireless headphones', // English semantic concepts
  'playstaton 5', // gaming typo
  'lave linge samsung', // French appliance term
]

for (const q of queries) {
  const r = search.search(q)
  console.log(`"${q}"`)
  if (r.correctedQuery !== q.toLowerCase()) console.log(`  ↳ did you mean: "${r.correctedQuery}"`, r.corrections)
  console.log(`  ↳ ${r.total} results in ${r.tookMs} ms — top: ${r.results[0]?.product.title ?? 'none'}`)
}

// 3) Filters + pagination
const page = search.search('sony', { filters: { category: 'audio', inStock: true }, page: 1, pageSize: 5 })
console.log(`\nFiltered (Sony, audio, in stock): ${page.total} results`)

// 4) Autocomplete suggestions
console.log('Suggestions for "sam":', search.suggest('sam'))

// 5) Facets for filter UI
console.log('Categories:', search.facets.categories)
