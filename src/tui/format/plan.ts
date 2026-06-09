/**
 * Title-case an account plan id for display: "pro" → "Pro", "PRO" → "Pro",
 * "pro_plus" → "Pro Plus". Returns undefined for empty/missing so callers can
 * cleanly omit the badge instead of rendering a placeholder.
 */
export function formatPlan(accountType?: string | null): string | undefined {
  const t = (accountType ?? "").trim()
  if (!t) return undefined
  return t
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

export type PlanTier = "free" | "paid" | "premium"

/** Classify a plan into a visual tier so the UI can colour-code the badge. */
export function planTier(accountType?: string | null): PlanTier {
  const t = (accountType ?? "").toLowerCase()
  if (t.includes("enterprise") || t.includes("premium") || t.includes("ultra")) return "premium"
  if (!t || t === "free" || t.includes("trial")) return "free"
  return "paid"
}
