import type { ActionCommand } from "../types"

export function helpCommand(): ActionCommand {
  return {
    kind: "action",
    id: "help",
    name: "help",
    description: "List available slash commands",
    category: "General",
    source: "builtin",
    run(_args, ctx) {
      const lines = ctx
        .query("")
        .filter((c) => !c.isHidden)
        .map((c) => `/${c.name} — ${c.description}`)
        .join("\n")
      ctx.submitPrompt(`Available commands:\n\n${lines}`)
    },
  }
}
