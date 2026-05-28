import { describe, expect, test } from "bun:test"
import { fetchMarketplaceIndex } from "@ext/marketplace/client"

describe("marketplace client", () => {
  test("validates a well-formed index", async () => {
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ plugins: [{ name: "p", version: "1.0.0", source: "github:org/p" }] }),
    }) as unknown as Response
    const index = await fetchMarketplaceIndex("https://example.com/index.json", fakeFetch)
    expect(index.plugins[0].name).toBe("p")
  })

  test("rejects malformed index", async () => {
    const fakeFetch = async () => ({ ok: true, json: async () => ({ plugins: [{ name: "p" }] }) }) as unknown as Response
    await expect(fetchMarketplaceIndex("https://example.com/index.json", fakeFetch)).rejects.toThrow()
  })
})
