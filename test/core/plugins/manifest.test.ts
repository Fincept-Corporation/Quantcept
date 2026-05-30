import { describe, expect, test } from "bun:test"
import { PluginManifestSchema } from "@core/plugins/manifest"

describe("PluginManifestSchema (neutral)", () => {
  test("parses a minimal manifest", () => {
    expect(PluginManifestSchema.parse({ name: "demo" }).name).toBe("demo")
  })

  test("tolerates foreign keys (claude $schema, gemini themes/settings)", () => {
    const m = PluginManifestSchema.parse({ name: "demo", $schema: "x", themes: [], settings: [] })
    expect(m.name).toBe("demo")
  })

  test("accepts component path overrides as string or array", () => {
    const m = PluginManifestSchema.parse({ name: "demo", skills: "./s", commands: ["./a.md", "./b.md"] })
    expect(m.skills).toBe("./s")
    expect(m.commands).toEqual(["./a.md", "./b.md"])
  })

  test("accepts author as a string or an object", () => {
    expect(PluginManifestSchema.parse({ name: "d", author: "Jane" }).author).toBe("Jane")
    expect(PluginManifestSchema.parse({ name: "d", author: { name: "Jane" } }).author).toEqual({ name: "Jane" })
  })

  test("rejects a missing name", () => {
    expect(PluginManifestSchema.safeParse({}).success).toBe(false)
  })
})
