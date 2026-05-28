import type { ActionCommand } from "../types"
export function themeCommand(): ActionCommand {
  return { kind: "action", id: "view.theme", name: "theme", description: "Switch theme (dark|light)", category: "View", argumentHint: "[dark|light]", source: "builtin", run() {} }
}
