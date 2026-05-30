import { z } from "zod/v4"

/** Lifecycle points a plugin hook can fire on. */
export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SessionEnd",
] as const

export type HookEvent = (typeof HOOK_EVENTS)[number]

/** A single command hook. `type` defaults to "command" (the only kind we execute today). */
export const HookCommandSchema = z.object({
  type: z.literal("command").default("command"),
  command: z.string().min(1),
  timeout: z.number().int().positive().optional(),
})
export type HookCommand = z.infer<typeof HookCommandSchema>

/** A matcher group: an optional tool-name regex plus the hooks to run when it matches. */
export const HookMatcherGroupSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(HookCommandSchema),
})
export type HookMatcherGroup = z.infer<typeof HookMatcherGroupSchema>

const groups = z.array(HookMatcherGroupSchema)

/** Claude-shaped hook config: event → matcher groups. `.strict()` rejects unknown event names. */
export const HookConfigSchema = z
  .object({
    SessionStart: groups.optional(),
    UserPromptSubmit: groups.optional(),
    PreToolUse: groups.optional(),
    PostToolUse: groups.optional(),
    Stop: groups.optional(),
    SessionEnd: groups.optional(),
  })
  .strict()
export type HookConfig = z.infer<typeof HookConfigSchema>

/**
 * Accept both the file shape `{ hooks: { <event>: [...] } }` (hooks/hooks.json) and a bare
 * event map `{ <event>: [...] }` (inline in a manifest), normalizing to a validated HookConfig.
 */
export function normalizeHookConfig(raw: unknown): HookConfig {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const candidate =
    "hooks" in obj && obj.hooks && typeof obj.hooks === "object" && !Array.isArray(obj.hooks) ? obj.hooks : obj
  return HookConfigSchema.parse(candidate)
}

/** Context handed to a hook command (serialized to JSON on stdin). */
export interface HookInput {
  event: HookEvent
  cwd: string
  sessionId?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  prompt?: string
}

/** Parsed result of a hook command's stdout (best-effort JSON). */
export interface HookOutput {
  /** PreToolUse: "block" denies the tool call. */
  decision?: "block" | "approve"
  reason?: string
  /** UserPromptSubmit/SessionStart: extra text to fold into the model context. */
  additionalContext?: string
  continue?: boolean
}

/** Aggregated outcome across all hooks that fired for one event. */
export interface HookOutcome {
  blocked: boolean
  reason?: string
  additionalContext: string[]
}

/**
 * Fires hooks for a lifecycle event. The concrete implementation (HookRegistry + runHooks) is
 * assembled in the TUI; `core` consumers depend only on this interface so the engine stays headless.
 */
export interface HookRunner {
  fire(input: HookInput): Promise<HookOutcome>
}
