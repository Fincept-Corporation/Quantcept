import { describe, expect, test } from "bun:test"
import { grammarWasm, runtimeWasm } from "@core/treesitter/grammars"

describe("grammar wasm registry", () => {
  test("each grammar resolves to an existing .wasm file", async () => {
    for (const lang of ["bash", "powershell", "python"] as const) {
      const url = grammarWasm(lang)
      expect(url.endsWith(".wasm")).toBe(true)
      expect(await Bun.file(url).exists()).toBe(true)
    }
  })

  test("the web-tree-sitter runtime wasm exists", async () => {
    expect(runtimeWasm.endsWith(".wasm")).toBe(true)
    expect(await Bun.file(runtimeWasm).exists()).toBe(true)
  })
})
