import { describe, expect, test } from "bun:test"
import { type FormState, formReducer, initForm } from "@tui/ui/modal/formReducer"

const two = (): FormState => initForm(["A", "B"], "")

describe("formReducer", () => {
  test("appends characters to the buffer", () => {
    let s = two()
    s = formReducer(s, { type: "char", ch: "h" })
    s = formReducer(s, { type: "char", ch: "i" })
    expect(s.buf).toBe("hi")
    expect(s.done).toBeNull()
  })
  test("backspace removes the last char", () => {
    let s = formReducer(two(), { type: "char", ch: "x" })
    s = formReducer(s, { type: "backspace" })
    expect(s.buf).toBe("")
  })
  test("paste appends text to the buffer", () => {
    const s = formReducer(two(), { type: "paste", text: "repo/name" })
    expect(s.buf).toBe("repo/name")
  })
  test("submit advances to the next field, banking the value", () => {
    let s = formReducer(two(), { type: "char", ch: "a" })
    s = formReducer(s, { type: "submit" })
    expect(s.stepIdx).toBe(1)
    expect(s.vals).toEqual(["a"])
    expect(s.buf).toBe("")
    expect(s.done).toBeNull()
  })
  test("submit on the last field completes with all values", () => {
    let s = two()
    s = formReducer(s, { type: "char", ch: "a" })
    s = formReducer(s, { type: "submit" })
    s = formReducer(s, { type: "char", ch: "b" })
    s = formReducer(s, { type: "submit" })
    expect(s.done).toEqual(["a", "b"])
  })
  test("a single-field form completes on the first submit", () => {
    let s = formReducer(initForm(["only"]), { type: "char", ch: "z" })
    s = formReducer(s, { type: "submit" })
    expect(s.done).toEqual(["z"])
  })
})
