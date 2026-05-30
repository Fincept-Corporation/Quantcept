import { describe, expect, test } from "bun:test"
import { createComputerUseTool } from "@core/tools/computeruse/ComputerUseTool"
import type { SidecarClient } from "@core/tools/computeruse/sidecarClient"
import type { SidecarRequest, SidecarResponse } from "@core/tools/computeruse/protocol"

function fakeClient(handler: (req: Omit<SidecarRequest, "id">) => SidecarResponse) {
  const sent: Array<Omit<SidecarRequest, "id">> = []
  const released = { count: 0 }
  const client: SidecarClient = {
    async send(req) {
      sent.push(req)
      return handler(req)
    },
    async releaseAll() {
      released.count++
    },
    async dispose() {},
  }
  return { client, sent, released }
}

const ctx = { abort: new AbortController().signal, cwd: "/" }
// biome-ignore lint/suspicious/noExplicitAny: tests construct minimal action inputs
const a = (action: string, extra: Record<string, unknown> = {}) => ({ action, ...extra }) as any

describe("ComputerUseTool", () => {
  test("screenshot/cursor_position are read-only; input actions are destructive", () => {
    const { client } = fakeClient(() => ({ id: 0 }))
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    expect(tool.isReadOnly(a("screenshot"))).toBe(true)
    expect(tool.isReadOnly(a("cursor_position"))).toBe(true)
    expect(tool.isReadOnly(a("left_click"))).toBe(false)
    expect(tool.isDestructive(a("type"))).toBe(true)
    expect(tool.isDestructive(a("screenshot"))).toBe(false)
  })

  test("permissionPatterns: read-only and normal input actions emit none (full-auto)", () => {
    const { client } = fakeClient(() => ({ id: 0 }))
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    expect(tool.permissionPatterns?.(a("screenshot"))).toEqual([])
    expect(tool.permissionPatterns?.(a("cursor_position"))).toEqual([])
    expect(tool.permissionPatterns?.(a("left_click", { coordinate: [1, 1] }))).toEqual([])
    expect(tool.permissionPatterns?.(a("type", { text: "x" }))).toEqual([])
  })

  test("permissionPatterns emits computeruse:money once a money-moving window is in view (tripwire)", async () => {
    const { client } = fakeClient((req) =>
      req.capture
        ? {
            id: 0,
            windowTitle: "Place Order — MyBroker",
            screenshot: { data: "B", width: 1024, height: 768, originalWidth: 1024, originalHeight: 768 },
          }
        : { id: 0 },
    )
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    expect(tool.permissionPatterns?.(a("left_click", { coordinate: [1, 1] }))).toEqual([]) // no window seen yet
    await tool.call(a("screenshot"), ctx)
    expect(tool.permissionPatterns?.(a("left_click", { coordinate: [1, 1] }))).toEqual(["computeruse:money"])
  })

  test("disabling the tripwire keeps full-auto even on a money window", async () => {
    const { client } = fakeClient(() => ({
      id: 0,
      windowTitle: "Confirm Wire Transfer",
      screenshot: { data: "B", width: 10, height: 10, originalWidth: 10, originalHeight: 10 },
    }))
    const tool = createComputerUseTool({
      client,
      captureLimits: { maxLongEdge: 1024 },
      tripwire: { enabled: false, patterns: [] },
    })
    await tool.call(a("screenshot"), ctx)
    expect(tool.permissionPatterns?.(a("left_click", { coordinate: [1, 1] }))).toEqual([])
  })

  test("suppresses the screenshot when the focused window is sensitive (redaction)", async () => {
    const { client } = fakeClient(() => ({
      id: 0,
      windowTitle: "Quantcept .env",
      screenshot: { data: "SECRET", width: 10, height: 10, originalWidth: 10, originalHeight: 10 },
    }))
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    const r = await tool.call(a("screenshot"), ctx)
    expect(r.image).toBeUndefined()
    expect(String(r.output).toLowerCase()).toContain("suppress")
  })

  test("clicks a Set-of-Marks number at its physical center, bypassing coordinate scaling", async () => {
    const { client, sent } = fakeClient((req) =>
      req.capture
        ? {
            id: 0,
            screenshot: { data: "B", width: 1024, height: 576, originalWidth: 1920, originalHeight: 1080 },
            elements: [{ mark: 5, x: 640, y: 360, label: "" }],
          }
        : { id: 0 },
    )
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    await tool.call(a("screenshot"), ctx) // establishes the mark map
    await tool.call(a("left_click", { mark: 5 }), ctx)
    const clickReq = sent[sent.length - 1]
    expect(clickReq?.actions).toEqual([
      { kind: "move", x: 640, y: 360 },
      { kind: "button", button: "left", direction: "click" },
    ])
  })

  test("requests marks on every capture", async () => {
    const { client, sent } = fakeClient(() => ({ id: 0, screenshot: { data: "B", width: 10, height: 10, originalWidth: 10, originalHeight: 10 } }))
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    await tool.call(a("screenshot"), ctx)
    expect(sent[0]?.capture).toEqual({ maxLongEdge: 1024, marks: true })
  })

  test("invokes the audit callback for each action", async () => {
    const lines: string[] = []
    const { client } = fakeClient(() => ({ id: 0, cursor: [0, 0] }))
    const tool = createComputerUseTool({
      client,
      captureLimits: { maxLongEdge: 1024 },
      onAudit: (l) => lines.push(l),
    })
    await tool.call(a("left_click", { coordinate: [5, 6] }), ctx)
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain("left_click")
  })

  test("screenshot sends an empty action batch with capture limits and returns the image", async () => {
    const { client, sent } = fakeClient(() => ({
      id: 0,
      screenshot: { data: "B64", width: 1024, height: 768, originalWidth: 2048, originalHeight: 1536 },
    }))
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    const r = await tool.call(a("screenshot"), ctx)
    expect(sent[0]).toEqual({ actions: [], capture: { maxLongEdge: 1024, marks: true } })
    expect(r.image).toEqual({ mediaType: "image/png", data: "B64" })
    expect(r.isError).toBeFalsy()
  })

  test("click coordinates are scaled from model space to physical pixels using the last screenshot scale", async () => {
    let lastReq: Omit<SidecarRequest, "id"> | undefined
    const { client } = fakeClient((req) => {
      lastReq = req
      return { id: 0, screenshot: { data: "B", width: 1024, height: 768, originalWidth: 2048, originalHeight: 1536 } }
    })
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    await tool.call(a("screenshot"), ctx) // establishes scaleFactor = 1024/2048 = 0.5
    await tool.call(a("left_click", { coordinate: [100, 100] }), ctx)
    expect(lastReq?.actions).toEqual([
      { kind: "move", x: 200, y: 200 },
      { kind: "button", button: "left", direction: "click" },
    ])
  })

  test("returns isError when the sidecar reports an error", async () => {
    const { client } = fakeClient(() => ({ id: 0, error: "no display" }))
    const tool = createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 } })
    const r = await tool.call(a("left_click", { coordinate: [1, 1] }), ctx)
    expect(r.isError).toBe(true)
    expect(String(r.output)).toContain("no display")
  })
})
