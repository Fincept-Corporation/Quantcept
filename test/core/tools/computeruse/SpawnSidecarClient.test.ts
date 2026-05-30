import { describe, expect, test } from "bun:test"
import path from "node:path"
import { SpawnSidecarClient } from "@core/tools/computeruse/SpawnSidecarClient"

const FAKE = path.join(import.meta.dir, "fixtures", "fake-sidecar.ts")
const bun = process.execPath

describe("SpawnSidecarClient (integration vs fake sidecar)", () => {
  test("sends a capture request and receives the screenshot", async () => {
    const c = new SpawnSidecarClient(bun, [FAKE])
    const res = await c.send({ actions: [], capture: { maxLongEdge: 1024 } })
    expect(res.screenshot?.data).toBe("FAKEPNG")
    await c.dispose()
  })

  test("correlates concurrent requests to the right responses by id", async () => {
    const c = new SpawnSidecarClient(bun, [FAKE])
    const [a, b] = await Promise.all([
      c.send({ actions: [{ kind: "move", x: 1, y: 1 }] }),
      c.send({
        actions: [
          { kind: "move", x: 1, y: 1 },
          { kind: "button", button: "left", direction: "click" },
        ],
      }),
    ])
    expect(a.cursor).toEqual([1, 0])
    expect(b.cursor).toEqual([2, 0])
    await c.dispose()
  })

  test("releaseAll round-trips a control message without throwing", async () => {
    const c = new SpawnSidecarClient(bun, [FAKE])
    await c.releaseAll()
    await c.dispose()
  })

  test("send rejects after the configured timeout when the sidecar never answers", async () => {
    // point at a process that produces no stdout responses (sleeps), with a tiny timeout
    const c = new SpawnSidecarClient(bun, ["-e", "setTimeout(() => {}, 3000)"], { timeoutMs: 80 })
    await expect(c.send({ actions: [] })).rejects.toThrow(/timed out/)
    await c.dispose()
  })
})
