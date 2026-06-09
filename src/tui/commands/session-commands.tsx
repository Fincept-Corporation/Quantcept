import type { McpManager } from "@core/mcp/manager"
import { remember } from "@core/memory"
import { projectHash } from "@core/storage/paths"
import type { ActionCommand } from "@ext/commands/types"
import { McpModal } from "@tui/components/mcp/McpModal"
import { MemoryModal } from "@tui/components/memory/MemoryModal"
import { PositionsModal } from "@tui/components/positions/PositionsModal"
import type { useSnapshot } from "@tui/context/snapshot"
import { markdownToPlainText } from "@tui/markdown/toPlainText"
import { copyToClipboard } from "@tui/platform/clipboard"
import { DialogConfirm } from "@tui/ui/dialog-confirm"

/**
 * Dependencies the session commands close over BEYOND the `CommandRunContext` (`ctx` already
 * supplies clearMessages / showDialog / closeDialog / toast). Everything is a stable reference
 * or a getter, so the catalog can be built once and registered.
 */
export interface SessionCommandDeps {
  snapshot: ReturnType<typeof useSnapshot>
  sessionId: () => string
  dialog: Parameters<typeof DialogConfirm.show>[0]
  renderer: Parameters<typeof copyToClipboard>[1]
  mcp: McpManager
  messages: readonly { role: string; content: string }[]
}

/**
 * The session route's built-in action commands AS DATA — one catalog instead of ~9 inline
 * `commands.register(...)` blocks in the component. Render-identical and dependency-light here;
 * `resume` (cloud/route logic) and the reactive `agent`/skill commands stay in the route because
 * they re-register as async state resolves.
 */
export function sessionCommands(deps: SessionCommandDeps): ActionCommand[] {
  return [
    {
      kind: "action",
      id: "session.clear",
      name: "clear",
      description: "Clear the current conversation",
      category: "Session",
      source: "builtin",
      keybind: "ctrl+l",
      run: (_args, ctx) => ctx.clearMessages(),
    },
    {
      kind: "action",
      id: "session.undo",
      name: "undo",
      description: "Revert the last file change the assistant made",
      category: "Session",
      source: "builtin",
      run(_args, ctx) {
        const result = deps.snapshot.undo(deps.sessionId())
        if (!result) {
          ctx.toast("Nothing to undo.")
          return
        }
        ctx.toast(result.files.length ? `Reverted: ${result.files.join(", ")}` : "Reverted last change.")
      },
    },
    {
      kind: "action",
      id: "session.redo",
      name: "redo",
      description: "Re-apply the last undone file change",
      category: "Session",
      source: "builtin",
      run: (_args, ctx) => ctx.toast(deps.snapshot.redo() ? "Re-applied last change." : "Nothing to redo."),
    },
    {
      kind: "action",
      id: "session.checkpoints",
      name: "checkpoints",
      description: "List turn checkpoints and roll the worktree back to one",
      category: "Session",
      source: "builtin",
      async run(_args, ctx) {
        const cps = deps.snapshot.listCheckpoints(deps.sessionId(), "turn")
        if (cps.length === 0) {
          ctx.toast("No checkpoints yet.")
          return
        }
        const latest = cps[0]!
        const lines = cps
          .slice(0, 10)
          .map((c, i) => `${i + 1}. ${c.label ?? "(turn)"}`)
          .join("\n")
        // Whole-worktree restore is destructive of uncommitted work — confirm first.
        const ok = await DialogConfirm.show(
          deps.dialog,
          "Roll back to the latest checkpoint?",
          `This restores all files to:\n"${latest.label ?? "(turn)"}"\n\nRecent checkpoints:\n${lines}`,
        )
        if (!ok) return
        deps.snapshot.revertTo(latest.treeHash)
        ctx.toast("Rolled back to the latest checkpoint.")
      },
    },
    {
      kind: "action",
      id: "session.remember",
      name: "remember",
      description: "Save a fact to this project's memory",
      category: "Memory",
      source: "builtin",
      run(args, ctx) {
        const fact = args.trim()
        if (!fact) {
          ctx.toast("Usage: /remember <fact>")
          return
        }
        const title = fact.split(/\s+/).slice(0, 6).join(" ").slice(0, 40)
        remember({ scope: "project", projectHash: projectHash(process.cwd()), title, fact })
        ctx.toast(`Remembered: ${title}`)
      },
    },
    {
      kind: "action",
      id: "session.memory",
      name: "memory",
      description: "Browse, view & delete saved memories",
      category: "Memory",
      source: "builtin",
      run: (_args, ctx) => ctx.showDialog(() => <MemoryModal onClose={ctx.closeDialog} />),
    },
    {
      kind: "action",
      id: "session.positions",
      name: "positions",
      description: "View trading positions & the order audit log",
      category: "Trading",
      source: "builtin",
      run: (_args, ctx) => ctx.showDialog(() => <PositionsModal onClose={ctx.closeDialog} />),
    },
    {
      kind: "action",
      id: "session.copy",
      name: "copy",
      description: "Copy the assistant's last response to the clipboard",
      category: "Session",
      source: "builtin",
      keybind: "ctrl+y",
      async run(_args, ctx) {
        let text: string | undefined
        for (let i = deps.messages.length - 1; i >= 0; i--) {
          const m = deps.messages[i]
          if (m && m.role === "assistant" && m.content.length > 0) {
            text = m.content
            break
          }
        }
        if (!text) {
          ctx.toast("No response to copy yet.")
          return
        }
        // Clean plain text via the native OS clipboard first (works even when the terminal blocks
        // OSC 52), then OSC 52 via the renderer as the remote/SSH fallback.
        const res = await copyToClipboard(markdownToPlainText(text), deps.renderer)
        ctx.toast(
          res.ok
            ? "Copied last response to clipboard."
            : "Couldn't reach the clipboard (OS clipboard + OSC 52 both failed).",
        )
      },
    },
    {
      kind: "action",
      id: "session.mcp",
      name: "mcp",
      description: "Browse & manage MCP servers (add, remove, auth, logout)",
      category: "MCP",
      source: "builtin",
      run: (_args, ctx) =>
        ctx.showDialog(() => <McpModal mcp={deps.mcp} cwd={process.cwd()} onClose={ctx.closeDialog} />),
    },
  ]
}
