import { describe, expect, test } from "bun:test"
import { JsonLineDecoder } from "@core/tools/computeruse/framing"

describe("JsonLineDecoder (sidecar stdout framing)", () => {
  test("emits a complete object on a full line", () => {
    const d = new JsonLineDecoder()
    expect(d.push('{"id":1}\n')).toEqual([{ id: 1 }])
  })

  test("buffers a partial line until the newline arrives", () => {
    const d = new JsonLineDecoder()
    expect(d.push('{"id":')).toEqual([])
    expect(d.push("2}\n")).toEqual([{ id: 2 }])
  })

  test("emits multiple objects from one chunk", () => {
    const d = new JsonLineDecoder()
    expect(d.push('{"id":1}\n{"id":2}\n')).toEqual([{ id: 1 }, { id: 2 }])
  })

  test("reassembles an object split across three chunks", () => {
    const d = new JsonLineDecoder()
    expect(d.push('{"i')).toEqual([])
    expect(d.push('d":3,"cur')).toEqual([])
    expect(d.push('sor":[1,2]}\n')).toEqual([{ id: 3, cursor: [1, 2] }])
  })

  test("ignores blank lines and malformed JSON without throwing", () => {
    const d = new JsonLineDecoder()
    expect(d.push('\n\nnot json\n{"id":4}\n')).toEqual([{ id: 4 }])
  })

  test("keeps trailing partial content buffered after a complete object", () => {
    const d = new JsonLineDecoder()
    expect(d.push('{"id":5}\n{"id":')).toEqual([{ id: 5 }])
    expect(d.push("6}\n")).toEqual([{ id: 6 }])
  })
})
