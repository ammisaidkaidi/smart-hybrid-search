/**
 * MULTI-STEP SPELLING CORRECTION (orthographe)
 * =============================================
 * A single edit-distance pass is NOT enough for real users. This
 * corrector runs ordered steps — cheapest / most certain first — and
 * records WHICH step fixed each token so the UI can explain it.
 *
 *  Step 1  Exact / accent-only      "telephone" == "téléphone" after normalise
 *  Step 2  Split & merge            "smart phone"→"smartphone", "sam sung"→"samsung"
 *  Step 3  Keyboard-aware edit dist "samsumg"→"samsung" (n/m neighbours), transpositions
 *  Step 4  Phonetic match           "samsong"→"samsung", "تلفون"→"تليفون"
 *  Step 5  Trigram fuzzy fallback   catches anything the above missed
 *  Step 6  Contextual re-ranking    candidates re-scored by (a) corpus frequency
 *                                   (b) the OTHER query words (category context):
 *                                   "apple telephon" prefers phone-vocab over fruit-vocab.
 *
 * Only corrections above `minConfidenceToAutoCorrect` are applied
 * automatically; below that we keep the original token and let the
 * fuzzy search layer deal with it (safer than a wrong "correction").
 */
import { SEARCH_CONFIG } from './config.js'
import { COMMON_WORDS, CONCEPTS, STOPWORDS, TRANSLITERATION_ALIASES, phoneticKey } from './dictionaries.js'
import { editDistance } from './levenshtein.js'
import { detectScript, trigrams } from './normalize.js'

export class SpellCorrector {
  /**
   * @param {Map<string,{freq:number, categories:Map<string,number>}>} vocabStats
   *        built by the indexer from your real catalog — correction
   *        is therefore tuned to YOUR data, not a generic dictionary.
   */
  constructor(vocabStats) {
    this.vocab = vocabStats
    for (const w of COMMON_WORDS) {
      if (!this.vocab.has(w)) this.vocab.set(w, { freq: 50, categories: new Map() })
    }
    // Concept vocabulary (بلوتوث، تليفون، رخيص…) is valid query language
    // even when product titles phrase it in another language.
    for (const { terms } of Object.values(CONCEPTS)) {
      for (const term of terms) {
        if (!term.includes(' ') && !this.vocab.has(term)) {
          this.vocab.set(term, { freq: 80, categories: new Map() })
        }
      }
    }
    // Phonetic index: phoneticKey -> [tokens]
    this.phoneticIndex = new Map()
    for (const token of this.vocab.keys()) {
      const key = phoneticKey(token)
      if (!this.phoneticIndex.has(key)) this.phoneticIndex.set(key, [])
      this.phoneticIndex.get(key).push(token)
    }
  }

  /** Candidate generation pruned by first letter + length (fast on large vocabularies). */
  #candidatesByEditDistance(token, maxDist) {
    const out = []
    for (const [candidate, stats] of this.vocab) {
      if (Math.abs(candidate.length - token.length) > maxDist) continue
      // Same first letter OR transposition of first two letters
      if (candidate[0] !== token[0] && candidate[1] !== token[0]) continue
      const d = editDistance(token, candidate)
      if (d <= maxDist) out.push({ token: candidate, distance: d, freq: stats.freq, method: 'edit-distance' })
    }
    return out
  }

  #candidatesByPhonetic(token) {
    const key = phoneticKey(token)
    return (this.phoneticIndex.get(key) ?? [])
      .filter((c) => c !== token)
      .map((c) => ({ token: c, distance: editDistance(token, c), freq: this.vocab.get(c).freq, method: 'phonetic' }))
  }

  #candidatesByTrigram(token) {
    const mine = trigrams(token)
    const out = []
    for (const [candidate, stats] of this.vocab) {
      if (Math.abs(candidate.length - token.length) > 3) continue
      let inter = 0
      const theirs = trigrams(candidate)
      for (const g of mine) if (theirs.has(g)) inter++
      const score = (2 * inter) / (mine.size + theirs.size)
      if (score > 0.45) out.push({ token: candidate, distance: editDistance(token, candidate), freq: stats.freq, method: 'trigram', trigram: score })
    }
    return out
  }

  /** Step 6: re-score candidates with frequency + query context. */
  #rescore(candidates, token, contextCategories) {
    const maxFreq = Math.max(...candidates.map((c) => c.freq), 1)
    return candidates
      .map((c) => {
        const stats = this.vocab.get(c.token)
        let contextBoost = 0
        if (stats && contextCategories.size) {
          for (const cat of contextCategories) contextBoost = Math.max(contextBoost, (stats.categories.get(cat) ?? 0) / Math.max(stats.freq, 1))
        }
        const lengthPenalty = Math.abs(c.token.length - token.length) * 0.04
        const confidence =
          (1 - c.distance / Math.max(token.length, 4)) * 0.62 +
          Math.log10(1 + c.freq) / Math.log10(1 + maxFreq) * 0.2 +
          contextBoost * 0.14 +
          (c.method === 'phonetic' ? 0.05 : 0) -
          lengthPenalty
        return { ...c, confidence: Math.max(0, Math.min(0.99, confidence)), contextBoost }
      })
      .sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Correct a token list.
   * @returns {{ tokens:string[], corrections:Array, merged:Array }}
   */
  correct(tokens, contextCategories = new Set()) {
    const { maxEditDistanceShort, maxEditDistanceLong, minConfidenceToAutoCorrect, maxCandidatesPerToken } =
      SEARCH_CONFIG.spelling
    const corrections = []
    const out = []
    let i = 0

    while (i < tokens.length) {
      const token = tokens[i]
      if (STOPWORDS.has(token) || token.length < 3 || /^\d+$/.test(token)) {
        out.push(token)
        i++
        continue
      }

      // Step 1b — cross-script transliteration: سامسونق → samsung, ايفون → iphone
      const alias = TRANSLITERATION_ALIASES.get(token)
      if (alias && alias !== token) {
        corrections.push({ original: token, corrected: alias, method: 'transliteration', confidence: 0.94, alternatives: [] })
        out.push(alias)
        i++
        continue
      }

      // Step 1 — exact (normalisation already handled accents)
      if (this.vocab.has(token)) {
        out.push(token)
        i++
        continue
      }

      // Step 2 — merge: "sam" + "sung" → "samsung"
      if (i + 1 < tokens.length) {
        const merged = token + tokens[i + 1]
        if (this.vocab.has(merged)) {
          corrections.push({ original: `${token} ${tokens[i + 1]}`, corrected: merged, method: 'merge', confidence: 0.95, alternatives: [] })
          out.push(merged)
          i += 2
          continue
        }
      }

      // Steps 3–5 — gather candidates from three strategies
      const maxDist = token.length < 5 ? maxEditDistanceShort : maxEditDistanceLong
      let candidates = [
        ...this.#candidatesByEditDistance(token, maxDist),
        ...this.#candidatesByPhonetic(token),
        ...this.#candidatesByTrigram(token),
      ]
      // De-duplicate keeping the best (lowest distance) entry per candidate
      const byToken = new Map()
      for (const c of candidates) if (!byToken.has(c.token) || c.distance < byToken.get(c.token).distance) byToken.set(c.token, c)
      candidates = this.#rescore([...byToken.values()], token, contextCategories).slice(0, maxCandidatesPerToken)

      const best = candidates[0]
      if (best && best.confidence >= minConfidenceToAutoCorrect) {
        corrections.push({
          original: token,
          corrected: best.token,
          method: best.method,
          confidence: Number(best.confidence.toFixed(2)),
          script: detectScript(token),
          alternatives: candidates.slice(1).map((c) => c.token),
        })
        out.push(best.token)
      } else {
        // Not confident → keep original; hybrid fuzzy layer will still find results.
        if (best) {
          corrections.push({
            original: token,
            corrected: token,
            method: 'kept-original-low-confidence',
            confidence: Number(best.confidence.toFixed(2)),
            alternatives: candidates.map((c) => c.token),
          })
        }
        out.push(token)
      }
      i++
    }

    // Step 2b — split: "smartphone" written as one word is fine;
    // "samsunggalaxy" → try to split into two known words.
    return { tokens: this.#trySplitCompounds(out, corrections), corrections }
  }

  #trySplitCompounds(tokens, corrections) {
    const out = []
    for (const token of tokens) {
      if (this.vocab.has(token) || token.length < 8) {
        out.push(token)
        continue
      }
      let split = null
      for (let p = 3; p < token.length - 2 && !split; p++) {
        const a = token.slice(0, p)
        const b = token.slice(p)
        if (this.vocab.has(a) && this.vocab.has(b)) split = [a, b]
      }
      if (split) {
        corrections.push({ original: token, corrected: split.join(' '), method: 'split', confidence: 0.9, alternatives: [] })
        out.push(...split)
      } else out.push(token)
    }
    return out
  }
}
