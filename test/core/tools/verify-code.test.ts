import { describe, expect, test } from "bun:test"
import { VerifyCodeTool } from "@core/tools/builtin/VerifyCodeTool"

const ctx = { abort: new AbortController().signal, cwd: process.cwd() }

describe("VerifyCodeTool", () => {
  test("is read-only and named verify_code", () => {
    expect(VerifyCodeTool.name).toBe("verify_code")
    expect(VerifyCodeTool.isReadOnly({ code: "", lang: "python" })).toBe(true)
  })

  test("reports a bias and titles the count", async () => {
    const r = await VerifyCodeTool.call({ code: 'df["y"] = df["px"].shift(-1)', lang: "python" }, ctx)
    expect(String(r.output)).toContain("bias/lookahead-shift")
    expect(r.title).toContain("1")
    expect(r.isError).toBeFalsy()
  })

  test("clean code reports no issues", async () => {
    const r = await VerifyCodeTool.call({ code: "y = 1 + 1", lang: "python" }, ctx)
    expect(String(r.output)).toContain("No structural bias")
    expect(r.title).toBe("no issues")
  })
})
