/**
 * Multilingual knowledge used by BOTH correction and semantics.
 *
 * Two ideas:
 *  1) CONCEPTS — one concept, many surface forms (EN/FR/AR + synonyms).
 *     This is our lightweight "embedding": if query and product share
 *     a concept, they are semantically close even with zero words in
 *     common. e.g. "pas cher" ↔ "رخيص" ↔ "budget".
 *     In a real backend you replace/augment this with vector embeddings
 *     (MiniLM / e5-multilingual) — the interface stays the same.
 *  2) STOPWORDS — removed before ranking, never corrected.
 */

export const STOPWORDS = new Set([
  // EN
  'the', 'a', 'an', 'for', 'with', 'and', 'or', 'of', 'to', 'in',
  // FR
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'pour', 'avec', 'et', 'ou', 'sur',
  // AR (normalised forms: ة→ه etc.)
  'في', 'من', 'الي', 'على', 'مع', 'و', 'او', 'ل', 'ذو', 'ذات',
])

/** conceptId -> { weight, terms: [normalised surface forms] } */
export const CONCEPTS = {
  smartphone: { terms: ['smartphone', 'phone', 'mobile', 'telephone', 'portable', 'هاتف', 'جوال', 'موبايل', 'تليفون'] },
  tablet: { terms: ['tablet', 'tablette', 'ipad', 'لوحي', 'تاب', 'جهاز لوحي'] },
  console: { terms: ['console', 'playstation', 'ps5', 'xbox', 'nintendo', 'switch', 'كونسول', 'بلايستيشن'] },
  laptop: { terms: ['laptop', 'notebook', 'pc', 'ordinateur', 'ordinateur portable', 'حاسوب', 'لابتوب', 'كمبيوتر'] },
  headphones: { terms: ['headphones', 'headphone', 'earbuds', 'ecouteurs', 'casque', 'سماعات', 'سماعه', 'ايربودز'] },
  tv: { terms: ['tv', 'television', 'tele', 'تلفاز', 'تلفزيون', 'شاشه'] },
  watch: { terms: ['watch', 'smartwatch', 'montre', 'ساعه', 'ساعه ذكيه'] },
  gaming: { terms: ['gaming', 'gamer', 'game', 'jeu', 'jeux', 'العاب', 'قيمنق', 'جيمينج'] },
  cheap: { terms: ['cheap', 'budget', 'affordable', 'pas cher', 'economique', 'رخيص', 'اقتصادي', 'بسعر جيد'] },
  premium: { terms: ['premium', 'pro', 'haut de gamme', 'فاخر', 'احترافي', 'بريميوم'] },
  wireless: { terms: ['wireless', 'bluetooth', 'sans fil', 'لاسلكي', 'بلوتوث', 'وايرلس'] },
  fast_charge: { terms: ['fast charge', 'charge rapide', 'شحن سريع', 'rapide'] },
  camera: { terms: ['camera', 'photo', 'appareil photo', 'كاميرا', 'تصوير'] },
  sport: { terms: ['sport', 'running', 'course', 'رياضه', 'جري', 'سبورت'] },
  home: { terms: ['home', 'maison', 'menage', 'منزل', 'بيت', 'منزلي'] },
  beauty: { terms: ['beauty', 'beaute', 'cosmetique', 'جمال', 'تجميل', 'عنايه'] },
  kids: { terms: ['kids', 'enfant', 'children', 'اطفال', 'طفل'] },
  waterproof: { terms: ['waterproof', 'etanche', 'مقاوم للماء', 'ضد الماء'] },
  washing: { terms: ['washing', 'washer', 'lave linge', 'machine a laver', 'lavage', 'غساله'] },
  perfume: { terms: ['perfume', 'parfum', 'fragrance', 'عطر', 'عطور'] },
  sneakers: { terms: ['sneakers', 'sneaker', 'shoes', 'chaussures', 'basket', 'حذاء'] },
}

/** term (normalised) -> conceptId, built once. Multi-word terms kept as phrases. */
export const TERM_TO_CONCEPT = new Map()
for (const [concept, { terms }] of Object.entries(CONCEPTS)) {
  for (const term of terms) TERM_TO_CONCEPT.set(term, concept)
}

/** Concept for a token, tolerating simple plurals: smartphones→smartphone. */
export function conceptForToken(token = '') {
  return (
    TERM_TO_CONCEPT.get(token) ??
    (token.endsWith('s') ? TERM_TO_CONCEPT.get(token.slice(0, -1)) : undefined) ??
    (token.endsWith('x') ? TERM_TO_CONCEPT.get(token.slice(0, -1)) : undefined) ??
    TERM_TO_CONCEPT.get(token + 's') ?? // ecouteur -> ecouteurs
    TERM_TO_CONCEPT.get(token + 'x')
  )
}

/**
 * Phonetic folding: letters that sound alike collapse to one key.
 * Lets "samsong" find "samsung", "تلفون" find "تليفون".
 */
export function phoneticKey(token = '') {
  let t = token
  // Arabic sound groups
  t = t
    .replace(/[صث]/g, 'س')
    .replace(/[ذظ]/g, 'ز')
    .replace(/[ط]/g, 'ت')
    .replace(/[ق]/g, 'ك')
    .replace(/[ج]/g, 'ي')
    .replace(/ه$/g, 'ا')
  // Latin simplification (soundex-inspired, deliberately simple)
  t = t
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'f')
    .replace(/(.)\1+/g, '$1') // double letters collapse: "samsunng"→…
  return t
}

/**
 * Cross-script aliases — extremely common in Algeria: users type a
 * Latin brand in Arabic letters (or vice-versa). Normalised token →
 * canonical catalog token. Checked BEFORE edit distance because
 * "سامسونق" is not a typo of "samsung", it is a transliteration.
 */
export const TRANSLITERATION_ALIASES = new Map([
  ['سامسونج', 'samsung'], ['سامسونغ', 'samsung'], ['سامسونق', 'samsung'],
  ['ايفون', 'iphone'], ['آيفون', 'iphone'], ['ابل', 'apple'], ['أبل', 'apple'],
  ['شاومي', 'xiaomi'], ['هواوي', 'huawei'], ['اوبو', 'oppo'], ['ريلمي', 'realme'],
  ['سوني', 'sony'], ['نايك', 'nike'], ['اديداس', 'adidas'], ['الجي', 'lg'],
  ['تلفون', 'telephone'], ['تليفون', 'telephone'], ['موبايل', 'mobile'], ['جوال', 'mobile'],
])

/** Extra real-world words so correction works even before catalog vocab. */
export const COMMON_WORDS = [
  'samsung', 'apple', 'iphone', 'xiaomi', 'redmi', 'oppo', 'realme', 'huawei',
  'sony', 'jbl', 'anker', 'lenovo', 'dell', 'asus', 'hp', 'lg', 'nike', 'adidas',
  'smartphone', 'telephone', 'ordinateur', 'ecouteurs', 'casque', 'montre',
  'television', 'camera', 'gaming', 'wireless', 'bluetooth', 'pas', 'cher',
  'هاتف', 'سماعات', 'حاسوب', 'تلفاز', 'ساعه', 'رخيص',
  'sans', 'fil', 'ecouteur', 'ecouteurs', 'lave', 'linge', 'parfum', 'sneakers', 'chaussures',
]
