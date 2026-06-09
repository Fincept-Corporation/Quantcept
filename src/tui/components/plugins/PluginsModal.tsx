import type { PluginContributions, PluginManager } from "@core/plugins/manager"
import type { MarketplacePluginEntry } from "@core/plugins/marketplace"
import type { InstalledPlugin } from "@core/plugins/state"
import { useRenderer } from "@opentui/solid"
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
import { createMemo, createSignal, Show } from "solid-js"

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
  const [tick, setTick] = createSignal(0) // bump to re-read manager state after a mutation
  const [loading, setLoading] = createSignal(false)
  const [catalog, setCatalog] = createSignal<MarketplacePluginEntry[] | null>(null)
  const notice = useNotice()
  const form = useModalForm({ onError: notice.fail })
  const bump = () => setTick((n) => n + 1)
  const run = (p: Promise<unknown> | unknown) => Promise.resolve(p).catch((e) => notice.fail(e))

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
    const cat = catalog()
    if (cat == null) return []
    return cat.length
      ? cat.map((e) => ({ kind: "catalog", entry: e }) as PRow)
      : [{ kind: "info", label: "This marketplace lists no plugins." }]
  }

  async function loadCatalog(name: string) {
    setLoading(true)
    setCatalog(null)
    notice.clear()
    try {
      const mp = await mgr.browseMarketplace(name)
      setCatalog(mp.plugins)
    } catch (e) {
      setCatalog([])
      notice.fail(e)
    } finally {
      setLoading(false)
      renderer.requestRender()
    }
  }

  function enter(key: View) {
    setView(key)
    nav.setCursor(0)
    notice.clear()
    if (key.startsWith("browse:")) void loadCatalog(key.slice(7))
    renderer.requestRender()
  }

  function back() {
    const v = view()
    if (v.startsWith("browse:")) {
      setCatalog(null)
      enter("marketplaces")
    } else if (v === "menu") {
      props.onClose()
    } else {
      setView("menu")
      nav.setCursor(0)
      renderer.requestRender()
    }
  }

  function openAdd() {
    form.start({
      fields: ["source"],
      onComplete: async ([src]) => {
        const s = (src ?? "").trim()
        if (!s) return
        const mp = await mgr.addMarketplace(s)
        bump()
        notice.flash(`Added "${mp.name}" (${mp.plugins.length} plugin(s)).`)
      },
    })
  }

  const nav = useListNav<PRow>({
    items: rows,
    onSelect: (row) => {
      if (row.kind === "menu") {
        enter(row.key)
      } else if (row.kind === "installed") {
        const p = row.plugin
        if (p.enabled) mgr.disable(p.name)
        else mgr.enable(p.name)
        props.reload()
        bump()
        notice.flash(`${p.enabled ? "Disabled" : "Enabled"} ${p.name}.`)
      } else if (row.kind === "mp-add") {
        openAdd()
      } else if (row.kind === "mp") {
        enter(`browse:${row.name}`)
      } else if (row.kind === "catalog") {
        const mpName = view().slice(7)
        const spec = `${row.entry.name}@${mpName}`
        notice.flash(`Installing ${row.entry.name}…`)
        void run(
          mgr.install(spec).then((p) => {
            props.reload()
            bump()
            notice.flash(`Installed "${p.name}". Skills/commands load now; MCP on next session.`)
          }),
        )
      }
    },
    onKey: (e, row) => {
      if (e.name === "left" && view() !== "menu") {
        back()
        return true
      }
      const isKey = (ch: string) => e.name === ch || e.sequence === ch
      if (row?.kind === "installed" && isKey("u")) {
        const name = row.plugin.name
        void run(
          mgr.uninstall(name).then(() => {
            props.reload()
            nav.setCursor(Math.max(0, nav.cursor() - 1))
            bump()
            notice.flash(`Uninstalled ${name}.`)
          }),
        )
        return true
      }
      if (row?.kind === "mp" && isKey("r")) {
        mgr.removeMarketplace(row.name)
        nav.setCursor(Math.max(0, nav.cursor() - 1))
        bump()
        notice.flash(`Removed marketplace ${row.name}.`)
        return true
      }
      return false
    },
    onEscape: back,
  })
  useModalKeyboard({ form, nav })

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
    <ModalFrame title={title()} footer={footer()} notice={notice.notice()} error={notice.err()}>
      <Show
        when={form.active()}
        fallback={
          <Show when={!loading()} fallback={<text fg={theme.textMuted}>Loading…</text>}>
            <Show when={rows().length > 0} fallback={<text fg={theme.textMuted}>Nothing here.</text>}>
              <ModalList
                window={nav.window()}
                selectable={(r) => r.kind !== "info"}
                label={rowLabel}
                right={rowRight}
              />
            </Show>
          </Show>
        }
      >
        <ModalFormView
          form={form}
          fields={form.spec()?.fields ?? []}
          title="Add marketplace"
          footer="Enter · Esc cancel — url · owner/repo · npm:pkg · local path"
        />
      </Show>
    </ModalFrame>
  )
}
