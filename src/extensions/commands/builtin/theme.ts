import type { ActionCommand } from "../types"
export function themeCommand(): ActionCommand {
  return {
    kind: "action",
    id: "view.theme",
    name: "theme",
    description: "Switch theme (name) or mode (dark|light)",
    category: "View",
    argumentHint: "[name|dark|light]",
    argChoices: ["dark", "light", "quantcept", "dracula", "nord", "catppuccin", "tokyonight"],
    source: "builtin",
    run(args, ctx) {
      const arg = args.trim().toLowerCase()
      if (arg === "") {
        ctx.openThemePicker()
        return
      }
      if (arg === "dark" || arg === "light") {
        ctx.setThemeMode(arg)
        ctx.toast(`Theme mode: ${arg}`)
        return
      }
      if (ctx.setTheme(arg)) {
        ctx.toast(`Theme: ${arg}`)
      } else {
        ctx.toast(`Unknown theme: ${arg}`)
      }
    },
  }
}
