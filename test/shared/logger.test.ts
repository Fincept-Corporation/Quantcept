import { afterEach, expect, test } from "bun:test"
import {
  addLogSink,
  clearLogContext,
  installCrashHandlers,
  logger,
  resetLogFloor,
  setLogContext,
  setLogFloor,
} from "@shared/logger"

function emitProcess(event: string, arg: unknown): void {
  ;(process as unknown as { emit: (e: string, a: unknown) => boolean }).emit(event, arg)
}

// Swallow stderr for the duration of a call so test output stays pristine and
// we can assert what did (or did not) reach the screen.
function withCapturedStderr(fn: () => void): string {
  const orig = process.stderr.write.bind(process.stderr)
  let captured = ""
  ;(process.stderr as unknown as { write: (c: unknown) => boolean }).write = (chunk) => {
    captured += String(chunk)
    return true
  }
  try {
    fn()
  } finally {
    ;(process.stderr as unknown as { write: typeof orig }).write = orig
  }
  return captured
}

let removeSink: (() => void) | undefined
afterEach(() => {
  removeSink?.()
  removeSink = undefined
  resetLogFloor()
  clearLogContext()
})

test("a registered sink receives a structured record", () => {
  const records: Array<Record<string, unknown>> = []
  removeSink = addLogSink((r) => records.push(r))
  withCapturedStderr(() => logger.info("hello", { a: 1 }))
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ level: "info", msg: "hello", a: 1 })
  expect(typeof records[0].ts).toBe("string")
})

test("the screen floor gates stderr only — the sink still captures", () => {
  const records: Array<Record<string, unknown>> = []
  removeSink = addLogSink((r) => records.push(r))
  setLogFloor("error")
  const onScreen = withCapturedStderr(() => logger.info("quiet on screen", { k: "v" }))
  expect(onScreen).not.toContain("quiet on screen")
  expect(records.map((r) => r.msg)).toContain("quiet on screen")
})

test("redacts secret tokens and sensitive keys before they reach a sink", () => {
  const records: Array<Record<string, unknown>> = []
  removeSink = addLogSink((r) => records.push(r))
  withCapturedStderr(() =>
    logger.error("auth failed", {
      authorization: "Bearer fk_user_SECRET123",
      apiKey: "sk-livesecretkey0001",
      detail: "token fk_user_ABC.def-456 rejected",
      note: "ok",
    }),
  )
  const r = records[0]
  expect(r.authorization).toBe("***")
  expect(r.apiKey).toBe("***")
  expect(r.detail).toBe("token fk_user_*** rejected")
  expect(r.note).toBe("ok")
})

test("redacts secrets in the message string and on stderr", () => {
  removeSink = addLogSink(() => {})
  const onScreen = withCapturedStderr(() => logger.error("leaking fk_user_TOPSECRET now"))
  expect(onScreen).toContain("fk_user_***")
  expect(onScreen).not.toContain("TOPSECRET")
})

test("setLogContext merges correlation fields into every record; clearLogContext resets", () => {
  const records: Array<Record<string, unknown>> = []
  removeSink = addLogSink((r) => records.push(r))
  setLogContext({ sessionId: "s-1", projectHash: "abc123" })
  withCapturedStderr(() => logger.info("with ctx"))
  withCapturedStderr(() => logger.warn("still ctx", { extra: true }))
  clearLogContext()
  withCapturedStderr(() => logger.info("no ctx"))
  expect(records[0]).toMatchObject({ msg: "with ctx", sessionId: "s-1", projectHash: "abc123" })
  expect(records[1]).toMatchObject({ msg: "still ctx", sessionId: "s-1", extra: true })
  expect(records[2].sessionId).toBeUndefined()
})

test("context values are redacted too", () => {
  const records: Array<Record<string, unknown>> = []
  removeSink = addLogSink((r) => records.push(r))
  setLogContext({ token: "fk_user_CTXSECRET" })
  withCapturedStderr(() => logger.info("ctx redaction"))
  expect(records[0].token).toBe("***")
})

test("crash handlers log uncaught exceptions to the durable sink", () => {
  const records: Array<Record<string, unknown>> = []
  const removeSinkLocal = addLogSink((r) => records.push(r))
  const removeHandlers = installCrashHandlers()
  try {
    withCapturedStderr(() => emitProcess("uncaughtExceptionMonitor", new Error("boom")))
  } finally {
    removeHandlers()
    removeSinkLocal()
  }
  const rec = records.find((r) => r.msg === "uncaught exception")
  expect(rec).toBeDefined()
  expect(rec?.error).toBe("boom")
})

test("installCrashHandlers is idempotent and removable", () => {
  const before = process.listenerCount("uncaughtExceptionMonitor")
  const r1 = installCrashHandlers()
  const r2 = installCrashHandlers()
  expect(process.listenerCount("uncaughtExceptionMonitor")).toBe(before + 1)
  r1()
  r2()
  expect(process.listenerCount("uncaughtExceptionMonitor")).toBe(before)
})
