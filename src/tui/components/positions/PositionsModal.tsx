import { type OrderAuditRecord, readOrderAudit } from "@core/risk/audit"
import { projectHash } from "@core/storage/paths"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, For, Show } from "solid-js"

type View = "menu" | "positions" | "log"

function hhmm(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

const s = (x: unknown): string => (x == null ? "" : String(x))

function summarize(r: OrderAuditRecord): string {
  const sym = s(r.symbol)
  if (r.kind === "fill" || r.kind === "intent") {
    const price = r.price ?? r.fillPrice
    return `${r.kind} ${sym} ${s(r.side)} ${s(r.qty)}${price != null ? ` @ ${s(price)}` : ""}`
      .replace(/\s+/g, " ")
      .trim()
  }
  if (r.kind === "failed") return `failed ${sym} — ${s(r.error)}`.trim()
  if (r.kind === "reserve") return `reserve ${s(r.amount)}`.trim()
  if (r.kind === "replay") return `replay ${sym}`.trim()
  return r.kind
}

/**
 * Read-only view of the trade-safety audit trail (the only persistent trading
 * record — the paper broker/ledger are rebuilt per agent turn). Shows net
 * positions reconstructed from `fill` records + the raw order log.
 */
export function PositionsModal(props: { onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  let records: OrderAuditRecord[] = []
  try {
    records = readOrderAudit(projectHash(process.cwd()))
  } catch {
    records = []
  }

  const [view, setView] = createSignal<View>("menu")
  const [cursor, setCursor] = createSignal(0)
  const rerender = () => renderer.requestRender()

  const positions = createMemo(() => {
    const m = new Map<string, number>()
    for (const r of records) {
      if (r.kind !== "fill" || typeof r.symbol !== "string" || typeof r.qty !== "number") continue
      m.set(r.symbol, (m.get(r.symbol) ?? 0) + (r.side === "sell" ? -r.qty : r.qty))
    }
    return [...m.entries()].filter(([, q]) => q !== 0).map(([symbol, qty]) => ({ symbol, qty }))
  })

  const MENU = createMemo<{ key: View; label: string }[]>(() => [
    { key: "positions", label: `Positions (${positions().length})` },
    { key: "log", label: `Order log (${records.length})` },
  ])

  function rows(): { label: string; value: string }[] {
    if (view() === "positions") {
      const p = positions()
      return p.length
        ? p.map((x) => ({ label: x.symbol, value: `${x.qty > 0 ? "+" : ""}${x.qty}` }))
        : [{ label: "No open positions.", value: "" }]
    }
    if (view() === "log") {
      return records.length
        ? [...records].reverse().map((r) => ({ label: summarize(r), value: hhmm(r.ts) }))
        : [{ label: "No orders recorded for this project.", value: "" }]
    }
    return []
  }

  // biome-ignore lint/suspicious/noExplicitAny: @opentui keyboard event is untyped (matches SettingsModal)
  useKeyboard((e: any) => {
    if (e.name === "escape" || (e.name === "left" && view() !== "menu")) {
      e.preventDefault?.()
      if (view() === "menu") props.onClose()
      else {
        setView("menu")
        setCursor(0)
      }
      rerender()
      return
    }
    const len = view() === "menu" ? MENU().length : rows().length
    if (e.name === "up") {
      e.preventDefault?.()
      setCursor((c) => Math.max(0, c - 1))
      rerender()
      return
    }
    if (e.name === "down") {
      e.preventDefault?.()
      setCursor((c) => Math.min(Math.max(0, len - 1), c + 1))
      rerender()
      return
    }
    if (view() === "menu" && (e.name === "return" || e.name === "kpenter")) {
      e.preventDefault?.()
      const m = MENU()[cursor()]
      if (m) {
        setView(m.key)
        setCursor(0)
        rerender()
      }
    }
  })

  const WINDOW = 14
  function windowed<T>(items: T[]): { slice: T[]; offset: number } {
    if (items.length <= WINDOW) return { slice: items, offset: 0 }
    const off = Math.min(Math.max(0, cursor() - Math.floor(WINDOW / 2)), items.length - WINDOW)
    return { slice: items.slice(off, off + WINDOW), offset: off }
  }

  return (
    <box flexDirection="column" minWidth={62} gap={0}>
      <text fg={theme.accent}>
        {view() === "menu" ? "📈  Trading" : view() === "positions" ? "📈  Positions" : "📈  Order log"}
      </text>
      <box height={1} minHeight={0} />

      <Show
        when={view() !== "menu"}
        fallback={
          <box flexDirection="column">
            <For each={MENU()}>
              {(m, i) => {
                const sel = () => i() === cursor()
                return (
                  <text fg={sel() ? theme.accent : theme.text} bg={sel() ? theme.backgroundElement : undefined}>
                    {(sel() ? "› " : "  ") + m.label}
                  </text>
                )
              }}
            </For>
          </box>
        }
      >
        <box flexDirection="column">
          <For each={windowed(rows()).slice}>
            {(r) => (
              <box flexDirection="row" justifyContent="space-between" gap={2}>
                <text fg={theme.text}>{`  ${r.label}`}</text>
                <text fg={theme.textMuted}>{r.value}</text>
              </box>
            )}
          </For>
        </box>
      </Show>

      <box height={1} minHeight={0} />
      <text fg={theme.textMuted}>
        {view() === "menu" ? "↑/↓ move · Enter open · Esc close" : "↑/↓ scroll · Esc back"}
      </text>
    </box>
  )
}
