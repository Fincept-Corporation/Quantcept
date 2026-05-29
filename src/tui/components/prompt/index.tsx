import type { Command } from "@ext/commands/types"
import { type BorderCharacters, defaultTextareaKeyBindings, type TextareaRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { useCommands } from "@tui/context/command"
import { useExit } from "@tui/context/exit"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, type JSX } from "solid-js"
import { SlashPopover } from "./slash-popover"

const EmptyBorder: BorderCharacters = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
}

/** Compact token counts: 950 → "950", 1_250 → "1.2k", 3_400_000 → "3.4M". */
function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) {
    const k = n / 1_000
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`
  }
  const m = n / 1_000_000
  return `${m < 10 ? m.toFixed(1) : Math.round(m)}M`
}

const promptKeyBindings = [
  { name: "return", action: "submit" as const },
  { name: "kpenter", action: "submit" as const },
  { name: "return", shift: true, action: "newline" as const },
  { name: "kpenter", shift: true, action: "newline" as const },
  ...defaultTextareaKeyBindings.filter((b) => b.name !== "return" && b.name !== "kpenter" && b.name !== "linefeed"),
]

interface PromptProps {
  placeholder?: string
  placeholders?: { normal: string[]; shell: string[] }
  onSubmit?: (text: string) => void
  hint?: JSX.Element
  right?: JSX.Element
  status?: string
  messageCount?: number
  tokenCount?: number
}

export function Prompt(props: PromptProps) {
  const { theme } = useTheme()
  const exit = useExit()
  const renderer = useRenderer()
  const [value, setValue] = createSignal("")
  const commands = useCommands()
  const [slashSelected, setSlashSelected] = createSignal(0)
  const slashResults = createMemo<Command[]>(() => {
    const m = /^\/(\S*)$/.exec(value().trim())
    if (m === null) return []
    return commands.query(m[1]!).slice(0, 6)
  })
  // After "/<command> <prefix>", suggest the command's declared argument choices.
  const argSuggestions = createMemo<{ commandName: string; choices: string[] } | null>(() => {
    const m = /^\/(\S+)\s+(\S*)$/.exec(value())
    if (m === null) return null
    const name = m[1]!
    const prefix = m[2]!.toLowerCase()
    const cmd = commands.query(name).find((c) => c.name === name || c.aliases?.includes(name))
    if (!cmd?.argChoices) return null
    const choices = cmd.argChoices.filter((c) => c.toLowerCase().startsWith(prefix))
    return choices.length > 0 ? { commandName: name, choices } : null
  })
  let inputRef: TextareaRenderable | undefined

  const placeholderText = () => {
    const phrases = props.placeholders?.normal ?? [props.placeholder ?? "Ask anything..."]
    const base = phrases[Math.floor(Date.now() / 10000) % phrases.length]
    return `Ask anything... "${base}"`
  }

  let submitting = false
  function submit() {
    if (submitting) return
    submitting = true
    try {
      const text = inputRef?.plainText?.trim() ?? value().trim()
      if (!text) return
      const slash = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text)
      if (slash) {
        const name = slash[1]!
        const args = slash[2] ?? ""
        const match = commands.query(name).find((c) => c.name === name || c.aliases?.includes(name))
        if (match) {
          commands.dispatch(match.id, args, "slash")
          setValue("")
          if (inputRef) inputRef.setText("")
          return
        }
      }
      props.onSubmit?.(text)
      setValue("")
      if (inputRef) inputRef.setText("")
    } finally {
      submitting = false
    }
  }

  return (
    <>
      <box width="100%">
        <SlashPopover results={slashResults()} argItems={argSuggestions()?.choices} selected={slashSelected()} />
        <box
          width="100%"
          border={["left"]}
          borderColor={theme.accent}
          customBorderChars={{
            ...EmptyBorder,
            bottomLeft: "╹",
          }}
        >
          <box
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            flexShrink={0}
            backgroundColor={theme.backgroundElement}
            flexGrow={1}
            width="100%"
          >
            <textarea
              width="100%"
              placeholder={placeholderText()}
              placeholderColor={theme.textMuted}
              textColor={theme.text}
              focusedTextColor={theme.text}
              minHeight={1}
              maxHeight={6}
              focused={true}
              keyBindings={promptKeyBindings}
              onContentChange={() => {
                setValue(inputRef?.plainText ?? "")
                setSlashSelected(0)
                renderer.requestRender()
              }}
              onSubmit={() => {
                setTimeout(() => submit(), 0)
              }}
              onKeyDown={(e: any) => {
                const args = argSuggestions()
                if (args) {
                  if (e.name === "up") {
                    e.preventDefault()
                    setSlashSelected((s) => Math.max(0, s - 1))
                    renderer.requestRender()
                    return
                  }
                  if (e.name === "down") {
                    e.preventDefault()
                    setSlashSelected((s) => Math.min(args.choices.length - 1, s + 1))
                    renderer.requestRender()
                    return
                  }
                  if (e.name === "tab" || e.name === "return" || e.name === "kpenter") {
                    e.preventDefault()
                    const choice = args.choices[slashSelected()]
                    const cmd = commands
                      .query(args.commandName)
                      .find((c) => c.name === args.commandName || c.aliases?.includes(args.commandName))
                    if (choice && cmd) {
                      commands.dispatch(cmd.id, choice, "slash")
                      setValue("")
                      if (inputRef) inputRef.setText("")
                      setSlashSelected(0)
                      renderer.requestRender()
                    }
                    return
                  }
                }
                if (slashResults().length > 0) {
                  if (e.name === "up") {
                    e.preventDefault()
                    setSlashSelected((s) => Math.max(0, s - 1))
                    renderer.requestRender()
                    return
                  }
                  if (e.name === "down") {
                    e.preventDefault()
                    setSlashSelected((s) => Math.min(slashResults().length - 1, s + 1))
                    renderer.requestRender()
                    return
                  }
                  if (e.name === "tab") {
                    e.preventDefault()
                    const cmd = slashResults()[slashSelected()]
                    if (cmd && inputRef) {
                      const text = `/${cmd.name} `
                      inputRef.setText(text)
                      inputRef.setCursor(0, text.length)
                      setValue(text)
                      setSlashSelected(0)
                      renderer.requestRender()
                    }
                    return
                  }
                  if (e.name === "return" || e.name === "kpenter") {
                    e.preventDefault()
                    const cmd = slashResults()[slashSelected()]
                    if (cmd) {
                      // Carry any args the user already typed after the command name.
                      const typed = /^\/\S+\s+([\s\S]*)$/.exec(value().trim())
                      commands.dispatch(cmd.id, typed?.[1] ?? "", "slash")
                      setValue("")
                      if (inputRef) inputRef.setText("")
                      setSlashSelected(0)
                      renderer.requestRender()
                    }
                    return
                  }
                }
                if (e.key === "c" && e.ctrl) {
                  e.preventDefault()
                  if (value() === "") {
                    void exit()
                  } else {
                    setValue("")
                  }
                }
              }}
              focusedBackgroundColor={theme.backgroundElement}
              cursorColor={theme.text}
              ref={(r: TextareaRenderable) => {
                inputRef = r
              }}
            />
            {/* Agent / Model / Status row */}
            <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1} justifyContent="space-between">
              <box flexDirection="row" gap={1}>
                <text fg={theme.accent}>Analyst</text>
                <text fg={theme.textMuted}>·</text>
                <text fg={theme.text}>Quantcept</text>
                <text fg={theme.textMuted}>Pro</text>
                {props.status && (
                  <>
                    <text fg={theme.textMuted}>·</text>
                    <text fg={theme.accent}>{props.status}</text>
                  </>
                )}
              </box>
              <box flexDirection="row" gap={1}>
                {(props.messageCount ?? 0) > 0 && (
                  <>
                    <text fg={theme.textMuted}>{props.messageCount} msgs</text>
                  </>
                )}
                {(props.tokenCount ?? 0) > 0 && (
                  <>
                    <text fg={theme.textMuted}>·</text>
                    <text fg={theme.textMuted}>{formatTokens(props.tokenCount ?? 0)} tokens</text>
                  </>
                )}
                {props.right}
              </box>
            </box>
          </box>
        </box>
        {/* Bottom accent */}
        <box
          height={1}
          border={["left"]}
          borderColor={theme.accent}
          customBorderChars={{ ...EmptyBorder, vertical: "╹" }}
        >
          <box
            height={1}
            border={["bottom"]}
            borderColor={theme.backgroundElement}
            customBorderChars={{ ...EmptyBorder, horizontal: "▀" }}
          />
        </box>
        {/* Hints row */}
        <box width="100%" flexDirection="row" justifyContent="space-between">
          {props.hint ?? <text />}
          <box gap={2} flexDirection="row">
            <text fg={theme.text}>
              tab <span style={{ fg: theme.textMuted }}>agents</span>
            </text>
            <text fg={theme.text}>
              ctrl+p <span style={{ fg: theme.textMuted }}>commands</span>
            </text>
          </box>
        </box>
      </box>
    </>
  )
}
