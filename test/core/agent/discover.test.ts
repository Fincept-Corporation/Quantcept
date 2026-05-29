import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { AgentRegistry, discoverAgents } from "@core/agent/agents"

let root: string
function writeAgent(dir: string, name: string, desc: string, model?: string) {
  mkdirSync(dir, { recursive: true })
  const fm = model ? `name: ${name}\ndescription: ${desc}\nmodel: ${model}` : `name: ${name}\ndescription: ${desc}`
  writeFileSync(join(dir, `${name}.md`), `---\n${fm}\n---\nYou are ${name}.`)
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "qc-agents-"))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("discoverAgents", () => {
  test("discovers across builtin/user/project", async () => {
    writeAgent(join(root, "builtin"), "analyst", "b")
    writeAgent(join(root, "user"), "trader", "u")
    writeAgent(join(root, "project"), "quant", "p")
    const list = await discoverAgents({ builtinDir: join(root, "builtin"), userDir: join(root, "user"), projectDir: join(root, "project") })
    expect(list.map((a) => a.name).sort()).toEqual(["analyst", "quant", "trader"])
  })
  test("project shadows user shadows builtin by name", async () => {
    writeAgent(join(root, "builtin"), "analyst", "builtin one")
    writeAgent(join(root, "user"), "analyst", "user one")
    writeAgent(join(root, "project"), "analyst", "project one")
    const list = await discoverAgents({ builtinDir: join(root, "builtin"), userDir: join(root, "user"), projectDir: join(root, "project") })
    expect(list.length).toBe(1)
    expect(list[0]!.description).toBe("project one")
  })
  test("missing dirs yield empty list", async () => {
    const list = await discoverAgents({ builtinDir: join(root, "a"), userDir: join(root, "b"), projectDir: join(root, "c") })
    expect(list).toEqual([])
  })
  test("AgentRegistry all/get", () => {
    const reg = new AgentRegistry([{ name: "analyst", description: "d", systemPrompt: "p" }])
    expect(reg.all().map((a) => a.name)).toEqual(["analyst"])
    expect(reg.get("analyst")?.systemPrompt).toBe("p")
    expect(reg.get("nope")).toBeUndefined()
  })
})
