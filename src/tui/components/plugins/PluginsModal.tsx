import type { PluginContributions, PluginManager } from "@core/plugins/manager"
import type { MarketplacePluginEntry } from "@core/plugins/marketplace"
import type { InstalledPlugin } from "@core/plugins/state"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, For, Show } from "solid-js"

type View = "menu" | "installed" | "marketplaces" | "hooks" | `browse:${string}`

// A renderable + actionable row in the current view.
type PRow =
  | { kind: "menu"; key: View; label: string; right?: string }
  | { kind: "installed"; plugin: InstalledPlugin; right: string }
  | { kind: "mp-add" }
  | { kind: "mp"; name: string }
  | { kind: "catalog"; entry: MarketplacePluginEntry }
  | { kind: "hook"; label: string; right: string }
  | { kind: "info"; label: string }

const MENU: { key: View; label: string }[] = [
  { key: "installed", label: "Installed plugins" },
  { key: "marketplaces", label: "Marketplaces" },
  { key: "hooks", label: "Active hooks" },
]

export function PluginsModal(props: {
  manager: PluginManager
  reload: () => void
  contributions: () => PluginContributions
  onClose: () => void
}) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const mgr = props.manager

  const [view, setView] = createSignal<View>("menu")
  const [cursor, setCursor] = createSignal(0)
  const [tick, setTick] = createSignal(0) // bump to re-read manager state after a mutation
  const [notice, setNotice] = createSignal<string | undefined>()
  const [err, setErr] = createSignal<string | undefined>()
  const [loading, setLoading] = createSignal(false)
  const [catalog, setCatalog] = createSignal<MarketplacePluginEntry[] | null>(null)

  // add-marketplace text input
  const [adding, setAdding] = createSignal(false)
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
  const bump = () => setTick((n) => n + 1)
  const run = (p: Promise<unknown> | unknown) => Promise.resolve(p).catch((e) => fail((e as Error).message))

  // Per-plugin contribution counts (only enabled+loaded plugins are in contributions).
  const counts = createMemo(() => {
    const m = new Map<string, string>()
    for (const p of props.contributions().plugins) {
      m.set(p.name, `${p.skills.length}sk ${p.commands.length}cm ${p.agents.length}ag`)
    }
    return m
  })

  function rows(): PRow[] {
    tick() // dependency
    const v = view()
    if (v === "menu") return MENU.map((m) => ({ kind: "menu", key: m.key, label: m.label }))
    if (v === "installed") {
      const c = counts()
      return mgr.listInstalled().map((p) => ({
        kind: "installed",
        plugin: p,
        right: `${p.enabled ? "on" : "off"}${p.enabled && c.has(p.name) ? ` · ${c.get(p.name)}` : ""}`,
      }))
    }
    if (v === "marketplaces") {
      return [{ kind: "mp-add" } as PRow, ...mgr.listMarketplaces().map((m) => ({ kind: "mp", name: m.name }) as PRow)]
    }
    if (v === "hooks") {
      const list = props
        .contributions()
        .hookRegistry.list()
        .filter((h) => h.count > 0)
      return list.length
        ? list.map((h) => ({ kind: "hook", label: h.source, right: `${h.events.join(", ")} (${h.count})` }) as PRow)
        : [{ kind: "info", label: "No active hooks." }]
    }
    // browse:<marketplace>
    const cat = catalog()
    if (cat == null) return []
    return cat.length
      ? cat.map((e) => ({ kind: "catalog", entry: e }) as PRow)
      : [{ kind: "info", label: "This marketplace lists no plugins." }]
  }

  async function loadCatalog(name: string) {
    setLoading(true)
    setCatalog(null)
    setErr(undefined)
    try {
      const mp = await mgr.browseMarketplace(name)
      setCatalog(mp.plugins)
    } catch (e) {
      setCatalog([])
      fail((e as Error).message)
    } finally {
      setLoading(false)
      rerender()
    }
  }

  function enter(key: View) {
    setView(key)
    setCursor(0)
    setNotice(undefined)
    setErr(undefined)
    if (key.startsWith("browse:")) void loadCatalog(key.slice(7))
  }

  function back() {
    const v = view()
    if (v.startsWith("browse:")) {
      setCatalog(null)
      enter("marketplaces")
    } else if (v === "menu") props.onClose()
    else {
      setView("menu")
      setCursor(0)
    }
    rerender()
  }

  // biome-ignore lint/suspicious/noExplicitAny: @opentui keyboard event is untyped (matches SettingsModal)
  useKeyboard((e: any) => {
    if (adding()) {
      if (e.name === "escape") {
        setAdding(false)
        setBuf("")
        rerender()
      } else if (e.name === "return" || e.name === "kpenter") {
        const src = buf().trim()
        setAdding(false)
        setBuf("")
        if (src)
          void run(
            mgr.addMarketplace(src).then((mp) => {
              bump()
              flash(`Added "${mp.name}" (${mp.plugins.length} plugin(s)).`)
            }),
          )
      } else if (e.name === "backspace") {
        setBuf((b) => b.slice(0, -1))
        rerender()
      } else if (typeof e.sequence === "string" && e.sequence.length === 1 && !e.ctrl && !e.meta) {
        setBuf((b) => b + e.sequence)
        rerender()
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
      setCursor((c) => Math.min(Math.max(0, list.length - 1), c + 1))
      rerender()
      return
    }
    const row = list[cursor()]
    if (!row) return
    const enterKey = e.name === "return" || e.name === "kpenter"
    const key = (ch: string) => e.name === ch || e.sequence === ch

    if (row.kind === "menu") {
      if (enterKey) {
        e.preventDefault?.()
        enter(row.key)
        rerender()
      }
      return
    }
    if (row.kind === "installed") {
      if (enterKey) {
        e.preventDefault?.()
        const p = row.plugin
        if (p.enabled) mgr.disable(p.name)
        else mgr.enable(p.name)
        props.reload()
        bump()
        flash(`${p.enabled ? "Disabled" : "Enabled"} ${p.name}.`)
      } else if (key("u")) {
        e.preventDefault?.()
        const name = row.plugin.name
        void run(
          mgr.uninstall(name).then(() => {
            props.reload()
            setCursor((c) => Math.max(0, c - 1))
            bump()
            flash(`Uninstalled ${name}.`)
          }),
        )
      }
      return
    }
    if (row.kind === "mp-add") {
      if (enterKey) {
        e.preventDefault?.()
        setAdding(true)
        setBuf("")
        setErr(undefined)
        rerender()
      }
      return
    }
    if (row.kind === "mp") {
      if (enterKey) {
        e.preventDefault?.()
        enter(`browse:${row.name}`)
        rerender()
      } else if (key("r")) {
        e.preventDefault?.()
        mgr.removeMarketplace(row.name)
        setCursor((c) => Math.max(0, c - 1))
        bump()
        flash(`Removed marketplace ${row.name}.`)
      }
      return
    }
    if (row.kind === "catalog") {
      if (enterKey) {
        e.preventDefault?.()
        const mpName = view().slice(7)
        const spec = `${row.entry.name}@${mpName}`
        flash(`Installing ${row.entry.name}…`)
        void run(
          mgr.install(spec).then((p) => {
            props.reload()
            bump()
            flash(`Installed "${p.name}". Skills/commands load now; MCP on next session.`)
          }),
        )
      }
      return
    }
  })

  // ── render ───────────────────────────────────────────────────────────────
  const WINDOW = 14
  function windowed(items: PRow[]): { slice: PRow[]; offset: number } {
    if (items.length <= WINDOW) return { slice: items, offset: 0 }
    const off = Math.min(Math.max(0, cursor() - Math.floor(WINDOW / 2)), items.length - WINDOW)
    return { slice: items.slice(off, off + WINDOW), offset: off }
  }
  function rowLabel(r: PRow): string {
    if (r.kind === "menu") return r.label
    if (r.kind === "installed") return r.plugin.name
    if (r.kind === "mp-add") return "＋ Add marketplace…"
    if (r.kind === "mp") return r.name
    if (r.kind === "catalog") return r.entry.description ? `${r.entry.name} — ${r.entry.description}` : r.entry.name
    return r.label
  }
  function rowRight(r: PRow): string {
    if (r.kind === "installed" || r.kind === "hook") return r.right
    if (r.kind === "catalog") return r.entry.version ?? ""
    return ""
  }
  const title = () => {
    const v = view()
    if (v === "menu") return "🧩  Plugins & Marketplaces"
    if (v.startsWith("browse:")) return `🧩  Browse — ${v.slice(7)}`
    return `🧩  ${MENU.find((m) => m.key === v)?.label ?? v}`
  }
  const footer = () => {
    const v = view()
    if (v === "menu") return "↑/↓ move · Enter open · Esc close"
    if (v === "installed") return "↑/↓ · Enter enable/disable · u uninstall · Esc back"
    if (v === "marketplaces") return "↑/↓ · Enter add/browse · r remove · Esc back"
    if (v.startsWith("browse:")) return "↑/↓ · Enter install · Esc back"
    return "Esc back"
  }

  return (
    <box flexDirection="column" minWidth={62} gap={0}>
      <text fg={theme.accent}>{title()}</text>
      <box height={1} minHeight={0} />

      <Show when={adding()}>
        <box flexDirection="column" gap={0}>
          <text fg={theme.accent}>Add marketplace — source (url · owner/repo · npm:pkg · local path)</text>
          <text fg={theme.text}>
            {buf()}
            <span style={{ fg: theme.accent }}>▏</span>
          </text>
          <text fg={theme.textMuted}>Enter · Esc cancel</text>
        </box>
      </Show>

      <Show when={!adding()}>
        <Show when={!loading()} fallback={<text fg={theme.textMuted}>Loading…</text>}>
          <box flexDirection="column">
            <Show when={rows().length > 0} fallback={<text fg={theme.textMuted}>Nothing here.</text>}>
              <For each={windowed(rows()).slice}>
                {(row, i) => {
                  const idx = () => windowed(rows()).offset + i()
                  const sel = () => idx() === cursor()
                  const actionable = row.kind !== "info"
                  const marker = !actionable ? "  " : sel() ? "› " : "  "
                  return (
                    <box
                      flexDirection="row"
                      justifyContent="space-between"
                      gap={2}
                      backgroundColor={sel() && actionable ? theme.backgroundElement : undefined}
                    >
                      <text fg={sel() && actionable ? theme.accent : theme.text}>
                        {marker}
                        {rowLabel(row)}
                      </text>
                      <text fg={theme.textMuted}>{rowRight(row)}</text>
                    </box>
                  )
                }}
              </For>
            </Show>
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
      <text fg={theme.textMuted}>{footer()}</text>
    </box>
  )
}
