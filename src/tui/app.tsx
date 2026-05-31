import { type CliRenderer, type CliRendererConfig, createCliRenderer } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { resetLogFloor, setLogFloor } from "@shared/logger"
import { BuddyProvider, useBuddy } from "@tui/buddy/BuddyContext"
import { buddyCommands } from "@tui/buddy/buddy.commands"
import { AuthGate } from "@tui/components/auth/AuthGate"
import { authCommands } from "@tui/components/auth/auth.commands"
import { cloudCommands } from "@tui/components/cloud/cloud.commands"
import { CommandPalette } from "@tui/components/command-palette"
import { learningsCommands } from "@tui/components/learnings/learnings.commands"
import { settingsCommands } from "@tui/components/settings/settings.commands"
import { AgentsProvider } from "@tui/context/agents"
import { type Args, ArgsProvider } from "@tui/context/args"
import { AuthProvider, useAuth } from "@tui/context/auth"
import { CommandProvider, useCommands } from "@tui/context/command"
import { createExit, type Exit, ExitProvider, useExit } from "@tui/context/exit"
import { KVProvider } from "@tui/context/kv"
import { PluginsProvider } from "@tui/context/plugins"
import { RouteProvider, useRoute } from "@tui/context/route"
import { SkillsProvider } from "@tui/context/skills"
import { SnapshotProvider } from "@tui/context/snapshot"
import { StorageProvider } from "@tui/context/storage"
import { ThemeProvider, useTheme } from "@tui/context/theme"
import { TuiConfigProvider } from "@tui/context/tui-config"
import { QuantceptKeymapProvider } from "@tui/keymap"
import { win32DisableProcessedInput, win32FlushInputBuffer, win32InstallCtrlCGuard } from "@tui/platform/win32"
import { Home } from "@tui/routes/home"
import { Session } from "@tui/routes/session"
import { DialogProvider } from "@tui/ui/dialog"
import { ToastProvider } from "@tui/ui/toast"
import { ErrorBoundary, Match, onCleanup, Switch } from "solid-js"

export function rendererConfig(): CliRendererConfig {
  return {
    externalOutputMode: "passthrough",
    targetFps: 60,
    gatherStats: false,
    exitOnCtrlC: false,
    useKittyKeyboard: {},
    autoFocus: false,
    useMouse: true,
  }
}

export async function createQuantceptRenderer() {
  return createCliRenderer(rendererConfig())
}

export type AppHandle = {
  ready: Promise<void>
  done: Promise<void>
  exit: Exit
}

type AppInput = {
  args: Args
  renderer: CliRenderer
}

export function startApp(input: AppInput): AppHandle {
  const unguard = win32InstallCtrlCGuard()
  win32DisableProcessedInput()
  // The TUI owns the screen; keep non-error logs off stderr so they don't
  // bleed onto the rendered output. Restored when the renderer is torn down.
  setLogFloor("error")

  const renderer = input.renderer
  const keymap = createDefaultOpenTuiKeymap(renderer)

  let resolveExited!: () => void
  const exited = new Promise<void>((resolve) => {
    resolveExited = resolve
  })

  const exit = createExit(async (reason, message) => {
    if (!renderer.isDestroyed) {
      renderer.setTerminalTitle("")
      renderer.destroy()
    }
    resetLogFloor()
    win32FlushInputBuffer()
    unguard?.()
    if (reason) {
      const formatted = reason instanceof Error ? reason.message : String(reason)
      if (formatted) process.stderr.write(formatted + "\n")
    }
    const text = message()
    if (text) process.stdout.write(text + "\n")
    resolveExited()
  })

  renderer.once("destroy", () => {
    resetLogFloor()
    win32FlushInputBuffer()
    unguard?.()
    resolveExited()
  })

  const ready = mountApp({ ...input, keymap, exit }).catch((error) => {
    if (!renderer.isDestroyed) renderer.destroy()
    resolveExited()
    throw error
  })

  const done = ready.then(() => exited)

  return { ready, done, exit }
}

async function mountApp(input: AppInput & { keymap: ReturnType<typeof createDefaultOpenTuiKeymap>; exit: Exit }) {
  const renderer = input.renderer
  void renderer.getPalette({ size: 16 }).catch(() => undefined)
  const mode = (await renderer.waitForThemeMode(1000)) ?? "dark"
  if (renderer.isDestroyed) return

  await render(() => {
    return (
      <ErrorBoundary
        fallback={(error) => (
          <box>
            <text fg="#ff5555">Fatal error: {error?.message ?? String(error)}</text>
          </box>
        )}
      >
        <QuantceptKeymapProvider keymap={input.keymap}>
          <ArgsProvider {...input.args}>
            <ExitProvider exit={input.exit}>
              <KVProvider>
                <StorageProvider>
                  <SnapshotProvider>
                    <TuiConfigProvider>
                      <RouteProvider>
                        <ThemeProvider mode={mode}>
                          <ToastProvider>
                            <DialogProvider>
                              <PluginsProvider>
                                <CommandProvider>
                                  <SkillsProvider>
                                    <AgentsProvider>
                                      <BuddyProvider>
                                        <AuthProvider>
                                          <App />
                                        </AuthProvider>
                                      </BuddyProvider>
                                    </AgentsProvider>
                                  </SkillsProvider>
                                </CommandProvider>
                              </PluginsProvider>
                            </DialogProvider>
                          </ToastProvider>
                        </ThemeProvider>
                      </RouteProvider>
                    </TuiConfigProvider>
                  </SnapshotProvider>
                </StorageProvider>
              </KVProvider>
            </ExitProvider>
          </ArgsProvider>
        </QuantceptKeymapProvider>
      </ErrorBoundary>
    )
  }, renderer)
}

function App() {
  const route = useRoute()
  const auth = useAuth()
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const renderer = useRenderer()
  const exit = useExit()

  const buddy = useBuddy()
  const commands = useCommands()
  const unregister = [
    ...buddyCommands(buddy),
    ...authCommands(auth),
    ...settingsCommands(auth),
    ...cloudCommands(auth),
    ...learningsCommands(auth),
  ].map((c) => commands.register(c))
  onCleanup(() => {
    for (const u of unregister) u()
  })

  renderer.setTerminalTitle("Quantcept")

  useKeyboard((e: any) => {
    if (e.ctrl && e.name === "c") {
      void exit()
    }
    if (e.ctrl && e.name === "q") {
      void exit()
    }
  })

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={theme.background}
    >
      <box flexGrow={1} minHeight={0} flexDirection="column">
        <Switch>
          <Match when={auth.status === "checking"}>
            <box flexGrow={1} alignItems="center" justifyContent="center">
              <text fg={theme.textMuted}>Connecting to Fincept…</text>
            </box>
          </Match>
          <Match when={auth.status === "unauthed"}>
            <AuthGate />
          </Match>
          <Match when={auth.status === "authed" || auth.status === "offline"}>
            <Switch>
              <Match when={route.data.type === "home"}>
                <Home />
              </Match>
              <Match when={route.data.type === "session"}>
                <Session />
              </Match>
            </Switch>
          </Match>
        </Switch>
      </box>
      <CommandPalette />
    </box>
  )
}
