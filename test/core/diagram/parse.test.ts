import { describe, expect, test } from "bun:test"
import { DiagramError, parseDiagram } from "@core/diagram/parse"

describe("parseDiagram", () => {
  test("parses type, title, direction, nodes and a labeled edge", () => {
    const spec = parseDiagram(`
      type: flow
      title: ETF Creation
      direction: lr
      [AP] Authorized Participant
      [ETF] ETF Sponsor
      AP -> ETF : deliver basket
    `)
    expect(spec.type).toBe("flow")
    expect(spec.title).toBe("ETF Creation")
    expect(spec.direction).toBe("lr")
    expect(spec.nodes).toEqual([
      { id: "AP", label: "Authorized Participant" },
      { id: "ETF", label: "ETF Sponsor" },
    ])
    expect(spec.edges).toEqual([{ from: "AP", to: "ETF", dir: "->", label: "deliver basket" }])
  })

  test("direction defaults to tb (vertical reads cleaner for descriptive flows)", () => {
    expect(parseDiagram("type: flow").direction).toBe("tb")
    expect(parseDiagram("type: tree").direction).toBe("tb")
  })

  test("note directives — with or without a colon — become caption notes", () => {
    expect(parseDiagram("type: flow\nnote: arbitrage closes the gap").notes).toEqual(["arbitrage closes the gap"])
    expect(parseDiagram("type: flow\nnote AP sells if premium exists").notes).toEqual(["AP sells if premium exists"])
  })

  test("skips comment and blank lines", () => {
    const spec = parseDiagram("# title comment\n\ntype: stack\n\n[a] A\n")
    expect(spec.type).toBe("stack")
    expect(spec.nodes).toHaveLength(1)
  })

  test("a node with no label falls back to its id", () => {
    expect(parseDiagram("type: flow\n[X]").nodes[0]).toEqual({ id: "X", label: "X" })
  })

  test("supports all four edge operators", () => {
    const spec = parseDiagram("type: flow\nA -> B\nB <- C\nC <-> D\nD -- E")
    expect(spec.edges.map((e) => e.dir)).toEqual(["->", "<-", "<->", "--"])
  })

  test("tree '>' is parsed as a parent->child edge", () => {
    const spec = parseDiagram("type: tree\nRoot > Child")
    expect(spec.edges[0]).toEqual({ from: "Root", to: "Child", dir: "->" })
  })

  test("taccount left/right rows become sided nodes with optional value", () => {
    const spec = parseDiagram("type: taccount\nleft: Cash | 100\nright: Debt")
    expect(spec.nodes[0]).toMatchObject({ side: "left", label: "Cash", value: "100" })
    expect(spec.nodes[1]).toMatchObject({ side: "right", label: "Debt", value: undefined })
  })

  test("missing type throws DiagramError", () => {
    expect(() => parseDiagram("[a] A")).toThrow(DiagramError)
  })

  test("unknown type throws DiagramError carrying the line number", () => {
    try {
      parseDiagram("type: pie")
      throw new Error("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(DiagramError)
      expect((e as DiagramError).line).toBe(1)
    }
  })

  test("an unrecognized line is skipped, not fatal (one stray line can't nuke the diagram)", () => {
    expect(() => parseDiagram("type: flow\nthis is just stray prose")).not.toThrow()
    const spec = parseDiagram("type: flow\nthis is just stray prose\n[A] A")
    expect(spec.nodes).toEqual([{ id: "A", label: "A" }])
  })
})
