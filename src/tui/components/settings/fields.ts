import { loadConfig } from "@core/config/load"
import { clearUserSettingPath, setUserSettingPath } from "@core/config/persist"

// Descriptor model for the Settings modal. Config sections are data-driven:
// each Field knows its kind, its dot-path in settings.json, and how to read its
// current display value (from the merged, validated config).

export type FieldKind = "string" | "secret" | "number" | "enum" | "bool"

export interface Field {
  label: string
  kind: FieldKind
  path: string
  get: () => string
  choices?: string[]
  hint?: string
}

export interface ConfigSection {
  key: string
  label: string
  fields: Field[]
}

const num = (n: number | undefined) => (n === undefined ? "" : String(n))

/** All editable config sections (scalars/enums/bools). Re-read on each call so
 *  it reflects the latest settings.json after a commit. */
export function configSections(): ConfigSection[] {
  const c = loadConfig()
  return [
    {
      key: "connection",
      label: "Connection",
      fields: [{ label: "Fincept base URL", kind: "string", path: "fincept.baseUrl", get: () => c.fincept.baseUrl }],
    },
    {
      key: "chat",
      label: "Chat",
      fields: [
        {
          label: "Storage",
          kind: "enum",
          path: "chat.mode",
          choices: ["cloud", "local"],
          get: () => c.chat.mode,
          hint: "cloud = Fincept backend (server-side) · local = on this machine",
        },
      ],
    },
    {
      key: "model",
      label: "Model",
      fields: [
        {
          label: "Provider",
          kind: "enum",
          path: "provider.id",
          choices: ["anthropic-messages", "openai-chat"],
          get: () => c.provider.id,
        },
        { label: "Model", kind: "string", path: "provider.model", get: () => c.provider.model },
        { label: "Base URL", kind: "string", path: "provider.baseUrl", get: () => c.provider.baseUrl },
        { label: "API key", kind: "secret", path: "provider.apiKey", get: () => c.provider.apiKey ?? "" },
        { label: "Max tokens", kind: "number", path: "provider.maxTokens", get: () => String(c.provider.maxTokens) },
        {
          label: "Temperature",
          kind: "number",
          path: "provider.temperature",
          get: () => String(c.provider.temperature),
        },
      ],
    },
    {
      key: "permissions",
      label: "Permissions",
      fields: [
        {
          label: "Default mode",
          kind: "enum",
          path: "permissions.defaultMode",
          choices: ["ask", "allow", "deny"],
          get: () => c.permissions.defaultMode,
          hint: `${c.permissions.rules.length} rule(s) — edit in settings.json`,
        },
      ],
    },
    {
      key: "plugins",
      label: "Plugins",
      fields: [
        {
          label: "Marketplace",
          kind: "string",
          path: "plugins.defaultMarketplace",
          get: () => c.plugins.defaultMarketplace,
        },
        { label: "Auto-update", kind: "bool", path: "plugins.autoUpdate", get: () => String(c.plugins.autoUpdate) },
      ],
    },
    {
      key: "budget",
      label: "Budget",
      fields: [
        { label: "Max USD", kind: "number", path: "budget.defaultMaxUsd", get: () => num(c.budget.defaultMaxUsd) },
        {
          label: "Max tokens",
          kind: "number",
          path: "budget.defaultMaxTokens",
          get: () => num(c.budget.defaultMaxTokens),
        },
        {
          label: "Max tool calls",
          kind: "number",
          path: "budget.defaultMaxToolCalls",
          get: () => num(c.budget.defaultMaxToolCalls),
        },
        {
          label: "Max data calls",
          kind: "number",
          path: "budget.defaultMaxDataCalls",
          get: () => num(c.budget.defaultMaxDataCalls),
        },
      ],
    },
    {
      key: "scheduler",
      label: "Scheduler",
      fields: [
        {
          label: "Exchange",
          kind: "enum",
          path: "scheduler.defaultExchange",
          choices: ["XNYS"],
          get: () => c.scheduler.defaultExchange,
        },
        { label: "Timezone", kind: "string", path: "scheduler.timezone", get: () => c.scheduler.timezone },
        {
          label: "Max staleness (s)",
          kind: "number",
          path: "scheduler.maxStalenessSeconds",
          get: () => String(c.scheduler.maxStalenessSeconds),
        },
        {
          label: "Missed policy",
          kind: "enum",
          path: "scheduler.defaultMissedPolicy",
          choices: ["catch_up", "skip"],
          get: () => c.scheduler.defaultMissedPolicy,
        },
      ],
    },
    {
      key: "risk",
      label: "Risk",
      fields: [
        { label: "Starting cash", kind: "number", path: "risk.startingCash", get: () => String(c.risk.startingCash) },
        {
          label: "Max order notional",
          kind: "number",
          path: "risk.maxOrderNotional",
          get: () => num(c.risk.maxOrderNotional),
        },
        {
          label: "Max daily loss USD",
          kind: "number",
          path: "risk.maxDailyLossUsd",
          get: () => num(c.risk.maxDailyLossUsd),
        },
        { label: "Max drawdown %", kind: "number", path: "risk.maxDrawdownPct", get: () => num(c.risk.maxDrawdownPct) },
        {
          label: "Max qty/symbol",
          kind: "number",
          path: "risk.maxPositionQtyPerSymbol",
          get: () => num(c.risk.maxPositionQtyPerSymbol),
        },
      ],
    },
    {
      key: "broker",
      label: "Broker",
      fields: [
        { label: "Kind", kind: "enum", path: "broker.kind", choices: ["paper"], get: () => c.broker.kind },
        {
          label: "Slippage (bps)",
          kind: "number",
          path: "broker.slippageBps",
          get: () => String(c.broker.slippageBps),
        },
      ],
    },
    {
      key: "trading",
      label: "Trading",
      fields: [
        { label: "Autonomous trading", kind: "bool", path: "trading.enabled", get: () => String(c.trading.enabled) },
      ],
    },
  ]
}

/** Persist a raw string value for a field, coercing to the right type. Empty
 *  number/secret clears the override (falls back to the config default). */
export function commitField(field: Field, raw: string): void {
  const t = raw.trim()
  if (field.kind === "number") {
    if (t === "") {
      clearUserSettingPath(field.path)
    } else {
      const n = Number(t)
      if (Number.isFinite(n)) setUserSettingPath(field.path, n)
    }
    return
  }
  if (field.kind === "bool") {
    setUserSettingPath(field.path, t === "true")
    return
  }
  if (field.kind === "secret" && t === "") {
    clearUserSettingPath(field.path) // empty secret clears the override
    return
  }
  setUserSettingPath(field.path, raw) // string | enum | non-empty secret
}

/** Next value when cycling an enum/bool with ←/→. */
export function cycleValue(field: Field, current: string, dir: 1 | -1): string {
  const opts = field.kind === "bool" ? ["false", "true"] : (field.choices ?? [current])
  const i = Math.max(0, opts.indexOf(current))
  return opts[(i + dir + opts.length) % opts.length] ?? current
}
