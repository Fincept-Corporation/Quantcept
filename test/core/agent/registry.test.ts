import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildAgentRegistry } from "@core/agent/registry"
import type { Config } from "@core/config/schema"
import { defaultConfig } from "@core/config/schema"
import type { ChatRequest, ChatResult, Provider, StreamHandlers } from "@core/llm/types"
import { JobStore } from "@core/jobs/store"
import { readOrderAudit } from "@core/risk/audit"
import { projectHash } from "@core/storage/paths"

// A provider stub is only consulted when the `task` tool is actually CALLED, which these
// structural tests never do — so a throwing chat() is fine and proves we don't call it.
const stubProvider: Provider = {
  id: "stub",
  async chat(_req: ChatRequest, _h?: StreamHandlers): Promise<ChatResult> {
    throw new Error("provider.chat must not be called during registry construction")
  },
}

const READ_ONLY_BUILTINS = ["read", "glob", "grep", "recall"]
const WRITE_BUILTINS = ["write", "edit", "shell", "remember"]
const FINANCE = ["ticker_info", "income_statement", "balance_sheet", "cashflow", "price_history"]

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-reg-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

const names = async (opts: Parameters<typeof buildAgentRegistry>[0]) => {
  const built = await buildAgentRegistry(opts)
  const list = built.registry.list().map((t) => t.name)
  await built.dispose()
  return list
}

describe("buildAgentRegistry", () => {
  test("readOnly:false registers read AND write tools + finance + task", async () => {
    const list = await names({ config: defaultConfig, provider: stubProvider, cwd: tmp, readOnly: false })
    for (const n of [...READ_ONLY_BUILTINS, ...WRITE_BUILTINS, ...FINANCE, "calculator", "task"]) {
      expect(list).toContain(n)
    }
  })

  test("readOnly:true keeps read tools + finance + task, excludes write/edit/shell/remember", async () => {
    const list = await names({ config: defaultConfig, provider: stubProvider, cwd: tmp, readOnly: true })
    for (const n of [...READ_ONLY_BUILTINS, ...FINANCE, "calculator", "task"]) {
      expect(list).toContain(n)
    }
    for (const n of WRITE_BUILTINS) {
      expect(list).not.toContain(n)
    }
  })

  test("jobStore + readOnly:true → list_jobs only (schedule_job excluded as a write)", async () => {
    const store = new JobStore()
    try {
      const list = await names({
        config: defaultConfig,
        provider: stubProvider,
        cwd: tmp,
        readOnly: true,
        jobStore: store,
      })
      expect(list).toContain("list_jobs")
      expect(list).not.toContain("schedule_job")
    } finally {
      store.close()
    }
  })

  test("jobStore + readOnly:false → both list_jobs and schedule_job", async () => {
    const store = new JobStore()
    try {
      const list = await names({
        config: defaultConfig,
        provider: stubProvider,
        cwd: tmp,
        readOnly: false,
        jobStore: store,
      })
      expect(list).toContain("list_jobs")
      expect(list).toContain("schedule_job")
    } finally {
      store.close()
    }
  })

  test("no jobStore → no job-control tools", async () => {
    const list = await names({ config: defaultConfig, provider: stubProvider, cwd: tmp, readOnly: false })
    expect(list).not.toContain("list_jobs")
    expect(list).not.toContain("schedule_job")
  })

  test("includeSubagents:false omits the task tool", async () => {
    const list = await names({
      config: defaultConfig,
      provider: stubProvider,
      cwd: tmp,
      readOnly: false,
      includeSubagents: false,
    })
    expect(list).not.toContain("task")
  })

  test("does not register the add_mcp_server admin tool", async () => {
    const list = await names({ config: defaultConfig, provider: stubProvider, cwd: tmp, readOnly: false })
    expect(list).not.toContain("add_mcp_server")
  })

  test("dispose() resolves without throwing when no MCP servers are configured", async () => {
    const built = await buildAgentRegistry({ config: defaultConfig, provider: stubProvider, cwd: tmp })
    await expect(built.dispose()).resolves.toBeUndefined()
  })
})

const TRADING = ["place_order", "cancel_order", "get_positions"]

describe("buildAgentRegistry — trading wiring", () => {
  // A config with a small per-order notional cap so the gate is easy to trip.
  const tradingConfig = (): Config => ({
    ...defaultConfig,
    risk: { ...defaultConfig.risk, startingCash: 100_000, maxOrderNotional: 1_000 },
    broker: { ...defaultConfig.broker, prices: { AAPL: 100 } },
  })

  test("with trading → registry includes order tools and a riskGate", async () => {
    const built = await buildAgentRegistry({
      config: tradingConfig(),
      provider: stubProvider,
      cwd: tmp,
      readOnly: false,
      trading: { ctxId: "t1" },
    })
    try {
      const list = built.registry.list().map((t) => t.name)
      for (const n of TRADING) expect(list).toContain(n)
      expect(built.riskGate).toBeDefined()
      expect(built.ledger).toBeDefined()
    } finally {
      await built.dispose()
    }
  })

  test("riskGate denies a place_order over maxOrderNotional, allows a small one", async () => {
    const built = await buildAgentRegistry({
      config: tradingConfig(),
      provider: stubProvider,
      cwd: tmp,
      readOnly: false,
      trading: { ctxId: "t2" },
    })
    try {
      const place = built.registry.list().find((t) => t.name === "place_order")!
      // 100 * 100 = 10_000 notional > 1_000 cap → deny.
      const big = built.riskGate!(place, { symbol: "AAPL", side: "buy", qty: 100 })
      expect(big.ok).toBe(false)
      expect(big.violation).toBe("maxOrderNotional")
      // 100 * 5 = 500 notional ≤ 1_000 cap → allow.
      const small = built.riskGate!(place, { symbol: "AAPL", side: "buy", qty: 5 })
      expect(small.ok).toBe(true)
    } finally {
      await built.dispose()
    }
  })

  test("riskGate passes through non-place_order tools as ok:true", async () => {
    const built = await buildAgentRegistry({
      config: tradingConfig(),
      provider: stubProvider,
      cwd: tmp,
      readOnly: false,
      trading: { ctxId: "t3" },
    })
    try {
      const getPos = built.registry.list().find((t) => t.name === "get_positions")!
      expect(built.riskGate!(getPos, {}).ok).toBe(true)
    } finally {
      await built.dispose()
    }
  })

  test("riskGate uses the config defaultPrice (100) for an un-priced symbol", async () => {
    const built = await buildAgentRegistry({
      config: tradingConfig(), // only AAPL is priced
      provider: stubProvider,
      cwd: tmp,
      readOnly: false,
      trading: { ctxId: "t4" },
    })
    try {
      const place = built.registry.list().find((t) => t.name === "place_order")!
      // ZZZZ un-priced → defaultPrice 100; 100 * 20 = 2_000 > 1_000 cap → deny.
      const v = built.riskGate!(place, { symbol: "ZZZZ", side: "buy", qty: 20 })
      expect(v.ok).toBe(false)
      expect(v.violation).toBe("maxOrderNotional")
    } finally {
      await built.dispose()
    }
  })

  test("place_order writes intent + fill records to the order audit log", async () => {
    const built = await buildAgentRegistry({
      config: tradingConfig(), // AAPL priced at 100
      provider: stubProvider,
      cwd: tmp,
      readOnly: false,
      trading: { ctxId: "t5" },
    })
    try {
      const place = built.registry.list().find((t) => t.name === "place_order")!
      // Drive the saga directly (the tool's call() runs intent→reserve→fill and onAudit).
      const r = await place.call({ symbol: "AAPL", side: "buy", qty: 5 }, {
        abort: new AbortController().signal,
        cwd: tmp,
      })
      expect(r.isError).toBeFalsy()

      const kinds = readOrderAudit(projectHash(tmp)).map((rec) => rec.kind)
      expect(kinds).toContain("intent")
      expect(kinds).toContain("fill")
    } finally {
      await built.dispose()
    }
  })

  test("without trading → no order tools, riskGate and ledger undefined", async () => {
    const built = await buildAgentRegistry({
      config: defaultConfig,
      provider: stubProvider,
      cwd: tmp,
      readOnly: false,
    })
    try {
      const list = built.registry.list().map((t) => t.name)
      for (const n of TRADING) expect(list).not.toContain(n)
      expect(built.riskGate).toBeUndefined()
      expect(built.ledger).toBeUndefined()
    } finally {
      await built.dispose()
    }
  })
})
