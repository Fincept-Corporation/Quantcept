import { createCancelOrderTool, createGetPositionsTool, createPlaceOrderTool } from "@core/broker/order-tools"
import { PaperBroker } from "@core/broker/paper"
import type { Config } from "@core/config/schema"
import { createFinceptTools } from "@core/fincept/tools"
import { registerJobControlTools } from "@core/jobs/JobControlTool"
import type { JobStore } from "@core/jobs/store"
import type { Provider } from "@core/llm/types"
import { McpManager } from "@core/mcp/manager"
import { appendOrderAudit } from "@core/risk/audit"
import { PositionLedger } from "@core/risk/ledger"
import { checkRisk, type RiskVerdict } from "@core/risk/limits"
import { OrderOutbox } from "@core/risk/outbox"
import { projectHash } from "@core/storage/paths"
import { CalculatorTool } from "@core/tools/builtin/CalculatorTool"
import { CreateAgentTool } from "@core/tools/builtin/CreateAgentTool"
import { EditTool } from "@core/tools/builtin/EditTool"
import { GlobTool } from "@core/tools/builtin/GlobTool"
import { GrepTool } from "@core/tools/builtin/GrepTool"
import { ReadTool } from "@core/tools/builtin/ReadTool"
import { RecallTool } from "@core/tools/builtin/RecallTool"
import { RememberTool } from "@core/tools/builtin/RememberTool"
import { ShellTool } from "@core/tools/builtin/ShellTool"
import { VerifyCodeTool } from "@core/tools/builtin/VerifyCodeTool"
import { WriteTool } from "@core/tools/builtin/WriteTool"
import { effectClassOf } from "@core/tools/effects"
import { BalanceSheetTool } from "@core/tools/finance/BalanceSheetTool"
import { CashflowTool } from "@core/tools/finance/CashflowTool"
import { IncomeStatementTool } from "@core/tools/finance/IncomeStatementTool"
import { PriceHistoryTool } from "@core/tools/finance/PriceHistoryTool"
import { TickerInfoTool } from "@core/tools/finance/TickerInfoTool"
import { ToolRegistry } from "@core/tools/registry"
import type { Tool } from "@core/tools/Tool"
import { logger } from "@shared/logger"
import { createTaskTool } from "./task-tool"

/**
 * The canonical builtin instance-tool set — the ONE source of truth for the builtin + finance
 * tools, registered by `registerBuiltinTools` for BOTH the interactive session and the headless
 * jobs runner. The two then diverge intentionally: the interactive session layers on its own
 * context-specific tools (computer-use, the live MCP-install tool, plugin MCP servers) that the
 * headless runner must not have. Computer-use is excluded here — it is vision/desktop-specific
 * and lives behind a TUI/vision provider, so it has no place in the headless engine.
 */
const BUILTIN_TOOLS: Tool[] = [
  CalculatorTool,
  ReadTool,
  GlobTool,
  GrepTool,
  WriteTool,
  EditTool,
  CreateAgentTool,
  ShellTool,
  VerifyCodeTool,
  RememberTool,
  RecallTool,
  TickerInfoTool,
  IncomeStatementTool,
  BalanceSheetTool,
  CashflowTool,
  PriceHistoryTool,
]

/**
 * Is this tool read-effect under an empty input? Some tools' `isReadOnly` inspects input;
 * the try/catch treats those as non-read (excluded from a read-only build) rather than
 * letting a thrown error crash the builder. A safe, conservative default.
 */
function isReadTool(t: Tool): boolean {
  try {
    return effectClassOf(t, {}) === "read"
  } catch {
    return false
  }
}

/**
 * Register the canonical builtin + finance instance tools into a registry, in the same order
 * session.tsx uses. When `readOnly`, only read-effect tools are included. Shared by the
 * interactive agent (full set) and the autonomous-jobs runner (read-only) so the tool list has
 * ONE source of truth.
 */
export function registerBuiltinTools(registry: ToolRegistry, opts?: { readOnly?: boolean }): void {
  // Fincept tools are built fresh (they read the persisted key + baseUrl from config).
  for (const tool of [...BUILTIN_TOOLS, ...createFinceptTools()]) {
    if (opts?.readOnly && !isReadTool(tool)) continue
    registry.register(tool)
  }
}

export interface BuildAgentRegistryOpts {
  config: Config
  /** Used only when the `task` sub-agent tool is actually CALLED, never at build time. */
  provider: Provider
  cwd: string
  /** When true, register ONLY read-effect builtin tools (the autonomous-jobs sandbox). */
  readOnly?: boolean
  /** Default: true when config.mcp.servers is non-empty. */
  includeMcp?: boolean
  /** Default: true. */
  includeSubagents?: boolean
  /** When provided, register job-control tools (list always; schedule only when writable). */
  jobStore?: JobStore
  /**
   * When set, register the trading order tools (place/cancel/get_positions) over a fresh
   * paper spine (ledger + broker + outbox) and expose a sync risk gate. `ctxId` is the stable
   * execution-context id (jobId/sessionId) used to derive the ENGINE idempotency key — the key
   * is `${ctxId}:${n}` with an in-build counter, so it is owned by the engine and never by the
   * LLM, stable across a re-run (the counter resets on a fresh build) and unique within a run.
   */
  trading?: { ctxId: string }
}

export interface BuiltAgentRegistry {
  registry: ToolRegistry
  dispose(): Promise<void>
  /** The trusted ledger backing the order tools — present only when `opts.trading` was set. */
  ledger?: PositionLedger
  /**
   * Sync pre-trade risk gate (present only when `opts.trading` was set). Thread it into the
   * agent turn's `riskGate`; it HARD-denies a `place_order` that violates a configured limit
   * (checked against the trusted ledger, using config.broker.prices as the trusted mark source).
   */
  riskGate?: (tool: Tool, input: unknown) => RiskVerdict
}

/**
 * Build the one canonical headless tool registry shared by the interactive agent and the
 * autonomous-jobs runner. Registers builtin + finance tools (effect-filtered when readOnly),
 * optional job-control tools, optional MCP server tools (non-fatal), and — registered LAST so
 * sub-agents inherit everything above — the `task` sub-agent tool.
 *
 * No `@tui` imports: this is core and must run without a terminal.
 */
export async function buildAgentRegistry(opts: BuildAgentRegistryOpts): Promise<BuiltAgentRegistry> {
  const registry = new ToolRegistry()

  // 1. Builtin + finance tools (effect-filtered in a read-only build).
  registerBuiltinTools(registry, { readOnly: opts.readOnly })

  // 2. Job-control tools: list is read-only (always); schedule is a write — keep it out of a
  //    read-only build entirely as a runaway guard (the sandbox would block it at execution,
  //    but don't even expose it).
  if (opts.jobStore) {
    registerJobControlTools(registry, { store: opts.jobStore, cwd: opts.cwd, schedulable: !opts.readOnly })
  }

  // 2.5. Trading order tools over a fresh paper spine. Registered regardless of `readOnly`
  //      (trading implies a non-readOnly build; if both are set the order tools are still
  //      exposed but the effect policy will gate the irreversible/compensable writes).
  let ledger: PositionLedger | undefined
  let outbox: OrderOutbox | undefined
  let riskGate: ((tool: Tool, input: unknown) => RiskVerdict) | undefined
  if (opts.trading) {
    ledger = new PositionLedger({ startingCash: opts.config.risk.startingCash })
    const broker = new PaperBroker({
      prices: opts.config.broker.prices,
      slippageBps: opts.config.broker.slippageBps,
    })
    outbox = new OrderOutbox()

    // ENGINE idempotency key: NEVER from the LLM. `${ctxId}:${n}` with a per-build counter —
    // stable across a re-run (the counter resets on a fresh build) and unique within a run.
    const ctxId = opts.trading.ctxId
    let n = 0
    const idempotencyKey = () => `${ctxId}:${n++}`

    // Phase 7: every order tool appends its lifecycle (intent→reserve→fill / failed / replay)
    // to the per-project append-only audit log. Keyed by the project hash of the build cwd.
    const ph = projectHash(opts.cwd)
    const orderDeps = {
      ledger,
      broker,
      outbox,
      accountId: "default",
      idempotencyKey,
      onAudit: (rec: Record<string, unknown>) => appendOrderAudit(ph, rec),
    }
    registry.register(createPlaceOrderTool(orderDeps))
    registry.register(createCancelOrderTool(orderDeps))
    registry.register(createGetPositionsTool(orderDeps))

    // Risk gate (sync). config.broker.prices is the TRUSTED mark source; an un-priced symbol
    // falls back to defaultPrice. Only `place_order` is gated — others pass through.
    const prices = opts.config.broker.prices ?? {}
    const defaultPrice = 100
    const ledgerRef = ledger // capture the non-undefined binding for the closure
    riskGate = (tool: Tool, input: unknown): RiskVerdict => {
      if (tool.name !== "place_order") return { ok: true }
      const o = input as { symbol: string; side: "buy" | "sell"; qty: number }
      const estPrice = prices[o.symbol] ?? defaultPrice
      return checkRisk(
        ledgerRef,
        { symbol: o.symbol, side: o.side, qty: o.qty, estPrice },
        {
          maxOrderNotional: opts.config.risk.maxOrderNotional,
          maxDailyLossUsd: opts.config.risk.maxDailyLossUsd,
          maxDrawdownPct: opts.config.risk.maxDrawdownPct,
          maxPositionQtyPerSymbol: opts.config.risk.maxPositionQtyPerSymbol,
        },
        prices,
        Date.now(),
      )
    }
  }

  // 3. MCP server tools. Non-fatal: a server that fails or needs OAuth must not crash the
  //    build. Read-only jobs still gate MCP tools at execution via the runner's effect
  //    sandbox — bridged tools the bridge marks read pass; others are blocked.
  const useMcp = opts.includeMcp ?? Object.keys(opts.config.mcp.servers ?? {}).length > 0
  let mcp: McpManager | undefined
  if (useMcp) {
    mcp = new McpManager()
    try {
      await mcp.start({ servers: opts.config.mcp.servers }, registry)
    } catch (e) {
      logger.warn("job MCP start failed", { error: String(e) })
    }
  }

  // 4. Sub-agents (the `task` tool) LAST, so the sub-registry inherits everything above. For
  //    jobs: no named agents, no permission rules, mode "ask", depth 1.
  if (opts.includeSubagents !== false) {
    registry.register(
      createTaskTool({
        provider: opts.provider,
        baseRegistry: registry,
        rules: [],
        mode: "ask",
        agents: new Map(),
        maxDepth: 1,
      }),
    )
  }

  return {
    registry,
    ledger,
    riskGate,
    dispose: async () => {
      if (mcp) await mcp.stop()
      ledger?.close()
      outbox?.close()
    },
  }
}
