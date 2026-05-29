import { createTextAttributes, RGBA, SyntaxStyle } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { batch, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { createStore, produce } from "solid-js/store"

const BOLD = createTextAttributes({ bold: true })

import type { ActionCommand } from "@ext/commands/types"
import type { ScrollBoxRenderable } from "@opentui/core"
import { Prompt } from "@tui/components/prompt"
import { useCommands } from "@tui/context/command"
import { useExit } from "@tui/context/exit"
import { type SessionRoute, useRoute } from "@tui/context/route"
import { useTheme } from "@tui/context/theme"
import { createProvider } from "@core/llm/provider"
import { loadConfig } from "@core/config/load"
import { SYSTEM_PROMPT } from "@core/agent/system"
import { Sidebar } from "./sidebar"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

const placeholder = {
  normal: ["Continue the conversation...", "Ask a follow-up question...", "Request more details..."],
  shell: ["ls -la", "git status", "pwd"],
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, "0")
  const m = d.getMinutes().toString().padStart(2, "0")
  return `${h}:${m}`
}

export function Session() {
  const { theme } = useTheme()
  const config = loadConfig()
  const provider = createProvider(config.provider)
  const route = useRoute()
  const exit = useExit()
  const dimensions = useTerminalDimensions()
  const sessionData = () => route.data as SessionRoute
  const [messages, setMessages] = createStore<Message[]>([])
  const [sidebarMode, setSidebarMode] = createSignal<"auto" | "show" | "hide">("auto")
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  let scrollRef: ScrollBoxRenderable | undefined

  const wide = createMemo(() => dimensions().width > 120)
  const sidebarVisible = createMemo(() => {
    if (sidebarOpen()) return true
    if (sidebarMode() === "hide") return false
    if (sidebarMode() === "show") return true
    return wide()
  })

  function toggleSidebar() {
    batch(() => {
      const isVisible = sidebarVisible()
      setSidebarMode(isVisible ? "hide" : "auto")
      setSidebarOpen(!isVisible)
    })
  }

  function addMessage(role: "user" | "assistant", content: string) {
    setMessages(
      produce((msgs) => {
        msgs.push({
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          content,
          timestamp: Date.now(),
        })
      }),
    )
  }

  onMount(() => {
    const initial = sessionData().initialMessage
    if (initial) {
      handleSubmit(initial)
    }
  })

  const renderer = useRenderer()
  const [loading, setLoading] = createSignal(false)
  const [tokensPrev, setTokensPrev] = createSignal(0)
  const [tokensLive, setTokensLive] = createSignal(0)
  const totalTokens = () => tokensPrev() + tokensLive()

  function updateLastAssistantMessage(content: string) {
    setMessages(
      produce((msgs) => {
        const last = msgs[msgs.length - 1]
        if (last && last.role === "assistant") {
          last.content = content
        }
      }),
    )
  }

  async function handleSubmit(text: string) {
    addMessage("user", text)
    setLoading(true)
    setTokensLive(0)

    addMessage("assistant", "")

    const history = messages
      .filter((m) => m.content.length > 0)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

    try {
      const result = await provider.chat(
        { messages: history, system: SYSTEM_PROMPT },
        {
          onChunk: (chunk) => {
            setMessages(
              produce((msgs) => {
                const last = msgs[msgs.length - 1]
                if (last && last.role === "assistant") {
                  last.content += chunk
                }
              }),
            )
            renderer.requestRender()
          },
          onTokens: (input, output) => {
            setTokensLive(input + output)
            renderer.requestRender()
          },
        },
      )
      setTokensPrev((p) => p + result.inputTokens + result.outputTokens)
      setTokensLive(0)
      if (result.stopReason === "max_tokens") {
        setMessages(
          produce((msgs) => {
            const last = msgs[msgs.length - 1]
            if (last && last.role === "assistant") {
              last.content += "\n\n[Response truncated — token limit reached]"
            }
          }),
        )
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      updateLastAssistantMessage(`Error: ${errMsg}`)
    } finally {
      setLoading(false)
      renderer.requestRender()
    }
  }

  const commands = useCommands()
  const hostHooks = {
    submitPrompt: (text: string) => handleSubmit(text),
    clearMessages: () => setMessages([]),
  }
  commands.setHostHooks(hostHooks)
  const clearCmd: ActionCommand = {
    kind: "action",
    id: "session.clear",
    name: "clear",
    description: "Clear the current conversation",
    category: "Session",
    source: "builtin",
    keybind: "ctrl+l",
    run(_args, ctx) {
      ctx.clearMessages()
    },
  }
  const unregisterClear = commands.register(clearCmd)
  onCleanup(() => {
    unregisterClear()
    commands.clearHostHooks(hostHooks)
  })

  return (
    <box flexDirection="row" flexGrow={1} minHeight={0}>
      {/* Main content area */}
      <box flexGrow={1} minHeight={0} paddingBottom={0} paddingLeft={2} paddingRight={2}>
        {/* Messages area */}
        <scrollbox
          ref={(r: ScrollBoxRenderable) => {
            scrollRef = r
          }}
          stickyScroll={true}
          stickyStart="bottom"
          flexGrow={1}
        >
          <box height={1} />

          <Show when={messages.length === 0}>
            <box paddingLeft={2} paddingTop={2} paddingBottom={1}>
              <text fg={theme.textMuted}>{"Welcome to Quantcept. Type a message below to start."}</text>
              <box height={1} />
              <text fg={theme.textMuted}>{"  Examples:"}</text>
              <text fg={theme.accent}>{'  · "Analyze NIFTY 50 performance this quarter"'}</text>
              <text fg={theme.accent}>{'  · "What\'s the risk exposure on my portfolio?"'}</text>
              <text fg={theme.accent}>{'  · "Compare HDFC Bank vs ICICI Bank"'}</text>
            </box>
          </Show>

          <For each={messages}>
            {(message, index) => (
              <Show
                when={message.role === "user"}
                fallback={
                  <AssistantMessage
                    content={message.content}
                    timestamp={message.timestamp}
                    theme={theme}
                    streaming={loading() && index() === messages.length - 1}
                  />
                }
              >
                <UserMessage
                  content={message.content}
                  timestamp={message.timestamp}
                  theme={theme}
                  isFirst={index() === 0}
                />
              </Show>
            )}
          </For>

          <box height={1} />
        </scrollbox>

        {/* Prompt */}
        <box flexShrink={0} paddingTop={1}>
          <Prompt
            placeholders={placeholder}
            onSubmit={handleSubmit}
            status={loading() ? "⟳ Generating..." : undefined}
            messageCount={messages.length}
            tokenCount={totalTokens()}
          />
        </box>

        {/* Session footer */}
        <box
          flexShrink={0}
          flexDirection="row"
          justifyContent="space-between"
          paddingTop={0}
          paddingLeft={1}
          paddingRight={1}
        >
          <text fg={theme.textMuted}>
            Ctrl+N <span style={{ fg: theme.textMuted }}>new</span>
            {"  "}Ctrl+Q <span style={{ fg: theme.textMuted }}>exit</span>
          </text>
          <text fg={theme.textMuted}>{sessionData().sessionID.slice(0, 12)}</text>
        </box>
      </box>

      {/* Sidebar */}
      <Show when={sidebarVisible()}>
        <Switch>
          <Match when={wide()}>
            <Sidebar sessionID={sessionData().sessionID} messages={messages} />
          </Match>

          <Match when={!wide()}>
            <box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              alignItems="flex-end"
              backgroundColor={RGBA.fromInts(0, 0, 0, 70)}
            >
              <Sidebar sessionID={sessionData().sessionID} messages={messages} overlay={true} />
            </box>
          </Match>
        </Switch>
      </Show>
    </box>
  )
}

function UserMessage(props: { content: string; timestamp: number; theme: any; isFirst: boolean }) {
  return (
    <box marginTop={props.isFirst ? 0 : 1} flexShrink={0} border={["left"]} borderColor={props.theme.accent}>
      <box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={props.theme.backgroundPanel}
      >
        <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
          <text fg={props.theme.accent} attributes={BOLD}>
            You
          </text>
          <text fg={props.theme.textMuted}>{formatTime(props.timestamp)}</text>
        </box>
        <box paddingTop={1}>
          <text fg={props.theme.text}>{props.content}</text>
        </box>
      </box>
    </box>
  )
}

const defaultSyntaxStyle = SyntaxStyle.create()

function AssistantMessage(props: { content: string; timestamp: number; theme: any; streaming?: boolean }) {
  return (
    <box marginTop={1} flexShrink={0}>
      <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
        <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
          <text fg={props.theme.accent} attributes={BOLD}>
            Quantcept
          </text>
          <text fg={props.theme.textMuted}>{formatTime(props.timestamp)}</text>
        </box>
        <box paddingTop={1}>
          <Show when={props.content} fallback={<text fg={props.theme.textMuted}>Thinking...</text>}>
            <markdown
              content={props.content}
              fg={props.theme.text}
              syntaxStyle={defaultSyntaxStyle}
              streaming={props.streaming ?? false}
            />
          </Show>
        </box>
      </box>
    </box>
  )
}
