import { describe, expect, test } from "bun:test"
import { getScaleFactor, scaledSize, toPhysical } from "@core/tools/computeruse/scale"

describe("computer-use scale math", () => {
  test("returns 1.0 when the image is already within limits (never upscales)", () => {
    expect(getScaleFactor(800, 600, { maxLongEdge: 1024 })).toBe(1)
  })

  test("returns 1.0 when no limits are given", () => {
    expect(getScaleFactor(4000, 3000, {})).toBe(1)
  })

  test("downscales by the long edge when it exceeds maxLongEdge", () => {
    expect(getScaleFactor(2048, 1536, { maxLongEdge: 1024 })).toBe(0.5)
  })

  test("downscales by total pixels when that constraint binds tighter", () => {
    // long-edge scale = 1500/2000 = 0.75; total scale = sqrt(1_000_000 / 4_000_000) = 0.5 -> min
    expect(getScaleFactor(2000, 2000, { maxLongEdge: 1500, maxTotalPx: 1_000_000 })).toBe(0.5)
  })

  test("scaledSize floors the scaled dimensions", () => {
    expect(scaledSize(2048, 1536, 0.5)).toEqual({ width: 1024, height: 768 })
    expect(scaledSize(1001, 1001, 0.5)).toEqual({ width: 500, height: 500 })
  })

  test("toPhysical maps a model-space coordinate back to physical pixels", () => {
    expect(toPhysical([512, 384], 0.5)).toEqual([1024, 768])
  })

  test("toPhysical is identity at scaleFactor 1", () => {
    expect(toPhysical([300, 200], 1)).toEqual([300, 200])
  })
})
