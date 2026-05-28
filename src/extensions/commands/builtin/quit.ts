import type { ActionCommand } from "../types"
export function quitCommand(): ActionCommand {
  return {
    kind: "action",
    id: "app.quit",
    name: "quit",
    description: "Exit Quantcept",
    category: "General",
    aliases: ["exit"],
    source: "builtin",
    run(_args, ctx) {
      ctx.exit()
    },
  }
}
