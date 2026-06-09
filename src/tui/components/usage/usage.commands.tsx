import type { ActionCommand } from "@ext/commands/types"
import type { AuthContext } from "@tui/context/auth"
import { UsageModal } from "./UsageModal"

/**
 * `/usage` opens the Usage panel (API usage + credit spend). Bound to the live
 * AuthContext (the dialog renders above AuthProvider, so it can't useAuth() itself).
 * Registered in App() alongside settingsCommands/authCommands.
 */
export function usageCommands(auth: AuthContext): ActionCommand[] {
  return [
    {
      kind: "action",
      id: "view.usage",
      name: "usage",
      description: "View your API usage & credit spend",
      category: "Account",
      source: "builtin",
      run: (_args, ctx) => ctx.showDialog(() => <UsageModal auth={auth} onClose={ctx.closeDialog} />),
    },
  ]
}
