import type { ActionCommand } from "../types"
export function themeCommand(): ActionCommand {
  return {
    kind: "action",
    id: "view.theme",
    name: "theme",
    description: "Switch theme mode (dark|light)",
    category: "View",
    argumentHint: "[dark|light]",
    source: "builtin",
    run(args, ctx) {
      const arg = args.trim().toLowerCase()
      if (arg === "dark" || arg === "light") {
        ctx.setThemeMode(arg)
        ctx.toast(`Theme mode: ${arg}`)
      } else {
        ctx.setThemeMode("dark")
        ctx.toast("Theme mode: dark (pass `light` to switch)")
      }
    },
  }
}
