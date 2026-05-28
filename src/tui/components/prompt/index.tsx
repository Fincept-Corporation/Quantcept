import { type BorderCharacters, defaultTextareaKeyBindings, type TextareaRenderable } from "@opentui/core"
import { useExit } from "@tui/context/exit"
import { useTheme } from "@tui/context/theme"
import { createSignal } from "solid-js"

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
  hint?: any
  right?: any
  status?: string
  messageCount?: number
  tokenCount?: number
}

export function Prompt(props: PromptProps) {
  const { theme } = useTheme()
  const exit = useExit()
  const [value, setValue] = createSignal("")
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
      if (text) {
        props.onSubmit?.(text)
        setValue("")
        if (inputRef) inputRef.setText("")
      }
    } finally {
      submitting = false
    }
  }

  return (
    <>
      <box width="100%">
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
              onContentChange={(val) => {
                setValue((typeof val === "string" ? val : "") ?? "")
              }}
              onSubmit={() => {
                setTimeout(() => submit(), 0)
              }}
              onKeyDown={(e: any) => {
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
                    <text fg={theme.textMuted}>{props.tokenCount} tokens</text>
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
