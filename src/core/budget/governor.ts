// src/core/budget/governor.ts
import type { Database } from "bun:sqlite"
import { openOwnedDb } from "@core/storage/owned-db"
import { dayKey } from "@shared/time"
import { estimateCostUsd, type PriceTable } from "./pricing"
import type { Budget, BudgetCheck, Spend } from "./types"

export class BudgetGovernor {
  private db: Database
  private budget: Budget
  private pricing?: PriceTable
  private ownsDb: boolean

  constructor(opts: { budget: Budget; pricing?: PriceTable; db?: Database }) {
    const owned = openOwnedDb(opts.db)
    this.db = owned.db
    this.ownsDb = owned.ownsDb
    this.budget = opts.budget
    this.pricing = opts.pricing
  }

  check(jobId: string): BudgetCheck {
    const s = this.spend(jobId)
    const b = this.budget

    if (b.maxTokens !== undefined && s.inputTokens + s.outputTokens >= b.maxTokens) {
      return { ok: false, exceeded: "maxTokens" }
    }
    if (b.maxUsd !== undefined && s.usd >= b.maxUsd) {
      return { ok: false, exceeded: "maxUsd" }
    }
    if (b.maxToolCalls !== undefined && s.toolCalls >= b.maxToolCalls) {
      return { ok: false, exceeded: "maxToolCalls" }
    }
    if (b.maxDataCalls !== undefined && s.dataCalls >= b.maxDataCalls) {
      return { ok: false, exceeded: "maxDataCalls" }
    }
    return { ok: true }
  }

  recordTurn(jobId: string, usage: { inputTokens: number; outputTokens: number }, model?: string): void {
    const usd = estimateCostUsd(model, usage.inputTokens, usage.outputTokens, this.pricing)
    this.add(`job:${jobId}`, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      usd,
      toolCalls: 0,
      dataCalls: 0,
    })
    this.add(`day:${dayKey()}`, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      usd,
      toolCalls: 0,
      dataCalls: 0,
    })
  }

  recordToolCall(jobId: string, isData: boolean): void {
    this.add(`job:${jobId}`, {
      inputTokens: 0,
      outputTokens: 0,
      usd: 0,
      toolCalls: 1,
      dataCalls: isData ? 1 : 0,
    })
  }

  spend(jobId: string): Spend {
    const row = this.db
      .query("SELECT input_tokens, output_tokens, usd, tool_calls, data_calls FROM budget_ledger WHERE scope = ?")
      .get(`job:${jobId}`) as {
      input_tokens: number
      output_tokens: number
      usd: number
      tool_calls: number
      data_calls: number
    } | null

    if (!row) {
      return { inputTokens: 0, outputTokens: 0, usd: 0, toolCalls: 0, dataCalls: 0 }
    }
    return {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      usd: row.usd,
      toolCalls: row.tool_calls,
      dataCalls: row.data_calls,
    }
  }

  /** Adapter so the executor can enforce per-tool-call ceilings for this job. */
  executorHook(jobId: string) {
    return {
      check: (): { ok: boolean } => ({ ok: this.check(jobId).ok }),
      recordToolCall: (isData: boolean) => this.recordToolCall(jobId, isData),
    }
  }

  close(): void {
    if (this.ownsDb) this.db.close()
  }

  private add(scope: string, d: Spend): void {
    this.db
      .query(
        `INSERT INTO budget_ledger (scope, input_tokens, output_tokens, usd, tool_calls, data_calls, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope) DO UPDATE SET
           input_tokens  = input_tokens  + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens,
           usd           = usd           + excluded.usd,
           tool_calls    = tool_calls    + excluded.tool_calls,
           data_calls    = data_calls    + excluded.data_calls,
           updated_at    = excluded.updated_at`,
      )
      .run(scope, d.inputTokens, d.outputTokens, d.usd, d.toolCalls, d.dataCalls, Date.now())
  }
}
