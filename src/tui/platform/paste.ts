const ESC = 0x1b
const NEWLINE = new Set([0x0a, 0x0d])

/**
 * Decode an OpenTUI paste payload (raw bytes or an already-decoded string) into
 * clean, single-line text suitable for a modal text field: skips ANSI CSI escape
 * sequences a terminal may inject, drops newlines, and strips stray control
 * characters. Mirrors what OpenTUI's focused Input does natively, so modals
 * (which receive paste via the global `usePaste` hook) get the same result.
 *
 * Implemented as a char-code scan rather than control-character regexes — those
 * are both fragile to author and rejected by the linter.
 */
export function pasteText(input: Uint8Array | string): string {
  const raw = typeof input === "string" ? input : new TextDecoder().decode(input)
  let out = ""
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (code === ESC) {
      // Skip a CSI sequence: ESC '[' params/intermediates up to a final byte (@-~).
      if (raw[i + 1] === "[") {
        i += 2
        while (i < raw.length) {
          const c = raw.charCodeAt(i)
          if (c >= 0x40 && c <= 0x7e) break
          i++
        }
      }
      continue // drop the (CSI or lone) escape
    }
    if (NEWLINE.has(code)) continue
    if (code < 0x20 || code === 0x7f) continue // other C0 controls + DEL
    out += raw[i]
  }
  return out
}
