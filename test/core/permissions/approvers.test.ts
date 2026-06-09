import { describe, expect, test } from "bun:test"
import { buildApproval } from "@core/permissions/approvers"
import { buildTool, type Tool } from "@core/tools/Tool"
import { z } from "zod/v4"

const mk = (name: string, opts: { effectClass?: "read" | "write"; money?: boolean } = {}): Tool =>
  buildTool({
    name,
    description: "",
    inputSchema: z.object({}),
    effectClass: opts.effectClass,
    permissionPatterns: opts.money ? () => ["computeruse:money"] : undefined,
    call: async () => ({ output: "" }),
  })

describe("buildApproval", () => {
  test("shell → a prompt titled 'Run shell?' (with a parsed command breakdown)", async () => {
    const ask = await buildApproval(mk("shell"), { command: "ls -la" }, { computerUseGranted: false })
    expect(ask.kind).toBe("prompt")
    if (ask.kind === "prompt") expect(ask.title.startsWith("Run shell?")).toBe(true)
  })

  test("computerUse → prompt that grants on accept; auto-allows once granted", async () => {
    const t = mk("computerUse")
    expect(await buildApproval(t, { instruction: "open browser" }, { computerUseGranted: false })).toMatchObject({
      kind: "prompt",
      grantsComputerUse: true,
    })
    expect(await buildApproval(t, { instruction: "open browser" }, { computerUseGranted: true })).toEqual({
      kind: "decide",
      decision: "allow",
    })
  })

  test("computer: non-money auto-allows after a grant; money always re-prompts and never grants", async () => {
    expect(await buildApproval(mk("computer"), { action: "click" }, { computerUseGranted: true })).toEqual({
      kind: "decide",
      decision: "allow",
    })
    const ask = await buildApproval(mk("computer", { money: true }), { action: "click", coordinate: [1, 2] }, {
      computerUseGranted: true,
    })
    expect(ask).toMatchObject({ kind: "prompt", grantsComputerUse: false })
    if (ask.kind === "prompt") expect(ask.title).toBe("Confirm money action?")
  })

  test("any other tool → a generic confirm prompt", async () => {
    const ask = await buildApproval(mk("write_file", { effectClass: "write" }), { path: "x" }, {
      computerUseGranted: false,
    })
    expect(ask.kind).toBe("prompt")
    if (ask.kind === "prompt") {
      expect(ask.title.startsWith("Run write_file?")).toBe(true)
      expect(ask.message).toContain("Input:")
    }
  })
})
