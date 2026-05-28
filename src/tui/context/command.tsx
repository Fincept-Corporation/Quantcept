import { createContext, createMemo, createSignal, onMount, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useBindings, useKeymap, reactiveMatcherFromSignal } from "@opentui/keymap/solid"
import { commandBindings } from "@opentui/keymap/extras"
import { useRenderer } from "@opentui/solid"
import { useRoute } from "@tui/context/route"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useToast } from "@tui/ui/toast"
import { useExit } from "@tui/context/exit"
import { COMMAND_PALETTE_COMMAND } from "@tui/keymap"
import { builtinCommands } from "@ext/commands/builtin"
import { discoverFileCommands } from "@ext/commands/loader"
import { rankCommands } from "@ext/commands/match"
import type { Command, CommandRunContext, DispatchSource } from "@ext/commands/types"
import { userConfigDir, projectConfigDir } from "@core/config/paths"
import { ThemePicker } from "@tui/components/theme-picker"

export interface CommandHostHooks {
  submitPrompt?: (text: string) => void
  clearMessages?: () => void
}

interface CommandContextValue {
  commands(): Command[]
  query(search: string): Command[]
  register(cmd: Command): () => void
  dispatch(id: string, args: string, source: DispatchSource): void
  paletteOpen(): boolean
  openPalette(): void
  closePalette(): void
  setHostHooks(hooks: CommandHostHooks): void
  clearHostHooks(hooks: CommandHostHooks): void
  keybindFor(id: string): string | undefined
}

const Ctx = createContext<CommandContextValue>()

export function useCommands() {
  const v = useContext(Ctx)
  if (!v) throw new Error("CommandProvider required")
  return v
}

export function CommandProvider(props: ParentProps) {
  const route = useRoute()
  const theme = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const exit = useExit()
  const keymap = useKeymap()
  const renderer = useRenderer()

  const [dynamic, setDynamic] = createStore<Command[]>([])
  const [fileCmds, setFileCmds] = createSignal<Command[]>([])
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  let hostHooks: CommandHostHooks = {}

  onMount(async () => {
    const cmds = await discoverFileCommands({ userDir: userConfigDir(), projectDir: projectConfigDir() })
    setFileCmds(cmds)
  })

  const allCommands = createMemo<Command[]>(() => [...builtinCommands(), ...fileCmds(), ...dynamic])

  function buildRunContext(args: string, source: DispatchSource): CommandRunContext {
    return {
      args,
      source,
      submitPrompt: (text) => hostHooks.submitPrompt?.(text),
      clearMessages: () => hostHooks.clearMessages?.(),
      navigate: (r) => route.navigate(r),
      setThemeMode: (m) => {
        theme.setMode(m)
        renderer.requestRender()
      },
      setTheme: (name) => {
        const ok = theme.set(name)
        renderer.requestRender()
        return ok
      },
      themeNames: () => Object.keys(theme.all()),
      openThemePicker: () => {
        dialog.replace(() => <ThemePicker names={Object.keys(theme.all())} onClose={() => dialog.clear()} />)
        renderer.requestRender()
      },
      showDialog: (render) => dialog.replace(render),
      closeDialog: () => dialog.clear(),
      toast: (message) => toast.show({ message, variant: "info" }),
      exit: () => void exit(),
      query: (search) => query(search),
    }
  }

  async function executeCommand(cmd: Command, args: string, source: DispatchSource) {
    const ctx = buildRunContext(args, source)
    try {
      if (cmd.kind === "prompt") {
        const text = await cmd.getPrompt(args, ctx)
        ctx.submitPrompt(text)
      } else if (cmd.kind === "action") {
        await cmd.run(args, ctx)
      } else {
        dialog.replace(() => cmd.render(ctx))
      }
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : String(error), variant: "error" })
    }
  }

  useBindings(() => {
    const cmds = allCommands()
    const keymapCommands = cmds.map((c) => ({
      name: c.id,
      kind: c.kind,
      desc: c.description,
      category: c.category ?? "",
      qname: c.name,
      hidden: c.isHidden ?? false,
      ...(c.isEnabled ? { activeWhen: reactiveMatcherFromSignal(() => c.isEnabled!()) } : {}),
      run: (kctx: any) => {
        const payload = (kctx.payload ?? {}) as { args?: string; source?: DispatchSource }
        void executeCommand(c, payload.args ?? "", payload.source ?? "keybind")
        return true
      },
    }))
    const keyMap: Record<string, string> = { [COMMAND_PALETTE_COMMAND]: "ctrl+p" }
    for (const c of cmds) if (c.keybind) keyMap[c.id] = c.keybind
    return {
      commands: [
        ...keymapCommands,
        {
          name: COMMAND_PALETTE_COMMAND,
          run: () => {
            setPaletteOpen(true)
            renderer.requestRender()
            return true
          },
        },
      ],
      bindings: commandBindings(keyMap),
    }
  })

  function query(search: string): Command[] {
    const visible = allCommands().filter((c) => !c.isHidden && (c.isEnabled ? c.isEnabled() : true))
    return rankCommands(search, visible)
  }

  function dispatch(id: string, args: string, source: DispatchSource) {
    keymap.runCommand(id, { payload: { args, source } })
  }

  function register(cmd: Command): () => void {
    setDynamic((prev) => [...prev.filter((c) => c.id !== cmd.id), cmd])
    return () => setDynamic((prev) => prev.filter((c) => c.id !== cmd.id))
  }

  function keybindFor(id: string): string | undefined {
    try {
      const map = keymap.getCommandBindings({ commands: [id], visibility: "active" })
      const bindings = map.get(id)
      if (!bindings || bindings.length === 0) return undefined
      const seq = bindings[0]!.sequence
      return seq.map((p: any) => p.display).join(" ")
    } catch {
      return undefined
    }
  }

  const value: CommandContextValue = {
    commands: allCommands,
    query,
    register,
    dispatch,
    paletteOpen,
    openPalette: () => setPaletteOpen(true),
    closePalette: () => setPaletteOpen(false),
    setHostHooks: (h) => {
      hostHooks = { ...hostHooks, ...h }
    },
    clearHostHooks: (h) => {
      const next = { ...hostHooks }
      for (const key of Object.keys(h) as (keyof CommandHostHooks)[]) {
        if (next[key] === h[key]) delete next[key]
      }
      hostHooks = next
    },
    keybindFor,
  }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
