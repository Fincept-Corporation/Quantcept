import { describe, expect, test } from "bun:test"
import { renderDiagram } from "@core/diagram/render"

describe("renderDiagram — totality & errors", () => {
  test("never throws, even on garbage input", () => {
    expect(() => renderDiagram("@#$%^&*(")).not.toThrow()
    expect(renderDiagram("@#$%^&*(").isError).toBe(true)
  })

  test("an unknown type renders an error box naming the problem", () => {
    const a = renderDiagram("type: pie")
    expect(a.isError).toBe(true)
    expect(a.text.toLowerCase()).toContain("error")
    expect(a.text).toContain("pie")
  })

  test("a valid but empty diagram is not an error", () => {
    expect(renderDiagram("type: stack").isError).toBe(false)
  })
})

describe("renderDiagram — flow", () => {
  test("vertical flow (tb) stacks boxes joined by a down-arrow connector", () => {
    const a = renderDiagram("type: flow\ndirection: tb\n[A] Alpha\n[B] Beta\nA -> B : passes")
    expect(a.isError).toBe(false)
    expect(a.text).toContain("Alpha")
    expect(a.text).toContain("Beta")
    expect(a.text).toContain("┌")
    expect(a.text).toContain("▼")
    expect(a.text).toContain("passes")
  })

  test("horizontal flow (lr) uses a right-arrow connector", () => {
    const a = renderDiagram("type: flow\ndirection: lr\n[A] Alpha\n[B] Beta\nA -> B")
    expect(a.text).toContain("▶")
  })

  test("a reverse edge draws the arrowhead the other way", () => {
    expect(renderDiagram("type: flow\ndirection: tb\n[A] A\n[B] B\nA <- B").text).toContain("▲")
  })

  test("flow defaults to vertical (tb) with a down-arrow connector", () => {
    expect(renderDiagram("type: flow\n[A] A\n[B] B\nA -> B").text).toContain("▼")
  })

  test("long node labels wrap so boxes stay modular instead of overflowing", () => {
    const a = renderDiagram(
      "type: flow\ndirection: tb\n[A] Authorized Participant delivers the underlying basket\n[B] ETF Sponsor",
    )
    expect(Math.max(...a.text.split("\n").map((l) => l.length))).toBeLessThanOrEqual(34)
    expect(a.text).toContain("Authorized")
    expect(a.text).toContain("basket")
  })

  test("notes render as caption lines beneath the diagram", () => {
    const a = renderDiagram("type: flow\n[A] A\n[B] B\nA -> B\nnote keep it simple")
    expect(a.isError).toBe(false)
    expect(a.text).toContain("keep it simple")
  })
})

describe("renderDiagram — stack", () => {
  test("renders tranches top-to-bottom in declared order with dividers", () => {
    const a = renderDiagram("type: stack\n[s] Senior\n[m] Mezzanine\n[e] Equity")
    expect(a.text).toContain("├")
    expect(a.text.indexOf("Senior")).toBeLessThan(a.text.indexOf("Mezzanine"))
    expect(a.text.indexOf("Mezzanine")).toBeLessThan(a.text.indexOf("Equity"))
  })
})

describe("renderDiagram — tree", () => {
  test("renders an indented hierarchy with branch connectors", () => {
    const a = renderDiagram("type: tree\nEnterprise Value > PV of FCF\nEnterprise Value > Terminal Value")
    expect(a.text).toContain("Enterprise Value")
    expect(a.text).toContain("├─")
    expect(a.text).toContain("└─")
    expect(a.text.indexOf("Enterprise Value")).toBeLessThan(a.text.indexOf("PV of FCF"))
  })

  test("does not loop forever on a cycle", () => {
    expect(() => renderDiagram("type: tree\nA > B\nB > A")).not.toThrow()
  })
})

describe("renderDiagram — taccount", () => {
  test("renders two columns with values and a center divider", () => {
    const a = renderDiagram("type: taccount\ntitle: Balance Sheet\nleft: Cash | 100\nright: Debt | 60")
    expect(a.text).toContain("Balance Sheet")
    expect(a.text).toContain("Cash")
    expect(a.text).toContain("100")
    expect(a.text).toContain("Debt")
    expect(a.text).toContain("┬")
  })
})
