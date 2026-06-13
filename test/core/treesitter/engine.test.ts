import { describe, expect, test } from "bun:test"
import { freeTree, parse, query, queryMatches, spanOf, usingTree, withParse } from "@core/treesitter/engine"
import type { Lang } from "@core/treesitter/types"
import { addLogSink, resetLogFloor, setLogFloor } from "@shared/logger"

describe("treesitter engine", () => {
  test("parse + query returns captures with byte spans, in document order", async () => {
    const tree = await parse("git push && rm -rf dist", "bash")
    expect(tree).not.toBeNull()
    const caps = query(tree, "(command (command_name) @name)", "bash")
    expect(caps.map((c) => c.span.text)).toEqual(["git", "rm"])
    expect(caps[0].span.byteStart).toBe(0)
    expect(caps[0].span.byteEnd).toBe(3)
    expect(caps[1].span.byteStart).toBe(12)
  })

  test("spanOf yields row/col across lines", async () => {
    const tree = await parse("ls\nrm x", "bash")
    const caps = query(tree!, "(command (command_name) @n)", "bash")
    expect(caps[1].span.startRow).toBe(1)
    expect(caps[1].span.startCol).toBe(0)
    expect(spanOf(caps[1].node).text).toBe("rm")
  })

  test("an invalid query returns [] rather than throwing", async () => {
    const tree = await parse("ls", "bash")
    expect(query(tree!, "((((", "bash")).toEqual([])
  })

  test("queryMatches groups captures per match", async () => {
    const tree = await parse("git push", "bash")
    const m = queryMatches(tree!, "(command name: (command_name) @name) @cmd", "bash")
    expect(m.length).toBe(1)
    expect(m[0].captures.map((c) => c.name).sort()).toEqual(["cmd", "name"])
  })

  test("freeTree calls the tree's delete() to release the wasm allocation", () => {
    let deleted = 0
    freeTree({ delete: () => deleted++ })
    expect(deleted).toBe(1)
  })

  test("freeTree tolerates null and trees without delete()", () => {
    expect(() => freeTree(null)).not.toThrow()
    expect(() => freeTree({})).not.toThrow()
  })

  test("a real parsed tree can be freed without throwing", async () => {
    const tree = await parse("ls", "bash")
    expect(() => freeTree(tree)).not.toThrow()
  })

  test("usingTree runs fn and frees the tree", () => {
    let deleted = 0
    const tree = { delete: () => deleted++, marker: "T" }
    expect(usingTree(tree, (t) => t.marker)).toBe("T")
    expect(deleted).toBe(1)
  })

  test("usingTree frees the tree even when fn throws", () => {
    let deleted = 0
    const tree = { delete: () => deleted++ }
    expect(() => usingTree(tree, () => {
        throw new Error("boom")
      }),
    ).toThrow("boom")
    expect(deleted).toBe(1)
  })

  test("withParse passes a usable tree to fn and frees it", async () => {
    const names = await withParse("git push", "bash", (t) =>
      query(t, "(command (command_name) @n)", "bash").map((c) => c.span.text),
    )
    expect(names).toEqual(["git"])
  })

  test("withParse returns null when parsing fails (unknown language)", async () => {
    let ran = false
    const out = await withParse("x = 1", "ruby" as Lang, () => {
      ran = true
      return "ran"
    })
    expect(out).toBeNull()
    expect(ran).toBe(false)
  })

  test("a malformed query logs a warning, not just a silent []", async () => {
    const records: Array<Record<string, unknown>> = []
    const remove = addLogSink((r) => records.push(r))
    setLogFloor("error") // keep stderr quiet; the sink still captures
    const tree = await parse("ls", "bash")
    const caps = query(tree!, "((((", "bash")
    freeTree(tree)
    resetLogFloor()
    remove()
    expect(caps).toEqual([])
    expect(records.some((r) => r.level === "warn" && String(r.msg).includes("query"))).toBe(true)
  })

  test("a parse failure logs a warning and returns null", async () => {
    const records: Array<Record<string, unknown>> = []
    const remove = addLogSink((r) => records.push(r))
    setLogFloor("error")
    const tree = await parse("x = 1", "ruby" as Lang)
    resetLogFloor()
    remove()
    expect(tree).toBeNull()
    expect(records.some((r) => r.level === "warn" && String(r.msg).includes("parse"))).toBe(true)
  })
})
