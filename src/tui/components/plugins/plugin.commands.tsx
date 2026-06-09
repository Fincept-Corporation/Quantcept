import type { ActionCommand } from "@ext/commands/types"
import type { usePlugins } from "@tui/context/plugins"
import { PluginsModal } from "./PluginsModal"

type PluginsCtx = ReturnType<typeof usePlugins>

/**
 * Plugin & marketplace management, exposed as the single `/plugins` modal command.
 * Registered globally (App level) so it's available on the home screen as well as
 * inside a session — it only needs the PluginManager, never session state. The
 * modal covers install/enable/disable, marketplaces, and active hooks; the old
 * toast-based `/plugin` and `/marketplace` verbs were removed in favour of it.
 */
export function pluginCommands(plugins: PluginsCtx): ActionCommand[] {
  const pluginsModalCmd: ActionCommand = {
    kind: "action",
    id: "session.plugins",
    name: "plugins",
    description: "Browse & manage plugins, marketplaces, and hooks",
    category: "Plugins",
    source: "builtin",
    run: (_args, ctx) =>
      ctx.showDialog(() => (
        <PluginsModal
          manager={plugins.manager}
          reload={() => plugins.reload()}
          contributions={plugins.contributions}
          onClose={ctx.closeDialog}
        />
      )),
  }

  return [pluginsModalCmd]
}
