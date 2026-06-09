import type { Command } from "@ext/commands/types"
import { useKeyboard, usePaste, useRenderer } from "@opentui/solid"
import { useCommands } from "@tui/context/command"
import { useTheme } from "@tui/context/theme"
import { pasteText } from "@tui/platform/paste"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"

export function CommandPalette() {
  const { theme } = useTheme()
  const commands = useCommands()
  const renderer = useRenderer()
  const [filter, setFilter] = createSignal("")
  const [selected, setSelected] = createSignal(0)

  const results = createMemo<Command[]>(() => commands.query(filter()))

  createEffect(() => {
    const len = results().length
    if (selected() >= len) setSelected(Math.max(0, len - 1))
  })

  function close() {
    setFilter("")
    setSelected(0)
    commands.closePalette()
  }

  function accept() {
    const cmd = results()[selected()]
    if (!cmd) return
    close()
    commands.dispatch(cmd.id, "", "palette")
  }

  useKeyboard((e: any) => {
    if (!commands.paletteOpen()) return
    renderer.requestRender()
    if (e.name === "escape") {
      e.preventDefault?.()
      close()
      return
    }
    if (e.name === "up") {
      e.preventDefault?.()
      setSelected((s) => Math.max(0, s - 1))
      return
    }
    if (e.name === "down") {
      e.preventDefault?.()
      setSelected((s) => Math.min(results().length - 1, s + 1))
      return
    }
    if (e.name === "return" || e.name === "kpenter") {
      e.preventDefault?.()
      accept()
      return
    }
    if (e.name === "backspace") {
      e.preventDefault?.()
      setFilter((f) => f.slice(0, -1))
      return
    }
    if (typeof e.sequence === "string" && e.sequence.length === 1 && !e.ctrl && !e.meta) {
      e.preventDefault?.()
      setFilter((f) => f + e.sequence)
    }
  })

  // Paste into the filter (a multi-char event useKeyboard never sees). Gated on the
  // palette being open so it doesn't fire while the home prompt owns input.
  // biome-ignore lint/suspicious/noExplicitAny: @opentui paste event is untyped
  usePaste((e: any) => {
    if (!commands.paletteOpen()) return
    const text = pasteText(e.bytes)
    if (!text) return
    setFilter((f) => f + text)
    renderer.requestRender()
  })

  return (
    <Show when={commands.paletteOpen()}>
      <box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        justifyContent="center"
        alignItems="center"
        backgroundColor={theme.background + "cc"}
        zIndex={950}
      >
        <box
          backgroundColor={theme.backgroundPanel}
          borderColor={theme.borderActive}
          border={true}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
          minWidth={60}
          maxWidth="80%"
          maxHeight="80%"
          flexDirection="column"
        >
          <box flexDirection="row" gap={1} flexShrink={0}>
            <text fg={theme.accent}>{">"}</text>
            <text fg={theme.text}>{filter() || ""}</text>
            <Show when={!filter()}>
              <text fg={theme.textMuted}>Search commands…</text>
            </Show>
          </box>
          <box height={1} flexShrink={0} />
          <box flexDirection="column" flexShrink={1} minHeight={0}>
            <Show when={results().length > 0} fallback={<text fg={theme.textMuted}>No matching commands</text>}>
              <For each={results()}>
                {(cmd, i) => {
                  const isSel = () => i() === selected()
                  const kb = () => commands.keybindFor(cmd.id)
                  return (
                    <box
                      flexDirection="row"
                      justifyContent="space-between"
                      gap={2}
                      backgroundColor={isSel() ? theme.backgroundElement : undefined}
                    >
                      <box flexDirection="row" gap={1}>
                        <text fg={isSel() ? theme.accent : theme.text}>/{cmd.name}</text>
                        <text fg={theme.textMuted}>{cmd.description}</text>
                        <Show when={cmd.argumentHint}>
                          <text fg={theme.textMuted}>{cmd.argumentHint}</text>
                        </Show>
                      </box>
                      <Show when={kb()}>
                        <text fg={theme.textMuted}>{kb()}</text>
                      </Show>
                    </box>
                  )
                }}
              </For>
            </Show>
          </box>
        </box>
      </box>
    </Show>
  )
}
