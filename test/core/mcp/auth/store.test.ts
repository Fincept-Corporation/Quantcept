import { describe, expect, test } from "bun:test"
import { McpAuthStore } from "@core/mcp/auth/store"
import fs from "fs"
import os from "os"
import path from "path"

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-auth-")), "mcp-auth.json")
}

const tokens = { access_token: "at", token_type: "Bearer" as const, refresh_token: "rt" }
const clientInfo = { client_id: "cid", client_secret: "csec" }

describe("McpAuthStore", () => {
  test("missing file reads as empty", () => {
    const store = new McpAuthStore(path.join(os.tmpdir(), "does-not-exist-xyz", "a.json"))
    expect(store.get("srv")).toBeUndefined()
  })

  test("round-trips tokens, client info, and discovery state per server", () => {
    const store = new McpAuthStore(tmpFile())
    store.setTokens("srv", tokens as any)
    store.setClientInformation("srv", clientInfo as any)
    store.setDiscoveryState("srv", { authorizationServerUrl: "https://as" } as any)
    const rec = store.get("srv")
    expect(rec?.tokens?.access_token).toBe("at")
    expect(rec?.clientInformation?.client_id).toBe("cid")
    expect(rec?.discoveryState?.authorizationServerUrl).toBe("https://as")
  })

  test("keeps servers isolated and clear() removes only one", () => {
    const store = new McpAuthStore(tmpFile())
    store.setTokens("a", tokens as any)
    store.setTokens("b", tokens as any)
    store.clear("a")
    expect(store.get("a")).toBeUndefined()
    expect(store.get("b")?.tokens?.access_token).toBe("at")
  })

  test("persists across store instances on the same file", () => {
    const file = tmpFile()
    new McpAuthStore(file).setTokens("srv", tokens as any)
    expect(new McpAuthStore(file).get("srv")?.tokens?.access_token).toBe("at")
  })

  test("corrupt file is treated as empty (no throw)", () => {
    const file = tmpFile()
    fs.writeFileSync(file, "{ not json")
    const store = new McpAuthStore(file)
    expect(store.get("srv")).toBeUndefined()
  })
})
