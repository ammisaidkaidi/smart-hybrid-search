/**
 * STEP 0 of every pipeline: normalisation.
 *
 * Goal: "Téléphone", "telephone", "هاتفٌ" and "telephone" must be
 * comparable WITHOUT destroying the original user text (we keep the
 * original for display / "did you mean").
 *
 * Rules are language-aware:
 *  - Latin: lowercase, strip accents (é→e), keep a copy with accents
 *    removed only for INDEXING/matching.
 *  - Arabic: strip diacritics/tatweel, إ/أ/آ→ا, ة→ه, ى→ي, ؤ/ئ normalised.
 *  - Numbers/units are kept: "128gb", "5g" are strong product signals.
 */

const ARABIC_DIACRITICS = /[ً-ٰٟـ]/g

export function detectScript(token = '') {
  if (/[؀-ۿ]/.test(token)) return 'ar'
  if (/[a-zA-ZÀ-ÿ]/.test(token)) return 'latin'
  return 'other'
}

export function normalizeArabic(text = '') {
  return text
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
}

export function stripLatinAccents(text = '') {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** One canonical form used for every index key and comparison. */
export function normalizeForIndex(text = '') {
  let t = String(text).toLowerCase().trim()
  t = normalizeArabic(t)
  t = stripLatinAccents(t)
  // Keep letters (latin + arabic), numbers and a few product chars.
  t = t.replace(/[^a-z0-9؀-ۿ+%./-]+/g, ' ')
  t = t.replace(/([0-9])([a-z؀-ۿ])/g, '$1 $2')
  t = t.replace(/([a-z؀-ۿ])([0-9])/g, '$1 $2')
  return t.replace(/\s+/g, ' ').trim()
}

export function tokenize(text = '') {
  const normalized = normalizeForIndex(text)
  return normalized ? normalized.split(' ').filter((w) => w.length > 0) : []
}

/** Character trigrams — the backbone of fuzzy matching. */
export function trigrams(token = '') {
  const padded = `  ${token} `
  const out = new Set()
  for (let i = 0; i <= padded.length - 3; i++) out.add(padded.slice(i, i + 3))
  return out
}

export function trigramSimilarity(a = '', b = '') {
  const A = trigrams(a)
  const B = trigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return (2 * inter) / (A.size + B.size) // Dice coefficient
}
