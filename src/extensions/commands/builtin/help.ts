import type { SlashCommand } from "../registry"

export const helpCommand: SlashCommand = {
  name: "help",
  description: "List available slash commands",
  async run(_args, ctx) {
    return ctx.registry
      .list()
      .map((c) => `/${c.name} — ${c.description}`)
      .join("\n")
  },
}
