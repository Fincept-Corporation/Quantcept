import type { Command } from "../types"
import { computerUseCommand } from "./computer-use"
import { helpCommand } from "./help"
import { newCommand } from "./new"
import { quitCommand } from "./quit"
import { themeCommand } from "./theme"

export function builtinCommands(): Command[] {
  return [helpCommand(), newCommand(), themeCommand(), quitCommand(), computerUseCommand()]
}
