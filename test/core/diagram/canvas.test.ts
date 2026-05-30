import { describe, expect, test } from "bun:test"
import { Canvas } from "@core/diagram/canvas"

describe("Canvas", () => {
  test("a fresh canvas renders as empty (blank rows trimmed away)", () => {
    expect(new Canvas(4, 3).toString()).toBe("")
  })

  test("drawText places a string at the given column/row", () => {
    const c = new Canvas(6, 2)
    c.drawText(1, 0, "Hi")
    expect(c.toString()).toBe(" Hi")
  })

  test("drawBox draws a box-drawing rectangle border", () => {
    const c = new Canvas(4, 3)
    c.drawBox(0, 0, 4, 3)
    expect(c.toString()).toBe(["┌──┐", "│  │", "└──┘"].join("\n"))
  })

  test("toString trims trailing whitespace per line but keeps interior gaps", () => {
    const c = new Canvas(8, 1)
    c.drawText(0, 0, "a")
    c.drawText(4, 0, "b")
    expect(c.toString()).toBe("a   b")
  })

  test("hLine and vLine draw straight runs", () => {
    const c = new Canvas(3, 3)
    c.hLine(0, 0, 3)
    c.vLine(0, 1, 2)
    expect(c.toString()).toBe(["───", "│", "│"].join("\n"))
  })

  test("out-of-bounds writes are clipped, never throw", () => {
    const c = new Canvas(2, 2)
    expect(() => c.drawText(1, 0, "long")).not.toThrow()
    expect(() => c.drawText(-3, -1, "x")).not.toThrow()
    expect(() => c.set(99, 99, "z")).not.toThrow()
    expect(c.toString()).toBe(" l")
  })

  test("reports its dimensions", () => {
    const c = new Canvas(7, 4)
    expect(c.width).toBe(7)
    expect(c.height).toBe(4)
  })
})
