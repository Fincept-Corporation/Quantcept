import { clearVisionProvider, setVisionProvider } from "@core/config/persist"
import type { ActionCommand } from "../types"

/**
 * `/computer-use <openai-key>` — one-command setup for computer-use. Writes an OpenAI key to the
 * per-user settings file (never the project repo) and enables the gpt-5.5 GA computer-use loop.
 * `/computer-use off` disables it. Takes effect on the next app start.
 */
export function computerUseCommand(): ActionCommand {
  return {
    kind: "action",
    id: "computer-use",
    name: "computer-use",
    description: "Enable computer-use by setting your OpenAI API key (gpt-5.5 controls the screen)",
    category: "Setup",
    source: "builtin",
    argumentHint: "<openai-api-key> | off",
    argChoices: ["off"],
    run(args, ctx) {
      const a = args.trim()
      if (a === "" || a === "status" || a === "help") {
        ctx.toast("Usage: /computer-use <openai-api-key>  (from platform.openai.com)  ·  /computer-use off to disable")
        return
      }
      if (a === "off") {
        clearVisionProvider()
        ctx.reloadComputerUse()
        ctx.toast("Computer-use disabled.")
        return
      }
      if (!a.startsWith("sk-")) {
        ctx.toast("That doesn't look like an OpenAI key — it should start with 'sk-'.")
        return
      }
      setVisionProvider({ id: "openai-chat", model: "gpt-5.5", baseUrl: "https://api.openai.com/v1", apiKey: a })
      ctx.reloadComputerUse()
      ctx.toast("✓ Computer-use enabled (gpt-5.5) — ready now, no restart.")
    },
  }
}
