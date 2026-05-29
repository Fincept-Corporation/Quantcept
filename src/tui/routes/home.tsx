import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { BuddySprite } from "@tui/buddy/BuddySprite"
import { Logo } from "@tui/components/logo"
import { Prompt } from "@tui/components/prompt"
import { useRoute } from "@tui/context/route"
import { useTheme } from "@tui/context/theme"
import { marketStatus } from "@tui/finance/market"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"

const placeholder = {
  normal: [
    "Analyze NIFTY 50 performance this quarter",
    "What's the risk exposure on my portfolio?",
    "Show me top gainers today",
    "Compare HDFC Bank vs ICICI Bank",
    "Calculate the Sharpe ratio of my holdings",
  ],
  shell: ["ls -la", "git status", "pwd"],
}

// Rotating hero subtitle — cycles slowly so the hero feels alive without churn.
const SUBTITLES = [
  "AI-powered finance terminal",
  "Markets · Portfolios · Risk · Strategy",
  "Your desk for quantitative analysis",
  "Ask. Analyze. Act.",
]

export function Home() {
  const { theme } = useTheme()
  const route = useRoute()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const promptMaxWidth = () => {
    const w = dimensions().width
    return Math.min(Math.max(75, Math.floor(w * 0.55)), w - 4)
  }

  // One slow 1s tick drives the subtitle rotation and the live market clock.
  // Cheap (1fps) and stops on unmount — no idle render churn.
  const [tick, setTick] = createSignal(0)
  let timer: ReturnType<typeof setInterval>
  onMount(() => {
    timer = setInterval(() => {
      setTick((t) => t + 1)
      renderer.requestRender()
    }, 1000)
  })
  onCleanup(() => clearInterval(timer))

  const subtitle = createMemo(() => SUBTITLES[Math.floor(tick() / 5) % SUBTITLES.length]!)
  const market = createMemo(() => {
    tick()
    return marketStatus()
  })

  return (
    <box flexGrow={1} alignItems="center" justifyContent="center" paddingLeft={2} paddingRight={2}>
      <box flexShrink={0}>
        <Logo />
      </box>
      <box flexShrink={0} flexDirection="row" justifyContent="center">
        <text fg={theme.textMuted}>{subtitle()}</text>
      </box>
      <box height={1} minHeight={0} flexShrink={1} />
      <box flexShrink={1} minHeight={0}>
        <BuddySprite />
      </box>
      <box height={1} minHeight={0} flexShrink={1} />
      <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} flexShrink={0}>
        <Prompt
          placeholders={placeholder}
          onSubmit={(text) => {
            const sessionID = `session-${Date.now()}`
            route.navigate({ type: "session", sessionID, initialMessage: text })
          }}
          hint={
            <box paddingLeft={3}>
              <text fg={theme.accent}>
                {"● "}
                <span style={{ fg: theme.text }}>Tip</span>{" "}
                <span style={{ fg: theme.textMuted }}>
                  Ask about markets, portfolios, risk analysis, or trading strategies
                </span>
              </text>
            </box>
          }
        />
      </box>
      <box height={1} minHeight={0} flexShrink={1} />
      <box flexShrink={0} width="100%" maxWidth={promptMaxWidth()} flexDirection="row" justifyContent="center">
        <text fg={theme.textMuted}>
          <span style={{ fg: market().open ? theme.success : theme.textMuted }}>{"● "}</span>
          <span style={{ fg: market().open ? theme.success : theme.textMuted }}>{market().label}</span>
          {" · "}Quantcept v0.1.0{" · "}Ctrl+Q exit{" · "}Enter submit
        </text>
      </box>
    </box>
  )
}
