import type { UsageEntry } from "@core/fincept"
import { useRenderer } from "@opentui/solid"
import { FinceptAuthError } from "@shared/errors"
import type { AuthContext } from "@tui/context/auth"
import { useTheme } from "@tui/context/theme"
import { formatPlan } from "@tui/format/plan"
import { ModalFrame, ModalList, useListNav, useModalKeyboard, useNotice } from "@tui/ui/modal"
import { createMemo, createSignal, Show } from "solid-js"
import { summarizeUsage } from "./summarize"

/** Read-only display rows for the usage panel (a single scrollable list). */
type UsageRow =
  | { kind: "head"; label: string } // section header (accent)
  | { kind: "info"; label: string; value: string } // label · right value
  | { kind: "gap" } // blank spacer line

const RECENT_LIMIT = 25

function errMsg(e: unknown): string {
  if (e instanceof FinceptAuthError) return "Not signed in to Fincept."
  return e instanceof Error ? e.message : String(e)
}

/** Trim long paths so they don't crowd the right-hand value column. */
function shortPath(s: string, max = 46): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

/**
 * `/usage` — a focused view of the signed-in account's API usage and credit spend
 * (GET /v1/users/me/usage). Shows current balance/plan, totals over the returned
 * window, a per-endpoint breakdown (where credits go), then the recent call log.
 * Read-only: ↑/↓ scroll, `r` refresh, Esc close.
 */
export function UsageModal(props: { auth: AuthContext; onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const notice = useNotice({ mapError: errMsg })
  const [entries, setEntries] = createSignal<UsageEntry[]>([])
  const [loading, setLoading] = createSignal(true)

  const rows = createMemo<UsageRow[]>(() => {
    const list = entries()
    const s = summarizeUsage(list)
    const acct = props.auth.account
    const plan = formatPlan(acct?.account_type)
    const out: UsageRow[] = [
      {
        kind: "info",
        label: "Balance",
        value: `${(acct?.credit_balance ?? 0).toLocaleString()} cr${plan ? ` · ${plan}` : ""}`,
      },
      {
        kind: "info",
        label: `Last ${s.totalCalls} calls`,
        value: `${s.totalCredits.toLocaleString()} cr used · ${s.avgLatencyMs}ms avg`,
      },
    ]
    if (s.byEndpoint.length) {
      out.push({ kind: "gap" }, { kind: "head", label: "By endpoint" })
      for (const e of s.byEndpoint) {
        out.push({ kind: "info", label: shortPath(`${e.method} ${e.endpoint}`), value: `${e.credits} cr · ${e.calls}` })
      }
    }
    if (list.length) {
      out.push({ kind: "gap" }, { kind: "head", label: "Recent calls" })
      for (const e of list.slice(0, RECENT_LIMIT)) {
        out.push({
          kind: "info",
          label: shortPath(`${e.method} ${e.endpoint}`),
          value: `${e.credits_used} cr · ${e.status_code}`,
        })
      }
    }
    return out
  })

  const nav = useListNav<UsageRow>({ items: rows, windowSize: 16, onEscape: () => props.onClose() })

  async function load() {
    setLoading(true)
    notice.clear()
    try {
      const r = await props.auth.accountApi.usage()
      setEntries(r.data ?? [])
    } catch (e) {
      notice.fail(e)
    } finally {
      setLoading(false)
      renderer.requestRender()
    }
  }

  // Read-only: no form, no selection. `r` refreshes; ↑/↓ scroll and Esc close come from nav.
  useModalKeyboard({
    nav,
    onKey: (e) => {
      if (e.name === "r" || e.sequence === "r") {
        void load()
        return true
      }
      return false
    },
  })

  void load()

  const labelOf = (r: UsageRow) => (r.kind === "gap" ? "" : r.label)
  const rightOf = (r: UsageRow) => (r.kind === "info" ? r.value : "")
  const fgOf = (r: UsageRow) => (r.kind === "head" ? theme.accent : theme.text)

  return (
    <ModalFrame
      title="💳  Usage"
      footer="↑/↓ scroll · r refresh · Esc close"
      notice={notice.notice()}
      error={notice.err()}
    >
      <Show when={!loading()} fallback={<text fg={theme.textMuted}>Loading…</text>}>
        <Show when={entries().length > 0} fallback={<text fg={theme.textMuted}>No usage recorded yet.</text>}>
          <ModalList
            window={nav.window()}
            selectable={() => false}
            marker={() => "  "}
            label={labelOf}
            right={rightOf}
            fg={fgOf}
          />
        </Show>
      </Show>
    </ModalFrame>
  )
}
