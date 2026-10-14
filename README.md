# smart-hybrid-search

Smart **semantic + hybrid search** with **multi-step spelling correction** for **Arabic · French · English** product catalogs.

BM25 keywords + multilingual semantic concepts + typo-tolerant fuzzy matching + popularity — combined into one explainable score. **Zero dependencies**, framework-agnostic: Node, browser, Vue, React, or behind your own API.

```bash
npm install smart-hybrid-search
```

| Query your users type | Library understands | Top result |
|---|---|---|
| `samsumg galaxy` | Samsung (keyboard typo) | Samsung Galaxy S24 Ultra |
| `iphnoe 15 pro` | iPhone (transposed letters) | iPhone 15 Pro Max |
| `سماعات بلوتوت` | سماعات بلوتوث (Arabic typo) | Sony WF-1000XM5 |
| `تلفون سامسونق` | telephone + Samsung (transliteration) | Samsung Galaxy S24 |
| `ecouteurs sans fil pas cher` | headphones + wireless + cheap | Wireless earbuds |
| `playstaton 5` | PlayStation | PlayStation 5 Slim |

---

## Quick start (Node.js)

```js
import { SearchService } from 'smart-hybrid-search'

const products = [
  {
    id: 1,
    sku: 'SKU-001',
    title: 'Samsung Galaxy S24 Ultra — 256GB · Black',
    brand: 'Samsung',
    category: 'smartphones',
    categoryLabels: ['Smartphones', 'Smartphones', 'هواتف ذكية'], // EN · FR · AR
    description: 'Snapdragon 8 Gen 3, 200MP camera, S Pen, Galaxy AI.',
    price: 238000,
    oldPrice: null,
    rating: 4.8,
    sales: 17100,
    stock: 24,
    tags: ['samsung', 'smartphone', 'telephone portable', 'هاتف ذكي', '5g'],
  },
  // …your whole catalog (tested with 3,000–60,000 products)
]

// 1) Build the index ONCE (inverted index + vocabulary + concepts)
const search = new SearchService(products)

// 2) Search anything — typos welcome
const result = search.search('samsumg galaxy')

result.correctedQuery // "samsung galaxy"
result.corrections    // [{ original: 'samsumg', corrected: 'samsung',
                      //    method: 'edit-distance', confidence: 0.77, alternatives: [] }]
result.total          // number of results
result.tookMs         // e.g. 24.6
result.results[0].product.title // "Samsung Galaxy S24 Ultra — 256GB · Black"
result.results[0].score         // hybrid score 0..1
result.results[0].scores        // { lexical, semantic, fuzzy, popularity } — why it ranked
result.concepts       // semantic concepts detected, e.g. ['smartphone']
```

Run the bundled example (12 real products, 8 demo queries):

```bash
git clone https://github.com/ammisaidkaidi/smart-hybrid-search.git
cd smart-hybrid-search
npm test            # 8 passing tests
npm run example     # node examples/01-node-basic.mjs
```

More examples: [`examples/01-node-basic.mjs`](examples/01-node-basic.mjs) ·
[`examples/02-vue-composable.js`](examples/02-vue-composable.js) ·
[`examples/03-http-backend.mjs`](examples/03-http-backend.mjs) ·
[`examples/products.sample.json`](examples/products.sample.json)

---

## How to use the library

### 1. Prepare your data

Only these fields are required per product (extra fields are kept and returned untouched):

| Field | Type | Notes |
|---|---|---|
| `id` | number/string | unique |
| `title` | string | product name (any language) |
| `brand` | string | |
| `category` | string | category id, used by filters/facets |
| `categoryLabels` | string[] | category name in EN/FR/AR |
| `description` | string | key features/specs help semantics a lot |
| `price` | number | any currency |
| `rating` | number | 0–5 |
| `sales` | number | popularity signal |
| `stock` | number | 0 = out of stock |
| `tags` | string[] | synonyms, translations, type words (`casque`, `سماعات`…) |

Loading 3,000 products from JSON/API is typically ~10 lines — fetch, index once, serve every keystroke from the index.

### 2. Search with filters & pagination

```js
const page = search.search('sony casque', {
  filters: { category: 'audio', brand: 'Sony', maxPrice: 60000, inStock: true },
  page: 2,
  pageSize: 24,
})
```

### 3. “Did you mean” + autocomplete

```js
if (result.corrections.length) {
  showBanner(`Did you mean “${result.correctedQuery}”?`)
}

search.suggest('sam') // [{ text: 'samsung', freq: 290, type: 'word' }, …]
search.facets         // { categories: [{id, count}…], brands: [{id, count}…] }
search.stats          // { totalDocs, vocabSize, buildMs }
```

### 4. Vue 3 (same pattern for React/Svelte — it's plain JS)

```js
import { markRaw, ref, shallowRef } from 'vue'
import { SearchService } from 'smart-hybrid-search'

// ⚠️ Use shallowRef + markRaw for the service instance.
// The engine uses private class methods; a normal Vue ref() Proxy breaks them.
const service = shallowRef(null)
const query = ref('')
const result = ref(null)

service.value = markRaw(new SearchService(products))

function onInput(value) {
  query.value = value
  result.value = service.value.search(value) // debounce ~180 ms in real UIs
}
```

Full composable: [`examples/02-vue-composable.js`](examples/02-vue-composable.js).
A complete working demo (Vue 3 + DaisyUI, 3,000 real products):
**[github.com/ammisaidkaidi/smart-hybrid-search](https://github.com/ammisaidkaidi)** — see the demo app built on this library.

### 5. Browser (no bundler)

```html
<script type="module">
  import { SearchService } from 'https://esm.sh/smart-hybrid-search@1.0.0'

  const products = await (await fetch('/products.json')).json()
  const search = new SearchService(products)
  console.log(search.search('iphnoe 15').results[0].product.title)
</script>
```

### 6. Production backend (optional)

Same interface, search executed on your server:

```js
import { HttpSearchService } from 'smart-hybrid-search'

const search = new HttpSearchService('https://api.example.com/api')
const result = await search.search('samsumg galaxy', { page: 1, pageSize: 24 })
```

Your API implements (response shape = `SearchService.search()` return):

```http
POST /api/search
{ "query": "samsumg galaxy", "filters": { "category": "", "brand": "", "maxPrice": 0, "inStock": false }, "page": 1, "pageSize": 24 }

GET  /api/suggest?q=sam&limit=8
→ [{ "text": "samsung", "freq": 290, "type": "word" }]
```

At 60k+ products, Postgres FTS (`tsvector` + `pg_trgm` + `pgvector` with multilingual embeddings) or OpenSearch + Qdrant are good fits; port the corrector steps 1:1 — the logic has no framework dependencies.

---

## How it works

### Multi-step spelling correction

1. **Normalise** — lowercase, FR accents folded, Arabic diacritics removed (إ/أ→ا، ة→ه، ى→ي)
2. **Transliteration** — `سامسونق` → `samsung`, `ايفون` → `iphone`, `تلفون` → `telephone`
3. **Exact vocabulary check** — correction is tuned to *your* catalog vocabulary
4. **Split & merge** — `sam sung` → `samsung`, `samsunggalaxy` → `samsung galaxy`
5. **Keyboard-aware edit distance** — AZERTY/QWERTY neighbour keys cost less; transpositions handled
6. **Phonetic matching** — sound-alike folding (ص/س, ph→f, doubled letters)
7. **Trigram fallback + contextual re-ranking** — frequency + the other words in the query

Only corrections with confidence ≥ 0.62 are auto-applied; below that the original word is kept and fuzzy search handles it (a wrong auto-correction is worse than none).

### Hybrid ranking (explainable)

```
final = 0.42·BM25 + 0.28·semantic + 0.18·fuzzy + 0.12·popularity + boosts
```

Every result carries its sub-scores in `result.results[i].scores`, so your UI can show **why** each product ranked where it did. Weights are tunable in `SEARCH_CONFIG` (`src/config.js`).

### Semantics without a vector DB

A multilingual **concept ontology** (EN/FR/AR synonyms: `écouteurs = سماعات = headphones`) plus TF-IDF cosine over candidates gives cross-language semantic search with no model downloads. The upgrade path to real embeddings (e.g. multilingual-e5 + pgvector/Qdrant) keeps the same `SearchService` interface.

### Performance design

- Index **once**: inverted index, vocabulary trigram index, concept sets, TF vectors
- Searches only rank **candidates** from index postings (never a full catalog scan), capped by `maxCandidates`
- 60-entry LRU query cache (repeated queries ≈ 0 ms)
- On 3,000 real products: index builds in ~0.2–0.3 s, typical searches take **5–60 ms** in the browser

---

## API reference

### `new SearchService(products)`
Builds all indexes. Throws nothing on empty arrays, but an empty catalog returns empty results.

| Member | Description |
|---|---|
| `.search(query, { filters, page, pageSize })` | Full pipeline → `SearchResult` |
| `.suggest(prefix, limit = 8)` | Autocomplete from catalog vocabulary |
| `.facets` | `{ categories: [{id, count}], brands: [{id, count}] }` for filter UIs |
| `.stats` | `{ totalDocs, vocabSize, buildMs }` |

### Exports

```js
import {
  SearchService,        // in-browser / Node engine
  HttpSearchService,    // API-backed drop-in replacement
  SEARCH_CONFIG,        // ranking weights & thresholds
  CONCEPTS,             // multilingual ontology (extend it!)
  TRANSLITERATION_ALIASES,
  normalizeForIndex, tokenize, detectScript,
  buildIndex, SpellCorrector,
} from 'smart-hybrid-search'
```

TypeScript definitions are included (`src/index.d.ts`).

---

## Extending

- **Add concepts/synonyms:** edit `CONCEPTS` in `src/dictionaries.js` (one concept → EN/FR/AR terms).
- **Add transliterations:** `TRANSLITERATION_ALIASES` (Arabic-script brand names → canonical tokens).
- **Tune ranking:** `SEARCH_CONFIG.weights` — keep sub-scores explainable.
- **Your data:** better `description`/`tags` (real specs + synonyms) = better semantic results. This matters more than any weight tuning.

## Development

```bash
npm test          # node --test — correction, AR/FR/EN, filters, cache
npm run example   # runs examples/01-node-basic.mjs
```

## License

MIT © ammisaidkaidi
