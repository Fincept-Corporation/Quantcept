import { describe, expect, test } from "bun:test"
import { parseLoopbackCallback, startLoopbackCapture } from "@core/mcp/auth/loopback"

describe("parseLoopbackCallback", () => {
  test("returns the code on a matching callback", () => {
    expect(parseLoopbackCallback("/callback?code=abc123&state=s1", "/callback", "s1")).toEqual({
      kind: "code",
      code: "abc123",
    })
  })

  test("ignores requests to other paths", () => {
    expect(parseLoopbackCallback("/favicon.ico", "/callback")).toEqual({ kind: "ignore" })
  })

  test("reports an OAuth error param", () => {
    const out = parseLoopbackCallback("/callback?error=access_denied", "/callback")
    expect(out.kind).toBe("error")
    if (out.kind === "error") expect(out.message).toContain("access_denied")
  })

  test("reports a state mismatch", () => {
    const out = parseLoopbackCallback("/callback?code=abc&state=wrong", "/callback", "expected")
    expect(out.kind).toBe("error")
    if (out.kind === "error") expect(out.message).toContain("state mismatch")
  })

  test("does not enforce state when none is expected", () => {
    expect(parseLoopbackCallback("/callback?code=abc", "/callback")).toEqual({ kind: "code", code: "abc" })
  })

  test("reports a missing code", () => {
    const out = parseLoopbackCallback("/callback?state=s1", "/callback", "s1")
    expect(out.kind).toBe("error")
    if (out.kind === "error") expect(out.message).toContain("No authorization code")
  })

  test("parses absolute request URLs too", () => {
    expect(parseLoopbackCallback("http://127.0.0.1:5000/callback?code=z", "/callback")).toEqual({
      kind: "code",
      code: "z",
    })
  })
})

describe("startLoopbackCapture", () => {
  test("exposes a 127.0.0.1 redirect URI and times out without a callback", async () => {
    const cap = startLoopbackCapture({ timeoutMs: 50 })
    expect(cap.redirectUri).toContain("127.0.0.1")
    expect(cap.redirectUri).toContain("/callback")
    await expect(cap.waitForCode()).rejects.toThrow(/timed out/)
  })
})
