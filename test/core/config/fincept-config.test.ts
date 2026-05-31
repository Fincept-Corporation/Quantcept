import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { applyEnvOverrides } from "@core/config/load"
import { clearFinceptAuth, getFinceptAuth, setFinceptAuth } from "@core/config/persist"
import { ConfigSchema, defaultConfig } from "@core/config/schema"

describe("fincept config", () => {
  test("schema defaults to localhost base url, no key", () => {
    const c = ConfigSchema.parse(defaultConfig)
    expect(c.fincept.baseUrl).toBe("http://localhost:8000")
    expect(c.fincept.apiKey).toBeUndefined()
  })

  test("env overrides base url + key", () => {
    const c = applyEnvOverrides(ConfigSchema.parse(defaultConfig), {
      FINCEPT_BASE_URL: "https://api.fincept.in",
      FINCEPT_API_KEY: "fk_user_abc",
    })
    expect(c.fincept.baseUrl).toBe("https://api.fincept.in")
    expect(c.fincept.apiKey).toBe("fk_user_abc")
  })

  test("setFinceptAuth round-trips through a settings file", () => {
    const file = path.join(fs.mkdtempSync(path.join(tmpdir(), "qc-")), "settings.json")
    setFinceptAuth({ apiKey: "fk_user_x", email: "a@b.com", userId: "usr_1" }, file)
    expect(getFinceptAuth(file)?.apiKey).toBe("fk_user_x")
    clearFinceptAuth(file)
    expect(getFinceptAuth(file)?.apiKey).toBeUndefined()
  })
})
