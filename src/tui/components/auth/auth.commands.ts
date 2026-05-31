import type { ActionCommand } from "@ext/commands/types"
import type { AuthContext } from "@tui/context/auth"

/**
 * Account commands bound to the live AuthContext. /account + /settings open the
 * Settings modal (see settings.commands.tsx); this keeps a quick /logout.
 * Registered in App() (they need the reactive context, so they live in the TUI
 * layer, not extensions/).
 */
export function authCommands(auth: AuthContext): ActionCommand[] {
  return [
    {
      kind: "action",
      id: "fincept.logout",
      name: "logout",
      description: "Sign out of your Fincept account",
      category: "Account",
      source: "builtin",
      async run(_args, ctx) {
        await auth.logout()
        ctx.toast("Signed out of Fincept")
      },
    },
  ]
}
