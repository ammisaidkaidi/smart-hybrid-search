/**
 * Example 02 — Vue 3 usage (the pattern used by the live demo).
 * The library itself is framework-agnostic: keep the SearchService
 * OUTSIDE deep reactivity. It uses private class methods, so a normal
 * Vue ref() Proxy would break it — use shallowRef + markRaw.
 *
 * npm i smart-hybrid-search vue
 */
import { computed, markRaw, ref, shallowRef } from 'vue'
import { SearchService } from 'smart-hybrid-search'

export function useSearch(products) {
  // ⚠️ shallowRef + markRaw — do not use a plain ref() for the service
  const service = shallowRef(null)
  const query = ref('')
  const result = ref(null)
  const page = ref(1)

  function init() {
    service.value = markRaw(new SearchService(products))
    run()
  }

  let timer
  function onInput(value) {
    query.value = value
    clearTimeout(timer)
    timer = setTimeout(() => {
      page.value = 1
      run()
    }, 180) // debounce
  }

  function run() {
    if (!service.value) return
    result.value = service.value.search(query.value, { page: page.value })
  }

  const suggestions = computed(() =>
    service.value && query.value ? service.value.suggest(query.value) : [],
  )

  return { query, result, suggestions, init, onInput, run }
}

/* In a component:
<script setup>
import { onMounted } from 'vue'
import { useSearch } from './useSearch.js'
import products from './products.json' // your catalog (see README for the format)

const { query, result, init, onInput } = useSearch(products)
onMounted(init)
</script>

<template>
  <input :value="query" @input="onInput($event.target.value)" placeholder="Search…" />
  <p v-if="result?.corrections.length">
    Did you mean {{ result.correctedQuery }}?
  </p>
  <article v-for="item in result?.results" :key="item.product.id">
    {{ item.product.title }} — score {{ item.score.toFixed(2) }}
    (BM25 {{ item.scores.lexical }}, semantic {{ item.scores.semantic }},
     fuzzy {{ item.scores.fuzzy }}, popularity {{ item.scores.popularity }})
  </article>
</template>
*/
