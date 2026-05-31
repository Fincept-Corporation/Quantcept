import type { ActionCommand, CommandRunContext } from "@ext/commands/types"
import type { AuthContext } from "@tui/context/auth"
import { SettingsModal } from "./SettingsModal"

/**
 * /settings and /account open the Settings & Account modal. Bound to the live
 * AuthContext (the dialog renders above AuthProvider in the tree, so it can't
 * useAuth() itself — we pass it in). Registered in App() like buddyCommands.
 */
export function settingsCommands(auth: AuthContext): ActionCommand[] {
  const open = (ctx: CommandRunContext) => ctx.showDialog(() => <SettingsModal auth={auth} onClose={ctx.closeDialog} />)
  return [
    {
      kind: "action",
      id: "view.settings",
      name: "settings",
      description: "Open settings & account",
      category: "View",
      source: "builtin",
      keybind: "ctrl+,",
      run: (_args, ctx) => open(ctx),
    },
    {
      kind: "action",
      id: "view.account",
      name: "account",
      description: "Your Fincept account, credits & profile",
      category: "Account",
      source: "builtin",
      run: (_args, ctx) => open(ctx),
    },
  ]
}
