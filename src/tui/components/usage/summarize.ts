import type { UsageEntry } from "@core/fincept"

/** One endpoint's rolled-up usage (a method+path pair). */
export interface EndpointUsage {
  method: string
  endpoint: string
  credits: number
  calls: number
}

/** Aggregated view-model for the /usage panel, derived purely from the raw call log. */
export interface UsageSummary {
  totalCredits: number
  totalCalls: number
  /** Mean response time across all calls, rounded; 0 when there are none. */
  avgLatencyMs: number
  /** Per method+endpoint rollup, sorted by credits desc then calls desc. */
  byEndpoint: EndpointUsage[]
}

/**
 * Roll a raw `UsageEntry[]` call log into totals + a per-endpoint breakdown. Pure and
 * UI-free so it can be unit-tested without the TUI; the modal only renders the result.
 */
export function summarizeUsage(entries: UsageEntry[]): UsageSummary {
  let totalCredits = 0
  let totalLatency = 0
  const groups = new Map<string, EndpointUsage>()

  for (const e of entries) {
    totalCredits += e.credits_used
    totalLatency += e.response_time_ms
    const key = `${e.method} ${e.endpoint}`
    const g = groups.get(key)
    if (g) {
      g.credits += e.credits_used
      g.calls += 1
    } else {
      groups.set(key, { method: e.method, endpoint: e.endpoint, credits: e.credits_used, calls: 1 })
    }
  }

  const byEndpoint = [...groups.values()].sort((a, b) => b.credits - a.credits || b.calls - a.calls)
  return {
    totalCredits,
    totalCalls: entries.length,
    avgLatencyMs: entries.length ? Math.round(totalLatency / entries.length) : 0,
    byEndpoint,
  }
}
