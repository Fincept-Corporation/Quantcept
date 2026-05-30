/**
 * Screenshot coordinate-scaling math for computer-use.
 *
 * Vision models work best on downscaled frames (Anthropic recommends ~1024x768 and silently
 * downscales anything past its hard limit, which makes clicks miss). We downscale BEFORE
 * sending and then scale the model's returned coordinates back UP to physical pixels before
 * issuing the click. This mirrors warp's `get_scale_factor`
 * (`min(maxLong/long, sqrt(maxTotal/total), 1.0)`, never upscaling).
 */

export interface ScaleLimits {
  /** Max length of the long edge, in pixels. */
  maxLongEdge?: number
  /** Max total pixel count. */
  maxTotalPx?: number
}

/** Factor in (0, 1] to multiply physical dimensions by so the frame fits within `limits`. */
export function getScaleFactor(width: number, height: number, limits: ScaleLimits): number {
  const longEdge = Math.max(width, height)
  const totalPx = width * height
  let factor = 1
  if (limits.maxLongEdge && longEdge > 0) factor = Math.min(factor, limits.maxLongEdge / longEdge)
  if (limits.maxTotalPx && totalPx > 0) factor = Math.min(factor, Math.sqrt(limits.maxTotalPx / totalPx))
  return Math.min(factor, 1)
}

/** Apply a scale factor to physical dimensions, flooring to whole pixels. */
export function scaledSize(width: number, height: number, scaleFactor: number): { width: number; height: number } {
  return { width: Math.floor(width * scaleFactor), height: Math.floor(height * scaleFactor) }
}

/** Map a coordinate the model gave (in downscaled space) back to physical screen pixels. */
export function toPhysical(coord: [number, number], scaleFactor: number): [number, number] {
  return [Math.round(coord[0] / scaleFactor), Math.round(coord[1] / scaleFactor)]
}
