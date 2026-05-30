import { describe, expect, test } from "bun:test"
import { interpolate, interpolateDeep } from "@core/plugins/interpolate"

describe("interpolate", () => {
  const vars = { pluginRoot: "/p", projectDir: "/proj", env: { TOKEN: "abc" } }

  test("substitutes claude/gemini/neutral plugin-root tokens", () => {
    expect(interpolate("${CLAUDE_PLUGIN_ROOT}/s.js", vars)).toBe("/p/s.js")
    expect(interpolate("${extensionPath}/s.js", vars)).toBe("/p/s.js")
    expect(interpolate("${PLUGIN_ROOT}/s.js", vars)).toBe("/p/s.js")
    expect(interpolate("${QUANTCEPT_PLUGIN_ROOT}/s.js", vars)).toBe("/p/s.js")
  })

  test("substitutes project-dir tokens", () => {
    expect(interpolate("${CLAUDE_PROJECT_DIR}", vars)).toBe("/proj")
    expect(interpolate("${workspacePath}", vars)).toBe("/proj")
  })

  test("substitutes environment variables", () => {
    expect(interpolate("Bearer ${TOKEN}", vars)).toBe("Bearer abc")
  })

  test("leaves unknown tokens untouched", () => {
    expect(interpolate("${NOPE}", vars)).toBe("${NOPE}")
  })

  test("interpolateDeep walks objects and arrays, leaving non-strings intact", () => {
    const out = interpolateDeep({ a: "${PLUGIN_ROOT}/x", b: ["${TOKEN}", 1, true], c: { d: "${PLUGIN_ROOT}" } }, vars)
    expect(out).toEqual({ a: "/p/x", b: ["abc", 1, true], c: { d: "/p" } })
  })
})
