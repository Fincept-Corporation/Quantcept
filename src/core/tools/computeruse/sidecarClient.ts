import type { SidecarRequest, SidecarResponse } from "./protocol"

/**
 * Transport to the capture/input sidecar. The ComputerUseTool depends only on this
 * interface, so the orchestration is unit-testable with a fake and the real Bun.spawn
 * implementation (which needs the compiled Rust binary) is swapped in at composition time.
 */
export interface SidecarClient {
  /** Send a batch of primitives (+ optional post-action capture) and await the response. */
  send(req: Omit<SidecarRequest, "id">): Promise<SidecarResponse>
  /** Kill-switch: tell the sidecar to release any held mouse buttons / keys immediately. */
  releaseAll(): Promise<void>
  /** Shut the sidecar process down. */
  dispose(): Promise<void>
}
