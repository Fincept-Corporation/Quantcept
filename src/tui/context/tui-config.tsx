import { createSimpleContext } from "./helper"

export interface TuiConfig {
  mouse: boolean
  keybinds: {
    gather(namespace: string, commands: readonly string[]): Record<string, { command: string }>
  }
}

function createDefaultConfig(): TuiConfig {
  return {
    mouse: true,
    keybinds: {
      gather(_namespace: string, commands: readonly string[]) {
        const bindings: Record<string, { command: string }> = {}
        for (const cmd of commands) {
          if (cmd === "app.exit") bindings["ctrl+q"] = { command: cmd }
          if (cmd === "command.palette.show") bindings["ctrl+p"] = { command: cmd }
        }
        return bindings
      },
    },
  }
}

export const { use: useTuiConfig, provider: TuiConfigProvider } = createSimpleContext({
  name: "TuiConfig",
  init: (props: { config?: TuiConfig }) => props.config ?? createDefaultConfig(),
})
