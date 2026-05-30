/**
 * Money-action tripwire — the single, surgical exception to full-auto computer-use.
 *
 * Before an input action runs, the sidecar reports the focused window's title (and, where
 * available, the label of the control under the cursor). If either matches a money-moving
 * pattern, the loop pauses for ONE explicit human confirmation. Matching is case-insensitive
 * substring matching and deliberately errs toward OVER-tripping: an extra confirmation is
 * cheap; an autonomous wire-transfer is not. Default-on, per-run overridable.
 */

export interface TripwireConfig {
  enabled: boolean
  patterns: string[]
}

export const DEFAULT_MONEY_PATTERNS = [
  "place order",
  "submit",
  "confirm",
  "buy",
  "sell",
  "transfer",
  "withdraw",
  "wire",
  "pay",
  "checkout",
  "place trade",
  "execute trade",
  "liquidate",
  "deposit",
]

export interface TripwireContext {
  windowTitle?: string
  buttonText?: string
}

export function shouldTripwire(config: TripwireConfig, ctx: TripwireContext): boolean {
  if (!config.enabled) return false
  const haystacks = [ctx.windowTitle, ctx.buttonText].filter((s): s is string => !!s).map((s) => s.toLowerCase())
  if (haystacks.length === 0) return false
  return config.patterns.some((p) => {
    const needle = p.toLowerCase()
    return haystacks.some((h) => h.includes(needle))
  })
}
