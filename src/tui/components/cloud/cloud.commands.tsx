import type { ActionCommand, CommandRunContext } from "@ext/commands/types"
import type { AuthContext } from "@tui/context/auth"
import { CloudModal } from "./CloudModal"

/**
 * /cloud opens the Fincept cloud-data modal (watchlists, notes, portfolios).
 * Bound to the live AuthContext (passed in — the dialog renders above AuthProvider).
 * Registered in App() like settingsCommands.
 */
export function cloudCommands(auth: AuthContext): ActionCommand[] {
  const open = (ctx: CommandRunContext) => ctx.showDialog(() => <CloudModal auth={auth} onClose={ctx.closeDialog} />)
  return [
    {
      kind: "action",
      id: "view.cloud",
      name: "cloud",
      description: "Your Fincept watchlists, notes & portfolios",
      category: "Cloud",
      source: "builtin",
      run: (_args, ctx) => open(ctx),
    },
  ]
}
