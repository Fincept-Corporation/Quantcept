import { useRenderer } from "@opentui/solid"
import { BuddySprite } from "@tui/buddy/BuddySprite"
import { useTheme } from "@tui/context/theme"
import { formatElapsed, marketStatus } from "@tui/finance/market"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"

interface SidebarMessage {
  role: string
  content: string
  toolName?: string
  toolStatus?: "running" | "done"
  toolIsError?: boolean
}

interface SidebarProps {
  sessionID: string
  overlay?: boolean
  messages?: SidebarMessage[]
  model?: string
  tokens?: number
  loading?: boolean
  startedAt?: number
}

const RULE = "─".repeat(36)

// Finance-flavored desk tips; rotate slowly through the ticker line.
const DESK_TIPS = [
  "Past performance ≠ future returns.",
  "Diversification is the only free lunch.",
  "Type / to run a command.",
  "Cut losses short, let winners run.",
  "Risk comes from not knowing what you're doing.",
  "Ctrl+L clears the conversation.",
  "Time in the market beats timing the market.",
]

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) {
    const k = n / 1_000
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`
  }
  const m = n / 1_000_000
  return `${m < 10 ? m.toFixed(1) : Math.round(m)}M`
}

/** A small labeled section header in the desk readout. */
function Section(props: { label: string; color: string; children: import("solid-js").JSX.Element }) {
  return (
    <box flexShrink={0}>
      <text fg={props.color}>
        <b>{props.label}</b>
      </text>
      <box paddingLeft={1}>{props.children}</box>
    </box>
  )
}

export function Sidebar(props: SidebarProps) {
  const { theme } = useTheme()
  const renderer = useRenderer()

  // One slow 1s tick drives the live elapsed clock, ticker rotation, and market
  // status. 1fps — negligible cost, and it stops on unmount.
  const [tick, setTick] = createSignal(0)
  let timer: ReturnType<typeof setInterval>
  onMount(() => {
    timer = setInterval(() => {
      setTick((t) => t + 1)
      renderer.requestRender()
    }, 1000)
  })
  onCleanup(() => clearInterval(timer))

  const sessionTitle = () => {
    const id = props.sessionID
    return id.startsWith("session-") ? "New Session" : id
  }

  const msgs = () => props.messages ?? []
  const userMsgCount = () => msgs().filter((m) => m.role === "user").length
  const assistantMsgCount = () => msgs().filter((m) => m.role === "assistant").length

  // TAPE: real tool activity pulled from the message stream, newest first.
  const activity = createMemo(() =>
    msgs()
      .filter((m) => m.role === "tool" && m.toolName)
      .slice(-6)
      .reverse(),
  )

  const elapsed = createMemo(() => {
    tick()
    return props.startedAt ? formatElapsed(Date.now() - props.startedAt) : "—"
  })
  const market = createMemo(() => {
    tick()
    return marketStatus()
  })
  const tip = createMemo(() => DESK_TIPS[Math.floor(tick() / 6) % DESK_TIPS.length]!)

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={42}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      position={props.overlay ? "absolute" : "relative"}
    >
      <scrollbox flexGrow={1}>
        <box flexShrink={0} gap={1} paddingRight={1}>
          {/* Buddy at top */}
          <box alignItems="center" flexShrink={0}>
            <BuddySprite compact />
          </box>

          {/* Market status strip */}
          <box flexDirection="row" flexShrink={0}>
            <text fg={market().open ? theme.success : theme.textMuted}>
              {"● "}
              {market().label}
            </text>
          </box>

          <box height={1} flexShrink={0}>
            <text fg={theme.border}>{RULE}</text>
          </box>

          {/* Session title */}
          <box flexShrink={0}>
            <text fg={theme.text}>
              <b>{sessionTitle()}</b>
            </text>
            <text fg={theme.textMuted}>{props.sessionID.slice(0, 16)}</text>
          </box>

          {/* VITALS — live session readout */}
          <Section label="VITALS" color={theme.secondary}>
            <text fg={theme.textMuted}>
              Model: <span style={{ fg: theme.text }}>{props.model ?? "—"}</span>
            </text>
            <text fg={theme.textMuted}>
              Tokens: <span style={{ fg: theme.accent }}>{formatTokens(props.tokens ?? 0)}</span>
            </text>
            <text fg={theme.textMuted}>
              Session: <span style={{ fg: theme.text }}>{elapsed()}</span>
            </text>
            <text fg={theme.textMuted}>
              State:{" "}
              <span style={{ fg: props.loading ? theme.warning : theme.success }}>
                {props.loading ? "Working…" : "Idle"}
              </span>
            </text>
          </Section>

          {/* MESSAGES */}
          <Section label="MESSAGES" color={theme.secondary}>
            <text fg={theme.textMuted}>
              You: <span style={{ fg: theme.text }}>{userMsgCount()}</span>
              {"   "}AI: <span style={{ fg: theme.text }}>{assistantMsgCount()}</span>
            </text>
          </Section>

          {/* TAPE — live tool activity feed */}
          <Section label="TAPE" color={theme.secondary}>
            <Show when={activity().length > 0} fallback={<text fg={theme.textMuted}>No activity yet</text>}>
              <For each={activity()}>
                {(a) => (
                  <text fg={theme.textMuted}>
                    <span
                      style={{
                        fg: a.toolStatus === "running" ? theme.warning : a.toolIsError ? theme.error : theme.success,
                      }}
                    >
                      {a.toolStatus === "running" ? "◌ " : a.toolIsError ? "✗ " : "✓ "}
                    </span>
                    {a.toolName}
                  </text>
                )}
              </For>
            </Show>
          </Section>

          {/* TICKER — rotating desk tip */}
          <Section label="TICKER" color={theme.secondary}>
            <text fg={theme.textMuted}>{tip()}</text>
          </Section>

          {/* ACTIONS — keybind shortcuts */}
          <Section label="ACTIONS" color={theme.secondary}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.accent }}>Ctrl+N</span> New session
            </text>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.accent }}>Ctrl+L</span> Clear chat
            </text>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.accent }}>/theme</span> Switch theme
            </text>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.accent }}>Ctrl+Q</span> Exit
            </text>
          </Section>
        </box>
      </scrollbox>

      {/* Footer */}
      <box flexShrink={0} gap={1} paddingTop={1}>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.success }}>•</span> <b>Quant</b>
          <span style={{ fg: theme.text }}>
            <b>cept</b>
          </span>{" "}
          <span>v0.1.0</span>
        </text>
      </box>
    </box>
  )
}
