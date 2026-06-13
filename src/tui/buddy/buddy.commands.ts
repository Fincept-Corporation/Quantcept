// src/tui/buddy/buddy.commands.ts
import type { ActionCommand } from "@ext/commands/types"
import type { useBuddy } from "./BuddyContext"
import { RARITY_STARS } from "./types"

type Buddy = ReturnType<typeof useBuddy>

export function buddyCommands(buddy: Buddy): ActionCommand[] {
  return [
    {
      kind: "action",
      id: "buddy",
      name: "buddy",
      description: "Show your buddy, or: pet | mute | choose | name <text>",
      category: "Buddy",
      source: "builtin",
      argChoices: ["pet", "mute", "choose", "name"],
      run(args, ctx) {
        const sub = args.trim().split(/\s+/)[0] ?? ""
        const rest = args.trim().slice(sub.length).trim()
        if (sub === "pet") {
          buddy.pet()
          ctx.toast(`You pet ${buddy.companion().name}.`)
          return
        }
        if (sub === "mute") {
          const m = buddy.toggleMute()
          ctx.toast(m ? "Buddy muted." : "Buddy unmuted.")
          return
        }
        if (sub === "choose") {
          buddy.openChooser()
          ctx.toast("Pick your new companion…")
          return
        }
        if (sub === "name") {
          if (!rest) {
            ctx.toast("Usage: /buddy name <text>")
            return
          }
          buddy.setName(rest)
          ctx.toast(`Renamed to ${buddy.companion().name}.`)
          return
        }
        const c = buddy.companion()
        ctx.toast(
          `${c.name} — ${c.rarity} ${c.species} ${RARITY_STARS[c.rarity]}${c.shiny ? " ✨" : ""} · ${c.personality}`,
        )
      },
    },
  ]
}
