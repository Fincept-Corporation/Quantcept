import type { JSX } from "solid-js"

export type CommandKind = "prompt" | "action" | "jsx"
export type CommandSource = "builtin" | "user" | "project" | "skill" | "plugin"
export type DispatchSource = "palette" | "slash" | "keybind"

export interface CommandRunContext {
  args: string
  source: DispatchSource
  submitPrompt(text: string): void
  clearMessages(): void
  runSkill(skillName: string, args: string): void
  navigate(route: { type: "home" } | { type: "session"; sessionID: string; initialMessage?: string }): void
  setThemeMode(mode: "dark" | "light"): void
  setTheme(name: string): boolean
  themeNames(): string[]
  openThemePicker(): void
  showDialog(render: () => JSX.Element): void
  closeDialog(): void
  toast(message: string): void
  /** Re-apply computer-use config in the live session (after changing the key), no restart. */
  reloadComputerUse(): void
  exit(): void
  query(search: string): Command[]
}

export interface CommandBase {
  id: string
  name: string
  description: string
  category?: string
  aliases?: string[]
  argumentHint?: string
  /** Suggested first-argument values, shown in the slash popover after a space. */
  argChoices?: string[]
  keybind?: string
  source: CommandSource
  isEnabled?: () => boolean
  isHidden?: boolean
}

export interface PromptCommand extends CommandBase {
  kind: "prompt"
  getPrompt(args: string, ctx: CommandRunContext): string | Promise<string>
}
export interface ActionCommand extends CommandBase {
  kind: "action"
  run(args: string, ctx: CommandRunContext): void | Promise<void>
}
export interface JsxCommand extends CommandBase {
  kind: "jsx"
  render(ctx: CommandRunContext): JSX.Element
}
export type Command = PromptCommand | ActionCommand | JsxCommand
