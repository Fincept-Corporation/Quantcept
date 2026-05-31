import type { ActionCommand } from "@ext/commands/types"
import type { AuthContext } from "@tui/context/auth"

/**
 * Account commands bound to the live AuthContext. Registered in App() (like buddyCommands) —
 * they need the reactive context, so they live in the TUI layer, not extensions/.
 */
export function authCommands(auth: AuthContext): ActionCommand[] {
  return [
    {
      kind: "action",
      id: "fincept.account",
      name: "account",
      description: "Show your Fincept account + credit balance",
      category: "Account",
      source: "builtin",
      run(_args, ctx) {
        const a = auth.account
        ctx.toast(a ? `${a.email} · ${a.account_type} · ${a.credit_balance} credits` : "Not signed in")
      },
    },
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
    {
      kind: "action",
      id: "fincept.login",
      name: "login",
      description: "Fincept sign-in status",
      category: "Account",
      source: "builtin",
      run(_args, ctx) {
        ctx.toast(auth.status === "authed" ? "Already signed in" : "Sign in via the startup gate")
      },
    },
  ]
}
