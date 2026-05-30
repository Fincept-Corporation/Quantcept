import { describe, expect, test } from "bun:test"
import { composeAction } from "@core/tools/computeruse/compose"

// composeAction receives coordinates already scaled to PHYSICAL pixels.
describe("computer-use verb composition", () => {
  test("screenshot -> capture only", () => {
    expect(composeAction({ action: "screenshot" })).toEqual({ primitives: [], capture: true })
  })

  test("cursor_position -> no primitives, no capture", () => {
    expect(composeAction({ action: "cursor_position" })).toEqual({ primitives: [], capture: false })
  })

  test("left_click -> move then click", () => {
    expect(composeAction({ action: "left_click", coordinate: [100, 200] })).toEqual({
      primitives: [
        { kind: "move", x: 100, y: 200 },
        { kind: "button", button: "left", direction: "click" },
      ],
      capture: true,
    })
  })

  test("double_click -> move then two clicks", () => {
    expect(composeAction({ action: "double_click", coordinate: [5, 6] })).toEqual({
      primitives: [
        { kind: "move", x: 5, y: 6 },
        { kind: "button", button: "left", direction: "click" },
        { kind: "button", button: "left", direction: "click" },
      ],
      capture: true,
    })
  })

  test("right_click and middle_click use the right button", () => {
    expect(composeAction({ action: "right_click", coordinate: [1, 2] }).primitives).toContainEqual({
      kind: "button",
      button: "right",
      direction: "click",
    })
    expect(composeAction({ action: "middle_click", coordinate: [1, 2] }).primitives).toContainEqual({
      kind: "button",
      button: "middle",
      direction: "click",
    })
  })

  test("mouse_move -> move only", () => {
    expect(composeAction({ action: "mouse_move", coordinate: [9, 9] })).toEqual({
      primitives: [{ kind: "move", x: 9, y: 9 }],
      capture: true,
    })
  })

  test("left_click_drag -> press at start, move to end, release", () => {
    expect(composeAction({ action: "left_click_drag", startCoordinate: [10, 10], coordinate: [50, 60] })).toEqual({
      primitives: [
        { kind: "move", x: 10, y: 10 },
        { kind: "button", button: "left", direction: "press" },
        { kind: "move", x: 50, y: 60 },
        { kind: "button", button: "left", direction: "release" },
      ],
      capture: true,
    })
  })

  test("type -> text primitive", () => {
    expect(composeAction({ action: "type", text: "hi" })).toEqual({
      primitives: [{ kind: "text", text: "hi" }],
      capture: true,
    })
  })

  test("single key -> click", () => {
    expect(composeAction({ action: "key", text: "Return" })).toEqual({
      primitives: [{ kind: "key", key: "Return", direction: "click" }],
      capture: true,
    })
  })

  test("key chord -> modifier held around the final key", () => {
    expect(composeAction({ action: "key", text: "ctrl+s" })).toEqual({
      primitives: [
        { kind: "key", key: "ctrl", direction: "press" },
        { kind: "key", key: "s", direction: "click" },
        { kind: "key", key: "ctrl", direction: "release" },
      ],
      capture: true,
    })
  })

  test("multi-modifier chord releases modifiers in reverse order", () => {
    expect(composeAction({ action: "key", text: "ctrl+shift+s" }).primitives).toEqual([
      { kind: "key", key: "ctrl", direction: "press" },
      { kind: "key", key: "shift", direction: "press" },
      { kind: "key", key: "s", direction: "click" },
      { kind: "key", key: "shift", direction: "release" },
      { kind: "key", key: "ctrl", direction: "release" },
    ])
  })

  test("scroll down/up map to signed vertical amounts", () => {
    expect(composeAction({ action: "scroll", coordinate: [4, 4], scrollDirection: "down", scrollAmount: 3 }).primitives).toContainEqual({
      kind: "scroll",
      axis: "vertical",
      amount: 3,
    })
    expect(composeAction({ action: "scroll", coordinate: [4, 4], scrollDirection: "up", scrollAmount: 2 }).primitives).toContainEqual({
      kind: "scroll",
      axis: "vertical",
      amount: -2,
    })
  })

  test("scroll left/right map to signed horizontal amounts", () => {
    expect(composeAction({ action: "scroll", coordinate: [0, 0], scrollDirection: "left", scrollAmount: 5 }).primitives).toContainEqual({
      kind: "scroll",
      axis: "horizontal",
      amount: -5,
    })
    expect(composeAction({ action: "scroll", coordinate: [0, 0], scrollDirection: "right", scrollAmount: 5 }).primitives).toContainEqual({
      kind: "scroll",
      axis: "horizontal",
      amount: 5,
    })
  })

  test("wait -> wait primitive", () => {
    expect(composeAction({ action: "wait", duration: 2 })).toEqual({
      primitives: [{ kind: "wait", seconds: 2 }],
      capture: true,
    })
  })
})
