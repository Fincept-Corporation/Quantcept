// src/core/budget/pricing.ts

export interface ModelPrice {
  inputPerM: number
  outputPerM: number
}

export type PriceTable = Record<string, ModelPrice>

/** Default per-model prices (USD / 1M tokens). Override via config. Unknown model → 0 (token ceiling still applies). */
export const DEFAULT_PRICES: PriceTable = {
  "MiniMax-M2.7": { inputPerM: 0.3, outputPerM: 1.2 },
}

export function estimateCostUsd(model: string | undefined, inTok: number, outTok: number, table?: PriceTable): number {
  const prices = { ...DEFAULT_PRICES, ...(table ?? {}) }
  const p = (model ? prices[model] : undefined) ?? { inputPerM: 0, outputPerM: 0 }
  return (inTok / 1_000_000) * p.inputPerM + (outTok / 1_000_000) * p.outputPerM
}
