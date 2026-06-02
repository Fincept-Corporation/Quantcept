import { describe, expect, test } from "bun:test"
import { quantBiasPack } from "@core/codecheck/packs/quant-bias"
import { verify } from "@core/codecheck/verify"

const ids = async (code: string) => (await verify(code, "python", [quantBiasPack])).map((d) => d.ruleId)

describe("quant-bias pack", () => {
  test("lookahead-shift: catches .shift(-1)", async () => {
    expect(await ids('df["y"] = df["px"].shift(-1)')).toContain("bias/lookahead-shift")
  })

  test("lookahead-shift: ignores .shift(1) and .shift(+1)", async () => {
    expect(await ids('df["y"] = df["px"].shift(1)')).not.toContain("bias/lookahead-shift")
    expect(await ids('df["y"] = df["px"].shift(+1)')).not.toContain("bias/lookahead-shift")
  })

  test("future-index: catches series[i+1] and df.iloc[i+1:]", async () => {
    expect(await ids("x = series[i + 1]")).toContain("bias/future-index")
    expect(await ids("x = df.iloc[i + 1 :]")).toContain("bias/future-index")
  })

  test("future-index: ignores series[i-1] and series[i]", async () => {
    expect(await ids("x = series[i - 1]")).not.toContain("bias/future-index")
    expect(await ids("x = series[i]")).not.toContain("bias/future-index")
  })

  test("fit-before-split: flags fit(X) preceding train_test_split(X)", async () => {
    expect(await ids("scaler.fit(X)\nX_tr, X_te = train_test_split(X)")).toContain("bias/fit-before-split")
  })

  test("fit-before-split: clean when args differ or order is correct", async () => {
    expect(await ids("scaler.fit(A)\nX_tr, X_te = train_test_split(B)")).not.toContain("bias/fit-before-split")
    expect(await ids("X_tr, X_te = train_test_split(X)\nscaler.fit(X_tr)")).not.toContain("bias/fit-before-split")
  })

  test("each diagnostic carries a span and a fix hint", async () => {
    const d = await verify('df["y"] = df["px"].shift(-1)', "python", [quantBiasPack])
    expect(d[0].span.text).toContain("shift(-1)")
    expect(d[0].fixHint).toBeTruthy()
  })
})
