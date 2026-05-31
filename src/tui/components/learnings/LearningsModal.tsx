import type { LearningItem } from "@core/fincept"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { FinceptAuthError, InsufficientCreditsError } from "@shared/errors"
import type { AuthContext } from "@tui/context/auth"
import { useTheme } from "@tui/context/theme"
import { createSignal, For, Show } from "solid-js"

type View = "feed" | "search" | "detail"
type Row =
  | { kind: "action"; label: string; act: () => void }
  | { kind: "item"; item: LearningItem }
  | { kind: "info"; label: string }

interface InputSpec {
  title: string
  fields: string[]
  onComplete: (values: string[]) => Promise<void> | void
}

function errMsg(e: unknown): string {
  if (e instanceof InsufficientCreditsError) return `Insufficient credits (need ${e.required}, have ${e.available}).`
  if (e instanceof FinceptAuthError) return "Not signed in to Fincept."
  return e instanceof Error ? e.message : String(e)
}

/**
 * The community "learnings" registry: search (pgvector), browse the feed, view
 * a learning's metadata, get a download URL, and publish. Reads auth.learnings.
 */
export function LearningsModal(props: { auth: AuthContext; onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const lib = props.auth.learnings

  const [view, setView] = createSignal<View>("feed")
  const [cursor, setCursor] = createSignal(0)
  const [rows, setRows] = createSignal<Row[]>([])
  const [loading, setLoading] = createSignal(false)
  const [notice, setNotice] = createSignal<string | undefined>()
  const [err, setErr] = createSignal<string | undefined>()
  const [current, setCurrent] = createSignal<LearningItem | undefined>()

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

  const searchAction = (): Row => ({
    kind: "action",
    label: "🔍 Search…",
    act: () =>
      startInput({ title: "Search learnings", fields: ["Query"], onComplete: ([q]) => doSearch((q ?? "").trim()) }),
  })
  const publishAction = (): Row => ({
    kind: "action",
    label: "＋ Publish a learning",
    act: () =>
      startInput({
        title: "Publish learning (pending approval)",
        fields: ["Title", "Content"],
        onComplete: ([title, content]) =>
          run(
            lib
              .upload({ title: title ?? "", content: content ?? "" })
              .then(() => flash("Published — pending admin approval.")),
          ),
      }),
  })

  async function loadFeed() {
    setView("feed")
    setCursor(0)
    setLoading(true)
    setErr(undefined)
    try {
      const r = await lib.list()
      setRows([
        searchAction(),
        publishAction(),
        ...(r.data?.items ?? []).map((item) => ({ kind: "item", item }) as Row),
      ])
    } catch (e) {
      setRows([searchAction(), publishAction()])
      fail(errMsg(e))
    } finally {
      setLoading(false)
      rerender()
    }
  }

  async function doSearch(q: string) {
    if (!q) return
    setView("search")
    setCursor(0)
    setLoading(true)
    setErr(undefined)
    try {
      const r = await lib.search(q)
      const results = (r.data?.results ?? []).map((item) => ({ kind: "item", item }) as Row)
      setRows([
        searchAction(),
        ...(results.length ? results : [{ kind: "info", label: `No matches for "${q}".` } as Row]),
      ])
    } catch (e) {
      setRows([searchAction()])
      fail(errMsg(e))
    } finally {
      setLoading(false)
      rerender()
    }
  }

  function openDetail(item: LearningItem) {
    setCurrent(item)
    setView("detail")
    setNotice(undefined)
    setErr(undefined)
    rerender()
  }

  // load the feed once on open
  void loadFeed()

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
        loadDetailBack()
      } else if (e.name === "g" || e.sequence === "g") {
        e.preventDefault?.()
        const it = current()
        if (it) void run(lib.download(it.id).then((r) => flash(`Download URL (10 min): ${r.data.download_url}`)))
      }
      return
    }

    const list = rows()
    if (e.name === "escape") {
      e.preventDefault?.()
      if (view() === "search") void loadFeed()
      else props.onClose()
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
      setCursor((c) => Math.min(Math.max(0, list.length - 1), c + 1))
      rerender()
      return
    }
    const row = list[cursor()]
    if (!row) return
    const enterKey = e.name === "return" || e.name === "kpenter"
    if (row.kind === "action" && enterKey) {
      e.preventDefault?.()
      row.act()
    } else if (row.kind === "item" && enterKey) {
      e.preventDefault?.()
      openDetail(row.item)
    }
  })

  // detail "back" returns to whichever list we came from; simplest is to re-show the feed.
  function loadDetailBack() {
    setView("feed")
    setCursor(0)
    rerender()
  }

  // ── render ───────────────────────────────────────────────────────────────
  const WINDOW = 14
  function windowed<T>(items: T[]): { slice: T[]; offset: number } {
    if (items.length <= WINDOW) return { slice: items, offset: 0 }
    const off = Math.min(Math.max(0, cursor() - Math.floor(WINDOW / 2)), items.length - WINDOW)
    return { slice: items.slice(off, off + WINDOW), offset: off }
  }
  function label(r: Row): string {
    if (r.kind === "action" || r.kind === "info") return r.label
    return r.item.title
  }
  function right(r: Row): string {
    if (r.kind !== "item") return ""
    const bits: string[] = []
    if (r.item.author) bits.push(r.item.author)
    if (typeof r.item.downloads === "number") bits.push(`${r.item.downloads}↓`)
    return bits.join(" · ")
  }
  function detailLines(it: LearningItem): string[] {
    const lines: string[] = []
    if (it.description) lines.push(it.description, "")
    if (it.author) lines.push(`Author: ${it.author}`)
    if (it.status) lines.push(`Status: ${it.status}`)
    if (typeof it.version === "number") lines.push(`Version: ${it.version}`)
    if (typeof it.downloads === "number") lines.push(`Downloads: ${it.downloads}`)
    if (typeof it.file_size === "number") lines.push(`Size: ${it.file_size} bytes`)
    if (it.tags?.length) lines.push(`Tags: ${it.tags.join(", ")}`)
    return lines
  }

  return (
    <box flexDirection="column" minWidth={62} gap={0}>
      <text fg={theme.accent}>{view() === "detail" ? `📚  ${current()?.title ?? ""}` : "📚  Learnings registry"}</text>
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
          <For each={detailLines(current() ?? ({} as LearningItem))}>
            {(line) => <text fg={theme.text}>{line}</text>}
          </For>
        </box>
      </Show>

      <Show when={!input() && view() !== "detail"}>
        <Show when={!loading()} fallback={<text fg={theme.textMuted}>Loading…</text>}>
          <box flexDirection="column">
            <For each={windowed(rows()).slice}>
              {(r, i) => {
                const idx = () => windowed(rows()).offset + i()
                const sel = () => idx() === cursor()
                const actionable = r.kind !== "info"
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

      <box height={1} minHeight={0} />
      <Show when={notice()}>
        <text fg={theme.accent}>{notice()}</text>
      </Show>
      <Show when={err()}>
        <text fg="#ff5555">{err()}</text>
      </Show>
      <text fg={theme.textMuted}>
        {view() === "detail" ? "g download URL · Esc back" : "↑/↓ · Enter open · Esc back/close"}
      </text>
    </box>
  )
}
