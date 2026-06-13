import { SessionStore } from "@core/storage"
import { projectHash } from "@core/storage/paths"
import type { ActionCommand } from "@ext/commands/types"
import { type CliRenderer, type CliRendererConfig, createCliRenderer } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { logger, resetLogFloor, setLogContext, setLogFloor } from "@shared/logger"
import { AdoptScreen } from "@tui/buddy/AdoptScreen"
import { BuddyProvider, useBuddy } from "@tui/buddy/BuddyContext"
import { buddyCommands } from "@tui/buddy/buddy.commands"
import { AuthGate } from "@tui/components/auth/AuthGate"
import { authCommands } from "@tui/components/auth/auth.commands"
import { cloudCommands } from "@tui/components/cloud/cloud.commands"
import { CommandPalette } from "@tui/components/command-palette"
import { learningsCommands } from "@tui/components/learnings/learnings.commands"
import { pluginCommands } from "@tui/components/plugins/plugin.commands"
import { settingsCommands } from "@tui/components/settings/settings.commands"
import { skillsCommands } from "@tui/components/skills/skills.commands"
import { usageCommands } from "@tui/components/usage/usage.commands"
import { AgentsProvider } from "@tui/context/agents"
import { type Args, ArgsProvider, useArgs } from "@tui/context/args"
import { AuthProvider, useAuth } from "@tui/context/auth"
import { AutoAcceptProvider, useAutoAccept } from "@tui/context/auto-accept"
import { CommandProvider, useCommands } from "@tui/context/command"
import { createExit, type Exit, ExitProvider, useExit } from "@tui/context/exit"
import { KVProvider } from "@tui/context/kv"
import { PluginsProvider, usePlugins } from "@tui/context/plugins"
import { type Route, RouteProvider, type SessionRoute, useRoute } from "@tui/context/route"
import { SkillsProvider, useSkills } from "@tui/context/skills"
import { SnapshotProvider } from "@tui/context/snapshot"
import { StorageProvider } from "@tui/context/storage"
import { ThemeProvider, useTheme } from "@tui/context/theme"
import { TuiConfigProvider } from "@tui/context/tui-config"
import { QuantceptKeymapProvider } from "@tui/keymap"
import { win32DisableProcessedInput, win32FlushInputBuffer, win32InstallCtrlCGuard } from "@tui/platform/win32"
import { isAutoApproveToggle } from "@tui/routes/auto-approve"
import { Home } from "@tui/routes/home"
import { Session } from "@tui/routes/session"
import { DialogProvider, useDialog } from "@tui/ui/dialog"
import { ToastProvider, useToast } from "@tui/ui/toast"
import { ErrorBoundary, Match, onCleanup, onMount, Show, Switch } from "solid-js"

export function rendererConfig(): CliRendererConfig {
  return {
    externalOutputMode: "passthrough",
    targetFps: 60,
    gatherStats: false,
    exitOnCtrlC: false,
    useKittyKeyboard: {},
    autoFocus: false,
    useMouse: true,
    // OpenTUI runs its native render/input loop on a background thread by
    // default (useThread=true) everywhere except Linux, which it force-disables.
    // On Windows that thread deadlocks against the console under legacy conhost
    // (cmd.exe) — the TUI accepts a few keystrokes, then freezes. Run
    // single-threaded on Windows too, matching OpenTUI's own Linux carve-out.
    ...(process.platform === "win32" ? { useThread: false } : {}),
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
  // Correlate every log line from this run with its project.
  setLogContext({ projectHash: projectHash() })
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
      logger.error("app exited with error", {
        error: formatted,
        stack: reason instanceof Error ? reason.stack : undefined,
      })
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
    logger.error("app mount failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    if (!renderer.isDestroyed) renderer.destroy()
    resolveExited()
    throw error
  })

  const done = ready.then(() => exited)

  return { ready, done, exit }
}

/** Resolve the route to land on from launch args. `--continue` reads the most-recent
 *  session; `--resume <id>` / a positional prompt route straight in; bare `--resume`
 *  (resume === true) stays home and the Home screen opens the picker on mount. */
function computeInitialRoute(args: Args): Route {
  if (typeof args.resume === "string" && args.resume) return { type: "session", sessionID: args.resume }
  if (args.continue) {
    try {
      const store = new SessionStore()
      const id = store.mostRecent(projectHash(process.cwd()))?.id
      store.close()
      if (id) return { type: "session", sessionID: id }
    } catch {
      // storage unavailable → fall through to home
    }
  }
  if (args.prompt) {
    const sessionID = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return { type: "session", sessionID, initialMessage: args.prompt }
  }
  return { type: "home" }
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
                      <RouteProvider initialRoute={computeInitialRoute(input.args)}>
                        <ThemeProvider mode={mode}>
                          <ToastProvider>
                            <DialogProvider>
                              <PluginsProvider>
                                <CommandProvider>
                                  <SkillsProvider>
                                    <AgentsProvider>
                                      <BuddyProvider>
                                        <AuthProvider>
                                          <AutoAcceptProvider>
                                            <App />
                                          </AutoAcceptProvider>
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
  const plugins = usePlugins()
  const skills = useSkills()
  const autoAccept = useAutoAccept()
  const toast = useToast()
  const dialog = useDialog()
  const args = useArgs()
  // Auto-accept is app-global so it works (and shows its amber indicator) on both the home screen
  // and inside a session, and a fresh session inherits it. Toggle feedback lives here, shared by
  // the /auto command (ctrl+t) and the shift+tab keybind below.
  function toggleAutoAccept() {
    const next = !autoAccept.enabled()
    autoAccept.set(next)
    toast.show({
      message: next
        ? "Auto-accept ON — tool prompts are granted automatically (ctrl+t or /auto to stop)"
        : "Auto-accept OFF — tool prompts will ask again",
      variant: next ? "warning" : "info",
    })
    renderer.requestRender()
  }
  const autoCmd: ActionCommand = {
    kind: "action",
    id: "session.auto",
    name: "auto",
    description: "Toggle auto-accept for tool permission prompts (ctrl+t, or shift+tab)",
    category: "Session",
    source: "builtin",
    keybind: "ctrl+t",
    run: () => toggleAutoAccept(),
  }
  const unregister = [
    ...buddyCommands(buddy),
    ...authCommands(auth),
    ...settingsCommands(auth),
    ...usageCommands(auth),
    ...cloudCommands(auth),
    ...learningsCommands(auth),
    ...pluginCommands(plugins),
    ...skillsCommands({ skills: () => skills.all(), route }),
    autoCmd,
  ].map((c) => commands.register(c))
  onCleanup(() => {
    for (const u of unregister) u()
  })

  // --skip-permissions seeds auto-accept ON once at launch (same machinery as ctrl+t / shift+tab),
  // so every tool permission prompt is granted without a dialog. Explicit `deny` rules and the hard
  // pre-trade risk gate are NOT bypassed. The user can still toggle it back off with ctrl+t.
  onMount(() => {
    if (!args.skipPermissions) return
    autoAccept.set(true)
    toast.show({
      message: "--skip-permissions: tool prompts auto-granted (deny rules + risk limits still apply; ctrl+t to stop)",
      variant: "warning",
    })
    renderer.requestRender()
  })

  renderer.setTerminalTitle("Quantcept")
  // Note: the renderer's backbuffer clear color is set to the theme background in
  // ThemeProvider (context/theme.tsx) — it already covers every grid cell, so there's
  // no need to set it again here.

  useKeyboard((e: any) => {
    // Shift+tab toggles auto-accept on every screen (works in terminals that deliver it; /auto
    // and ctrl+t cover terminals that don't). Skipped while a modal owns the keyboard.
    if (isAutoApproveToggle(e) && !dialog.active()) {
      toggleAutoAccept()
      return
    }
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
            {/* First-run gate: pick a buddy before the dashboard. Existing owners (a seed is
                already persisted) skip straight through; `/buddy choose` re-opens it. */}
            <Show when={buddy.chosen() && !buddy.choosing()} fallback={<AdoptScreen />}>
              <Switch>
                <Match when={route.data.type === "home"}>
                  <Home />
                </Match>
                <Match when={route.data.type === "session"}>
                  <Show when={(route.data as SessionRoute).sessionID} keyed>
                    {(_sessionID) => <Session />}
                  </Show>
                </Match>
              </Switch>
            </Show>
          </Match>
        </Switch>
      </box>
      <CommandPalette />
    </box>
  )
}
