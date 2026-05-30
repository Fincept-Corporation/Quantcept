import { describe, expect, test } from "bun:test"
import { openBrowser } from "@core/mcp/auth/browser"

describe("openBrowser", () => {
  test("returns true and spawns a command for the url", async () => {
    let cmd: string[] | undefined
    const ok = await openBrowser("https://example.com/auth", (c) => {
      cmd = c
      return { exited: Promise.resolve(0) }
    })
    expect(ok).toBe(true)
    expect(cmd?.some((part) => part.includes("example.com"))).toBe(true)
  })

  test("returns false when spawning throws (headless fallback)", async () => {
    const ok = await openBrowser("https://example.com/auth", () => {
      throw new Error("no browser")
    })
    expect(ok).toBe(false)
  })
})
