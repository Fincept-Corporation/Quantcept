/**
 * Remove stray CJK characters that a Chinese-origin model (e.g. MiniMax) leaks
 * mid-sentence when code-switching — e.g. it emits "现" where it meant "current",
 * producing "on现earnings". Pure and conservative: it only touches an isolated
 * Han/Kana/Hangul character that is glued directly to a Latin letter, which is
 * essentially never legitimate. Deliberate Chinese text (runs of CJK, or CJK with
 * surrounding spaces / CJK punctuation) is left untouched.
 *
 * Used on the accumulated assistant text so the displayed, stored, and copied
 * output are all clean. The complement of the source-side system-prompt
 * instruction, not a replacement for it.
 */

// Hiragana/Katakana + Han (Ext A + Unified) + CJK-compat + Hangul + halfwidth kana.
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ｦ-ﾟ]/
const LATIN = /[A-Za-z]/

export function stripStrayCJK(text: string): string {
  if (!text || !CJK.test(text)) return text

  let out = ""
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (!CJK.test(ch)) {
      out += ch
      continue
    }

    const prev = i > 0 ? text.charAt(i - 1) : undefined
    const next = i < text.length - 1 ? text.charAt(i + 1) : undefined

    // Defer a trailing CJK char: its right-hand context hasn't streamed in yet,
    // and dropping it now could merge two words once the next token arrives.
    if (next === undefined) {
      out += ch
      continue
    }
    // Keep runs of CJK — that is deliberate Chinese/Japanese/Korean text.
    if ((prev !== undefined && CJK.test(prev)) || CJK.test(next)) {
      out += ch
      continue
    }
    // Only a character glued directly to a Latin letter is treated as a leak.
    const gluedLatin = (prev !== undefined && LATIN.test(prev)) || LATIN.test(next)
    if (!gluedLatin) {
      out += ch
      continue
    }
    // Wedged between two non-space chars → replace with a space so words don't
    // merge ("on现earnings" → "on earnings"); otherwise just drop it.
    const wedged = prev !== undefined && !/\s/.test(prev) && !/\s/.test(next)
    out += wedged ? " " : ""
  }
  return out
}
