import { describe, expect, test } from "bun:test"
import path from "node:path"
import { adaptMarketplace, fetchMarketplace, readMarketplaceDir } from "@core/plugins/registry-client"

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "plugins")

describe("readMarketplaceDir (local)", () => {
  test("reads a neutral marketplace and resolves relative local plugin sources to absolute", async () => {
    const mp = await readMarketplaceDir(path.join(FIX, "sample-marketplace"))
    expect(mp.name).toBe("sample-marketplace")
    const entry = mp.plugins.find((p) => p.name === "neutral-sample")
    expect(entry).toBeDefined()
    const src = entry!.source as { source: string; path: string }
    expect(src.source).toBe("local")
    expect(path.isAbsolute(src.path)).toBe(true)
    expect(src.path).toBe(path.join(FIX, "neutral-sample"))
  })
})

describe("adaptMarketplace (gemini registry array)", () => {
  test("maps a gemini extensions.json array to neutral entries", () => {
    const mp = adaptMarketplace(
      [{ extensionName: "foo", url: "https://github.com/o/foo", extensionDescription: "d", extensionVersion: "1.0.0" }],
      "gemini-registry",
    )
    expect(mp.name).toBe("gemini-registry")
    expect(mp.plugins[0]!.name).toBe("foo")
    expect(mp.plugins[0]!.source).toBe("https://github.com/o/foo")
  })
})

describe("fetchMarketplace (local source)", () => {
  test("dispatches a local directory source to readMarketplaceDir", async () => {
    const mp = await fetchMarketplace({ source: "local", path: path.join(FIX, "sample-marketplace") })
    expect(mp.plugins.length).toBe(1)
  })
})
