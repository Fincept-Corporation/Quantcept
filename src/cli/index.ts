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
  .help()
  .version("0.1.0")
  .parse()
