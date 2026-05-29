import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { readIndex, recall, remember } from "@core/memory/store"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-mem-store-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("memory store", () => {
  test("remember creates a topic file and an index pointer", () => {
    remember({ scope: "project", projectHash: "ph", title: "Portfolio Holdings", fact: "60% equities" })
    const idx = readIndex("project", "ph")
    expect(idx).toContain("[Portfolio Holdings](portfolio-holdings.md)")
    expect(recall({ scope: "project", projectHash: "ph", title: "Portfolio Holdings" })).toContain("60% equities")
  })

  test("remembering the same title appends and does not duplicate the pointer", () => {
    remember({ scope: "project", projectHash: "ph", title: "Risk", fact: "low risk tolerance" })
    remember({ scope: "project", projectHash: "ph", title: "Risk", fact: "no leverage" })
    const idx = readIndex("project", "ph")
    expect(idx.match(/\(risk\.md\)/g)?.length).toBe(1)
    const body = recall({ scope: "project", projectHash: "ph", title: "Risk" })!
    expect(body).toContain("low risk tolerance")
    expect(body).toContain("no leverage")
  })

  test("recall returns null for an unknown topic", () => {
    expect(recall({ scope: "project", projectHash: "ph", title: "Nope" })).toBeNull()
  })

  test("readIndex returns empty string when absent", () => {
    expect(readIndex("global")).toBe("")
  })

  test("global and project scopes are separate", () => {
    remember({ scope: "global", title: "Prefs", fact: "concise answers" })
    expect(readIndex("global")).toContain("[Prefs](prefs.md)")
    expect(readIndex("project", "ph")).toBe("")
  })
})
