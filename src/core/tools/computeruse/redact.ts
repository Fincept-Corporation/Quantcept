/**
 * Capture redaction — window-level suppression.
 *
 * Computer-use uniquely ships whatever is on screen to a third-party vision model and into
 * conversation logs. The v1 safety floor refuses to capture frames whose focused window looks
 * like it shows secrets (Quantcept's own config/.env, password managers, credential vaults).
 * Pixel-level secret blurring (which needs OCR) is deferred; window suppression is the cheap,
 * robust first line. When suppressed, the tool returns a text-only result instead of an image.
 */

export const DEFAULT_SUPPRESS_PATTERNS = [
  "quantcept",
  ".env",
  "config",
  "password",
  "secret",
  "api key",
  "apikey",
  "credential",
  "vault",
  "1password",
  "bitwarden",
  "keepass",
  "lastpass",
]

export function shouldSuppressCapture(windowTitle: string | undefined, patterns: string[]): boolean {
  if (!windowTitle) return false
  const t = windowTitle.toLowerCase()
  return patterns.some((p) => t.includes(p.toLowerCase()))
}
