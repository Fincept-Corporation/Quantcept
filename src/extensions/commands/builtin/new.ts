import type { ActionCommand } from "../types"
export function newCommand(): ActionCommand {
  return { kind: "action", id: "session.new", name: "new", description: "Start a new session", category: "Session", source: "builtin", keybind: "ctrl+n", run() {} }
}
