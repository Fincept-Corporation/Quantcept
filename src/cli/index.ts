import yargs from "yargs"
import { hideBin } from "yargs/helpers"

yargs(hideBin(process.argv))
  .scriptName("quantcept")
  .command(
    "$0 [message]",
    "Start Quantcept - Finance AI Terminal",
    (yargs) =>
      yargs.positional("message", {
        type: "string",
        describe: "Initial prompt message",
      }),
    async (args) => {
      const { createQuantceptRenderer, startApp } = await import("@tui/app")
      const renderer = await createQuantceptRenderer()
      const handle = startApp({
        renderer,
        args: {
          prompt: args.message,
        },
      })
      await handle.done
    },
  )
  .command(
    "plugin [action] [rest..]",
    "Manage plugins (list | install <spec> | uninstall <name> | enable <name> | disable <name> | marketplace <add|list|remove> [src])",
    (y) =>
      y
        .positional("action", {
          type: "string",
          describe: "list | install | uninstall | enable | disable | marketplace",
        })
        .positional("rest", { type: "string", array: true, describe: "action arguments" }),
    async (argv) => {
      const { runPluginCli } = await import("@cli/plugin-command")
      await runPluginCli(argv.action as string | undefined, (argv.rest as string[]) ?? [])
    },
  )
  .command(
    "jobs [action] [rest..]",
    "Manage autonomous agent jobs (add <goal...> | list | run <id> | tick | logs <id> | pause <id> | resume <id>)",
    (y) =>
      y
        // Keep `--flags` (e.g. --max-turns, --schedule) in `rest` instead of letting
        // yargs consume them, so the delegate parses them itself. Scoped to this command.
        .parserConfiguration({ "unknown-options-as-args": true })
        .positional("action", {
          type: "string",
          describe: "add | list | run | tick | logs | pause | resume",
        })
        .positional("rest", { type: "string", array: true, describe: "action arguments" }),
    async (argv) => {
      const { runJobsCli } = await import("@cli/jobs-command")
      await runJobsCli(argv.action as string | undefined, (argv.rest as string[]) ?? [])
    },
  )
  .help()
  .version("0.1.0")
  .parse()
