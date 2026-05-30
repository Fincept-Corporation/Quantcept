import { describe, expect, test } from "bun:test"
import { MarketplaceSchema, parsePluginSource } from "@core/plugins/marketplace"

describe("parsePluginSource", () => {
  test("github shorthand (prefixed and bare owner/repo)", () => {
    expect(parsePluginSource("github:owner/repo")).toEqual({ source: "github", repo: "owner/repo" })
    expect(parsePluginSource("owner/repo")).toEqual({ source: "github", repo: "owner/repo" })
  })

  test("git url (ends in .git)", () => {
    expect(parsePluginSource("https://gitlab.com/t/p.git")).toEqual({ source: "git", url: "https://gitlab.com/t/p.git" })
  })

  test("tarball url (archive extension)", () => {
    expect(parsePluginSource("https://x.com/p.tgz")).toEqual({ source: "tarball", url: "https://x.com/p.tgz" })
  })

  test("npm package", () => {
    expect(parsePluginSource("npm:@acme/p")).toEqual({ source: "npm", package: "@acme/p" })
  })

  test("local path", () => {
    expect(parsePluginSource("./plugins/foo")).toEqual({ source: "local", path: "./plugins/foo" })
  })

  test("passes object sources through after validation", () => {
    expect(parsePluginSource({ source: "github", repo: "a/b", ref: "main" })).toEqual({
      source: "github",
      repo: "a/b",
      ref: "main",
    })
  })
})

describe("MarketplaceSchema", () => {
  test("parses a neutral marketplace with a local plugin source", () => {
    const mp = MarketplaceSchema.parse({
      name: "mp",
      owner: { name: "me" },
      plugins: [{ name: "p", source: "./p", description: "demo" }],
    })
    expect(mp.plugins[0]!.name).toBe("p")
  })

  test("rejects a marketplace without a name", () => {
    expect(MarketplaceSchema.safeParse({ owner: { name: "me" }, plugins: [] }).success).toBe(false)
  })
})
