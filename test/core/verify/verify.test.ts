import { describe, expect, test } from "bun:test"
import type { RulePack } from "@core/verify/types"
import { verify } from "@core/verify/verify"

const pack: RulePack = {
  id: "t",
  lang: "python",
  rules: [
    {
      ruleId: "t/shift-neg",
      severity: "error",
      message: "negative shift",
      scm: `(call
        function: (attribute attribute: (identifier) @m (#eq? @m "shift"))
        arguments: (argument_list (unary_operator "-" (integer)))) @hit`,
    },
  ],
}

describe("verify", () => {
  test("emits a diagnostic for a matching rule, with a span", async () => {
    const d = await verify("y = s.shift(-1)", "python", [pack])
    expect(d).toHaveLength(1)
    expect(d[0].ruleId).toBe("t/shift-neg")
    expect(d[0].severity).toBe("error")
    expect(d[0].span.text).toContain("shift(-1)")
  })

  test("no match yields no diagnostics", async () => {
    expect(await verify("y = s.shift(1)", "python", [pack])).toEqual([])
  })

  test("packs whose lang != target are skipped", async () => {
    expect(await verify("y = s.shift(-1)", "bash", [pack])).toEqual([])
  })
})
