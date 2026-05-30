/**
 * JSON-RPC contract between the TS ComputerUseTool and the Rust capture/input sidecar.
 *
 * The tool speaks LOW-LEVEL primitives (mirroring warp's computer_use crate and enigo's
 * API: move / button press-release-click / scroll / text / key / wait). High-level verbs
 * (left_click, double_click, drag, key-chords, ...) are composed into these primitives in
 * `compose.ts`, so the Rust side stays dumb and auditable. All coordinates are PHYSICAL
 * screen pixels (the tool scales the model's coordinates up via `scale.ts` before composing).
 *
 * The protocol is structured-only — the sidecar accepts typed action objects, never a shell
 * string — which closes the input-injection / command-smuggling class flagged for ShellTool.
 */

export type SidecarButton = "left" | "right" | "middle"
export type Direction = "press" | "release" | "click"
export type Axis = "vertical" | "horizontal"

export type Primitive =
  | { kind: "move"; x: number; y: number }
  | { kind: "button"; button: SidecarButton; direction: Direction }
  | { kind: "scroll"; axis: Axis; amount: number }
  | { kind: "text"; text: string }
  | { kind: "key"; key: string; direction: Direction }
  | { kind: "wait"; seconds: number }

export interface CaptureRequest {
  /** Optional sub-region in physical pixels; full display if omitted. */
  region?: { x: number; y: number; width: number; height: number }
  /** Downscale constraints applied by the sidecar (or in-process via Bun.Image). */
  maxLongEdge?: number
  maxTotalPx?: number
  /** Overlay a numbered grid (Set-of-Marks) so the model can click by mark number. */
  marks?: boolean
}

/** A numbered grid cell (Set-of-Marks): the mark number + its PHYSICAL screen center. */
export interface MarkElement {
  mark: number
  x: number
  y: number
  label: string
}

export interface SidecarRequest {
  id: number
  actions: Primitive[]
  /** If present, a screenshot is captured AFTER the actions run. */
  capture?: CaptureRequest
  /** Out-of-band control message: release any held buttons/keys (kill-switch). */
  control?: "release_all"
}

export interface Screenshot {
  /** base64-encoded PNG. */
  data: string
  /** dimensions of the (possibly downscaled) image actually returned. */
  width: number
  height: number
  /** dimensions before any downscale — used to map model coords back to physical pixels. */
  originalWidth: number
  originalHeight: number
  /** captured monitor's top-left in virtual-screen coords (image px / scale + origin = physical). */
  originX: number
  originY: number
}

export interface SidecarResponse {
  id: number
  screenshot?: Screenshot
  cursor?: [number, number]
  /** Title of the focused window at capture time — drives the money tripwire + redaction. */
  windowTitle?: string
  /** Set-of-Marks grid cells (when capture.marks was set): mark number → physical center. */
  elements?: MarkElement[]
  error?: string
}
