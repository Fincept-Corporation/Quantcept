import { useTerminalDimensions } from "@opentui/solid"
import { BuddySprite } from "@tui/buddy/BuddySprite"
import { Logo } from "@tui/components/logo"
import { Prompt } from "@tui/components/prompt"
import { useRoute } from "@tui/context/route"
import { useTheme } from "@tui/context/theme"

const placeholder = {
  normal: [
    "Analyze NIFTY 50 performance this quarter",
    "What's the risk exposure on my portfolio?",
    "Show me top gainers today",
  ],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const { theme } = useTheme()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const promptMaxWidth = () => {
    const w = dimensions().width
    return Math.min(Math.max(75, Math.floor(w * 0.55)), w - 4)
  }

  return (
    <box flexGrow={1} alignItems="center" justifyContent="center" paddingLeft={2} paddingRight={2}>
      <box flexShrink={0}>
        <Logo />
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
          <span style={{ fg: theme.accent }}>{"● "}</span>Quantcept v0.1.0{" · "}
          Ctrl+Q exit{" · "}Enter submit{" · "}Shift+Enter newline
        </text>
      </box>
    </box>
  )
}
