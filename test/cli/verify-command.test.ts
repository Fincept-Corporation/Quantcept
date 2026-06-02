import { describe, expect, test } from "bun:test"
import { verifyText } from "@cli/verify-command"

describe("verifyText", () => {
  test("returns formatted diagnostics for biased python", async () => {
    const out = await verifyText('df["y"] = df["px"].shift(-1)')
    expect(out).toContain("bias/lookahead-shift")
  })

  test("returns the no-issues message for clean code", async () => {
    expect(await verifyText("y = 1")).toContain("No structural bias")
  })
})
