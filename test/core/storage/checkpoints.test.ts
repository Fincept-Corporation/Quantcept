import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { CheckpointStore } from "@core/storage/checkpoints"

let tmp: string
let store: CheckpointStore
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-cp-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
  store = new CheckpointStore()
})
afterEach(() => {
  store.close()
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("CheckpointStore", () => {
  test("insert then list by session newest-first", () => {
    store.insert({ id: "c1", sessionId: "s1", projectHash: "p", treeHash: "a".repeat(40), kind: "tool", label: "Edit", createdAt: 100 })
    store.insert({ id: "c2", sessionId: "s1", projectHash: "p", treeHash: "b".repeat(40), kind: "turn", label: "ask X", createdAt: 200 })
    store.insert({ id: "c3", sessionId: "s2", projectHash: "p", treeHash: "c".repeat(40), kind: "tool", label: "Write", createdAt: 150 })
    const list = store.listBySession("s1")
    expect(list.map((c) => c.id)).toEqual(["c2", "c1"])
  })
  test("listBySession filters by kind when given", () => {
    store.insert({ id: "c1", sessionId: "s1", projectHash: "p", treeHash: "a".repeat(40), kind: "tool", label: "E", createdAt: 100 })
    store.insert({ id: "c2", sessionId: "s1", projectHash: "p", treeHash: "b".repeat(40), kind: "turn", label: "T", createdAt: 200 })
    expect(store.listBySession("s1", "turn").map((c) => c.id)).toEqual(["c2"])
  })
})
