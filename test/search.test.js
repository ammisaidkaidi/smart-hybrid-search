import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SearchService } from '../src/index.js'

const products = JSON.parse(await readFile(new URL('../examples/products.sample.json', import.meta.url), 'utf8'))
const search = new SearchService(products)

test('indexes the catalog', () => {
  assert.equal(search.stats.totalDocs, products.length)
  assert.ok(search.stats.vocabSize > 50)
})

test('corrects keyboard typos (samsumg -> samsung)', () => {
  const r = search.search('samsumg galaxy')
  assert.equal(r.corrections[0].corrected, 'samsung')
  assert.match(r.results[0].product.title, /Samsung Galaxy/)
})

test('corrects transpositions (iphnoe -> iphone)', () => {
  const r = search.search('iphnoe 15 pro')
  assert.equal(r.correctedQuery.includes('iphone'), true)
  assert.match(r.results[0].product.title, /iPhone 15 Pro/)
})

test('Arabic transliteration (تلفون سامسونق -> samsung phones)', () => {
  const r = search.search('تلفون سامسونق')
  assert.match(r.results[0].product.title, /Samsung Galaxy/)
})

test('French semantic search finds English-named products', () => {
  const r = search.search('ecouteurs bluetooth')
  assert.ok(r.results.length > 0)
  assert.match(r.results[0].product.title, /Sony (WH|WF)-1000XM5/)
})

test('filters and pagination work', () => {
  const r = search.search('sony', { filters: { category: 'audio' }, page: 1, pageSize: 1 })
  assert.equal(r.results.length, 1)
  assert.equal(r.results[0].product.category, 'audio')
  assert.ok(r.total >= 2)
})

test('suggestions are frequency ordered', () => {
  const s = search.suggest('sam')
  assert.equal(s[0].text, 'samsung')
})

test('repeated queries are served from cache', () => {
  search.search('dior sauvage')
  const cached = search.search('dior sauvage')
  assert.equal(cached.fromCache, true)
})
