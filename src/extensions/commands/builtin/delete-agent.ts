import path from "node:path"
import { deleteAgentFile } from "@core/agent/agents"
import { projectConfigDir, userConfigDir } from "@core/config/paths"
import type { ActionCommand } from "../types"

export function deleteAgentCommand(): ActionCommand {
  return {
    kind: "action",
    id: "agent.delete",
    name: "delete-agent",
    description: "Delete a custom agent (user or project; built-ins can't be removed)",
    category: "Agents",
    source: "builtin",
    argumentHint: "<name>",
    async run(args, ctx) {
      const name = args.trim()
      if (!name) {
        ctx.toast("Usage: /delete-agent <name>")
        return
      }
      const removed = await deleteAgentFile(name, {
        userDir: path.join(userConfigDir(), "agents"),
        projectDir: path.join(projectConfigDir(), "agents"),
      })
      ctx.toast(
        removed.length > 0
          ? `Deleted agent "${name}". Reopen the agent picker (Tab) to refresh.`
          : `No custom agent "${name}" found to delete (built-ins can't be removed).`,
      )
    },
  }
}
