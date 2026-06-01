import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { SessionStore } from "@core/storage/sessions"

let tmp: string
let store: SessionStore
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-sess-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
  store = new SessionStore()
})
afterEach(() => {
  store.close()
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("SessionStore", () => {
  test("createSession + appendEvent + loadSession replays records", () => {
    store.createSession({ id: "s1", cwd: "/repo/a", title: "Hello" })
    store.appendEvent("s1", { t: "msg", role: "user", content: "hi", ts: 1 })
    store.appendEvent("s1", { t: "msg", role: "assistant", content: "yo", ts: 2 })
    const loaded = store.loadSession("s1")
    expect(loaded.map((r) => r.t)).toEqual(["meta", "msg", "msg"])
    expect(loaded[1]).toMatchObject({ role: "user", content: "hi" })
  })

  test("listSessions filters by project and orders by updated_at desc", () => {
    store.createSession({ id: "s1", cwd: "/repo/a" })
    store.appendEvent("s1", { t: "msg", role: "user", content: "a", ts: 1 })
    store.touch("s1", { msgCount: 1, tokens: 10, updatedAt: 100 })
    store.createSession({ id: "s2", cwd: "/repo/a" })
    store.touch("s2", { msgCount: 1, tokens: 5, updatedAt: 200 })
    const ph = store.projectHashFor("/repo/a")
    const list = store.listSessions(ph)
    expect(list.map((s) => s.id)).toEqual(["s2", "s1"]) // newest first
  })

  test("rebuildIndex reconstructs rows from transcripts", () => {
    store.createSession({ id: "s1", cwd: "/repo/a", title: "T" })
    store.appendEvent("s1", { t: "msg", role: "user", content: "hi", ts: 1 })
    store.dropIndexRow("s1") // simulate a lost/corrupt DB row
    expect(store.listSessions(store.projectHashFor("/repo/a")).length).toBe(0)
    store.rebuildIndex()
    const list = store.listSessions(store.projectHashFor("/repo/a"))
    expect(list.length).toBe(1)
    expect(list[0]!.title).toBe("T")
  })

  test("a resumed session (fresh store instance) can persist new messages", () => {
    // Write + close, simulating a process exit.
    store.createSession({ id: "s1", cwd: "/repo/a" })
    store.appendEvent("s1", { t: "msg", role: "user", content: "first", ts: 1 })
    store.close()
    // Fresh instance (new process): resume by loadSession, then append more.
    const reopened = new SessionStore()
    const replayed = reopened.loadSession("s1")
    expect(replayed.filter((r) => r.t === "msg").length).toBe(1)
    reopened.appendEvent("s1", { t: "msg", role: "assistant", content: "second", ts: 2 })
    const after = reopened.loadSession("s1")
    reopened.close()
    // The new message must have landed in the same transcript file.
    expect(after.filter((r) => r.t === "msg").map((r) => (r as { content: string }).content)).toEqual([
      "first",
      "second",
    ])
    // Reassign so afterEach closes a valid handle.
    store = new SessionStore()
  })

  test("setTitle writes once and does not overwrite an existing title", () => {
    store.createSession({ id: "s1", cwd: "/repo/a" })
    store.setTitle("s1", "First title")
    store.setTitle("s1", "Second title (ignored)")
    const row = store.listSessions(store.projectHashFor("/repo/a"))[0]!
    expect(row.title).toBe("First title")
  })

  test("appendEvent on an unknown session is a no-op (no throw)", () => {
    expect(() => store.appendEvent("never-created", { t: "msg", role: "user", content: "x", ts: 1 })).not.toThrow()
    expect(store.loadSession("never-created")).toEqual([])
  })

  test("mostRecent returns the newest session by updated_at, scoped to project", () => {
    store.createSession({ id: "s1", cwd: "/repo/a", title: "Old" })
    store.touch("s1", { updatedAt: 100 })
    store.createSession({ id: "s2", cwd: "/repo/a", title: "New" })
    store.touch("s2", { updatedAt: 200 })
    store.createSession({ id: "s3", cwd: "/repo/b" }) // different project, newer
    store.touch("s3", { updatedAt: 999 })
    expect(store.mostRecent(store.projectHashFor("/repo/a"))?.id).toBe("s2")
  })

  test("mostRecent returns null when the project has no sessions", () => {
    expect(store.mostRecent(store.projectHashFor("/empty"))).toBeNull()
  })
})
