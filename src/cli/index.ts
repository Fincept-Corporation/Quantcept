import { VERSION } from "@shared/version"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

yargs(hideBin(process.argv))
  .scriptName("quantcept")
  .command(
    "$0 [message]",
    "Start Quantcept - Finance AI Terminal",
    (yargs) =>
      yargs
        .positional("message", { type: "string", describe: "Initial prompt message" })
        .option("continue", {
          alias: "c",
          type: "boolean",
          describe: "Continue the most recent session in this directory",
        })
        // No explicit type: bare `-r` → true (open picker); `-r <id>` → string (resume that id).
        .option("resume", { alias: "r", describe: "Resume a session by id, or open the picker (bare -r)" })
        // Start with every tool permission prompt auto-granted (same as toggling auto-accept ON).
        // Explicit `deny` rules and the hard pre-trade risk gate are NOT bypassed.
        .option("skip-permissions", {
          alias: ["dangerously-skip-permissions", "yolo"],
          type: "boolean",
          describe: "Auto-grant every tool permission prompt (ctrl+t toggles it back off)",
        }),
    async (args) => {
      const { createQuantceptRenderer, startApp } = await import("@tui/app")
      const renderer = await createQuantceptRenderer()
      const handle = startApp({
        renderer,
        args: {
          prompt: args.message,
          continue: args.continue as boolean | undefined,
          resume: args.resume as string | boolean | undefined,
          skipPermissions: args.skipPermissions as boolean | undefined,
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
  .command(
    "verify [file]",
    "Structurally verify a Python strategy file for lookahead bias",
    (y) =>
      y
        .positional("file", { type: "string", describe: "Path to a .py file" })
        .option("strict", { type: "boolean", default: false, describe: "Exit non-zero on warnings too" }),
    async (argv) => {
      const { runVerifyCli } = await import("@cli/verify-command")
      await runVerifyCli(argv.file as string | undefined, argv.strict as boolean)
    },
  )
  .help()
  .version(VERSION)
  .parse()
