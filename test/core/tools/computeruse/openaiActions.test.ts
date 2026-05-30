import { describe, expect, test } from "bun:test"
import { oaiActionToPrimitives } from "@core/tools/computeruse/openaiActions"

// identity coord mapping for tests (model image coords == physical)
const id = (x: number, y: number): [number, number] => [x, y]

describe("oaiActionToPrimitives (OpenAI computer action → sidecar primitives)", () => {
  test("screenshot → no primitives", () => {
    expect(oaiActionToPrimitives({ type: "screenshot" }, id)).toEqual([])
  })

  test("click → move then button click", () => {
    expect(oaiActionToPrimitives({ type: "click", button: "left", x: 10, y: 20 }, id)).toEqual([
      { kind: "move", x: 10, y: 20 },
      { kind: "button", button: "left", direction: "click" },
    ])
  })

  test("click defaults to left button", () => {
    expect(oaiActionToPrimitives({ type: "click", x: 1, y: 2 }, id)).toContainEqual({
      kind: "button",
      button: "left",
      direction: "click",
    })
  })

  test("right/middle buttons map through", () => {
    expect(oaiActionToPrimitives({ type: "click", button: "right", x: 1, y: 2 }, id)).toContainEqual({
      kind: "button",
      button: "right",
      direction: "click",
    })
  })

  test("click with modifier keys holds them around the click", () => {
    expect(oaiActionToPrimitives({ type: "click", button: "left", x: 5, y: 6, keys: ["SHIFT"] }, id)).toEqual([
      { kind: "key", key: "shift", direction: "press" },
      { kind: "move", x: 5, y: 6 },
      { kind: "button", button: "left", direction: "click" },
      { kind: "key", key: "shift", direction: "release" },
    ])
  })

  test("double_click → move then two clicks", () => {
    expect(oaiActionToPrimitives({ type: "double_click", x: 3, y: 4 }, id)).toEqual([
      { kind: "move", x: 3, y: 4 },
      { kind: "button", button: "left", direction: "click" },
      { kind: "button", button: "left", direction: "click" },
    ])
  })

  test("type → text primitive", () => {
    expect(oaiActionToPrimitives({ type: "type", text: "hi" }, id)).toEqual([{ kind: "text", text: "hi" }])
  })

  test("keypress chord → press all, release reverse, with key normalization", () => {
    expect(oaiActionToPrimitives({ type: "keypress", keys: ["CTRL", "A"] }, id)).toEqual([
      { kind: "key", key: "ctrl", direction: "press" },
      { kind: "key", key: "a", direction: "press" },
      { kind: "key", key: "a", direction: "release" },
      { kind: "key", key: "ctrl", direction: "release" },
    ])
  })

  test("keypress single ENTER → press+release as 'enter'", () => {
    expect(oaiActionToPrimitives({ type: "keypress", keys: ["ENTER"] }, id)).toEqual([
      { kind: "key", key: "enter", direction: "press" },
      { kind: "key", key: "enter", direction: "release" },
    ])
  })

  test("keypress normalizes ARROWDOWN → down", () => {
    expect(oaiActionToPrimitives({ type: "keypress", keys: ["ARROWDOWN"] }, id)).toEqual([
      { kind: "key", key: "down", direction: "press" },
      { kind: "key", key: "down", direction: "release" },
    ])
  })

  test("scroll → move then signed scroll on non-zero axes", () => {
    expect(oaiActionToPrimitives({ type: "scroll", x: 4, y: 4, scrollY: 3 }, id)).toEqual([
      { kind: "move", x: 4, y: 4 },
      { kind: "scroll", axis: "vertical", amount: 3 },
    ])
  })

  test("move → move only", () => {
    expect(oaiActionToPrimitives({ type: "move", x: 7, y: 8 }, id)).toEqual([{ kind: "move", x: 7, y: 8 }])
  })

  test("drag → press at first point, move through path, release", () => {
    expect(
      oaiActionToPrimitives({ type: "drag", path: [[0, 0], { x: 10, y: 10 }] }, id),
    ).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "button", button: "left", direction: "press" },
      { kind: "move", x: 10, y: 10 },
      { kind: "button", button: "left", direction: "release" },
    ])
  })

  test("coordinate mapper is applied", () => {
    const toPhys = (x: number, y: number): [number, number] => [x + 100, y + 200]
    expect(oaiActionToPrimitives({ type: "click", x: 1, y: 2 }, toPhys)).toContainEqual({ kind: "move", x: 101, y: 202 })
  })
})
