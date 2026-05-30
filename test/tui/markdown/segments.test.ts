import { describe, expect, test } from "bun:test"
import { splitDiagramSegments } from "@tui/markdown/segments"

describe("splitDiagramSegments", () => {
  test("plain markdown is a single md segment", () => {
    const segs = splitDiagramSegments("Hello **world**")
    expect(segs).toEqual([{ kind: "md", text: "Hello **world**" }])
  })

  test("a closed qdiagram fence splits md / diagram / md in order", () => {
    const segs = splitDiagramSegments("before\n```qdiagram\ntype: flow\n[A] A\n```\nafter")
    expect(segs.map((s) => s.kind)).toEqual(["md", "diagram", "md"])
    const diagram = segs[1]
    expect(diagram).toMatchObject({ kind: "diagram", closed: true })
    if (diagram?.kind === "diagram") expect(diagram.body).toBe("type: flow\n[A] A")
  })

  test("an unclosed fence (mid-stream) yields a diagram segment marked not closed", () => {
    const segs = splitDiagramSegments("here:\n```qdiagram\ntype: flow\n[A] Al")
    expect(segs.map((s) => s.kind)).toEqual(["md", "diagram"])
    expect(segs[1]).toMatchObject({ kind: "diagram", closed: false })
  })

  test("once the stream has ended, an unterminated fence is treated as closed so it renders", () => {
    // Models (notably MiniMax) sometimes end a turn without a closing ```; the
    // diagram must still render instead of being stuck on the placeholder.
    const segs = splitDiagramSegments("```qdiagram\ntype: flow\n[A] A", { streamEnded: true })
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ kind: "diagram", closed: true })
  })

  test("a closed fence is closed regardless of streamEnded", () => {
    const segs = splitDiagramSegments("```qdiagram\ntype: stack\n[a] A\n```", { streamEnded: false })
    expect(segs[0]).toMatchObject({ kind: "diagram", closed: true })
  })

  test("an ordinary code fence is left inside the markdown, not treated as a diagram", () => {
    const content = "```python\nprint(1)\n```"
    const segs = splitDiagramSegments(content)
    expect(segs).toHaveLength(1)
    expect(segs[0]!.kind).toBe("md")
  })

  test("a diagram at the very start has no leading md segment", () => {
    const segs = splitDiagramSegments("```qdiagram\ntype: stack\n[a] A\n```")
    expect(segs.map((s) => s.kind)).toEqual(["diagram"])
  })

  test("whitespace-only gaps around fences do not produce empty md segments", () => {
    const segs = splitDiagramSegments("```qdiagram\ntype: stack\n[a] A\n```\n\n   \n")
    expect(segs.map((s) => s.kind)).toEqual(["diagram"])
  })

  test("handles two diagram blocks", () => {
    const segs = splitDiagramSegments("```qdiagram\ntype: stack\n[a] A\n```\nmid\n```qdiagram\ntype: tree\nA > B\n```")
    expect(segs.map((s) => s.kind)).toEqual(["diagram", "md", "diagram"])
  })
})
