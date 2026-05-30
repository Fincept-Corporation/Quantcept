import { buildTool } from "@core/tools/Tool"
import { z } from "zod/v4"
import { formatAuditEntry } from "./audit"
import { type ComputerAction, composeAction } from "./compose"
import type { CaptureRequest, SidecarResponse } from "./protocol"
import { DEFAULT_SUPPRESS_PATTERNS, shouldSuppressCapture } from "./redact"
import { toPhysical } from "./scale"
import type { SidecarClient } from "./sidecarClient"
import { DEFAULT_MONEY_PATTERNS, shouldTripwire, type TripwireConfig } from "./tripwire"

export const ComputerInputSchema = z.object({
  action: z.enum([
    "screenshot",
    "left_click",
    "right_click",
    "middle_click",
    "double_click",
    "triple_click",
    "mouse_move",
    "left_click_drag",
    "type",
    "key",
    "scroll",
    "wait",
    "cursor_position",
  ]),
  coordinate: z.tuple([z.number(), z.number()]).optional(),
  /** Set-of-Marks: the numbered grid cell to act on (preferred over raw coordinate). */
  mark: z.number().int().optional(),
  startCoordinate: z.tuple([z.number(), z.number()]).optional(),
  text: z.string().optional(),
  scrollDirection: z.enum(["up", "down", "left", "right"]).optional(),
  scrollAmount: z.number().optional(),
  duration: z.number().optional(),
})

export type ComputerInput = z.infer<typeof ComputerInputSchema>

const COMPUTER_TOOL_DESCRIPTION = [
  "Control the computer's screen, mouse, and keyboard to do the user's task.",
  "ALWAYS `screenshot` first. The screenshot has a NUMBERED yellow grid overlaid: to click or act on a spot, set `mark` = the grid number on (or nearest) your target — this is FAR more reliable than guessing pixels, so PREFER `mark` over `coordinate`. If you must use `coordinate` [x,y], it must be within the reported pixel size.",
  "CRITICAL: keystrokes go to whatever window is focused — including the terminal running this agent. Before any `type`, FIRST `left_click` the exact text field/window you want, then type. Verify with a screenshot.",
  "Actions: left_click/right_click/middle_click/double_click/triple_click at `coordinate`; mouse_move; left_click_drag (startCoordinate→coordinate); type `text`; key with `text` like 'ctrl+s','Return','ctrl+esc'(Start menu); scroll at `coordinate` with `scrollDirection`+`scrollAmount`; wait `duration`s; cursor_position.",
  "To open an app: key 'ctrl+esc', type the app name, key 'Return'. Take a screenshot after EVERY action to confirm it worked before the next step.",
].join(" ")

const READ_ONLY = new Set(["screenshot", "cursor_position"])

export interface ComputerUseDeps {
  client: SidecarClient
  /** Downscale envelope applied to each captured frame (e.g. { maxLongEdge: 1024 }). */
  captureLimits: CaptureRequest
  /** Money-action tripwire (default: enabled with the built-in money patterns). */
  tripwire?: TripwireConfig
  /** Window-title patterns whose frames are never sent to the model (default: built-ins). */
  suppressPatterns?: string[]
  /** Optional sink for the append-only action audit log. */
  onAudit?: (line: string) => void
}

/**
 * The model-facing `computer` tool. State across calls: `lastScaleFactor` (model coordinates
 * are in the last screenshot's downscaled space) and `lastWindowTitle` (the focused window,
 * used to gate money actions and suppress sensitive captures).
 *
 * Permission model honours full-auto: input actions emit NO permission pattern (so they
 * auto-allow in `allow` mode), EXCEPT when the last-seen window looks money-moving — then a
 * `computeruse:money` pattern forces a one-time confirmation (the tripwire), the single
 * exception to full-auto.
 */
export function createComputerUseTool(deps: ComputerUseDeps) {
  let lastScaleFactor = 1
  let lastWindowTitle: string | undefined
  // mark number -> physical screen center, from the last marked screenshot.
  let lastMarks = new Map<number, [number, number]>()
  const tripwire: TripwireConfig = deps.tripwire ?? { enabled: true, patterns: DEFAULT_MONEY_PATTERNS }
  const suppress = deps.suppressPatterns ?? DEFAULT_SUPPRESS_PATTERNS

  return buildTool({
    name: "computer",
    description: COMPUTER_TOOL_DESCRIPTION,
    inputSchema: ComputerInputSchema,
    isReadOnly: (i) => READ_ONLY.has(i.action),
    isDestructive: (i) => !READ_ONLY.has(i.action),
    permissionPatterns: (i) => {
      if (READ_ONLY.has(i.action)) return []
      return shouldTripwire(tripwire, { windowTitle: lastWindowTitle }) ? ["computeruse:money"] : []
    },
    async call(input) {
      const physical = resolveCoords(input, lastScaleFactor, lastMarks)
      const { primitives, capture } = composeAction(physical)
      const res = await deps.client.send({
        actions: primitives,
        capture: capture ? { ...deps.captureLimits, marks: true } : undefined,
      })
      emitAudit(deps.onAudit, input, physical)
      if (res.error) return { output: `computer ${input.action} failed: ${res.error}`, isError: true }

      if (res.windowTitle !== undefined) lastWindowTitle = res.windowTitle
      if (res.elements) lastMarks = new Map(res.elements.map((e) => [e.mark, [e.x, e.y] as [number, number]]))

      let image: { mediaType: string; data: string } | undefined
      let suppressed = false
      if (res.screenshot) {
        lastScaleFactor = res.screenshot.originalWidth > 0 ? res.screenshot.width / res.screenshot.originalWidth : 1
        if (shouldSuppressCapture(res.windowTitle, suppress)) {
          suppressed = true
        } else {
          image = { mediaType: "image/png", data: res.screenshot.data }
        }
      }
      const base = describe(input, res)
      const output = suppressed ? `${base} [capture suppressed: sensitive window]` : base
      return { output, image, title: `computer:${input.action}` }
    },
  })
}

/** Resolve the action's target to PHYSICAL pixels: a `mark` looks up its grid center directly;
 * otherwise the model's screenshot-space coordinate is scaled up. */
function resolveCoords(input: ComputerInput, scaleFactor: number, marks: Map<number, [number, number]>): ComputerAction {
  const out: ComputerAction = { ...input }
  const marked = input.mark != null ? marks.get(input.mark) : undefined
  if (marked) out.coordinate = marked
  else if (input.coordinate) out.coordinate = toPhysical(input.coordinate, scaleFactor)
  if (input.startCoordinate) out.startCoordinate = toPhysical(input.startCoordinate, scaleFactor)
  return out
}

function emitAudit(onAudit: ComputerUseDeps["onAudit"], input: ComputerInput, physical: ComputerAction): void {
  if (!onAudit) return
  onAudit(
    formatAuditEntry({
      timestamp: Date.now(),
      action: input.action,
      coordinate: physical.coordinate,
      text: input.action === "type" || input.action === "key" ? input.text : undefined,
    }),
  )
}

function describe(input: ComputerInput, res: SidecarResponse): string {
  const parts: string[] = [input.action]
  if (input.coordinate) parts.push(`@ [${input.coordinate.join(", ")}]`)
  if (input.text !== undefined && (input.action === "type" || input.action === "key")) parts.push(`"${input.text}"`)
  if (res.cursor) parts.push(`cursor=[${res.cursor.join(", ")}]`)
  if (res.screenshot) {
    const grid = res.elements?.length ? ` — numbered grid: marks 1-${res.elements.length}, click via mark:N` : ""
    parts.push(
      `screenshot ${res.screenshot.width}x${res.screenshot.height}px${grid} (coordinates within x:0-${res.screenshot.width}, y:0-${res.screenshot.height})`,
    )
  }
  return parts.join(" ")
}
