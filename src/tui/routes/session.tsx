import { createTextAttributes, RGBA, type SyntaxStyle } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { McpModal } from "@tui/components/mcp/McpModal"
import { MemoryModal } from "@tui/components/memory/MemoryModal"
import { PositionsModal } from "@tui/components/positions/PositionsModal"
import { ResumeModal } from "@tui/components/sessions/ResumeModal"
import { chatStoresCloud } from "@tui/components/sessions/history"
import { batch, createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { createStore, produce } from "solid-js/store"

const BOLD = createTextAttributes({ bold: true })

import { appendFileSync, mkdirSync } from "node:fs"
import nodePath from "node:path"
import type { LoadedAgent } from "@core/agent/agent-manifest"
import { composeSystemPrompt } from "@core/agent/compose-system"
import type { AgentEvent } from "@core/agent/events"
import { runAgentTurn } from "@core/agent/loop"
import { registerBuiltinTools } from "@core/agent/registry"
import { SYSTEM_PROMPT } from "@core/agent/system"
import { createTaskTool } from "@core/agent/task-tool"
import { loadConfig } from "@core/config/load"
import { FinceptChat } from "@core/fincept/chat"
import { FinceptClient } from "@core/fincept/client"
import { HookRegistry } from "@core/hooks/registry"
import { runHooks } from "@core/hooks/runner"
import type { HookRunner } from "@core/hooks/types"
import { JobStore } from "@core/jobs"
import { createListJobsTool, createScheduleJobTool } from "@core/jobs/JobControlTool"
import { stripStrayCJK } from "@core/llm/normalize"
import { createProvider } from "@core/llm/provider"
import { McpManager } from "@core/mcp/manager"
import { memorySystemBlock, readIndex, remember } from "@core/memory"
import type { PermissionDecision } from "@core/permissions/schema"
import { filterRegistry } from "@core/skills"
import { projectHash } from "@core/storage/paths"
import { createAddMcpServerTool } from "@core/tools/builtin/AddMcpServerTool"
import { createComputerUseAgentTool } from "@core/tools/computeruse/ComputerUseAgentTool"
import { createComputerUseTool } from "@core/tools/computeruse/ComputerUseTool"
import { resolveSidecarBinary } from "@core/tools/computeruse/resolveBinary"
import { SpawnSidecarClient } from "@core/tools/computeruse/SpawnSidecarClient"
import { effectClassOf } from "@core/tools/effects"
import { ToolRegistry } from "@core/tools/registry"
import { detectShell } from "@core/tools/shell/detect"
import { formatApproval } from "@core/tools/shell/format"
import { describeCommand } from "@core/tools/shell/parse"
import type { Tool } from "@core/tools/Tool"
import type { ActionCommand } from "@ext/commands/types"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useBuddy } from "@tui/buddy/BuddyContext"
import { AgentPicker } from "@tui/components/AgentPicker"
import { DiagramBlock } from "@tui/components/DiagramBlock"
import { Prompt } from "@tui/components/prompt"
import { ToolMessage } from "@tui/components/tool-message"
import { useAgents } from "@tui/context/agents"
import { useAuth } from "@tui/context/auth"
import { useCommands } from "@tui/context/command"
import { useExit } from "@tui/context/exit"
import { usePlugins } from "@tui/context/plugins"
import { type SessionRoute, useRoute } from "@tui/context/route"
import { useSkills } from "@tui/context/skills"
import { useSnapshot } from "@tui/context/snapshot"
import { useStorage } from "@tui/context/storage"
import { type ThemeColors, useTheme } from "@tui/context/theme"
import { createCoalescer } from "@tui/markdown/coalesce"
import { StreamingMarkdown } from "@tui/markdown/StreamingMarkdown"
import { splitDiagramSegments } from "@tui/markdown/segments"
import { markdownToPlainText } from "@tui/markdown/toPlainText"
import { copyToClipboard } from "@tui/platform/clipboard"
import { buildSyntaxStyle } from "@tui/themes/syntax-style"
import { TIPS } from "@tui/tips"
import { useDialog } from "@tui/ui/dialog"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { useToast } from "@tui/ui/toast"
import { autoApproveLabel, isAutoApproveToggle } from "./auto-approve"
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

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, "0")
  const m = d.getMinutes().toString().padStart(2, "0")
  return `${h}:${m}`
}

const COMPUTER_USE_AUDIT = nodePath.join(process.cwd(), ".quantcept", "computeruse-audit.log")
function appendComputerUseAudit(line: string): void {
  try {
    mkdirSync(nodePath.dirname(COMPUTER_USE_AUDIT), { recursive: true })
    appendFileSync(COMPUTER_USE_AUDIT, `${line}\n`)
  } catch {
    // audit is best-effort; never break the loop over a logging failure
  }
}

/**
 * Register the computer-use tool if (and only if) a vision provider is configured AND the
 * sidecar binary is present — otherwise computer-use stays cleanly disabled. Returns the
 * live sidecar client + the constructed vision provider for the loop to route image turns to.
 */
function setupComputerUse(registry: ToolRegistry, config: ReturnType<typeof loadConfig>) {
  const vp = config.visionProvider
  if (!vp) return null
  const bin = resolveSidecarBinary()
  if (!bin) return null
  const client = new SpawnSidecarClient(bin)

  // Best path: OpenAI GA computer-use (gpt-5.5, pixel-grounded) via the self-contained
  // `computerUse` agent tool — the primary model just delegates the whole GUI task to it.
  const isOpenAI = vp.id === "openai-chat" && (vp.baseUrl?.includes("openai.com") ?? false)
  if (isOpenAI && vp.apiKey) {
    registry.register(
      createComputerUseAgentTool({
        sidecar: client,
        apiKey: vp.apiKey,
        model: "gpt-5.5",
        onAudit: appendComputerUseAudit,
      }),
    )
    return { client, visionProvider: undefined as ReturnType<typeof createProvider> | undefined }
  }

  // Fallback (non-OpenAI vision, e.g. local Ollama): the grid Set-of-Marks `computer` tool,
  // driven step-by-step by the configured vision provider via the loop's image routing.
  let visionProvider: ReturnType<typeof createProvider>
  try {
    visionProvider = createProvider(vp)
  } catch {
    void client.dispose()
    return null // misconfigured vision provider (e.g. missing key) → stay disabled
  }
  registry.register(
    createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 }, onAudit: appendComputerUseAudit }),
  )
  return { client, visionProvider }
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
  let computerUse = setupComputerUse(registry, config)
  onCleanup(() => {
    const cu = computerUse
    if (cu) void cu.client.releaseAll().finally(() => void cu.client.dispose())
  })
  // Re-apply computer-use config live (e.g. after `/computer-use <key>`) — no restart needed.
  function reloadComputerUse(): void {
    const old = computerUse
    registry.unregister("computerUse")
    registry.unregister("computer")
    if (old) {
      void old.client
        .releaseAll()
        .catch(() => {})
        .finally(() => void old.client.dispose())
    }
    computerUse = setupComputerUse(registry, loadConfig())
  }
  const mcp = new McpManager()
  // The agent can add (install) MCP servers at runtime via this tool; it always prompts for
  // approval (see AddMcpServerTool's permission pattern) and persists to project settings.json.
  registry.register(createAddMcpServerTool({ manager: mcp, cwd: process.cwd() }))
  // The agent can inspect + schedule autonomous jobs from chat. `schedule_job` is a write, so it
  // goes through the normal approval gate; it always creates read-only jobs (runaway guard).
  const jobStore = new JobStore()
  onCleanup(() => jobStore.close())
  registry.register(createListJobsTool({ store: jobStore, cwd: process.cwd() }))
  registry.register(createScheduleJobTool({ store: jobStore, cwd: process.cwd() }))
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
    if (autoApprove()) return "allow"
    let message = `Input: ${JSON.stringify(input)}`
    if (tool.name === "shell" && input && typeof (input as { command?: unknown }).command === "string") {
      try {
        const command = (input as { command: string }).command
        const parts = await describeCommand(command, detectShell().kind)
        message = formatApproval(parts)
      } catch {
        // keep the default message on any failure
      }
    }
    if (tool.name === "computerUse" && input && typeof input === "object") {
      if (computerUseGranted) return "allow"
      const instr = (input as { instruction?: string }).instruction ?? ""
      const ok = await DialogConfirm.show(
        dialog,
        "Allow computer use for this session?",
        `Quantcept will control the screen/keyboard to do this task, then run unattended.\nTask: ${instr.slice(0, 200)}`,
      )
      if (ok) computerUseGranted = true
      return ok ? "allow" : "deny"
    }
    if (tool.name === "computer" && input && typeof input === "object") {
      const isMoney = (tool.permissionPatterns?.(input) ?? []).includes("computeruse:money")
      // After the first grant, normal computer actions auto-allow; only money windows re-ask.
      if (!isMoney && computerUseGranted) return "allow"
      const a = input as { action?: string; coordinate?: [number, number]; text?: string }
      const where = a.coordinate ? ` @ [${a.coordinate.join(", ")}]` : ""
      const what = a.text ? ` "${a.text}"` : ""
      const title = isMoney ? "Confirm money action?" : "Allow computer use for this session?"
      const cmsg = isMoney
        ? `⚠ Money-action tripwire — the focused window looks money-moving.\nAction: ${a.action ?? "?"}${where}${what}`
        : `Quantcept will control the screen/keyboard for this task. Approve once and it runs unattended (money-moving windows still confirm).\nFirst action: ${a.action ?? "?"}${where}${what}`
      const okComputer = await DialogConfirm.show(dialog, title, cmsg)
      if (okComputer && !isMoney) computerUseGranted = true
      return okComputer ? "allow" : "deny"
    }
    const ok = await DialogConfirm.show(dialog, `Run ${tool.name}?  ·  effect: ${effectClassOf(tool, input)}`, message)
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

  // Auto-accept: when ON, every tool permission prompt is granted without a dialog. Toggled
  // with shift+tab (plain tab is the slash-popover key, so it must be the shifted chord).
  const [autoApprove, setAutoApprove] = createSignal(false)
  let turnAbortController: AbortController | null = null
  useKeyboard((e: { name?: string; shift?: boolean }) => {
    if (e.name === "escape" && loading() && !dialog.active()) {
      turnAbortController?.abort()
      return
    }
    if (!isAutoApproveToggle(e)) return
    // An open modal (e.g. the agent picker) owns the keyboard — don't toggle underneath it.
    if (dialog.active()) return
    const next = !autoApprove()
    setAutoApprove(next)
    toast.show({
      message: next
        ? "Auto-accept ON — tool prompts are granted automatically (shift+tab to stop)"
        : "Auto-accept OFF — tool prompts will ask again",
      variant: next ? "warning" : "info",
    })
    renderer.requestRender()
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
  async function hydrateCloudConversation(id: string) {
    const chat = makeChat()
    if (!chat) return
    try {
      const r = await chat.getConversation(id)
      setMessages(
        produce((msgs) => {
          for (const m of r.data.messages) {
            const text = m.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join("")
            msgs.push({
              id: `msg-${msgs.length}-${m.id}`,
              role: m.role,
              content: text,
              timestamp: Date.parse(m.created_at) || Date.now(),
            })
          }
        }),
      )
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

  // Cloud chat turn: send the user message to the Fincept chat plane and stream
  // the server-generated reply (SSE) into the live assistant message. Mirrors
  // runTurn's streaming/error/abort behavior; persistence is server-side.
  async function runCloudTurn(text: string) {
    const chat = makeChat()
    if (!chat) {
      updateLastAssistantMessage("Error: sign in to Fincept for cloud chat, or switch to local in Settings.")
      buddy.react("error")
      setLoading(false)
      return
    }
    turnAbortController = new AbortController()
    let genId = ""
    try {
      if (!cloudConvId) {
        const created = await chat.createConversation({ title: text.slice(0, 60), source: "cli" })
        cloudConvId = created.data.id
      }
      const sent = await chat.send(
        cloudConvId,
        {
          content: text,
          client_message_id: crypto.randomUUID(),
          mode: "deep",
          source: "cli",
          auto_approve: autoApprove(),
        },
        crypto.randomUUID(),
      )
      genId = sent.data.generation_id
      for await (const ev of chat.streamGeneration(genId, { signal: turnAbortController.signal })) {
        if (ev.type === "text-delta") {
          textCoalescer.push(ev.text)
        } else if (ev.type === "tool-start") {
          toast.show({ message: `Running ${ev.tool}…`, variant: "info" })
        } else if (ev.type === "approval-required") {
          // v1: approval follows the session auto-accept toggle (shift+tab). Rich
          // per-tool approval in cloud mode is a follow-up.
          await chat.approveGeneration(genId, { approved: autoApprove() }).catch(() => {})
          if (!autoApprove()) {
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
          buddy.react("error")
          return
        }
        // "done" ends the async iterator.
      }
      textCoalescer.flush()
      buddy.react("success")
    } catch (error) {
      textCoalescer.dispose()
      if (turnAbortController?.signal.aborted) {
        if (genId) void chat.cancelGeneration(genId).catch(() => {})
        buddy.react("success")
      } else {
        updateLastAssistantMessage(`Error: ${error instanceof Error ? error.message : String(error)}`)
        buddy.react("error")
      }
    } finally {
      setLoading(false)
      setTokensLive(0)
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
          visionProvider: computerUse?.visionProvider,
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
            setTokensLive(input + output)
            renderer.requestRender()
          },
        },
      )
      // Commit any text still buffered from the final stream segment so the
      // stored transcript and the final (streaming=false) render are complete.
      textCoalescer.flush()
      setTokensPrev((p) => p + result.totalTokens)
      setTokensLive(0)
      buddy.react("success")
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
        buddy.react("success")
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
        buddy.react("error")
      }
    } finally {
      setLoading(false)
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
    buddy.react("thinking")
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
    buddy.react("thinking")
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
    reloadComputerUse: () => reloadComputerUse(),
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
  const rememberCmd: ActionCommand = {
    kind: "action",
    id: "session.remember",
    name: "remember",
    description: "Save a fact to this project's memory",
    category: "Memory",
    source: "builtin",
    run(args, ctx) {
      const fact = args.trim()
      if (!fact) {
        ctx.toast("Usage: /remember <fact>")
        return
      }
      const title = fact.split(/\s+/).slice(0, 6).join(" ").slice(0, 40)
      remember({ scope: "project", projectHash: projectHash(process.cwd()), title, fact })
      ctx.toast(`Remembered: ${title}`)
    },
  }
  const unregisterRemember = commands.register(rememberCmd)

  // /memory — browse, view & delete saved memories (the same store the agent's recall reads).
  const memoryModalCmd: ActionCommand = {
    kind: "action",
    id: "session.memory",
    name: "memory",
    description: "Browse, view & delete saved memories",
    category: "Memory",
    source: "builtin",
    run: (_args, ctx) => ctx.showDialog(() => <MemoryModal onClose={ctx.closeDialog} />),
  }
  const unregisterMemory = commands.register(memoryModalCmd)

  // /positions — read-only trading positions + order audit log (the persistent trade record).
  const positionsCmd: ActionCommand = {
    kind: "action",
    id: "session.positions",
    name: "positions",
    description: "View trading positions & the order audit log",
    category: "Trading",
    source: "builtin",
    run: (_args, ctx) => ctx.showDialog(() => <PositionsModal onClose={ctx.closeDialog} />),
  }
  const unregisterPositions = commands.register(positionsCmd)
  const copyCmd: ActionCommand = {
    kind: "action",
    id: "session.copy",
    name: "copy",
    description: "Copy the assistant's last response to the clipboard",
    category: "Session",
    source: "builtin",
    keybind: "ctrl+y",
    async run(_args, ctx) {
      let text: string | undefined
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role === "assistant" && m.content.length > 0) {
          text = m.content
          break
        }
      }
      if (!text) {
        ctx.toast("No response to copy yet.")
        return
      }
      // Copy as clean plain text (markdown markers stripped, tables flattened),
      // via the native OS clipboard first (works even when the terminal blocks
      // OSC 52), then OSC 52 via the renderer as the remote/SSH fallback.
      const res = await copyToClipboard(markdownToPlainText(text), renderer)
      ctx.toast(
        res.ok
          ? "Copied last response to clipboard."
          : "Couldn't reach the clipboard (OS clipboard + OSC 52 both failed).",
      )
    },
  }
  const unregisterCopy = commands.register(copyCmd)
  const mcpCmd: ActionCommand = {
    kind: "action",
    id: "session.mcp",
    name: "mcp",
    description: "Browse & manage MCP servers (add, remove, auth, logout)",
    category: "MCP",
    source: "builtin",
    run: (_args, ctx) => ctx.showDialog(() => <McpModal mcp={mcp} cwd={process.cwd()} onClose={ctx.closeDialog} />),
  }
  const unregisterMcp = commands.register(mcpCmd)
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
        ctx.toast(`Now acting as "${agent.name}"${agent.model ? ` (model: ${agent.model})` : ""}.`)
      },
    }
    unregisterAgent = commands.register(agentCmd)
  })
  onCleanup(() => {
    unregisterClear()
    unregisterCopy()
    unregisterMcp()
    unregisterResume()
    unregisterUndo()
    unregisterRedo()
    unregisterCheckpoints()
    unregisterRemember()
    unregisterMemory()
    unregisterPositions()
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
            status={loading() ? "⟳ Generating..." : undefined}
            messageCount={messages.length}
            tokenCount={totalTokens()}
            agent={activeAgent()?.name}
            onOpenAgentPicker={openAgentPicker}
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
            Ctrl+N <span style={{ fg: theme.textMuted }}>new</span>
            {"  "}Ctrl+Y <span style={{ fg: theme.textMuted }}>copy</span>
            {"  "}Ctrl+Q <span style={{ fg: theme.textMuted }}>exit</span>
          </text>
          <text fg={autoApprove() ? theme.warning : theme.textMuted}>{autoApproveLabel(autoApprove())}</text>
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
    <box marginTop={1} flexShrink={0} paddingLeft={2} paddingRight={2}>
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <text fg={props.theme.accent} attributes={BOLD}>
          Quantcept
        </text>
        <text fg={props.theme.textMuted}>{formatTime(props.timestamp)}</text>
      </box>
      <For each={segments()}>
        {(seg, i) =>
          seg.kind === "md" ? (
            <StreamingMarkdown
              content={seg.text}
              streaming={(props.streaming ?? false) && i() === segments().length - 1}
              syntaxStyle={props.syntaxStyle}
              fg={props.theme.markdownText}
            />
          ) : (
            <DiagramBlock body={seg.body} closed={seg.closed} theme={props.theme} />
          )
        }
      </For>
    </box>
  )
}
