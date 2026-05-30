import { describe, expect, test } from "bun:test"
import type { McpServer } from "@core/mcp/config"
import { removeServerFromSettings, writeServerToSettings } from "@core/mcp/persist"
import fs from "fs"
import os from "os"
import path from "path"

function tmpCwd(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcp-persist-"))
}
function settingsPath(cwd: string): string {
  return path.join(cwd, ".quantcept", "settings.json")
}
function read(cwd: string): any {
  return JSON.parse(fs.readFileSync(settingsPath(cwd), "utf8"))
}

const stdio: McpServer = { type: "stdio", command: "npx", args: ["-y", "srv"], enabled: true, timeout: 30000 } as McpServer
const httpWithSecret: McpServer = {
  type: "http",
  url: "https://api.x/mcp",
  headers: { Authorization: "Bearer ${X_TOKEN}" },
  transport: "auto",
  enabled: true,
  timeout: 30000,
} as McpServer

describe("writeServerToSettings", () => {
  test("creates settings.json with the server when none exists", () => {
    const cwd = tmpCwd()
    writeServerToSettings("fs", stdio, cwd)
    expect(read(cwd).mcp.servers.fs.command).toBe("npx")
  })

  test("merges into existing mcp.servers without dropping siblings or other keys", () => {
    const cwd = tmpCwd()
    fs.mkdirSync(path.join(cwd, ".quantcept"), { recursive: true })
    fs.writeFileSync(
      settingsPath(cwd),
      JSON.stringify({ provider: { model: "m" }, mcp: { servers: { existing: { command: "old" } } } }),
    )
    writeServerToSettings("added", stdio, cwd)
    const s = read(cwd)
    expect(s.provider.model).toBe("m") // unrelated key preserved
    expect(s.mcp.servers.existing.command).toBe("old") // sibling server preserved
    expect(s.mcp.servers.added.command).toBe("npx")
  })

  test("persists secrets as ${ENV} literals (never expanded)", () => {
    const cwd = tmpCwd()
    process.env.X_TOKEN = "super-secret"
    writeServerToSettings("x", httpWithSecret, cwd)
    const raw = fs.readFileSync(settingsPath(cwd), "utf8")
    expect(raw).toContain("Bearer ${X_TOKEN}")
    expect(raw).not.toContain("super-secret")
  })

  test("a corrupt settings file is replaced rather than throwing", () => {
    const cwd = tmpCwd()
    fs.mkdirSync(path.join(cwd, ".quantcept"), { recursive: true })
    fs.writeFileSync(settingsPath(cwd), "{ not json")
    expect(() => writeServerToSettings("fs", stdio, cwd)).not.toThrow()
    expect(read(cwd).mcp.servers.fs.command).toBe("npx")
  })
})

describe("removeServerFromSettings", () => {
  test("deletes only the named server", () => {
    const cwd = tmpCwd()
    writeServerToSettings("a", stdio, cwd)
    writeServerToSettings("b", stdio, cwd)
    removeServerFromSettings("a", cwd)
    const s = read(cwd)
    expect(s.mcp.servers.a).toBeUndefined()
    expect(s.mcp.servers.b).toBeDefined()
  })

  test("is a no-op when the server or file is absent", () => {
    const cwd = tmpCwd()
    expect(() => removeServerFromSettings("ghost", cwd)).not.toThrow()
  })
})
