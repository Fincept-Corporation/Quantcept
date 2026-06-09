import { createTextAttributes, RGBA, type SyntaxStyle } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { chatStoresCloud } from "@tui/components/sessions/history"
import { ResumeModal } from "@tui/components/sessions/ResumeModal"
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js"
import { createStore, produce } from "solid-js/store"

const BOLD = createTextAttributes({ bold: true })

import type { LoadedAgent } from "@core/agent/agent-manifest"
import { composeSystemPrompt } from "@core/agent/compose-system"
import type { AgentEvent } from "@core/agent/events"
import { runAgentTurn } from "@core/agent/loop"
import { registerBuiltinTools } from "@core/agent/registry"
import { SYSTEM_PROMPT } from "@core/agent/system"
import { createTaskTool } from "@core/agent/task-tool"
import { loadConfig } from "@core/config/load"
import { cloudMessageText, FinceptChat, partitionResumeMessages, type TerminalCall } from "@core/fincept/chat"
import { FinceptClient } from "@core/fincept/client"
import { serializeClientTools } from "@core/fincept/terminal-tools"
import { HookRegistry } from "@core/hooks/registry"
import { runHooks } from "@core/hooks/runner"
import type { HookRunner } from "@core/hooks/types"
import { JobStore } from "@core/jobs"
import { registerJobControlTools } from "@core/jobs/JobControlTool"
import { stripStrayCJK } from "@core/llm/normalize"
import { createProvider } from "@core/llm/provider"
import { McpManager } from "@core/mcp/manager"
import { memorySystemBlock, readIndex } from "@core/memory"
import { buildApproval } from "@core/permissions/approvers"
import type { PermissionDecision } from "@core/permissions/schema"
import { filterRegistry } from "@core/skills"
import { projectHash } from "@core/storage/paths"
import { createAddMcpServerTool } from "@core/tools/builtin/AddMcpServerTool"
import { executeTool } from "@core/tools/executor"
import { ToolRegistry } from "@core/tools/registry"
import type { Tool } from "@core/tools/Tool"
import type { ActionCommand } from "@ext/commands/types"
import type { ScrollBoxRenderable } from "@opentui/core"
import { displayModel } from "@shared/branding"
import { useBuddy } from "@tui/buddy/BuddyContext"
import { BuddySprite } from "@tui/buddy/BuddySprite"
import { sessionCommands } from "@tui/commands/session-commands"
import { AgentPicker } from "@tui/components/AgentPicker"
import { DiagramBlock } from "@tui/components/DiagramBlock"
import { Prompt } from "@tui/components/prompt"
import { ToolMessage } from "@tui/components/tool-message"
import { useAgents } from "@tui/context/agents"
import { useAuth } from "@tui/context/auth"
import { useAutoAccept } from "@tui/context/auto-accept"
import { useCommands } from "@tui/context/command"
import { useExit } from "@tui/context/exit"
import { useKV } from "@tui/context/kv"
import { usePlugins } from "@tui/context/plugins"
import { type SessionRoute, useRoute } from "@tui/context/route"
import { useSkills } from "@tui/context/skills"
import { useSnapshot } from "@tui/context/snapshot"
import { useStorage } from "@tui/context/storage"
import { type ThemeColors, useTheme } from "@tui/context/theme"
import { createCoalescer } from "@tui/markdown/coalesce"
import { StreamingMarkdown } from "@tui/markdown/StreamingMarkdown"
import { type DiagramSegment, splitDiagramSegments } from "@tui/markdown/segments"
import { useComputerUse } from "@tui/routes/useComputerUse"
import { buildSyntaxStyle } from "@tui/themes/syntax-style"
import { TIPS } from "@tui/tips"
import { useDialog } from "@tui/ui/dialog"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { useToast } from "@tui/ui/toast"
import { autoApproveLabel } from "./auto-approve"
import { Sidebar } from "./sidebar"

interface Message {
  id: string
  role: "user" | "assistant" | "tool"
  content: string
  timestamp: number
  toolName?: string
  toolStatus?: "running" | "done"
  toolOutput?: unknown
  toolTitle?: string
  toolIsError?: boolean
}

const placeholder = {
  normal: ["Continue the conversation...", "Ask a follow-up question...", "Request more details..."],
  shell: ["ls -la", "git status", "pwd"],
}

// Stashed in the KV store (which lives above the auth gate, so it survives the
// <Session/> unmount) when a session is re-gated mid-edit. Restored on remount
// once the user re-authenticates so they don't lose typed work or their place.
interface InterruptedStash {
  sessionID: string
  cloudConvId: string | null
  draftText: string
  activeAgent?: string
  sidebarMode?: "auto" | "show" | "hide"
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
  const skills = useSkills()
  const agents = useAgents()
  const plugins = usePlugins()
  const auth = useAuth()
  const kv = useKV()
  // Mirror of the prompt's live draft (reported via <Prompt onDraftChange>), kept
  // outside reactive state since it's only read at the moment of a re-gate stash.
  let liveDraft = ""
  // Set to true when a re-gate stash restores the user's typed draft so that the
  // async hydrateCloudConversation does not overwrite it with lastFailedQuestion.
  let draftRestored = false
  // Plugin hooks + extra context, populated once enabled plugins load (see the MCP onMount below).
  const [pluginHooks, setPluginHooks] = createSignal<HookRegistry>(new HookRegistry())
  const [pluginContext, setPluginContext] = createSignal("")
  const hookRunner: HookRunner = { fire: (event) => runHooks(pluginHooks(), event) }
  const [activeAgent, setActiveAgent] = createSignal<LoadedAgent | undefined>(undefined)
  const config = loadConfig()
  // Two axes (Settings): generation cloud→server-side, local→on-device loop.
  // storage cloud→Fincept chat plane, local→SessionStore. Cloud generation always
  // persists server-side, so storeCloud is implied by cloud generation.
  const genCloud = () => config.chat.generation === "cloud"
  const storeCloud = () => genCloud() || config.chat.storage === "cloud"
  // Cloud conversation bound to this session — created lazily on the first turn.
  let cloudConvId: string | null = null
  function makeChat(): FinceptChat | null {
    const f = loadConfig().fincept
    if (!f.apiKey) return null
    return new FinceptChat(new FinceptClient(f.baseUrl), f.apiKey, f.baseUrl)
  }
  const activeProvider = () => {
    // `||` (not `??`) so an empty-string model from any agent source also inherits the
    // configured model — an empty model would otherwise break the provider call.
    const model = activeAgent()?.model || config.provider.model
    return createProvider({ ...config.provider, model })
  }
  const registry = new ToolRegistry()
  // Single source of truth for the builtin + finance tool list (shared with the jobs runner).
  registerBuiltinTools(registry)
  const computerUse = useComputerUse(registry)
  const mcp = new McpManager()
  // The agent can add (install) MCP servers at runtime via this tool; it always prompts for
  // approval (see AddMcpServerTool's permission pattern) and persists to project settings.json.
  registry.register(createAddMcpServerTool({ manager: mcp, cwd: process.cwd() }))
  // The agent can inspect + schedule autonomous jobs from chat. `schedule_job` is a write, so it
  // goes through the normal approval gate; it always creates read-only jobs (runaway guard).
  const jobStore = new JobStore()
  onCleanup(() => jobStore.close())
  registerJobControlTools(registry, { store: jobStore, cwd: process.cwd() })
  onMount(async () => {
    // Load enabled-plugin contributions first so their MCP servers, hooks, and context join the
    // session. Plugin MCP servers are namespaced (<plugin>__<server>) and merged into the config.
    let contrib: Awaited<ReturnType<typeof plugins.manager.loadEnabled>> | null = null
    try {
      contrib = await plugins.manager.loadEnabled()
    } catch {
      contrib = null
    }
    if (contrib) {
      setPluginHooks(contrib.hookRegistry)
      setPluginContext(contrib.contextText.join("\n\n"))
    }
    const servers = contrib ? { ...config.mcp.servers, ...contrib.mcpServers } : config.mcp.servers
    try {
      await mcp.start({ servers }, registry)
    } catch {
      // start() already logs per-server failures; never block the session.
    }
    if (contrib && !contrib.hookRegistry.isEmpty()) {
      void hookRunner.fire({ event: "SessionStart", cwd: process.cwd(), sessionId: sessionData().sessionID })
    }
  })
  onCleanup(() => void mcp.stop())
  onMount(() => {
    if (registry.get("task")) return
    const agentMap = new Map(agents.all().map((a) => [a.name, a]))
    registry.register(
      createTaskTool({
        provider: activeProvider(),
        baseRegistry: registry,
        rules: config.permissions.rules,
        mode: config.permissions.defaultMode,
        agents: agentMap,
        maxDepth: 1,
      }),
    )
  })
  const dialog = useDialog()
  const toast = useToast()
  // Report-back: on open, surface jobs that finished or await attention while you were away.
  onMount(() => {
    try {
      const projJobs = jobStore.listByProject(projectHash(process.cwd()))
      if (!projJobs.length) return
      const attention = projJobs.filter((j) => j.status === "paused" || j.status === "failed").length
      const done = projJobs.filter((j) => j.status === "done").length
      const active = projJobs.filter((j) => j.status === "running" || j.status === "pending").length
      const parts: string[] = []
      if (attention) parts.push(`${attention} need attention`)
      if (done) parts.push(`${done} done`)
      if (active) parts.push(`${active} active`)
      if (parts.length) toast.show({ message: `Jobs: ${parts.join(", ")} · /jobs to view`, variant: "info" })
    } catch {
      // best-effort; never block the session
    }
  })
  // Computer-use is granted once per session: after the first approval, actions run unattended
  // (money-moving windows still re-confirm via the tripwire).
  let computerUseGranted = false

  async function askViaDialog(tool: Tool, input: unknown): Promise<PermissionDecision> {
    // Auto-accept (shift+tab) grants every prompt without a dialog, for the whole session.
    if (autoAccept.enabled()) return "allow"
    // The policy — which tools auto-allow, what each prompt says, when computer-use is granted —
    // lives in core/permissions/approvers and is unit-tested. Here we only render + apply it.
    const ask = await buildApproval(tool, input, { computerUseGranted })
    if (ask.kind === "decide") return ask.decision
    const ok = await DialogConfirm.show(dialog, ask.title, ask.message)
    if (ok && ask.grantsComputerUse) computerUseGranted = true
    return ok ? "allow" : "deny"
  }
  const route = useRoute()
  const exit = useExit()
  const dimensions = useTerminalDimensions()
  const sessionData = () => route.data as SessionRoute
  // A persona chosen on the home screen arrives as `initialAgent`. Apply it as soon as
  // the registry has it. Usually that's synchronous on the first run (home already
  // resolved the resource), so it lands before the onMount that fires the first turn;
  // but if discovery is still in flight, this effect re-runs and self-heals when it
  // resolves. One-shot guard so it only applies the initial choice, never fighting a
  // later user switch via the picker.
  {
    const initialAgentName = sessionData().initialAgent
    if (initialAgentName) {
      let applied = false
      createEffect(() => {
        if (applied) return
        const a = agents.get(initialAgentName)
        if (a) {
          setActiveAgent(a)
          applied = true
        }
      })
    }
  }
  const [messages, setMessages] = createStore<Message[]>([])
  // On resume, the last failed/unanswered question is reloaded into the prompt
  // input so the user can retry it with one keypress (see hydrateCloudConversation).
  const [draftPrefill, setDraftPrefill] = createSignal<string>("")
  const [sidebarMode, setSidebarMode] = createSignal<"auto" | "show" | "hide">("auto")
  const [sidebarOpen, setSidebarOpen] = createSignal(false)

  // Draft preservation across a session re-gate. If the session is invalidated on
  // another device, auth.status flips to "unauthed" and app.tsx unmounts <Session/>
  // (to show <AuthGate/>), losing component-local state. On that transition we stash
  // the in-progress draft + context to the KV store (which lives above the auth gate);
  // the onMount below restores it once the user re-authenticates and the route remounts.
  {
    let prevStatus = auth.status
    createEffect(() => {
      const status = auth.status
      const wasGated = prevStatus !== "unauthed" && status === "unauthed"
      prevStatus = status
      if (!wasGated) return
      // Only stash if there's something worth keeping back — a typed draft or a bound
      // cloud conversation. Skip writing an all-empty stash.
      if (liveDraft.trim().length === 0 && !cloudConvId) return
      const stash: InterruptedStash = {
        sessionID: sessionData().sessionID,
        cloudConvId,
        draftText: liveDraft,
        activeAgent: activeAgent()?.name,
        sidebarMode: sidebarMode(),
      }
      kv.set("session:interrupted", stash)
    })
  }
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

  // Show the full info sidebar inline once there's room for a usable split (42-col sidebar +
  // ~58 chat). Below this the buddy still stays — as a slim column (see the sidebar fallback).
  const wide = createMemo(() => dimensions().width > 100)
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
    // Local storage persists on-device; cloud storage persists server-side (gen) or via mirror.
    if (content.length > 0 && !storeCloud()) {
      const id = sessionData().sessionID
      storage.appendEvent(id, { t: "msg", role, content, ts })
      // Derive the session title from the first user message (write-once).
      if (role === "user") storage.setTitle(id, content.slice(0, 60))
    }
  }

  onMount(() => {
    // Resuming a cloud conversation: bind it and hydrate its messages into the display.
    const cloudConv = (sessionData() as SessionRoute).cloudConvId
    if (cloudConv) {
      cloudConvId = cloudConv
      void hydrateCloudConversation(cloudConv)
    }
    const id = sessionData().sessionID
    const cwd = process.cwd()
    const existing = storeCloud() ? [] : storage.loadSession(id)
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
    } else if (!storeCloud()) {
      // New session: write the meta line.
      storage.createSession({ id, cwd })
    }
    const initial = sessionData().initialMessage
    if (initial) handleSubmit(initial)
    // A skill launched from the home screen arrives as `initialSkill`: run it now.
    const initialSkillName = sessionData().initialSkill
    if (initialSkillName) runSkill(initialSkillName, "")

    // Restore a draft stashed when this session was re-gated (see the auth.status
    // effect above). Only honor it for the SAME session, then clear it. Every field
    // is best-effort — a stash from an older app version, or with an agent that no
    // longer exists, must never break the mount.
    const stash = kv.get("session:interrupted", undefined) as InterruptedStash | undefined
    if (stash && stash.sessionID === sessionData().sessionID) {
      if (stash.draftText && stash.draftText.trim().length > 0) {
        setDraftPrefill(stash.draftText)
        draftRestored = true
      }
      if (stash.activeAgent) {
        const agent = agents.get(stash.activeAgent)
        if (agent) setActiveAgent(agent)
      }
      if (stash.sidebarMode) setSidebarMode(stash.sidebarMode)
      kv.set("session:interrupted", undefined)
    }
  })

  const renderer = useRenderer()

  // Streamed assistant text arrives token-by-token; coalesce commits to ~30fps
  // (and immediately on paragraph breaks) so the markdown renderer re-parses far
  // less often. Flushed on tool boundaries and at turn end; dropped on cleanup.
  const textCoalescer = createCoalescer({
    onFlush: (delta) => {
      setMessages(
        produce((msgs) => {
          const last = msgs[msgs.length - 1]
          // Strip stray CJK on the full accumulated text (not the delta) so a
          // leak split across chunks is still caught and words never merge.
          if (last && last.role === "assistant") last.content = stripStrayCJK(last.content + delta)
        }),
      )
      renderer.requestRender()
    },
  })
  onCleanup(() => textCoalescer.dispose())

  const [loading, setLoading] = createSignal(false)
  const [tokensPrev, setTokensPrev] = createSignal(0)
  const [tokensLive, setTokensLive] = createSignal(0)
  const totalTokens = () => tokensPrev() + tokensLive()
  const sessionStart = Date.now()

  // Auto-accept (shift+tab / ctrl+t / /auto): when ON, every tool permission prompt is granted
  // without a dialog. State is app-global via the AutoAccept context so it stays consistent with
  // the home screen and is inherited by this session; toggling + feedback happen in App.
  const autoAccept = useAutoAccept()
  let turnAbortController: AbortController | null = null
  useKeyboard((e: { name?: string }) => {
    // Esc stops an in-flight turn; when the session is idle it backs out to the home screen. The
    // conversation is saved and stays resumable (Recent / Ctrl+R), so this never loses work.
    if (e.name === "escape" && !dialog.active()) {
      if (loading()) turnAbortController?.abort()
      else route.navigate({ type: "home" })
    }
  })

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

  const baseSystem = () =>
    composeSystemPrompt({
      base: SYSTEM_PROMPT,
      memory: memorySystemBlock(readIndex("global"), readIndex("project", projectHash(process.cwd()))),
      skills: skills.systemBlock(),
      plugins: pluginContext(),
      agent: activeAgent(),
    })

  function onAgentEvent(e: AgentEvent) {
    if (e.type === "text") {
      setMessages(
        produce((msgs) => {
          const last = msgs[msgs.length - 1]
          if (last && last.role === "assistant") last.content += e.text
        }),
      )
    } else if (e.type === "tool_start") {
      // Commit any buffered text into the current assistant bubble before the
      // tool row and the fresh post-tool bubble are pushed below.
      textCoalescer.flush()
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
              msgs[i].toolTitle = e.title
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
  }

  // Resume a cloud conversation: load its persisted messages into the display.
  //
  // A turn that never produced an answer (the assistant reply is `failed`, or
  // the user message has no assistant reply at all) is NOT rendered as a dead
  // "You" bubble. Instead the most recent such question is reloaded into the
  // prompt input (via draftPrefill) so the user can retry it. This stops the
  // "three identical unanswered questions" pile-up after a failed generation.
  async function hydrateCloudConversation(id: string) {
    const chat = makeChat()
    if (!chat) return
    try {
      const r = await chat.getConversation(id)
      const { rendered, lastFailedQuestion } = partitionResumeMessages(r.data.messages)
      setMessages(
        produce((msgs) => {
          for (const m of rendered) {
            msgs.push({
              id: `msg-${msgs.length}-${m.id}`,
              role: m.role,
              content: cloudMessageText(m),
              timestamp: Date.parse(m.created_at) || Date.now(),
            })
          }
        }),
      )
      if (lastFailedQuestion.trim().length > 0 && !draftRestored) setDraftPrefill(lastFailedQuestion)
      renderer.requestRender()
    } catch {
      // best-effort hydrate
    }
  }

  // Local generation + cloud storage: push the latest finished turn (user +
  // assistant) to the Fincept chat plane via the store-only import endpoint.
  // Best-effort — a cloud hiccup must not break the local conversation.
  async function mirrorTurnToCloud() {
    const chat = makeChat()
    if (!chat) return
    const real = messages.filter((m) => m.role !== "tool" && m.content.length > 0)
    const lastUser = [...real].reverse().find((m) => m.role === "user")
    const lastAssistant = [...real].reverse().find((m) => m.role === "assistant")
    if (!lastUser) return
    try {
      if (!cloudConvId) {
        const created = await chat.createConversation({ title: lastUser.content.slice(0, 60), source: "cli" })
        cloudConvId = created.data.id
      }
      const batch: { role: "user" | "assistant"; content: string; client_message_id: string }[] = [
        { role: "user", content: lastUser.content, client_message_id: crypto.randomUUID() },
      ]
      if (lastAssistant && lastAssistant.content.length > 0) {
        batch.push({ role: "assistant", content: lastAssistant.content, client_message_id: crypto.randomUUID() })
      }
      await chat.importMessages(cloudConvId, batch, crypto.randomUUID())
    } catch {
      // best-effort mirror
    }
  }

  // Execute one local tool a cloud generation asked for (via the terminal-tool
  // bridge) and return the JSON payload to post back as its result. Errors are
  // encoded into the payload (the bridge has no separate is_error channel), so the
  // model still sees them. Runs through the same executeTool gate as a local turn
  // — permissions + approval dialog (askViaDialog) + hooks all apply.
  async function executeClientTool(name: string, input: unknown): Promise<unknown> {
    const tool = registry.get(name)
    if (!tool) return { error: `unknown tool: ${name}` }
    try {
      const result = await executeTool(tool, input, {
        mode: config.permissions.defaultMode,
        cwd: process.cwd(),
        abort: turnAbortController?.signal ?? new AbortController().signal,
        ask: askViaDialog,
        rules: config.permissions.rules,
        hooks: hookRunner,
      })
      return result.isError ? { error: result.output } : result.output
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  // While a cloud generation is in flight, poll the bridge for tool calls the
  // server is blocked on, run each locally, and post the result back. Returns a
  // stop fn (called in runCloudTurn's finally). The server renders the tool node
  // via its own tool-start/tool-end SSE events; this loop only does execution.
  function startTerminalToolPump(chat: FinceptChat): () => void {
    let stopped = false
    const pump = async () => {
      while (!stopped) {
        let calls: TerminalCall[] = []
        try {
          const r = await chat.pendingTerminalCalls()
          calls = r.data.calls ?? []
        } catch {
          calls = []
        }
        for (const call of calls) {
          if (stopped) break
          const result = await executeClientTool(call.tool_name, call.input)
          await chat.submitTerminalResult(call.call_id, result).catch(() => {})
        }
        if (!stopped && calls.length === 0) await new Promise((r) => setTimeout(r, 600))
      }
    }
    void pump()
    return () => {
      stopped = true
    }
  }

  // Cloud chat turn: send the user message to the Fincept chat plane and stream
  // the server-generated reply (SSE) into the live assistant message. Mirrors
  // runTurn's streaming/error/abort behavior; persistence is server-side.
  async function runCloudTurn(text: string) {
    const chat = makeChat()
    if (!chat) {
      updateLastAssistantMessage("Error: sign in to Fincept for cloud chat, or switch to local in Settings.")
      setLoading(false)
      return
    }
    turnAbortController = new AbortController()
    let genId = ""
    let stopPump: (() => void) | undefined
    try {
      if (!cloudConvId) {
        const created = await chat.createConversation({ title: text.slice(0, 60), source: "cli" })
        cloudConvId = created.data.id
      }
      // Advertise this machine's local tools so the cloud model can call them (run
      // here via the bridge). Non-fatal — without it the model uses server tools only.
      await chat.registerTerminalTools(serializeClientTools(registry)).catch(() => {})
      const sent = await chat.send(
        cloudConvId,
        {
          content: text,
          client_message_id: crypto.randomUUID(),
          mode: "deep",
          source: "cli",
          auto_approve: autoAccept.enabled(),
        },
        crypto.randomUUID(),
      )
      genId = sent.data.generation_id
      // Run local-tool calls the generation blocks on, concurrently with the stream.
      stopPump = startTerminalToolPump(chat)
      for await (const ev of chat.streamGeneration(genId, { signal: turnAbortController.signal })) {
        if (ev.type === "text-delta") {
          textCoalescer.push(ev.text)
        } else if (ev.type === "tool-start") {
          // Render a tool node (grey ▪ → green ■) like the local path; execution is
          // server-side (first-party) or via the local pump (client tools).
          textCoalescer.flush()
          setMessages(
            produce((msgs) => {
              msgs.push({
                id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                role: "tool",
                content: "",
                timestamp: Date.now(),
                toolName: ev.tool,
                toolStatus: "running",
              })
            }),
          )
          addMessage("assistant", "")
          renderer.requestRender()
        } else if (ev.type === "tool-end") {
          setMessages(
            produce((msgs) => {
              for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i]
                if (m.role === "tool" && m.toolName === ev.tool && m.toolStatus === "running") {
                  m.toolStatus = "done"
                  m.toolOutput = ev.result
                  m.toolIsError = ev.isError
                  break
                }
              }
            }),
          )
          renderer.requestRender()
        } else if (ev.type === "approval-required") {
          // v1: approval follows the session auto-accept toggle (shift+tab). Rich
          // per-tool approval in cloud mode is a follow-up.
          await chat.approveGeneration(genId, { approved: autoAccept.enabled() }).catch(() => {})
          if (!autoAccept.enabled()) {
            toast.show({
              message: `Tool "${ev.tool}" needs approval — enable auto-accept (shift+tab).`,
              variant: "warning",
            })
          }
        } else if (ev.type === "finish") {
          const u = ev.usage
          if (u) setTokensPrev((p) => p + u.inputTokens + u.outputTokens)
        } else if (ev.type === "error") {
          textCoalescer.dispose()
          updateLastAssistantMessage(`Error: ${ev.message || ev.code}`)
          return
        }
        // "done" ends the async iterator.
      }
      textCoalescer.flush()
    } catch (error) {
      textCoalescer.dispose()
      if (turnAbortController?.signal.aborted) {
        if (genId) void chat.cancelGeneration(genId).catch(() => {})
      } else {
        updateLastAssistantMessage(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      stopPump?.() // stop polling the terminal-tool bridge once the generation ends
      setLoading(false)
      setTokensLive(0)
      buddy.setBusy(false) // generation ended — buddy resumes its own personality drift
      renderer.requestRender()
      // Reconcile credits/account after a server-billed turn.
      void auth.reloadAccount()
    }
  }

  async function runTurn(opts: { system: string; toolRegistry: ToolRegistry }) {
    const history = messages
      .filter((m) => m.role !== "tool" && m.content.length > 0)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

    turnAbortController = new AbortController()
    try {
      const result = await runAgentTurn(
        {
          provider: activeProvider(),
          visionProvider: computerUse.visionProvider(),
          maxIterations: 12,
          registry: opts.toolRegistry,
          messages: history,
          system: opts.system,
          mode: config.permissions.defaultMode,
          rules: config.permissions.rules,
          hooks: hookRunner,
          cwd: process.cwd(),
          ask: askViaDialog,
          abort: turnAbortController.signal,
          snapshot: {
            track: async (label: string) => snapshot.trackRaw(label),
            revertTo: async (treeHash: string) => snapshot.revertTo(treeHash),
          },
          onEvent: onAgentEvent,
        },
        {
          onChunk: (chunk) => {
            textCoalescer.push(chunk)
          },
          onTokens: (input, output) => {
            // Update the live counter but DON'T force a render here. Some providers emit a
            // usage event per chunk; calling requestRender() on each would render per-token and
            // defeat the 30fps text coalescer. The counter rides the coalescer's flush cadence
            // (and the turn-end requestRender in `finally`), so it stays current within ~32ms.
            setTokensLive(input + output)
          },
        },
      )
      // Commit any text still buffered from the final stream segment so the
      // stored transcript and the final (streaming=false) render are complete.
      textCoalescer.flush()
      setTokensPrev((p) => p + result.totalTokens)
      setTokensLive(0)
      if (storeCloud()) {
        // Local generation + cloud storage: mirror the finished turn to the cloud transcript.
        void mirrorTurnToCloud()
      } else {
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
      }
    } catch (error) {
      // Drop any buffered partial text so it can't append after the error line.
      textCoalescer.dispose()
      // Escape-abort is a clean stop — just flush whatever partial response we have.
      if (turnAbortController?.signal.aborted) {
        // Clean stop (Esc) — the buddy simply resumes its own mood.
      } else {
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
      }
    } finally {
      setLoading(false)
      buddy.setBusy(false) // generation ended — buddy resumes its own personality drift
      renderer.requestRender()
      // Reconcile the account after the turn — agent tool calls may have spent credits or changed
      // state. (Credits-Balance headers already live-patch the balance; this catches the rest, and
      // reloadAccount never flips the gate to "checking".)
      void auth.reloadAccount()
      // Plugin Stop hooks (best-effort; no-op when no plugin registers one).
      void hookRunner.fire({ event: "Stop", cwd: process.cwd(), sessionId: sessionData().sessionID })
    }
  }

  // Smoothly slide the transcript to the newest message on send. Sticky-scroll is
  // paused for the slide (so it can't snap instantly), then restored at the bottom
  // where OpenTUI re-engages it so streaming keeps following.
  let scrollAnim: ReturnType<typeof setInterval> | undefined
  function endScrollAnim() {
    if (scrollAnim) {
      clearInterval(scrollAnim)
      scrollAnim = undefined
    }
  }
  onCleanup(endScrollAnim)
  function slideToNewest() {
    const box = scrollRef
    if (!box) return
    endScrollAnim()
    const startTop = box.scrollTop
    box.stickyScroll = false
    const startTime = Date.now()
    const durationMs = 280
    scrollAnim = setInterval(() => {
      const b = scrollRef
      if (!b) {
        endScrollAnim()
        return
      }
      const max = Math.max(0, b.scrollHeight - b.viewport.height)
      const t = Math.min(1, (Date.now() - startTime) / durationMs)
      const eased = 1 - (1 - t) ** 3 // easeOutCubic
      b.scrollTop = Math.round(startTop + (max - startTop) * eased)
      renderer.requestRender()
      if (t >= 1) {
        endScrollAnim()
        b.stickyScroll = true
      }
    }, 16)
  }

  async function handleSubmit(text: string) {
    // Guard against a second turn starting mid-stream (e.g. a prompt-submitting slash
    // command dispatched while the current turn is generating) — two concurrent runTurns
    // would interleave writes to the same message store.
    if (loading()) {
      toast.show({ message: "Still generating — wait for the current turn to finish.", variant: "warning" })
      return
    }
    addMessage("user", text)
    setLoading(true)
    buddy.setBusy(true)
    snapshot.track(sessionData().sessionID, "turn", text.slice(0, 60))
    setTokensLive(0)
    addMessage("assistant", "")
    slideToNewest()
    // Cloud generation: server-side; skip the local agent loop + plugin hooks.
    if (genCloud()) {
      await runCloudTurn(text)
      return
    }
    let system = baseSystem()
    // Plugin UserPromptSubmit hooks may inject extra context for this turn.
    const pre = await hookRunner.fire({
      event: "UserPromptSubmit",
      cwd: process.cwd(),
      sessionId: sessionData().sessionID,
      prompt: text,
    })
    if (pre.additionalContext.length) system = `${system}\n\n${pre.additionalContext.join("\n\n")}`
    await runTurn({ system, toolRegistry: registry })
  }

  function runSkill(skillName: string, args: string) {
    const skill = skills.get(skillName)
    if (!skill) return
    if (loading()) {
      toast.show({ message: "Still generating — wait for the current turn to finish.", variant: "warning" })
      return
    }
    addMessage("user", args || `(run skill: ${skillName})`)
    setLoading(true)
    buddy.setBusy(true)
    snapshot.track(sessionData().sessionID, "turn", `skill:${skillName}`)
    setTokensLive(0)
    addMessage("assistant", "")
    slideToNewest()
    const system = `${baseSystem()}\n\n## Skill: ${skill.name}\n${skill.prompt}`
    void runTurn({ system, toolRegistry: filterRegistry(registry, skill.allowedTools) })
  }

  const commands = useCommands()
  const hostHooks = {
    submitPrompt: (text: string) => handleSubmit(text),
    clearMessages: () => setMessages([]),
    runSkill: (skillName: string, args: string) => runSkill(skillName, args),
    reloadComputerUse: () => computerUse.reload(),
  }
  commands.setHostHooks(hostHooks)

  // Tab in the prompt opens the agent picker; selecting reuses the /agent command
  // so the switch + toast + model/prompt swap stay in one place.
  function openAgentPicker() {
    if (dialog.active()) return
    agents.refresh()
    dialog.replace(() => (
      <AgentPicker
        agents={() => agents.all()}
        current={activeAgent()?.name}
        onSelect={(name) => commands.dispatch("session.agent", name ?? "off", "keybind")}
        onClose={() => dialog.clear()}
      />
    ))
    renderer.requestRender()
  }
  // Built-in session commands as a catalog (see tui/commands/session-commands). `resume` and the
  // reactive `agent`/skill commands stay below — they need this route's cloud/route + async state.
  const sessionCmdUnregs = sessionCommands({
    snapshot,
    sessionId: () => sessionData().sessionID,
    dialog,
    renderer,
    mcp,
    messages,
  }).map((c) => commands.register(c))
  const resumeCmd: ActionCommand = {
    kind: "action",
    id: "session.resume",
    name: "resume",
    description: "Browse and resume a previous session in this project",
    category: "Session",
    source: "builtin",
    run(_args, ctx) {
      ctx.showDialog(() => (
        <ResumeModal
          currentSessionId={chatStoresCloud() ? (cloudConvId ?? undefined) : sessionData().sessionID}
          onClose={ctx.closeDialog}
          onResume={(id) => {
            ctx.closeDialog()
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
    },
  }
  const unregisterResume = commands.register(resumeCmd)
  // The /auto command (toggle auto-accept, keybind ctrl+t) is registered globally in app.tsx so it
  // works on the home screen too — see App's autoCmd.
  // /plugin, /marketplace, /plugins and /skills are registered globally in app.tsx
  // (App level) so they're available on the home screen as well as in a session —
  // see plugins/plugin.commands.tsx and skills/skills.commands.tsx. Running a skill
  // still flows through this route's runSkill hook (or initialSkill on a fresh session).
  // Re-register /agent reactively so its argChoices reflect discovered agent
  // names once the (async) registry resolves — same pattern as the skill commands.
  let unregisterAgent: (() => void) | undefined
  createEffect(() => {
    unregisterAgent?.()
    const agentCmd: ActionCommand = {
      kind: "action",
      id: "session.agent",
      name: "agent",
      description: "Switch the active agent persona (or: off | <name>)",
      category: "Agents",
      source: "builtin",
      argChoices: [...agents.all().map((a) => a.name), "off"],
      run(args, ctx) {
        const arg = args.trim()
        if (!arg) {
          const list = agents.all()
          ctx.toast(
            list.length
              ? `Agents:\n${list.map((a) => `- ${a.name}: ${a.description}`).join("\n")}\n\nUse /agent <name>.`
              : "No agents available.",
          )
          return
        }
        if (arg === "off" || arg === "default") {
          setActiveAgent(undefined)
          ctx.toast("Back to the default assistant.")
          return
        }
        const agent = agents.get(arg)
        if (!agent) {
          ctx.toast(`Unknown agent: ${arg}`)
          return
        }
        setActiveAgent(agent)
        ctx.toast(`Now acting as "${agent.name}"${agent.model ? ` (model: ${displayModel(agent.model)})` : ""}.`)
      },
    }
    unregisterAgent = commands.register(agentCmd)
  })
  onCleanup(() => {
    for (const u of sessionCmdUnregs) u()
    unregisterResume()
    unregisterAgent?.()
    commands.clearHostHooks(hostHooks)
  })

  // Register a slash command per discovered skill. Skills load async, so do
  // this in an effect that re-runs as the registry resolves.
  const skillUnregisters: Array<() => void> = []
  createEffect(() => {
    for (const u of skillUnregisters.splice(0)) u()
    for (const skill of skills.all()) {
      const cmd: ActionCommand = {
        kind: "action",
        id: `skill:${skill.name}`,
        name: skill.name,
        description: skill.description,
        category: "Skills",
        source: "skill",
        run(args, ctx) {
          ctx.runSkill(skill.name, args)
        },
      }
      skillUnregisters.push(commands.register(cmd))
    }
  })
  onCleanup(() => {
    for (const u of skillUnregisters.splice(0)) u()
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
                      // Hide empty assistant turns (model went straight to a tool call) so
                      // there are no repeated "Thinking..." blocks — only bubbles with text show.
                      <Show when={message.content.length > 0}>
                        <AssistantMessage
                          content={message.content}
                          timestamp={message.timestamp}
                          theme={theme}
                          syntaxStyle={syntaxStyle()}
                          streaming={loading() && index() === messages.length - 1}
                        />
                      </Show>
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
                  title={message.toolTitle}
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
            initialDraft={draftPrefill()}
            onDraftChange={(t) => {
              liveDraft = t
            }}
            status={loading() ? "⟳ Generating..." : undefined}
            messageCount={messages.length}
            tokenCount={totalTokens()}
            agent={activeAgent()?.name}
            onOpenAgentPicker={openAgentPicker}
            autoAccept={autoAccept.enabled()}
            tips={[...TIPS]}
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
            Esc <span style={{ fg: theme.textMuted }}>home</span>
            {"  "}Ctrl+N <span style={{ fg: theme.textMuted }}>new</span>
            {"  "}Ctrl+Y <span style={{ fg: theme.textMuted }}>copy</span>
            {"  "}Ctrl+Q <span style={{ fg: theme.textMuted }}>exit</span>
          </text>
          <text fg={autoAccept.enabled() ? theme.warning : theme.textMuted}>
            {autoApproveLabel(autoAccept.enabled())}
          </text>
          <text fg={theme.textMuted}>{sessionData().sessionID.slice(0, 12)}</text>
        </box>
      </box>

      {/* Sidebar — the buddy lives at the top. When the full sidebar is hidden (narrow terminal
          or toggled off) the buddy must NOT vanish: fall back to a slim buddy-only column so it
          stays with you once a chat starts, just like on the home screen. */}
      <Show
        when={sidebarVisible()}
        fallback={
          <box flexShrink={0} paddingTop={1} paddingLeft={1} alignItems="center">
            <BuddySprite compact minimal />
          </box>
        }
      >
        <Switch>
          <Match when={wide()}>
            <Sidebar
              sessionID={sessionData().sessionID}
              messages={messages}
              model={activeAgent()?.model ?? config.provider.model}
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
                model={activeAgent()?.model ?? config.provider.model}
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
            ▌ You
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
  // Compact: name + time, then the markdown directly below — no nested padding
  // boxes. Only rendered when there is content (empty turns are hidden by the
  // caller), so no "Thinking..." placeholder block. Content is split into
  // markdown and inline `qdiagram` segments; only the trailing markdown span is
  // treated as still-streaming.
  // Pass streamEnded so a diagram whose closing ``` never arrived (model ended the
  // turn without it) still renders once streaming stops, instead of being stuck on
  // the "drawing diagram…" placeholder.
  const segments = createMemo(() => splitDiagramSegments(props.content, { streamEnded: !(props.streaming ?? false) }))
  return (
    <box
      marginTop={1}
      flexShrink={0}
      border={["left"]}
      borderColor={props.theme.accent}
      paddingLeft={1}
      paddingRight={2}
    >
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <text fg={props.theme.accent} attributes={BOLD}>
          ▌ Quantcept
        </text>
        <text fg={props.theme.textMuted}>{formatTime(props.timestamp)}</text>
      </box>
      {/* Index (keyed by position), NOT For (keyed by object identity): splitDiagramSegments
          returns brand-new segment objects on every coalesced stream flush (~30/s), so a
          For would dispose+recreate every segment row each flush — remounting the <markdown>
          element and flickering the whole message area. Index keeps each slot's element
          mounted and only updates its props. The inner Show (condition-memoized) is also
          required: a bare ternary reading seg() would still recreate the child on each flush. */}
      <Index each={segments()}>
        {(seg, i) => (
          <Show
            when={seg().kind === "md"}
            fallback={
              <DiagramBlock
                body={(seg() as Extract<DiagramSegment, { kind: "diagram" }>).body}
                closed={(seg() as Extract<DiagramSegment, { kind: "diagram" }>).closed}
                theme={props.theme}
              />
            }
          >
            <StreamingMarkdown
              content={(seg() as Extract<DiagramSegment, { kind: "md" }>).text}
              streaming={(props.streaming ?? false) && i === segments().length - 1}
              syntaxStyle={props.syntaxStyle}
              fg={props.theme.markdownText}
            />
          </Show>
        )}
      </Index>
    </box>
  )
}
