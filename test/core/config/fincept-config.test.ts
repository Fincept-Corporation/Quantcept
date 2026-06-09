import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { applyEnvOverrides, applyFinceptHost } from "@core/config/load"
import { clearFinceptAuth, getFinceptAuth, setFinceptAuth } from "@core/config/persist"
import { ConfigSchema, defaultConfig, FINCEPT_API_URL } from "@core/config/schema"

describe("fincept config", () => {
  test("schema defaults to the hosted base url, no key", () => {
    const c = ConfigSchema.parse(defaultConfig)
    expect(c.fincept.baseUrl).toBe(FINCEPT_API_URL)
    expect(FINCEPT_API_URL).toBe("https://api.quantcept.io")
    expect(c.fincept.apiKey).toBeUndefined()
  })

  test("env overrides the key but NOT the base url (local API removed)", () => {
    const c = applyEnvOverrides(ConfigSchema.parse(defaultConfig), {
      FINCEPT_BASE_URL: "http://localhost:8000",
      FINCEPT_API_KEY: "fk_user_abc",
    })
    // FINCEPT_BASE_URL is no longer honored — the app only ever talks to the hosted API.
    expect(c.fincept.baseUrl).toBe(FINCEPT_API_URL)
    expect(c.fincept.apiKey).toBe("fk_user_abc")
  })

  test("applyFinceptHost forces the hosted host over a localhost-pinned config", () => {
    const pinned = ConfigSchema.parse({
      ...defaultConfig,
      fincept: { ...defaultConfig.fincept, baseUrl: "http://localhost:8000" },
    })
    expect(pinned.fincept.baseUrl).toBe("http://localhost:8000") // sanity: parse kept the stale value
    const forced = applyFinceptHost(pinned)
    expect(forced.fincept.baseUrl).toBe(FINCEPT_API_URL)
    // Other fincept fields are preserved.
    expect(forced.fincept.seedByDefault).toBe(pinned.fincept.seedByDefault)
  })

  test("setFinceptAuth round-trips; clear drops the key and does not re-pin a base url", () => {
    const file = path.join(fs.mkdtempSync(path.join(tmpdir(), "qc-")), "settings.json")
    setFinceptAuth({ apiKey: "fk_user_x", email: "a@b.com", userId: "usr_1" }, file)
    expect(getFinceptAuth(file)?.apiKey).toBe("fk_user_x")
    clearFinceptAuth(file)
    expect(getFinceptAuth(file)?.apiKey).toBeUndefined()
    // Logout must not re-persist a (now meaningless) base url.
    expect(getFinceptAuth(file)?.baseUrl).toBeUndefined()
  })
})
