import { createTextAttributes } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"

const BOLD = createTextAttributes({ bold: true })

const LOGO = [
  " ██████  ██    ██  █████  ███    ██ ████████  ██████ ███████ ██████  ████████",
  "██    ██ ██    ██ ██   ██ ████   ██    ██    ██      ██      ██   ██    ██   ",
  "██    ██ ██    ██ ███████ ██ ██  ██    ██    ██      █████   ██████     ██   ",
  "██ ▄▄ ██ ██    ██ ██   ██ ██  ██ ██    ██    ██      ██      ██        ██   ",
  " ██████   ██████  ██   ██ ██   ████    ██     ██████ ███████ ██        ██   ",
  "    ▀▀                                                                      ",
]

const MAX_CHARS = Math.max(...LOGO.map((l) => l.length))

export function Logo() {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const [revealed, setRevealed] = createSignal(0)
  const [done, setDone] = createSignal(false)

  // Reveal once on mount, then idle. The previous build replayed every 6s on a
  // 12ms (~83fps) interval — a permanent render/CPU drain on an otherwise static
  // home screen. ~30fps (33ms) is visually identical for a one-shot reveal and
  // the timer stops for good once the logo is fully drawn.
  const REVEAL_STEP_MS = 33
  let interval: ReturnType<typeof setInterval> | undefined

  onMount(() => {
    interval = setInterval(() => {
      setRevealed((r) => {
        const next = r + 2
        if (next >= MAX_CHARS) {
          clearInterval(interval)
          setDone(true)
          return MAX_CHARS
        }
        renderer.requestRender()
        return next
      })
    }, REVEAL_STEP_MS)
  })
  onCleanup(() => clearInterval(interval))

  const visibleLines = createMemo(() => {
    const r = revealed()
    return LOGO.map((line) => {
      if (r >= line.length) return line
      return line.slice(0, r)
    })
  })

  const textColor = () => (typeof theme.text === "string" ? theme.text : "#e0e0e0")
  const cursorColor = () => (typeof theme.accent === "string" ? theme.accent : "#3ce067")

  return (
    <box flexDirection="column" alignItems="center">
      {visibleLines().map((line, i) => (
        <box flexDirection="row" height={1}>
          <text fg={textColor()} attributes={BOLD}>
            {line}
          </text>
          {!done() && revealed() < LOGO[i]!.length && (
            <text fg={cursorColor()} attributes={BOLD}>
              █
            </text>
          )}
        </box>
      ))}
    </box>
  )
}
