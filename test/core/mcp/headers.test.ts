import { describe, expect, test } from "bun:test"
import { httpTransportOptions, interpolateHeaders } from "@core/mcp/headers"

describe("interpolateHeaders", () => {
  test("returns undefined for undefined headers", () => {
    expect(interpolateHeaders(undefined, {})).toBeUndefined()
  })

  test("leaves plain values untouched", () => {
    expect(interpolateHeaders({ "X-Plain": "value" }, {})).toEqual({ "X-Plain": "value" })
  })

  test("substitutes ${VAR} from env", () => {
    const out = interpolateHeaders({ Authorization: "Bearer ${TOK}" }, { TOK: "secret" })
    expect(out).toEqual({ Authorization: "Bearer secret" })
  })

  test("substitutes multiple vars in one value", () => {
    const out = interpolateHeaders({ X: "${A}-${B}" }, { A: "1", B: "2" })
    expect(out).toEqual({ X: "1-2" })
  })

  test("throws when a referenced env var is missing", () => {
    expect(() => interpolateHeaders({ Authorization: "Bearer ${NOPE}" }, {})).toThrow(/NOPE/)
  })
})

describe("httpTransportOptions", () => {
  test("returns interpolated headers under requestInit", () => {
    expect(httpTransportOptions({ Authorization: "Bearer ${TOK}" }, { TOK: "s" })).toEqual({
      requestInit: { headers: { Authorization: "Bearer s" } },
    })
  })

  test("returns an empty object when there are no headers", () => {
    expect(httpTransportOptions(undefined, {})).toEqual({})
  })
})
