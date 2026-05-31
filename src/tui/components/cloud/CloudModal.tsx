import type { Note, Portfolio, Watchlist } from "@core/fincept"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { FinceptAuthError, InsufficientCreditsError } from "@shared/errors"
import type { AuthContext } from "@tui/context/auth"
import { useTheme } from "@tui/context/theme"
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

interface InputSpec {
  title: string
  fields: string[]
  onComplete: (values: string[]) => Promise<void> | void
}

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

  const [view, setView] = createSignal<View>("menu")
  const [cursor, setCursor] = createSignal(0)
  const [rows, setRows] = createSignal<Row[]>([])
  const [loading, setLoading] = createSignal(false)
  const [notice, setNotice] = createSignal<string | undefined>()
  const [err, setErr] = createSignal<string | undefined>()
  const [detail, setDetail] = createSignal<{ title: string; lines: string[]; from: View }>()

  // multi-step text input
  const [input, setInput] = createSignal<InputSpec | null>(null)
  const [stepIdx, setStepIdx] = createSignal(0)
  const [vals, setVals] = createSignal<string[]>([])
  const [buf, setBuf] = createSignal("")

  const rerender = () => renderer.requestRender()
  const flash = (m: string) => {
    setNotice(m)
    setErr(undefined)
    rerender()
  }
  const fail = (m: string) => {
    setErr(m)
    setNotice(undefined)
    rerender()
  }
  const run = (p: Promise<unknown> | unknown): Promise<void> =>
    Promise.resolve(p)
      .then(() => undefined)
      .catch((e) => fail(errMsg(e)))
  function startInput(spec: InputSpec) {
    setInput(spec)
    setStepIdx(0)
    setVals([])
    setBuf("")
    setErr(undefined)
    rerender()
  }

  async function loadView(v: View) {
    if (v === "menu" || v === "detail") return
    setLoading(true)
    setErr(undefined)
    setRows([])
    try {
      if (v === "watchlists") {
        const r = await sync.watchlists.list()
        setRows([
          {
            kind: "add",
            label: "＋ New watchlist",
            act: () =>
              startInput({
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
              startInput({
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
              startInput({
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
      fail(errMsg(e))
    } finally {
      setLoading(false)
      rerender()
    }
  }

  function enter(v: View) {
    setView(v)
    setCursor(0)
    setNotice(undefined)
    setErr(undefined)
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
    setCursor(0)
    rerender()
  }

  // biome-ignore lint/suspicious/noExplicitAny: @opentui keyboard event is untyped (matches SettingsModal)
  useKeyboard((e: any) => {
    const spec = input()
    if (spec) {
      if (e.name === "escape") {
        setInput(null)
        rerender()
      } else if (e.name === "return" || e.name === "kpenter") {
        const collected = [...vals(), buf()]
        if (stepIdx() < spec.fields.length - 1) {
          setVals(collected)
          setStepIdx(stepIdx() + 1)
          setBuf("")
          rerender()
        } else {
          setInput(null)
          void Promise.resolve(spec.onComplete(collected)).catch((x) => fail(errMsg(x)))
        }
      } else if (e.name === "backspace") {
        setBuf((b) => b.slice(0, -1))
        rerender()
      } else if (typeof e.sequence === "string" && e.sequence.length === 1 && !e.ctrl && !e.meta) {
        setBuf((b) => b + e.sequence)
        rerender()
      }
      return
    }

    if (view() === "detail") {
      if (e.name === "escape" || e.name === "left") {
        e.preventDefault?.()
        back()
      }
      return
    }

    const list = rows()
    if (e.name === "escape" || (e.name === "left" && view() !== "menu")) {
      e.preventDefault?.()
      back()
      return
    }
    if (e.name === "up") {
      e.preventDefault?.()
      setCursor((c) => Math.max(0, c - 1))
      rerender()
      return
    }
    if (e.name === "down") {
      e.preventDefault?.()
      const len = view() === "menu" ? MENU.length : list.length
      setCursor((c) => Math.min(Math.max(0, len - 1), c + 1))
      rerender()
      return
    }
    const enterKey = e.name === "return" || e.name === "kpenter"

    if (view() === "menu") {
      if (enterKey) {
        e.preventDefault?.()
        const m = MENU[cursor()]
        if (m) enter(m.key)
      }
      return
    }

    const row = list[cursor()]
    if (!row) return
    if (row.kind === "add") {
      if (enterKey) {
        e.preventDefault?.()
        row.act()
      }
      return
    }
    if (row.kind === "wl" && enterKey) {
      e.preventDefault?.()
      enter(`wl:${row.wl.id}`)
      return
    }
    if (row.kind === "note") {
      if (enterKey) {
        e.preventDefault?.()
        setDetail({ title: row.note.title, lines: (row.note.content ?? "").split("\n"), from: "notes" })
        setView("detail")
        rerender()
      } else if (e.name === "d" || e.sequence === "d") {
        e.preventDefault?.()
        void run(sync.notes.remove(row.note.id).then(() => loadView("notes")))
      }
      return
    }
    if (row.kind === "pf" && enterKey) {
      e.preventDefault?.()
      setDetail({
        title: row.pf.name,
        lines: Object.entries(row.pf).map(
          ([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`,
        ),
        from: "portfolios",
      })
      setView("detail")
      rerender()
      return
    }
    if (row.kind === "stock" && (e.name === "d" || e.sequence === "d")) {
      e.preventDefault?.()
      const id = view().slice(3)
      void run(sync.watchlists.removeStock(id, row.symbol).then(() => loadView(view())))
    }
  })

  // ── render ───────────────────────────────────────────────────────────────
  const WINDOW = 14
  function windowed<T>(items: T[]): { slice: T[]; offset: number } {
    if (items.length <= WINDOW) return { slice: items, offset: 0 }
    const off = Math.min(Math.max(0, cursor() - Math.floor(WINDOW / 2)), items.length - WINDOW)
    return { slice: items.slice(off, off + WINDOW), offset: off }
  }
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

  const menuRows = (): Row[] => MENU.map((m) => ({ kind: "menu", key: m.key, label: m.label }))
  const visibleRows = () => (view() === "menu" ? menuRows() : rows())

  return (
    <box flexDirection="column" minWidth={62} gap={0}>
      <text fg={theme.accent}>{title()}</text>
      <box height={1} minHeight={0} />

      <Show when={input()}>
        {(spec) => (
          <box flexDirection="column" gap={0}>
            <text fg={theme.accent}>{spec().title}</text>
            <For each={vals()}>
              {(v, i) => (
                <text fg={theme.textMuted}>
                  {spec().fields[i()]}: {v}
                </text>
              )}
            </For>
            <text fg={theme.text}>
              {spec().fields[stepIdx()]}: {buf()}
              <span style={{ fg: theme.accent }}>▏</span>
            </text>
            <text fg={theme.textMuted}>Enter · Esc cancel</text>
          </box>
        )}
      </Show>

      <Show when={!input() && view() === "detail"}>
        <box flexDirection="column">
          <For each={detail()?.lines ?? []}>{(line) => <text fg={theme.text}>{line}</text>}</For>
        </box>
      </Show>

      <Show when={!input() && view() !== "detail"}>
        <Show when={!loading()} fallback={<text fg={theme.textMuted}>Loading…</text>}>
          <Show when={visibleRows().length > 0} fallback={<text fg={theme.textMuted}>Nothing here.</text>}>
            <box flexDirection="column">
              <For each={windowed(visibleRows()).slice}>
                {(r, i) => {
                  const idx = () => windowed(visibleRows()).offset + i()
                  const sel = () => idx() === cursor()
                  const actionable = r.kind !== "info" && r.kind !== "stock"
                  return (
                    <box
                      flexDirection="row"
                      justifyContent="space-between"
                      gap={2}
                      backgroundColor={sel() && actionable ? theme.backgroundElement : undefined}
                    >
                      <text fg={sel() && actionable ? theme.accent : theme.text}>
                        {(sel() && actionable ? "› " : "  ") + label(r)}
                      </text>
                      <text fg={theme.textMuted}>{right(r)}</text>
                    </box>
                  )
                }}
              </For>
            </box>
          </Show>
        </Show>
      </Show>

      <box height={1} minHeight={0} />
      <Show when={notice()}>
        <text fg={theme.accent}>{notice()}</text>
      </Show>
      <Show when={err()}>
        <text fg="#ff5555">{err()}</text>
      </Show>
      <text fg={theme.textMuted}>{footer()}</text>
    </box>
  )
}
