import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { clearUserSettingPath, getUserSettings, setUserSettingPath, updateUserSettings } from "@core/config/persist"

function tmp(): string {
  return path.join(fs.mkdtempSync(path.join(tmpdir(), "qc-set-")), "settings.json")
}

describe("user settings writer", () => {
  test("setUserSettingPath creates nested paths; getUserSettings reads them", () => {
    const f = tmp()
    setUserSettingPath("provider.model", "MiniMax-M2.7", f)
    setUserSettingPath("provider.temperature", 0.5, f)
    setUserSettingPath("fincept.baseUrl", "https://api.fincept.in", f)
    const s = getUserSettings(f) as Record<string, Record<string, unknown>>
    expect(s.provider!.model).toBe("MiniMax-M2.7")
    expect(s.provider!.temperature).toBe(0.5)
    expect(s.fincept!.baseUrl).toBe("https://api.fincept.in")
  })

  test("setUserSettingPath preserves sibling keys", () => {
    const f = tmp()
    setUserSettingPath("provider.model", "a", f)
    setUserSettingPath("provider.baseUrl", "b", f)
    const p = (getUserSettings(f) as Record<string, Record<string, unknown>>).provider!
    expect(p.model).toBe("a")
    expect(p.baseUrl).toBe("b")
  })

  test("clearUserSettingPath removes a section", () => {
    const f = tmp()
    setUserSettingPath("visionProvider.apiKey", "secret", f)
    expect((getUserSettings(f) as Record<string, Record<string, unknown>>).visionProvider!.apiKey).toBe("secret")
    clearUserSettingPath("visionProvider", f)
    expect((getUserSettings(f) as Record<string, unknown>).visionProvider).toBeUndefined()
  })

  test("updateUserSettings applies an arbitrary mutation", () => {
    const f = tmp()
    updateUserSettings((s) => {
      s.trading = { enabled: true }
    }, f)
    expect((getUserSettings(f) as Record<string, Record<string, unknown>>).trading!.enabled).toBe(true)
  })
})
