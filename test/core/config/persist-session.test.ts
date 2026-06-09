import { afterEach, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { clearFinceptAuth, getFinceptAuth, sessionFromConfig, setFinceptAuth } from "@core/config/persist"

const tmp = () => path.join(os.tmpdir(), `qc-sess-${Math.random().toString(36).slice(2)}.json`)
let file = ""
afterEach(() => { if (file && fs.existsSync(file)) fs.unlinkSync(file) })

test("sessionToken round-trips through set/get", () => {
  file = tmp()
  setFinceptAuth({ apiKey: "fk_user_abc", sessionToken: "sess_xyz", email: "a@x.com" }, file)
  const got = getFinceptAuth(file)
  expect(got?.apiKey).toBe("fk_user_abc")
  expect(got?.sessionToken).toBe("sess_xyz")
})

test("clearFinceptAuth wipes sessionToken", () => {
  file = tmp()
  setFinceptAuth({ apiKey: "k", sessionToken: "s" }, file)
  clearFinceptAuth(file)
  const got = getFinceptAuth(file)
  expect(got?.apiKey).toBeUndefined()
  expect(got?.sessionToken).toBeUndefined()
})

test("sessionFromConfig builds a session, or undefined without a key", () => {
  file = tmp()
  expect(sessionFromConfig(file)).toBeUndefined()
  setFinceptAuth({ apiKey: "k", sessionToken: "s" }, file)
  expect(sessionFromConfig(file)).toEqual({ apiKey: "k", sessionToken: "s" })
})
