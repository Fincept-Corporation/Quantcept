import type { LearningsNetworkStats } from "@core/fincept"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { chatStoresCloud, cloudSummaries, localSummaries, type SessionSummary } from "@tui/components/sessions/history"
import { BuddySprite } from "@tui/buddy/BuddySprite"
import { AgentPicker } from "@tui/components/AgentPicker"
import { Logo } from "@tui/components/logo"
import { Prompt } from "@tui/components/prompt"
import { ResumeModal } from "@tui/components/sessions/ResumeModal"
import { useAgents } from "@tui/context/agents"
import { useArgs } from "@tui/context/args"
import { useAuth } from "@tui/context/auth"
import { useRoute } from "@tui/context/route"
import { useStorage } from "@tui/context/storage"
import { useTheme } from "@tui/context/theme"
import { TIPS } from "@tui/tips"
import { useDialog } from "@tui/ui/dialog"
import { useToast } from "@tui/ui/toast"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"

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

// Rotating hero subtitle — cycles slowly (every ~15s, see `subtitle` below) so the
// hero feels alive without churn. Short, on-brand taglines; edit freely.
const SUBTITLES = [
  "AI-powered finance terminal",
  "Markets · Portfolios · Risk · Strategy",
  "Your AI analyst, on call around the clock",
  "Ask. Analyze. Act.",
  "From ticker to thesis in seconds",
  "Where questions become positions",
  "Quant power, in plain English",
  "Research, risk, and reasoning — together",
  "The market, explained simply",
  "Numbers in. Insight out.",
  "Your edge, one question away",
  "Institutional-grade analysis, made simple",
  "Decode any company in minutes",
  "Less noise. More signal.",
  "Turn data into decisions",
  "Built for the curious investor",
  "Markets move fast — so do we",
]

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// Local-system date + time, e.g. "Mon 01 Jun 2026  ·  14:32:05".
function fmtClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${WD[d.getDay()]} ${p(d.getDate())} ${MO[d.getMonth()]} ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n)
}

export function Home() {
  const { theme } = useTheme()
  const route = useRoute()
  const agents = useAgents()
  const toast = useToast()
  const dialog = useDialog()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const promptMaxWidth = () => {
    const w = dimensions().width
    return Math.min(Math.max(75, Math.floor(w * 0.55)), w - 4)
  }

  const storage = useStorage()
  const args = useArgs()
  // Recent chats for the inline list — cloud conversations or local sessions.
  // Loaded on mount (Home remounts each time it's shown, so it stays fresh).
  const [recent, setRecent] = createSignal<SessionSummary[]>([])

  function openResume() {
    if (dialog.active()) return
    dialog.replace(() => (
      <ResumeModal
        onClose={() => dialog.clear()}
        onResume={(id) => {
          dialog.clear()
          if (chatStoresCloud()) {
            route.navigate({
              type: "session",
              sessionID: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              cloudConvId: id,
            })
          } else {
            route.navigate({ type: "session", sessionID: id })
          }
        }}
      />
    ))
    renderer.requestRender()
  }

  useKeyboard((e: { name?: string; ctrl?: boolean; preventDefault?: () => void }) => {
    if (e.ctrl && e.name === "r") {
      e.preventDefault?.()
      openResume()
    }
  })

  // Selected agent persona (undefined = default assistant). Tab opens the picker;
  // the choice is carried into the session the prompt creates on submit.
  const [agentName, setAgentName] = createSignal<string | undefined>(undefined)
  function openAgentPicker() {
    if (dialog.active()) return
    agents.refresh()
    dialog.replace(() => (
      <AgentPicker
        agents={() => agents.all()}
        current={agentName()}
        onSelect={(name) => {
          setAgentName(name)
          toast.show({ message: name ? `Agent: ${name}` : "Default assistant", variant: "info" })
        }}
        onClose={() => dialog.clear()}
      />
    ))
    renderer.requestRender()
  }

  // One slow 1s tick drives the subtitle rotation and the live market clock.
  // Cheap (1fps) and stops on unmount — no idle render churn.
  const [tick, setTick] = createSignal(0)

  // Learnings/torrent stats for the hero strip (network + swarm + your own).
  const auth = useAuth()
  const [stats, setStats] = createSignal<LearningsNetworkStats | undefined>(undefined)
  // Backoff state: when we get rate-limited we skip stat fetches until the
  // retry window expires, so we don't burn the user's hourly request budget.
  let statsBackoffUntil = 0
  async function loadStats() {
    if (Date.now() < statsBackoffUntil) return
    try {
      const r = await auth.learnings.stats()
      setStats(r.data)
    } catch (e: unknown) {
      // On 429 back off for 60s; for any other error keep whatever we had.
      const msg = e instanceof Error ? e.message : ""
      if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
        statsBackoffUntil = Date.now() + 60_000
      }
    }
  }

  let timer: ReturnType<typeof setInterval>
  onMount(() => {
    if (args.resume === true) openResume()
    if (chatStoresCloud()) {
      void cloudSummaries().then((s) => setRecent(s.slice(0, 5)))
    } else {
      setRecent(localSummaries(storage.listSessions(storage.projectHashFor(process.cwd()))).slice(0, 5))
    }
    void loadStats()
    timer = setInterval(() => {
      setTick((t) => {
        const n = t + 1
        if (n % 30 === 0) void loadStats() // refresh swarm/learnings stats every ~30s
        return n
      })
      renderer.requestRender()
    }, 1000)
  })
  onCleanup(() => clearInterval(timer))

  // Advance one subtitle every 15 ticks (~15s) — slow enough not to distract.
  const subtitle = createMemo(() => SUBTITLES[Math.floor(tick() / 15) % SUBTITLES.length]!)
  // Live local-system clock — re-derived each tick.
  const clock = createMemo(() => {
    tick()
    return fmtClock(new Date())
  })
  // Compact one-liner for the top status bar (empty until stats load).
  const statsBody = createMemo(() => {
    const s = stats()
    if (!s) return ""
    const swarm = s.swarm.enabled
      ? `swarm: ${s.swarm.seeders} seeding · ${s.swarm.leechers} downloading`
      : "swarm: idle"
    return `${fmtNum(s.network.learnings)} learnings · ${swarm}`
  })

  return (
    <box flexDirection="column" flexGrow={1} width="100%">
      {/* Ambient top status bar — learnings/swarm (left) · local clock (right). */}
      <box flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={1}>
        <box flexDirection="row" flexShrink={1}>
          <Show when={statsBody()}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.accent }}>{"● "}</span>
              {statsBody()}
            </text>
          </Show>
        </box>
        <text fg={theme.textMuted}>{clock()}</text>
      </box>

      {/* Hero — unchanged, centered in the remaining space. */}
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
            agent={agentName()}
            onOpenAgentPicker={openAgentPicker}
            onSubmit={(text) => {
              const sessionID = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
              route.navigate({ type: "session", sessionID, initialMessage: text, initialAgent: agentName() })
            }}
            tips={[...TIPS]}
          />
        </box>
        <Show when={recent().length > 0}>
          <box width="100%" maxWidth={promptMaxWidth()} flexDirection="column" flexShrink={0} paddingTop={1}>
            <text fg={theme.textMuted}>Recent</text>
            <For each={recent()}>
              {(s) => (
                <box flexDirection="row" justifyContent="space-between" gap={2}>
                  <text fg={theme.text}>{s.title.slice(0, 48)}</text>
                  <text fg={theme.textMuted}>{s.sub}</text>
                </box>
              )}
            </For>
            <text fg={theme.textMuted}>more… (Ctrl+R or /resume)</text>
          </box>
        </Show>
        <box height={1} minHeight={0} flexShrink={1} />
        <box flexShrink={0} width="100%" maxWidth={promptMaxWidth()} flexDirection="row" justifyContent="center">
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.accent }}>{"● "}</span>Quantcept v0.1.0{" · "}
            Ctrl+Q exit{" · "}Enter submit{" · "}Shift+Enter newline
          </text>
        </box>
      </box>
    </box>
  )
}
