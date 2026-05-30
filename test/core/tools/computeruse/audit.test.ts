import { describe, expect, test } from "bun:test"
import { formatAuditEntry } from "@core/tools/computeruse/audit"

describe("computer-use audit log", () => {
  test("formats a one-line, parseable entry with iso time, action, coords and screenshot path", () => {
    const line = formatAuditEntry({
      timestamp: 1_700_000_000_000,
      action: "left_click",
      coordinate: [200, 140],
      screenshotPath: "/tmp/cu-001.png",
    })
    expect(line).toBe("2023-11-14T22:13:20.000Z\tleft_click\t[200,140]\t/tmp/cu-001.png")
  })

  test("omits missing fields with a dash, keeping the column layout stable", () => {
    const line = formatAuditEntry({ timestamp: 1_700_000_000_000, action: "screenshot" })
    expect(line).toBe("2023-11-14T22:13:20.000Z\tscreenshot\t-\t-")
  })

  test("includes typed text (truncated) for type actions", () => {
    const line = formatAuditEntry({
      timestamp: 1_700_000_000_000,
      action: "type",
      text: "hello world this is a fairly long string that should be truncated for the log",
    })
    expect(line).toContain("type")
    expect(line).toContain("hello world")
    expect(line.length).toBeLessThan(160)
  })
})
