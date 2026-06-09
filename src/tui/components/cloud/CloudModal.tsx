import type { Note, Portfolio, Watchlist } from "@core/fincept"
import { useRenderer } from "@opentui/solid"
import { FinceptAuthError, InsufficientCreditsError } from "@shared/errors"
import type { AuthContext } from "@tui/context/auth"
import { useTheme } from "@tui/context/theme"
import {
  ModalFormView,
  ModalFrame,
  ModalList,
  useListNav,
  useModalForm,
  useModalKeyboard,
  useNotice,
} from "@tui/ui/modal"
import { createSignal, For, Show } from "solid-js"

type View = "menu" | "watchlists" | "notes" | "portfolios" | "detail" | `wl:${string}`

type Row =
  | { kind: "menu"; key: View; label: string }
  | { kind: "add"; label: string; act: () => void }
  | { kind: "wl"; wl: Watchlist }
  | { kind: "stock"; symbol: string; name?: string }
  | { kind: "note"; note: Note }
  | { kind: "pf"; pf: Portfolio }
  | { kind: "info"; label: string }

const MENU: { key: View; label: string }[] = [
  { key: "watchlists", label: "Watchlists" },
  { key: "notes", label: "Notes" },
  { key: "portfolios", label: "Portfolios" },
]

function errMsg(e: unknown): string {
  if (e instanceof InsufficientCreditsError) return `Insufficient credits (need ${e.required}, have ${e.available}).`
  if (e instanceof FinceptAuthError) return "Not signed in to Fincept."
  return e instanceof Error ? e.message : String(e)
}

export function CloudModal(props: { auth: AuthContext; onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const sync = props.auth.sync
  const notice = useNotice({ mapError: errMsg })
  const form = useModalForm({ onError: notice.fail })

  const [view, setView] = createSignal<View>("menu")
  const [rows, setRows] = createSignal<Row[]>([])
  const [loading, setLoading] = createSignal(false)
  const [detail, setDetail] = createSignal<{ title: string; lines: string[]; from: View }>()

  const run = (p: Promise<unknown> | unknown): Promise<void> =>
    Promise.resolve(p)
      .then(() => undefined)
      .catch((e) => notice.fail(e))

  async function loadView(v: View) {
    if (v === "menu" || v === "detail") return
    setLoading(true)
    notice.clear()
    setRows([])
    try {
      if (v === "watchlists") {
        const r = await sync.watchlists.list()
        setRows([
          {
            kind: "add",
            label: "＋ New watchlist",
            act: () =>
              form.start({
                title: "New watchlist",
                fields: ["Name"],
                onComplete: ([name]) =>
                  run(sync.watchlists.create({ name: name ?? "" }).then(() => loadView("watchlists"))),
              }),
          },
          ...(r.data ?? []).map((wl) => ({ kind: "wl", wl }) as Row),
        ])
      } else if (v === "notes") {
        const r = await sync.notes.list()
        setRows([
          {
            kind: "add",
            label: "＋ New note",
            act: () =>
              form.start({
                title: "New note",
                fields: ["Title", "Content"],
                onComplete: ([title, content]) =>
                  run(sync.notes.create({ title: title ?? "", content: content ?? "" }).then(() => loadView("notes"))),
              }),
          },
          ...(r.data?.notes ?? []).map((note) => ({ kind: "note", note }) as Row),
        ])
      } else if (v === "portfolios") {
        const r = await sync.portfolios.list()
        const list = (r.data ?? []).map((pf) => ({ kind: "pf", pf }) as Row)
        setRows(list.length ? list : [{ kind: "info", label: "No portfolios." }])
      } else if (v.startsWith("wl:")) {
        const id = v.slice(3)
        const r = await sync.watchlists.get(id)
        setRows([
          {
            kind: "add",
            label: "＋ Add stock",
            act: () =>
              form.start({
                title: "Add stock",
                fields: ["Symbol"],
                onComplete: ([sym]) =>
                  run(sync.watchlists.addStock(id, { symbol: (sym ?? "").toUpperCase() }).then(() => loadView(v))),
              }),
          },
          ...(r.data?.stocks ?? []).map((s) => ({ kind: "stock", symbol: s.symbol, name: s.name }) as Row),
        ])
      }
    } catch (e) {
      notice.fail(e)
    } finally {
      setLoading(false)
      renderer.requestRender()
    }
  }

  function enter(v: View) {
    setView(v)
    nav.setCursor(0)
    notice.clear()
    void loadView(v)
  }
  function back() {
    const v = view()
    if (v === "detail") setView(detail()?.from ?? "menu")
    else if (v.startsWith("wl:")) enter("watchlists")
    else if (v === "menu") {
      props.onClose()
      return
    } else setView("menu")
    nav.setCursor(0)
    renderer.requestRender()
  }

  const menuRows = (): Row[] => MENU.map((m) => ({ kind: "menu", key: m.key, label: m.label }))
  const items = (): Row[] => (view() === "menu" ? menuRows() : rows())

  const nav = useListNav<Row>({
    items,
    onSelect: (row) => {
      if (row.kind === "menu") enter(row.key)
      else if (row.kind === "add") row.act()
      else if (row.kind === "wl") enter(`wl:${row.wl.id}`)
      else if (row.kind === "note") {
        setDetail({ title: row.note.title, lines: (row.note.content ?? "").split("\n"), from: "notes" })
        setView("detail")
        renderer.requestRender()
      } else if (row.kind === "pf") {
        setDetail({
          title: row.pf.name,
          lines: Object.entries(row.pf).map(
            ([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`,
          ),
          from: "portfolios",
        })
        setView("detail")
        renderer.requestRender()
      }
    },
    onKey: (e, row) => {
      if (view() === "detail") {
        if (e.name === "escape" || e.name === "left") back()
        return true
      }
      if (e.name === "left" && view() !== "menu") {
        back()
        return true
      }
      const isKey = (ch: string) => e.name === ch || e.sequence === ch
      if (row?.kind === "note" && isKey("d")) {
        void run(sync.notes.remove(row.note.id).then(() => loadView("notes")))
        return true
      }
      if (row?.kind === "stock" && isKey("d")) {
        const id = view().slice(3)
        void run(sync.watchlists.removeStock(id, row.symbol).then(() => loadView(view())))
        return true
      }
      return false
    },
    onEscape: back,
  })
  useModalKeyboard({ form, nav })

  function label(r: Row): string {
    if (r.kind === "menu") return r.label
    if (r.kind === "add" || r.kind === "info") return r.label
    if (r.kind === "wl") return r.wl.name
    if (r.kind === "stock") return r.name ? `${r.symbol} — ${r.name}` : r.symbol
    if (r.kind === "note") return r.note.title || "(untitled)"
    return r.pf.name
  }
  function right(r: Row): string {
    if (r.kind === "wl") return `${r.wl.stock_count ?? r.wl.stocks?.length ?? 0} stocks`
    if (r.kind === "note") return r.note.category ?? ""
    return ""
  }
  const title = () => {
    const v = view()
    if (v === "menu") return "☁  Cloud data"
    if (v === "detail") return `☁  ${detail()?.title ?? ""}`
    if (v.startsWith("wl:")) return "☁  Watchlist"
    return `☁  ${MENU.find((m) => m.key === v)?.label ?? v}`
  }
  const footer = () => {
    const v = view()
    if (v === "detail") return "Esc back"
    if (v === "menu") return "↑/↓ move · Enter open · Esc close"
    if (v === "notes") return "↑/↓ · Enter view · d delete · Esc back"
    if (v.startsWith("wl:")) return "↑/↓ · Enter add · d remove stock · Esc back"
    return "↑/↓ · Enter open · Esc back"
  }

  return (
    <ModalFrame title={title()} footer={footer()} notice={notice.notice()} error={notice.err()}>
      <Show
        when={form.active()}
        fallback={
          <Show
            when={view() === "detail"}
            fallback={
              <Show when={!loading()} fallback={<text fg={theme.textMuted}>Loading…</text>}>
                <Show when={items().length > 0} fallback={<text fg={theme.textMuted}>Nothing here.</text>}>
                  <ModalList
                    window={nav.window()}
                    selectable={(r) => r.kind !== "info" && r.kind !== "stock"}
                    label={label}
                    right={right}
                  />
                </Show>
              </Show>
            }
          >
            <box flexDirection="column">
              <For each={detail()?.lines ?? []}>{(line) => <text fg={theme.text}>{line}</text>}</For>
            </box>
          </Show>
        }
      >
        <ModalFormView form={form} fields={form.spec()?.fields ?? []} title={form.spec()?.title} />
      </Show>
    </ModalFrame>
  )
}
