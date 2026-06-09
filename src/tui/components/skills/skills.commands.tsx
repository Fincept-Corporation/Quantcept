import type { LoadedSkill } from "@core/skills"
import type { ActionCommand, CommandRunContext } from "@ext/commands/types"
import type { RouteContext } from "@tui/context/route"
import { SkillsModal } from "./SkillsModal"

/**
 * /skills opens the skills browser. Registered globally (App level) so it's
 * discoverable on the home screen too. Running a skill needs a chat session:
 * inside one we use the host's runSkill hook; from home we open a fresh session
 * that runs the skill on mount (via the route's initialSkill).
 */
export function skillsCommands(deps: { skills: () => LoadedSkill[]; route: RouteContext }): ActionCommand[] {
  const runSkill = (ctx: CommandRunContext, name: string) => {
    if (deps.route.data.type === "session") {
      ctx.runSkill(name, "")
    } else {
      deps.route.navigate({ type: "session", sessionID: `session-${Date.now()}`, initialSkill: name })
    }
  }

  const skillsModalCmd: ActionCommand = {
    kind: "action",
    id: "session.skills",
    name: "skills",
    description: "Browse & run installed skills",
    category: "Skills",
    source: "builtin",
    run: (_args, ctx) =>
      ctx.showDialog(() => (
        <SkillsModal skills={deps.skills} onRun={(name) => runSkill(ctx, name)} onClose={ctx.closeDialog} />
      )),
  }

  return [skillsModalCmd]
}
