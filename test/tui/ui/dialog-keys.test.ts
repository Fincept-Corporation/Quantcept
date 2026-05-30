import { describe, expect, test } from "bun:test"
import { dialogKeyAction } from "@tui/ui/dialog-keys"

describe("dialogKeyAction", () => {
  test("arrow keys and tab toggle the selection", () => {
    for (const k of ["left", "right", "up", "down", "tab"]) {
      expect(dialogKeyAction(k, true)).toEqual({ toggle: true })
    }
  })

  test("y confirms yes, n and escape confirm no", () => {
    expect(dialogKeyAction("y", false)).toEqual({ result: true })
    expect(dialogKeyAction("n", true)).toEqual({ result: false })
    expect(dialogKeyAction("escape", true)).toEqual({ result: false })
  })

  test("enter confirms the currently selected option", () => {
    expect(dialogKeyAction("return", true)).toEqual({ result: true })
    expect(dialogKeyAction("return", false)).toEqual({ result: false })
    expect(dialogKeyAction("kpenter", true)).toEqual({ result: true })
  })

  test("unrelated keys do nothing", () => {
    expect(dialogKeyAction("a", true)).toBeNull()
    expect(dialogKeyAction("backspace", false)).toBeNull()
  })
})
