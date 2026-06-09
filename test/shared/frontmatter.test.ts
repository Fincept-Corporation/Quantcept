import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "@shared/frontmatter"

describe("parseFrontmatter", () => {
  test("no fence → empty data, body is the whole content", () => {
    expect(parseFrontmatter("no frontmatter at all")).toEqual({ data: {}, body: "no frontmatter at all" })
  })

  test("scalar key:value pairs", () => {
    const { data, body } = parseFrontmatter("---\nname: hi\ndescription: a thing\n---\nbody")
    expect(data).toEqual({ name: "hi", description: "a thing" })
    expect(body).toBe("body")
  })

  test("strips surrounding single/double quotes from scalars", () => {
    const { data } = parseFrontmatter('---\nname: "hi"\nlabel: \'yo\'\n---\nB')
    expect(data).toEqual({ name: "hi", label: "yo" })
  })

  test("CRLF line endings (Windows-authored files)", () => {
    const { data, body } = parseFrontmatter("---\r\nname: crlf\r\ndescription: works\r\n---\r\nBody line\r\n")
    expect(data).toEqual({ name: "crlf", description: "works" })
    expect(body).toBe("Body line\n") // body returned verbatim; callers trim
  })

  test("inline array → string[] (quotes stripped, empties dropped)", () => {
    const { data } = parseFrontmatter("---\nname: x\nallowedTools: [calculator, read]\n---\nB")
    expect(data.allowedTools).toEqual(["calculator", "read"])
  })

  test("YAML block list → string[]", () => {
    const { data } = parseFrontmatter("---\nname: x\nallowedTools:\n  - calculator\n  - write\n---\nB")
    expect(data.allowedTools).toEqual(["calculator", "write"])
  })

  test("folded scalar (empty value + indented continuation) joins with spaces", () => {
    const { data } = parseFrontmatter("---\ndescription:\n  Line one of the description\n  and line two continues here.\n---\nB")
    expect(data.description).toBe("Line one of the description and line two continues here.")
  })

  test("nested mapping folds into its parent and does NOT leak child keys", () => {
    const { data } = parseFrontmatter(
      "---\nname: withmeta\ndescription: A real description\nmetadata:\n  author: someone\n  version: '1.0.0'\n---\nBody",
    )
    expect(data.name).toBe("withmeta")
    expect(data.description).toBe("A real description")
    expect(data.author).toBeUndefined() // child of metadata, not a top-level key
    expect(data.version).toBeUndefined()
  })

  test("bare key with no value → empty string (adapters drop these when they want 'absent')", () => {
    const { data } = parseFrontmatter("---\nname: x\nmodel:\n---\nB")
    expect(data.model).toBe("")
    expect(data.name).toBe("x")
  })
})
