import { loadHistory, pushHistory } from "@core/storage"
import type { Command } from "@ext/commands/types"
import { type BorderCharacters, defaultTextareaKeyBindings, type TextareaRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { useAuth } from "@tui/context/auth"
import { useCommands } from "@tui/context/command"
import { useExit } from "@tui/context/exit"
import { useTheme } from "@tui/context/theme"
import { formatPlan, planTier } from "@tui/format/plan"
import { useDialog } from "@tui/ui/dialog"
import { createEffect, createMemo, createSignal, type JSX, onCleanup, onMount } from "solid-js"
import { type HistoryState, historyNext, historyPrev } from "./history"
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
  /** Rotating one-line tips shown (in place of `hint`) while the input is idle. */
  tips?: string[]
  right?: JSX.Element
  status?: string
  messageCount?: number
  tokenCount?: number
  /** Active agent name shown in the footer; undefined when on the default assistant. */
  agent?: string
  /** Open the agent picker — bound to Tab when the slash popover is closed. */
  onOpenAgentPicker?: () => void
  /** Session auto-accept (shift+tab) state — drives a prominent amber mode indicator. */
  autoAccept?: boolean
  /**
   * Text to seed the input with once, on mount. Used on resume to reload the
   * last failed/unanswered question so the user can retry with one keypress.
   */
  initialDraft?: string
  /**
   * Reports the live draft text whenever it changes. Lets a parent stash the
   * in-progress draft (e.g. to survive a session re-gate) without the prompt
   * knowing anything about auth/session state.
   */
  onDraftChange?: (text: string) => void
}

export function Prompt(props: PromptProps) {
  const { theme } = useTheme()
  const exit = useExit()
  const renderer = useRenderer()
  const [value, setValue] = createSignal("")
  // Report the live draft up to the parent (if it wants it) so it can be stashed
  // and restored across a remount — e.g. when a session re-gate unmounts the chat.
  createEffect(() => props.onDraftChange?.(value()))
  // Slow tick to rotate the placeholder phrase while the input is empty. Only
  // requests a render when empty, so a focused/typed prompt costs nothing.
  const [phraseTick, setPhraseTick] = createSignal(0)
  let phraseTimer: ReturnType<typeof setInterval>
  onMount(() => {
    phraseTimer = setInterval(() => {
      if (value().length > 0) return
      setPhraseTick((t) => t + 1)
      renderer.requestRender()
    }, 5000)
  })
  onCleanup(() => clearInterval(phraseTimer))
  // Rotating tips: start on a random tip (variety per visit) and advance every ~20s while
  // the input is idle — slow enough to read comfortably, and frozen the moment the user types.
  const [tipTick, setTipTick] = createSignal(props.tips?.length ? Math.floor(Math.random() * props.tips.length) : 0)
  let tipTimer: ReturnType<typeof setInterval>
  onMount(() => {
    tipTimer = setInterval(() => {
      const tips = props.tips
      if (!tips || tips.length < 2 || value().length > 0) return
      setTipTick((t) => t + 1)
      renderer.requestRender()
    }, 20000)
  })
  onCleanup(() => clearInterval(tipTimer))
  const currentTip = (): string | null => {
    const tips = props.tips
    if (!tips || tips.length === 0) return null
    return tips[tipTick() % tips.length] ?? null
  }
  const commands = useCommands()
  const dialog = useDialog()
  const auth = useAuth()
  // The badge next to "Quantcept" reflects the signed-in account's plan, colour-coded by
  // tier (muted = free, accent = paid, gold = premium/enterprise) — not a static label.
  const planLabel = createMemo(() => formatPlan(auth.account?.account_type))
  const planColor = createMemo(() => {
    const tier = planTier(auth.account?.account_type)
    return tier === "premium" ? (theme.warning ?? theme.accent) : tier === "paid" ? theme.accent : theme.textMuted
  })
  // Own keyboard/paste only when no overlay is up. A modal (DialogProvider) or the
  // command palette takes input focus while open; keeping the textarea focused would
  // let it steal keypress + paste (OpenTUI routes paste to the focused renderable),
  // which is exactly the "paste lands in the home input" bug. Blurring hands input
  // to the modal cleanly; it re-focuses when the overlay closes.
  const promptFocused = () => !dialog.active() && !commands.paletteOpen()
  const [slashSelected, setSlashSelected] = createSignal(0)
  const slashResults = createMemo<Command[]>(() => {
    const m = /^\/(\S*)$/.exec(value().trim())
    if (m === null) return []
    return commands.query(m[1]!)
  })
  // Render a bounded window of the (possibly long) result list, scrolling so the
  // current selection stays visible. Replaces the old hard `.slice(0, 6)` cap that
  // hid every dynamically-registered command (plugins, skills, …) past the first 6.
  const SLASH_MAX_VISIBLE = 8
  const slashWindow = createMemo(() => {
    const all = slashResults()
    const sel = slashSelected()
    if (all.length <= SLASH_MAX_VISIBLE) return { items: all, selected: sel, moreAbove: 0, moreBelow: 0 }
    const start = Math.max(0, Math.min(sel - Math.floor(SLASH_MAX_VISIBLE / 2), all.length - SLASH_MAX_VISIBLE))
    return {
      items: all.slice(start, start + SLASH_MAX_VISIBLE),
      selected: sel - start,
      moreAbove: start,
      moreBelow: all.length - (start + SLASH_MAX_VISIBLE),
    }
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

  // Submitted-prompt history for ↑/↓ recall (oldest → newest). `histState`
  // tracks where in history the user currently is (null = editing live draft).
  const [history, setHistory] = createSignal<string[]>(loadHistory())
  let histState: HistoryState = { index: null }

  // Apply a recalled history entry to the input and move the cursor to the end.
  // `applyingHistory` suppresses the onContentChange index-reset for this
  // programmatic edit, so navigation keeps its place.
  let applyingHistory = false
  function applyHistory(text: string) {
    applyingHistory = true
    setValue(text)
    if (inputRef) {
      inputRef.setText(text)
      inputRef.setCursor(0, text.length)
    }
    applyingHistory = false
    renderer.requestRender()
  }

  // Seed the input from `initialDraft` (resume: the last failed/unanswered
  // question, reloaded so the user can retry). Reactive — the draft is set
  // asynchronously after the conversation hydrates, which may be after mount —
  // and applied only once, only while the input is still empty (so it never
  // clobbers something the user has started typing).
  let draftApplied = false
  createEffect(() => {
    const draft = props.initialDraft
    if (draftApplied || !draft || draft.trim().length === 0) return
    if (value().length > 0) {
      draftApplied = true // user already typing — don't overwrite
      return
    }
    draftApplied = true
    queueMicrotask(() => applyHistory(draft))
  })

  const placeholderText = () => {
    const phrases = props.placeholders?.normal ?? [props.placeholder ?? "Ask anything..."]
    const base = phrases[phraseTick() % phrases.length]
    return `Ask anything... "${base}"`
  }

  let submitting = false
  function submit() {
    if (submitting) return
    submitting = true
    try {
      const text = inputRef?.plainText?.trim() ?? value().trim()
      if (!text) return
      // Record in history (skip if identical to the most recent entry) and reset
      // the navigation cursor back to "live draft".
      setHistory((h) => (h[h.length - 1] === text ? h : [...h, text]))
      pushHistory(text)
      histState = { index: null }
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
        <SlashPopover
          results={slashWindow().items}
          argItems={argSuggestions()?.choices}
          selected={slashWindow().selected}
          moreAbove={slashWindow().moreAbove}
          moreBelow={slashWindow().moreBelow}
        />
        <box
          width="100%"
          border={["left"]}
          borderColor={props.autoAccept ? (theme.warning ?? theme.accent) : theme.accent}
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
              focused={promptFocused()}
              keyBindings={promptKeyBindings}
              onContentChange={() => {
                setValue(inputRef?.plainText ?? "")
                setSlashSelected(0)
                // User edited the text → leave history navigation (next ↑ starts
                // fresh from the newest). Skipped for programmatic recalls.
                if (!applyingHistory) histState = { index: null }
                renderer.requestRender()
              }}
              onSubmit={() => {
                setTimeout(() => submit(), 0)
              }}
              onKeyDown={(e: any) => {
                // Shift+Tab is the session's auto-accept toggle (handled by a global keyboard
                // handler), NOT a prompt action. Consume it here so the prompt never treats it
                // as plain Tab — that's why every Tab branch below can assume no shift. This is
                // what keeps Shift+Tab from opening the agent picker (Tab = agents, Shift+Tab = mode).
                if (e.name === "tab" && e.shift) {
                  e.preventDefault()
                  return
                }
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
                // No slash popover open: Tab opens the agent picker (the "tab · agents" hint).
                if (!args && slashResults().length === 0 && e.name === "tab") {
                  e.preventDefault()
                  props.onOpenAgentPicker?.()
                  return
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
                // No popover open → ↑/↓ navigate submitted-command history.
                if (e.name === "up") {
                  const r = historyPrev(history(), histState)
                  if (r.value !== null) {
                    e.preventDefault()
                    histState = r.state
                    applyHistory(r.value)
                    return
                  }
                }
                if (e.name === "down") {
                  const r = historyNext(history(), histState)
                  if (r.value !== null) {
                    e.preventDefault()
                    histState = r.state
                    applyHistory(r.value)
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
              // The input is focused whenever no overlay is open, so OpenTUI draws the native cursor at
              // column 0 even while empty. The default block cursor inverts that cell — sitting
              // on top of the placeholder's first char ("A" of "Ask anything...") — which reads
              // as a stray highlighted box on the home screen. A line (beam) caret renders before
              // the glyph instead, so the placeholder stays fully legible.
              cursorStyle={{ style: "line", blinking: true }}
              ref={(r: TextareaRenderable) => {
                inputRef = r
              }}
            />
            {/* Agent / Model / Status row */}
            <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1} justifyContent="space-between">
              <box flexDirection="row" gap={1}>
                <text fg={theme.accent}>{props.agent ?? "Assistant"}</text>
                <text fg={theme.textMuted}>·</text>
                <text fg={theme.text}>Quantcept</text>
                {planLabel() && <text fg={planColor()}>{planLabel()}</text>}
                {props.status && (
                  <>
                    <text fg={theme.textMuted}>·</text>
                    <text fg={theme.accent}>{props.status}</text>
                  </>
                )}
                {props.autoAccept && (
                  <>
                    <text fg={theme.textMuted}>·</text>
                    <text fg={theme.warning ?? theme.accent}>■ auto-accept on (ctrl+t)</text>
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
          borderColor={props.autoAccept ? (theme.warning ?? theme.accent) : theme.accent}
          customBorderChars={{ ...EmptyBorder, vertical: "╹" }}
        >
          <box
            height={1}
            border={["bottom"]}
            borderColor={theme.backgroundElement}
            customBorderChars={{ ...EmptyBorder, horizontal: "▀" }}
          />
        </box>
        {/* Hints row. Left tip shrinks/wraps (minWidth 0 defeats flex min-width:auto); the
            keyboard hints are pinned (flexShrink 0) so they never clip on narrow terminals.
            paddingTop lifts the tip off the input's bottom accent so it reads as its own row. */}
        <box width="100%" flexDirection="row" justifyContent="space-between" gap={2} paddingTop={1}>
          <box flexShrink={1} minWidth={0}>
            {currentTip() != null ? (
              <box paddingLeft={3}>
                <text fg={theme.accent}>
                  {"● "}
                  <span style={{ fg: theme.text }}>Tip</span>{" "}
                  <span style={{ fg: theme.textMuted }}>{currentTip()}</span>
                </text>
              </box>
            ) : (
              (props.hint ?? <text />)
            )}
          </box>
          <box gap={2} flexDirection="row" flexShrink={0}>
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
