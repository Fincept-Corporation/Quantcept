// Server-Sent Events parsing for the Fincept chat generation stream.
// Pure functions (no I/O) so the wire protocol is unit-testable; the network
// loop lives in FinceptChat.streamGeneration.

/** One raw SSE frame: the `id:` cursor, the `event:` name, and joined `data:`. */
export interface SseFrame {
  id?: string
  event?: string
  data: string
}

/** A decoded chat stream event. Known finagent event types are typed; anything
 *  else passes through as `{ type, data }` so the client tolerates new events. */
export type ChatStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-start"; toolUseId: string; tool: string; input: unknown }
  | { type: "tool-end"; toolUseId: string; tool: string; result: unknown; isError: boolean }
  | { type: "approval-required"; toolUseId: string; tool: string; input: unknown }
  | { type: "finish"; stopReason: string; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; code: string; message: string }
  | { type: "done" }
  | { type: "workflow"; name: string; title: string; version: number; performance: number }
  | { type: "passthrough"; event: string; data: unknown }

/**
 * Split a buffer into complete SSE frames (separated by a blank line), returning
 * the parsed frames plus the unconsumed tail (a partial frame still arriving).
 * Comment/keepalive lines (starting with ":") are ignored. Tolerates CRLF.
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n")
  const frames: SseFrame[] = []
  let rest = normalized
  let sep = rest.indexOf("\n\n")
  while (sep !== -1) {
    const block = rest.slice(0, sep)
    rest = rest.slice(sep + 2)
    const frame: SseFrame = { data: "" }
    const dataLines: string[] = []
    for (const line of block.split("\n")) {
      if (line === "" || line.startsWith(":")) continue
      const c = line.indexOf(":")
      const field = c === -1 ? line : line.slice(0, c)
      let val = c === -1 ? "" : line.slice(c + 1)
      if (val.startsWith(" ")) val = val.slice(1)
      if (field === "id") frame.id = val
      else if (field === "event") frame.event = val
      else if (field === "data") dataLines.push(val)
    }
    frame.data = dataLines.join("\n")
    if (frame.event !== undefined || frame.data !== "") frames.push(frame)
    sep = rest.indexOf("\n\n")
  }
  return { frames, rest }
}

function parseData(data: string): Record<string, unknown> {
  if (!data) return {}
  try {
    const v = JSON.parse(data)
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Map a raw frame to a typed ChatStreamEvent. Payloads are camelCase (finagent v2). */
export function toChatEvent(frame: SseFrame): ChatStreamEvent {
  const ev = frame.event ?? "message"
  const p = parseData(frame.data)
  switch (ev) {
    case "text-delta":
      return { type: "text-delta", text: typeof p.text === "string" ? p.text : "" }
    case "tool-start":
      return { type: "tool-start", toolUseId: String(p.toolUseId ?? ""), tool: String(p.tool ?? ""), input: p.input }
    case "tool-end":
      return {
        type: "tool-end",
        toolUseId: String(p.toolUseId ?? ""),
        tool: String(p.tool ?? ""),
        result: p.result,
        isError: Boolean(p.isError),
      }
    case "approval-required":
      return {
        type: "approval-required",
        toolUseId: String(p.toolUseId ?? ""),
        tool: String(p.tool ?? ""),
        input: p.input,
      }
    case "finish":
      return {
        type: "finish",
        stopReason: typeof p.stopReason === "string" ? p.stopReason : "",
        usage: p.usage as { inputTokens: number; outputTokens: number } | undefined,
      }
    case "error":
      return { type: "error", code: String(p.code ?? "error"), message: String(p.message ?? "") }
    case "done":
      return { type: "done" }
    case "workflow": {
      const w = p as { name?: string; title?: string; version?: number; performance?: number }
      return {
        type: "workflow",
        name: typeof w.name === "string" ? w.name : "",
        title: typeof w.title === "string" ? w.title : "",
        version: typeof w.version === "number" ? w.version : 0,
        performance: typeof w.performance === "number" ? w.performance : 0,
      }
    }
    default:
      return { type: "passthrough", event: ev, data: p }
  }
}
