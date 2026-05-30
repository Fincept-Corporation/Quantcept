// src/core/budget/types.ts

export interface Budget {
  maxTokens?: number
  maxUsd?: number
  maxToolCalls?: number
  maxDataCalls?: number
}

export interface Spend {
  inputTokens: number
  outputTokens: number
  usd: number
  toolCalls: number
  dataCalls: number
}

export interface BudgetCheck {
  ok: boolean
  exceeded?: keyof Budget
}
