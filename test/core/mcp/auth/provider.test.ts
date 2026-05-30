import { describe, expect, test } from "bun:test"
import { QuantceptOAuthProvider } from "@core/mcp/auth/provider"
import { McpAuthStore } from "@core/mcp/auth/store"
import fs from "fs"
import os from "os"
import path from "path"

function tmpStore(): McpAuthStore {
  return new McpAuthStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-prov-")), "mcp-auth.json"))
}

describe("QuantceptOAuthProvider", () => {
  test("clientMetadata advertises the loopback redirect and code flow", () => {
    const p = new QuantceptOAuthProvider({
      store: tmpStore(),
      server: "srv",
      redirectUrl: "http://127.0.0.1:9999/callback",
      scopes: ["read", "write"],
      onRedirect: () => {},
    })
    const m = p.clientMetadata
    expect(p.redirectUrl).toBe("http://127.0.0.1:9999/callback")
    expect(m.redirect_uris).toEqual(["http://127.0.0.1:9999/callback"])
    expect(m.grant_types).toContain("authorization_code")
    expect(m.grant_types).toContain("refresh_token")
    expect(m.scope).toBe("read write")
  })

  test("tokens/clientInformation read and write through the store", () => {
    const store = tmpStore()
    const p = new QuantceptOAuthProvider({
      store,
      server: "srv",
      redirectUrl: "http://127.0.0.1:1/callback",
      onRedirect: () => {},
    })
    expect(p.tokens()).toBeUndefined()
    p.saveTokens({ access_token: "at", token_type: "Bearer" } as any)
    p.saveClientInformation({ client_id: "cid" } as any)
    expect(p.tokens()?.access_token).toBe("at")
    expect(p.clientInformation()?.client_id).toBe("cid")
    // and it's actually persisted
    expect(store.get("srv")?.tokens?.access_token).toBe("at")
  })

  test("code verifier is held in memory and required", () => {
    const p = new QuantceptOAuthProvider({
      store: tmpStore(),
      server: "srv",
      redirectUrl: "http://127.0.0.1:1/callback",
      onRedirect: () => {},
    })
    expect(() => p.codeVerifier()).toThrow()
    p.saveCodeVerifier("verifier123")
    expect(p.codeVerifier()).toBe("verifier123")
  })

  test("redirectToAuthorization invokes the injected onRedirect", async () => {
    let seen: URL | undefined
    const p = new QuantceptOAuthProvider({
      store: tmpStore(),
      server: "srv",
      redirectUrl: "http://127.0.0.1:1/callback",
      onRedirect: (url) => {
        seen = url
      },
    })
    await p.redirectToAuthorization(new URL("https://as/authorize?x=1"))
    expect(seen?.toString()).toBe("https://as/authorize?x=1")
  })

  test("invalidateCredentials('all') clears stored creds and verifier", () => {
    const store = tmpStore()
    const p = new QuantceptOAuthProvider({
      store,
      server: "srv",
      redirectUrl: "http://127.0.0.1:1/callback",
      onRedirect: () => {},
    })
    p.saveTokens({ access_token: "at", token_type: "Bearer" } as any)
    p.saveCodeVerifier("v")
    p.invalidateCredentials("all")
    expect(store.get("srv")).toBeUndefined()
    expect(() => p.codeVerifier()).toThrow()
  })
})
