import { z } from "zod/v4"

/**
 * WORKFLOW.md parser — the TypeScript twin of finceptgo's
 * internal/domain/learnings/workflow.go ParseWorkflow. The golden-vector test
 * in BOTH repos pins the wire format; if the parsers drift, a suite fails.
 *
 * Frontmatter is real YAML (nested maps/lists) parsed with Bun.YAML and
 * validated STRICTLY (unknown keys rejected — mirrors Go's KnownFields).
 * Deliberately NOT @shared/frontmatter, whose YAML-ish flat parser folds
 * nested mappings into scalars.
 */

/** Injection cap (bytes) — mirrors learnings.MaxWorkflowBodyBytes. */
export const MAX_WORKFLOW_BODY_BYTES = 4096

/**
 * Pre-validation cleaning that mirrors Go: trim a string before the base
 * schema runs.  Non-strings are passed through unchanged so Zod can report
 * the type error in the normal way.
 */
const trimmedString = (schema: z.ZodType<string>) => z.preprocess((v) => (typeof v === "string" ? v.trim() : v), schema)

/**
 * Pre-validation cleaning that mirrors Go: trim each entry, then drop
 * empty strings, before the base array schema runs.
 * `undefined` is passed through so `.default()` inside the array schema
 * can still fire on missing keys.
 */
const trimmedList = (schema: z.ZodType<string[]>) =>
  z.preprocess(
    (v) =>
      v === undefined
        ? v
        : Array.isArray(v)
          ? v.map((s) => (typeof s === "string" ? s.trim() : s)).filter((s) => s !== "")
          : v,
    schema,
  )

const checkSchema = z
  .strictObject({
    kind: z.enum(["output_sections", "tool_called", "numbers_cited"]),
    must_include: z.array(z.string().min(1)).max(16).optional(),
    tool: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.kind === "output_sections" && (!c.must_include || c.must_include.length === 0)) {
      ctx.addIssue({ code: "custom", message: "output_sections requires must_include" })
    }
    if (c.kind === "tool_called" && !c.tool?.trim()) {
      ctx.addIssue({ code: "custom", message: "tool_called requires tool" })
    }
  })

const frontmatterSchema = z.strictObject({
  name: trimmedString(z.string().regex(/^[a-z0-9][a-z0-9-]{1,99}$/, "name must be a lowercase kebab-case slug")),
  title: trimmedString(
    z
      .string()
      .min(1)
      .refine((t) => !/[\r\n]/.test(t), "title must be a single line")
      .refine((t) => [...t].length <= 200, "title exceeds 200 code points"),
  ),
  description: trimmedString(z.string().min(1)),
  triggers: trimmedList(z.array(z.string().min(1)).min(1).max(8)),
  domains: trimmedList(z.array(z.string().min(1)).max(10).default([])),
  tools: z
    .strictObject({
      required: trimmedList(z.array(z.string().min(1)).default([])),
      optional: trimmedList(z.array(z.string().min(1)).default([])),
    })
    .default({ required: [], optional: [] }),
  inputs: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        required: z.boolean().default(false),
        description: z.string().default(""),
      }),
    )
    .default([]),
  checks: z.array(checkSchema).max(12).default([]),
})

export type WorkflowCheck = z.infer<typeof checkSchema>
export type WorkflowFrontmatter = z.infer<typeof frontmatterSchema>
export interface WorkflowDoc extends WorkflowFrontmatter {
  body: string
}

/** Parse + validate a WORKFLOW.md. Throws Error with a readable reason. */
export function parseWorkflow(raw: string): WorkflowDoc {
  const content = raw.replace(/\r\n/g, "\n")

  // indexOf-based fence split (a lazy regex backtracks pathologically in JS on
  // large inputs with no closing fence — the Go side is RE2 and immune).
  // Opening fence must be the very first line.
  if (!content.startsWith("---\n")) {
    throw new Error("workflow: missing --- frontmatter fences")
  }

  // Find the first \n--- that is followed by \n or end-of-string (i.e. a real
  // fence line, not a sequence that is part of a value). This matches Go's lazy
  // `(.*?)\n---` semantics: stop at the FIRST closing fence.
  const fenceStart = content.indexOf("\n---", 3)
  const closing = findClosingFence(content, fenceStart)
  if (closing === -1) {
    throw new Error("workflow: missing --- frontmatter fences")
  }

  // fm is the text between the opening "---\n" and the closing "\n---"
  const fm = content.slice(4, closing)
  // body starts after the closing "\n---\n" (5 chars); trim whitespace
  const bodyRaw = content.slice(closing + 5)
  const body = bodyRaw.trim()

  let parsed: unknown
  try {
    parsed = Bun.YAML.parse(fm)
  } catch (e) {
    throw new Error(`workflow frontmatter: ${e instanceof Error ? e.message : String(e)}`)
  }

  const res = frontmatterSchema.safeParse(parsed)
  if (!res.success) {
    const first = res.error.issues[0]
    throw new Error(`workflow frontmatter: ${first?.path.join(".") ?? ""} ${first?.message ?? "invalid"}`.trim())
  }

  if (!body) throw new Error("workflow body (steps) is required")

  const bytes = new TextEncoder().encode(body).length
  if (bytes > MAX_WORKFLOW_BODY_BYTES) {
    throw new Error(`workflow body exceeds ${MAX_WORKFLOW_BODY_BYTES} bytes (got ${bytes}): 4096 is the injection cap`)
  }

  return { ...res.data, body }
}

/**
 * Starting at `start` (the result of the first indexOf("\n---", 3)), scan
 * forward for a fence line: a position `i` where content[i] === '\n',
 * content[i+1..i+3] === '---', and content[i+4] is '\n' or end-of-string.
 * Returns -1 if none found.
 */
function findClosingFence(content: string, start: number): number {
  let at = start
  while (at !== -1) {
    const after = content[at + 4]
    if (content.slice(at + 1, at + 4) === "---" && (after === "\n" || after === undefined)) {
      return at
    }
    at = content.indexOf("\n---", at + 1)
  }
  return -1
}
