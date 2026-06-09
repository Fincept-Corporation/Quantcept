import { describe, expect, test } from "bun:test"
import { freeTree, parse, query, queryMatches, spanOf } from "@core/treesitter/engine"

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
})
