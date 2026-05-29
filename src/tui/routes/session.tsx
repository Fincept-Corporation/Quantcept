import { createTextAttributes, RGBA, type SyntaxStyle } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { batch, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { createStore, produce } from "solid-js/store"

const BOLD = createTextAttributes({ bold: true })

import { runAgentTurn } from "@core/agent/loop"
import { SYSTEM_PROMPT } from "@core/agent/system"
import { loadConfig } from "@core/config/load"
import { createProvider } from "@core/llm/provider"
import { McpManager } from "@core/mcp/manager"
import type { PermissionDecision } from "@core/permissions/schema"
import { CalculatorTool } from "@core/tools/builtin/CalculatorTool"
import { EditTool } from "@core/tools/builtin/EditTool"
import { GlobTool } from "@core/tools/builtin/GlobTool"
import { GrepTool } from "@core/tools/builtin/GrepTool"
import { ReadTool } from "@core/tools/builtin/ReadTool"
import { ShellTool } from "@core/tools/builtin/ShellTool"
import { WriteTool } from "@core/tools/builtin/WriteTool"
import { ToolRegistry } from "@core/tools/registry"
import type { Tool } from "@core/tools/Tool"
import type { ActionCommand } from "@ext/commands/types"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useBuddy } from "@tui/buddy/BuddyContext"
import { Prompt } from "@tui/components/prompt"
import { ToolMessage } from "@tui/components/tool-message"
import { useCommands } from "@tui/context/command"
import { useExit } from "@tui/context/exit"
import { type SessionRoute, useRoute } from "@tui/context/route"
import { useSnapshot } from "@tui/context/snapshot"
import { useStorage } from "@tui/context/storage"
import { type ThemeColors, useTheme } from "@tui/context/theme"
import { buildSyntaxStyle } from "@tui/themes/syntax-style"
import { useDialog } from "@tui/ui/dialog"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { Sidebar } from "./sidebar"

interface Message {
  id: string
  role: "user" | "assistant" | "tool"
  content: string
  timestamp: number
  toolName?: string
  toolStatus?: "running" | "done"
  toolOutput?: unknown
  toolIsError?: boolean
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
  const buddy = useBuddy()
  const storage = useStorage()
  const snapshot = useSnapshot()
  const config = loadConfig()
  const provider = createProvider(config.provider)
  const registry = new ToolRegistry()
  registry.register(CalculatorTool)
  registry.register(ReadTool)
  registry.register(GlobTool)
  registry.register(GrepTool)
  registry.register(WriteTool)
  registry.register(EditTool)
  registry.register(ShellTool)
  const mcp = new McpManager()
  onMount(async () => {
    try {
      await mcp.start(config.mcp, registry)
    } catch {
      // start() already logs per-server failures; never block the session.
    }
  })
  onCleanup(() => void mcp.stop())
  const dialog = useDialog()

  async function askViaDialog(tool: Tool, input: unknown): Promise<PermissionDecision> {
    const ok = await DialogConfirm.show(dialog, `Run ${tool.name}?`, `Input: ${JSON.stringify(input)}`)
    return ok ? "allow" : "deny"
  }
  const route = useRoute()
  const exit = useExit()
  const dimensions = useTerminalDimensions()
  const sessionData = () => route.data as SessionRoute
  const [messages, setMessages] = createStore<Message[]>([])
  const [sidebarMode, setSidebarMode] = createSignal<"auto" | "show" | "hide">("auto")
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  let scrollRef: ScrollBoxRenderable | undefined

  // Rebuild the markdown/code SyntaxStyle whenever the theme changes so chat
  // output honors the active theme. SyntaxStyle holds a native handle, so the
  // previous instance is destroyed before a new one replaces it.
  let prevSyntaxStyle: SyntaxStyle | undefined
  const syntaxStyle = createMemo(() => {
    const next = buildSyntaxStyle(theme)
    prevSyntaxStyle?.destroy()
    prevSyntaxStyle = next
    return next
  })
  onCleanup(() => prevSyntaxStyle?.destroy())

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
    const ts = Date.now()
    setMessages(
      produce((msgs) => {
        msgs.push({
          id: `msg-${ts}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          content,
          timestamp: ts,
        })
      }),
    )
    if (content.length > 0) {
      const id = sessionData().sessionID
      storage.appendEvent(id, { t: "msg", role, content, ts })
      // Derive the session title from the first user message (write-once).
      if (role === "user") storage.setTitle(id, content.slice(0, 60))
    }
  }

  onMount(() => {
    const id = sessionData().sessionID
    const cwd = process.cwd()
    const existing = storage.loadSession(id)
    if (existing.length > 0) {
      // Resume: replay the transcript into the message store.
      setMessages(
        produce((msgs) => {
          for (const r of existing) {
            if (r.t === "msg") {
              msgs.push({
                id: `msg-${msgs.length}-${r.ts}`,
                role: r.role,
                content: r.content,
                timestamp: r.ts,
              })
            }
          }
        }),
      )
    } else {
      // New session: write the meta line.
      storage.createSession({ id, cwd })
    }
    const initial = sessionData().initialMessage
    if (initial) handleSubmit(initial)
  })

  const renderer = useRenderer()
  const [loading, setLoading] = createSignal(false)
  const [tokensPrev, setTokensPrev] = createSignal(0)
  const [tokensLive, setTokensLive] = createSignal(0)
  const totalTokens = () => tokensPrev() + tokensLive()
  const sessionStart = Date.now()

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
    buddy.react("thinking")
    snapshot.track(sessionData().sessionID, "turn", text.slice(0, 60))
    setTokensLive(0)

    addMessage("assistant", "")

    const history = messages
      .filter((m) => m.role !== "tool" && m.content.length > 0)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

    try {
      const result = await runAgentTurn(
        {
          provider,
          registry,
          messages: history,
          system: SYSTEM_PROMPT,
          mode: config.permissions.defaultMode,
          rules: config.permissions.rules,
          cwd: process.cwd(),
          ask: askViaDialog,
          snapshot: {
            track: async (label: string) => snapshot.trackRaw(label),
            revertTo: async (treeHash: string) => snapshot.revertTo(treeHash),
          },
          onEvent: (e) => {
            if (e.type === "text") {
              setMessages(
                produce((msgs) => {
                  const last = msgs[msgs.length - 1]
                  if (last && last.role === "assistant") last.content += e.text
                }),
              )
            } else if (e.type === "tool_start") {
              setMessages(
                produce((msgs) => {
                  msgs.push({
                    id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    role: "tool",
                    content: "",
                    timestamp: Date.now(),
                    toolName: e.tool,
                    toolStatus: "running",
                  })
                }),
              )
              // Fresh bubble for any post-tool assistant text; stays empty (shows "Thinking…") if the model emits none.
              addMessage("assistant", "")
            } else if (e.type === "tool_end") {
              setMessages(
                produce((msgs) => {
                  // Assumes one running row per tool name (single tool per turn); revisit if concurrent same-named tools are added.
                  for (let i = msgs.length - 1; i >= 0; i--) {
                    if (msgs[i].role === "tool" && msgs[i].toolName === e.tool && msgs[i].toolStatus === "running") {
                      msgs[i].toolStatus = "done"
                      msgs[i].toolOutput = e.output
                      msgs[i].toolIsError = e.isError
                      break
                    }
                  }
                }),
              )
              storage.appendEvent(sessionData().sessionID, {
                t: "tool",
                tool: e.tool,
                status: "done",
                output: e.output,
                isError: e.isError,
                ts: Date.now(),
              })
            }
            renderer.requestRender()
          },
        },
        {
          onChunk: (chunk) => {
            setMessages(
              produce((msgs) => {
                const last = msgs[msgs.length - 1]
                if (last && last.role === "assistant") last.content += chunk
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
      setTokensPrev((p) => p + result.totalTokens)
      setTokensLive(0)
      buddy.react("success")
      const last = messages[messages.length - 1]
      if (last && last.role === "assistant" && last.content.length > 0) {
        storage.appendEvent(sessionData().sessionID, {
          t: "msg",
          role: "assistant",
          content: last.content,
          ts: Date.now(),
        })
      }
      const realMsgCount = messages.filter((m) => m.role !== "tool" && m.content.length > 0).length
      storage.touch(sessionData().sessionID, { msgCount: realMsgCount, tokens: totalTokens() })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      setMessages(
        produce((msgs) => {
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== "assistant") {
            msgs.push({
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: "assistant",
              content: "",
              timestamp: Date.now(),
            })
          }
        }),
      )
      updateLastAssistantMessage(`Error: ${errMsg}`)
      buddy.react("error")
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
  const resumeCmd: ActionCommand = {
    kind: "action",
    id: "session.resume",
    name: "resume",
    description: "List and resume a previous session in this project",
    category: "Session",
    source: "builtin",
    run(_args, ctx) {
      const ph = storage.projectHashFor(process.cwd())
      const sessions = storage.listSessions(ph).filter((s) => s.id !== sessionData().sessionID)
      if (sessions.length === 0) {
        ctx.toast("No previous sessions in this project.")
        return
      }
      const lines = sessions
        .slice(0, 10)
        .map((s, i) => `${i + 1}. ${s.title ?? "(untitled)"} — ${s.msgCount} msgs`)
        .join("\n")
      ctx.toast(`Recent sessions:\n${lines}\n\nResuming the latest…`)
      route.navigate({ type: "session", sessionID: sessions[0]!.id })
    },
  }
  const unregisterResume = commands.register(resumeCmd)
  const undoCmd: ActionCommand = {
    kind: "action",
    id: "session.undo",
    name: "undo",
    description: "Revert the last file change the assistant made",
    category: "Session",
    source: "builtin",
    run(_args, ctx) {
      const result = snapshot.undo(sessionData().sessionID)
      if (!result) {
        ctx.toast("Nothing to undo.")
        return
      }
      ctx.toast(result.files.length ? `Reverted: ${result.files.join(", ")}` : "Reverted last change.")
    },
  }
  const redoCmd: ActionCommand = {
    kind: "action",
    id: "session.redo",
    name: "redo",
    description: "Re-apply the last undone file change",
    category: "Session",
    source: "builtin",
    run(_args, ctx) {
      ctx.toast(snapshot.redo() ? "Re-applied last change." : "Nothing to redo.")
    },
  }
  const checkpointsCmd: ActionCommand = {
    kind: "action",
    id: "session.checkpoints",
    name: "checkpoints",
    description: "List turn checkpoints and roll the worktree back to one",
    category: "Session",
    source: "builtin",
    async run(_args, ctx) {
      const cps = snapshot.listCheckpoints(sessionData().sessionID, "turn")
      if (cps.length === 0) {
        ctx.toast("No checkpoints yet.")
        return
      }
      const latest = cps[0]!
      const lines = cps
        .slice(0, 10)
        .map((c, i) => `${i + 1}. ${c.label ?? "(turn)"}`)
        .join("\n")
      // Whole-worktree restore is destructive of uncommitted work — confirm first.
      const ok = await DialogConfirm.show(
        dialog,
        "Roll back to the latest checkpoint?",
        `This restores all files to:\n"${latest.label ?? "(turn)"}"\n\nRecent checkpoints:\n${lines}`,
      )
      if (!ok) return
      snapshot.revertTo(latest.treeHash)
      ctx.toast("Rolled back to the latest checkpoint.")
    },
  }
  const unregisterUndo = commands.register(undoCmd)
  const unregisterRedo = commands.register(redoCmd)
  const unregisterCheckpoints = commands.register(checkpointsCmd)
  onCleanup(() => {
    unregisterClear()
    unregisterResume()
    unregisterUndo()
    unregisterRedo()
    unregisterCheckpoints()
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
                when={message.role === "tool"}
                fallback={
                  <Show
                    when={message.role === "user"}
                    fallback={
                      <AssistantMessage
                        content={message.content}
                        timestamp={message.timestamp}
                        theme={theme}
                        syntaxStyle={syntaxStyle()}
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
                }
              >
                <ToolMessage
                  name={message.toolName ?? "tool"}
                  status={message.toolStatus ?? "done"}
                  output={message.toolOutput}
                  isError={message.toolIsError}
                  theme={theme}
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
            <Sidebar
              sessionID={sessionData().sessionID}
              messages={messages}
              model={config.provider.model}
              tokens={totalTokens()}
              loading={loading()}
              startedAt={sessionStart}
            />
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
              <Sidebar
                sessionID={sessionData().sessionID}
                messages={messages}
                model={config.provider.model}
                tokens={totalTokens()}
                loading={loading()}
                startedAt={sessionStart}
                overlay={true}
              />
            </box>
          </Match>
        </Switch>
      </Show>
    </box>
  )
}

function UserMessage(props: { content: string; timestamp: number; theme: ThemeColors; isFirst: boolean }) {
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

function AssistantMessage(props: {
  content: string
  timestamp: number
  theme: ThemeColors
  syntaxStyle: SyntaxStyle
  streaming?: boolean
}) {
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
              fg={props.theme.markdownText}
              syntaxStyle={props.syntaxStyle}
              streaming={props.streaming ?? false}
            />
          </Show>
        </box>
      </box>
    </box>
  )
}
