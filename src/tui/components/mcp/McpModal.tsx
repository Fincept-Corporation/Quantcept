import { McpServerSchema } from "@core/mcp/config"
import type { McpManager, McpServerStatus } from "@core/mcp/manager"
import { removeServerFromSettings, writeServerToSettings } from "@core/mcp/persist"
import {
  ModalFormView,
  ModalFrame,
  ModalList,
  useListNav,
  useModalForm,
  useModalKeyboard,
  useNotice,
} from "@tui/ui/modal"
import { createSignal, Show } from "solid-js"

type Row = { kind: "add" } | { kind: "server"; s: McpServerStatus } | { kind: "info"; label: string }

/**
 * /mcp modal: list configured MCP servers with transport/state/tool-count, add a
 * server (stdio command or `--http <url>`, persisted to settings.json), remove,
 * and authenticate/logout OAuth servers. Built on the shared modal layer.
 */
export function McpModal(props: { mcp: McpManager; cwd: string; onClose: () => void }) {
  const mcp = props.mcp
  const [tick, setTick] = createSignal(0) // bump to re-read manager state after a mutation
  const bump = () => setTick((n) => n + 1)
  const notice = useNotice()
  const form = useModalForm({ onError: notice.fail })

  const rows = (): Row[] => {
    tick() // dependency
    const servers = mcp.status()
    const out: Row[] = [{ kind: "add" }]
    if (servers.length === 0) out.push({ kind: "info", label: "No MCP servers configured." })
    else out.push(...servers.map((s) => ({ kind: "server", s }) as Row))
    return out
  }

  function startAdd() {
    form.start({
      fields: ["Name", "Command (or: --http <url>)"],
      onComplete: async ([name, spec]) => {
        const trimmedName = (name ?? "").trim()
        const tokens = (spec ?? "").trim().split(/\s+/).filter(Boolean)
        if (!trimmedName || tokens.length === 0) {
          notice.fail("Name and command/url are both required.")
          return
        }
        const raw =
          tokens[0] === "--http"
            ? { type: "http", url: tokens[1] }
            : { type: "stdio", command: tokens[0], args: tokens.slice(1) }
        const parsed = McpServerSchema.safeParse(raw)
        if (!parsed.success) {
          notice.fail(`Invalid MCP server spec: ${parsed.error.message}`)
          return
        }
        const result = await mcp.addServer(trimmedName, parsed.data)
        if (result.ok) writeServerToSettings(trimmedName, parsed.data, props.cwd)
        bump()
        if (result.ok) notice.flash(result.message)
        else notice.fail(result.message)
      },
    })
  }

  // Run an async manager action with a "Working…" indicator and notice/err result.
  async function withBusy(tag: string, p: Promise<{ ok: boolean; message: string }>) {
    notice.setBusy(tag)
    try {
      const r = await p
      bump()
      if (r.ok) notice.flash(r.message)
      else notice.fail(r.message)
    } catch (e) {
      notice.fail(e)
    } finally {
      notice.setBusy(undefined)
    }
  }

  const nav = useListNav<Row>({
    items: rows,
    onSelect: (row) => {
      if (row.kind === "add") startAdd()
      else if (row.kind === "server") void withBusy(`auth ${row.s.name}`, mcp.authenticate(row.s.name))
    },
    onKey: (e, row) => {
      if (row?.kind !== "server") return false
      const name = row.s.name
      const isKey = (ch: string) => e.name === ch || e.sequence === ch
      if (isKey("o")) {
        void withBusy(`logout ${name}`, mcp.logout(name))
        return true
      }
      if (isKey("r")) {
        void withBusy(
          `remove ${name}`,
          mcp.removeServer(name).then((r) => {
            if (r.ok) removeServerFromSettings(name, props.cwd)
            nav.setCursor(Math.max(0, nav.cursor() - 1))
            return r
          }),
        )
        return true
      }
      return false
    },
    onEscape: props.onClose,
  })

  useModalKeyboard({ form, nav })

  const label = (r: Row): string => {
    if (r.kind === "add") return "＋ Add server…"
    if (r.kind === "info") return r.label
    return r.s.name
  }
  const right = (r: Row): string => {
    if (r.kind !== "server") return ""
    const transport = r.s.type === "http" ? `http/${r.s.transport ?? "?"}` : "stdio"
    const tools = r.s.toolCount ? ` · ${r.s.toolCount} tool(s)` : ""
    return `[${transport}] ${r.s.state}${tools}`
  }

  return (
    <ModalFrame
      title="🔌 MCP servers"
      footer="↑/↓ · Enter add/auth · o logout · r remove · Esc close"
      notice={notice.notice()}
      error={notice.err()}
      busy={notice.busy()}
    >
      <Show
        when={form.active()}
        fallback={<ModalList window={nav.window()} selectable={(r) => r.kind !== "info"} label={label} right={right} />}
      >
        <ModalFormView
          form={form}
          fields={form.spec()?.fields ?? []}
          title="Add MCP server"
          footer="Enter next · Esc cancel — stdio: npx -y @scope/mcp · http: --http https://…"
        />
      </Show>
    </ModalFrame>
  )
}
