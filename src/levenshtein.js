/**
 * Edit-distance + keyboard-distance helpers for spelling correction.
 *
 * Keyboard awareness matters: on AZERTY (very common in Algeria)
 * "q" and "a" swap, on QWERTY "samsumg" (n→m neighbour) is a classic
 * slip. A substitution between neighbour keys should cost LESS than
 * an arbitrary substitution.
 */

const KEYBOARD_ROWS = [
  'azertyuiop', // AZERTY top row start + QWERTY overlap
  'qwertyuiop',
  'qsdfghjklm',
  'asdfghjklm',
  'wxcvbn',
  'zxcvbn',
]

const NEIGHBOURS = new Map()
for (const row of KEYBOARD_ROWS) {
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (!NEIGHBOURS.has(ch)) NEIGHBOURS.set(ch, new Set())
    if (i > 0) NEIGHBOURS.get(ch).add(row[i - 1])
    if (i < row.length - 1) NEIGHBOURS.get(ch).add(row[i + 1])
  }
}

export function areKeyboardNeighbours(a, b) {
  return NEIGHBOURS.get(a)?.has(b) ?? false
}

/** Damerau–Levenshtein with cheap neighbour substitutions & transpositions. */
export function editDistance(a = '', b = '') {
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > 3) return 99
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const subCost = a[i - 1] === b[j - 1] ? 0 : areKeyboardNeighbours(a[i - 1], b[j - 1]) ? 0.45 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // delete
        dp[i][j - 1] + 1, // insert
        dp[i - 1][j - 1] + subCost, // substitute (cheap if keyboard slip)
      )
      // Transposition: "iphnoe" → "iphone"
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 0.6)
      }
    }
  }
  return dp[m][n]
}
