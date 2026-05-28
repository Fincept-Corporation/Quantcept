import type { Command } from "../types"
import { helpCommand } from "./help"
import { newCommand } from "./new"
import { themeCommand } from "./theme"
import { quitCommand } from "./quit"

export function builtinCommands(): Command[] {
  return [helpCommand(), newCommand(), themeCommand(), quitCommand()]
}
