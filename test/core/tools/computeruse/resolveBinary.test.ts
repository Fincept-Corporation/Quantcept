import { describe, expect, test } from "bun:test"
import { resolveSidecarBinary } from "@core/tools/computeruse/resolveBinary"

describe("resolveSidecarBinary", () => {
  test("returns null when no candidate exists", () => {
    expect(resolveSidecarBinary(["/no/such/path/a", "/no/such/path/b"])).toBeNull()
  })

  test("returns the first existing candidate, skipping empties and missing", () => {
    // process.execPath (the bun binary) always exists
    expect(resolveSidecarBinary(["", "/no/such/path", process.execPath])).toBe(process.execPath)
  })

  test("returns null for an empty candidate list", () => {
    expect(resolveSidecarBinary([])).toBeNull()
  })
})
