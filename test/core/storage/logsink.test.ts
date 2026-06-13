import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { installFileLogSink } from "@core/storage/logsink"
import { logsDir } from "@core/storage/paths"
import { logger, resetLogFloor, setLogFloor } from "@shared/logger"

let tmp: string
let remove: () => void
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-logsink-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
  remove = installFileLogSink()
})
afterEach(() => {
  remove()
  resetLogFloor()
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

test("writes a JSONL record to a dated log file even when stderr is gated", () => {
  setLogFloor("error")
  logger.info("disk capture", { code: "X1" })

  const files = readdirSync(logsDir()).filter((f) => f.endsWith(".jsonl"))
  expect(files).toHaveLength(1)
  expect(files[0]).toMatch(/^quantcept-\d{4}-\d{2}-\d{2}\.jsonl$/)

  const lines = readFileSync(join(logsDir(), files[0]), "utf8").trim().split("\n")
  const rec = JSON.parse(lines[lines.length - 1])
  expect(rec).toMatchObject({ level: "info", msg: "disk capture", code: "X1" })
  expect(rec.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
})
