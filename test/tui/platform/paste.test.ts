import { describe, expect, test } from "bun:test"
import { pasteText } from "@tui/platform/paste"

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)

describe("pasteText", () => {
  test("decodes UTF-8 bytes to a string", () => {
    expect(pasteText(new TextEncoder().encode("anthropics/financial-services"))).toBe("anthropics/financial-services")
  })
  test("passes a plain string through unchanged", () => {
    expect(pasteText("npx -y @scope/mcp")).toBe("npx -y @scope/mcp")
  })
  test("strips newlines so a multi-line paste stays single-line", () => {
    expect(pasteText("line1\nline2\r\n")).toBe("line1line2")
  })
  test("strips ANSI escape sequences", () => {
    expect(pasteText(`${ESC}[31mred${ESC}[0m`)).toBe("red")
  })
  test("strips stray control characters", () => {
    expect(pasteText(`a${BEL}b`)).toBe("ab")
  })
})
