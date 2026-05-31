import type { ActionCommand, CommandRunContext } from "@ext/commands/types"
import type { AuthContext } from "@tui/context/auth"
import { LearningsModal } from "./LearningsModal"

/**
 * /learnings opens the community learnings registry modal (search, browse, view,
 * download, publish). Bound to the live AuthContext, registered in App().
 */
export function learningsCommands(auth: AuthContext): ActionCommand[] {
  const open = (ctx: CommandRunContext) =>
    ctx.showDialog(() => <LearningsModal auth={auth} onClose={ctx.closeDialog} />)
  return [
    {
      kind: "action",
      id: "view.learnings",
      name: "learnings",
      description: "Search & browse the community learnings registry",
      category: "Learnings",
      source: "builtin",
      run: (_args, ctx) => open(ctx),
    },
  ]
}
