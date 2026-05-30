import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { clearVisionProvider, readSettingsFile, setVisionProvider } from "@core/config/persist"

function tmp(): string {
  return path.join(os.tmpdir(), `qc-persist-${Math.random().toString(36).slice(2)}.json`)
}

describe("config persist", () => {
  test("setVisionProvider writes the block, preserving other settings", () => {
    const f = tmp()
    fs.writeFileSync(f, JSON.stringify({ mcp: { servers: {} } }))
    setVisionProvider({ id: "openai-chat", model: "gpt-5.5", baseUrl: "https://api.openai.com/v1", apiKey: "sk-x" }, f)
    const s = readSettingsFile(f)
    expect(s.visionProvider).toEqual({ id: "openai-chat", model: "gpt-5.5", baseUrl: "https://api.openai.com/v1", apiKey: "sk-x" })
    expect(s.mcp).toEqual({ servers: {} })
    fs.rmSync(f)
  })

  test("setVisionProvider creates the file when absent", () => {
    const f = tmp()
    setVisionProvider({ id: "openai-chat", model: "gpt-5.5", baseUrl: "u", apiKey: "k" }, f)
    expect((readSettingsFile(f).visionProvider as { apiKey?: string }).apiKey).toBe("k")
    fs.rmSync(f)
  })

  test("clearVisionProvider removes only the block", () => {
    const f = tmp()
    fs.writeFileSync(f, JSON.stringify({ visionProvider: { id: "openai-chat", model: "m", baseUrl: "u", apiKey: "k" }, mcp: {} }))
    clearVisionProvider(f)
    const s = readSettingsFile(f)
    expect(s.visionProvider).toBeUndefined()
    expect(s.mcp).toEqual({})
    fs.rmSync(f)
  })

  test("readSettingsFile tolerates a missing or corrupt file", () => {
    expect(readSettingsFile(tmp())).toEqual({})
    const f = tmp()
    fs.writeFileSync(f, "{not json")
    expect(readSettingsFile(f)).toEqual({})
    fs.rmSync(f)
  })
})
