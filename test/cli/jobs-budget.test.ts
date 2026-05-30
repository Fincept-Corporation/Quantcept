import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { JobStore } from "@core/jobs/store"
import { runJobsCli } from "@cli/jobs-command"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-jobs-budget-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("jobs add --max-* budget flags", () => {
  // Capture console.log to grab the printed id without polluting output.
  let logs: string[]
  const orig = console.log
  beforeEach(() => {
    logs = []
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(" "))
    }
  })
  afterEach(() => {
    console.log = orig
  })

  test("--max-usd and --max-tokens are persisted as the job's budget", async () => {
    await runJobsCli("add", ["g", "--max-usd", "2.5", "--max-tokens", "1000"])
    const id = logs.find((l) => /[0-9a-f]{8}/.test(l))!.match(/[0-9a-f]{8}/)![0]

    const store = new JobStore()
    try {
      const job = store.get(id)!
      expect(job.budget).toEqual({ maxUsd: 2.5, maxTokens: 1000 })
    } finally {
      store.close()
    }
  })

  test("add with no --max-* flags leaves budget undefined", async () => {
    await runJobsCli("add", ["g"])
    const id = logs.find((l) => /[0-9a-f]{8}/.test(l))!.match(/[0-9a-f]{8}/)![0]

    const store = new JobStore()
    try {
      expect(store.get(id)!.budget).toBeUndefined()
    } finally {
      store.close()
    }
  })

  test("all four --max-* flags are parsed into the budget", async () => {
    await runJobsCli("add", [
      "g",
      "--max-usd",
      "3",
      "--max-tokens",
      "500",
      "--max-tool-calls",
      "7",
      "--max-data-calls",
      "4",
    ])
    const id = logs.find((l) => /[0-9a-f]{8}/.test(l))!.match(/[0-9a-f]{8}/)![0]

    const store = new JobStore()
    try {
      expect(store.get(id)!.budget).toEqual({
        maxUsd: 3,
        maxTokens: 500,
        maxToolCalls: 7,
        maxDataCalls: 4,
      })
    } finally {
      store.close()
    }
  })
})
