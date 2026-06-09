import { type OrderAuditRecord, readOrderAudit } from "@core/risk/audit"
import { projectHash } from "@core/storage/paths"
import { useRenderer } from "@opentui/solid"
import { ModalFrame, ModalList, useListNav, useModalKeyboard } from "@tui/ui/modal"
import { createMemo, createSignal } from "solid-js"

type View = "menu" | "positions" | "log"
type Item = { kind: "menu"; key: View; label: string } | { kind: "row"; label: string; value: string }

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
  const renderer = useRenderer()
  let records: OrderAuditRecord[] = []
  try {
    records = readOrderAudit(projectHash(process.cwd()))
  } catch {
    records = []
  }
  const [view, setView] = createSignal<View>("menu")

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

  function detailRows(): { label: string; value: string }[] {
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

  const items = (): Item[] =>
    view() === "menu"
      ? MENU().map((m) => ({ kind: "menu" as const, key: m.key, label: m.label }))
      : detailRows().map((r) => ({ kind: "row" as const, label: r.label, value: r.value }))

  const nav = useListNav<Item>({
    items,
    onSelect: (item) => {
      if (item.kind === "menu") {
        setView(item.key)
        nav.setCursor(0)
        renderer.requestRender()
      }
    },
    onKey: (e) => {
      if (e.name === "left" && view() !== "menu") {
        setView("menu")
        nav.setCursor(0)
        renderer.requestRender()
        return true
      }
      return false
    },
    onEscape: () => {
      if (view() === "menu") props.onClose()
      else {
        setView("menu")
        nav.setCursor(0)
        renderer.requestRender()
      }
    },
  })
  useModalKeyboard({ nav })

  const title = () => (view() === "menu" ? "📈 Trading" : view() === "positions" ? "📈 Positions" : "📈 Order log")
  const footer = () => (view() === "menu" ? "↑/↓ move · Enter open · Esc close" : "↑/↓ scroll · Esc back")

  return (
    <ModalFrame title={title()} footer={footer()}>
      <ModalList
        window={nav.window()}
        selectable={(it) => it.kind === "menu"}
        label={(it) => it.label}
        right={(it) => (it.kind === "row" ? it.value : "")}
      />
    </ModalFrame>
  )
}
