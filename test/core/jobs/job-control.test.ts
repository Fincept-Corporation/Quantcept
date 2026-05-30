import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createListJobsTool, createScheduleJobTool } from "@core/jobs/JobControlTool"
import { JobStore } from "@core/jobs/store"
import { projectHash } from "@core/storage/paths"

const ctxOf = () => ({ abort: new AbortController().signal, cwd: "/repo/jc" })

let tmp: string
let store: JobStore
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-jobctl-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
  store = new JobStore()
})
afterEach(() => {
  store.close()
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("createScheduleJobTool", () => {
  test("declares effectClass 'write' and is not read-only", () => {
    const tool = createScheduleJobTool({ store, cwd: "/repo/jc" })
    expect(tool.name).toBe("schedule_job")
    expect(tool.effectClass).toBe("write")
    expect(tool.isReadOnly({})).toBe(false)
  })

  test("creates a read-only job and returns its id; persists to the store", async () => {
    const tool = createScheduleJobTool({ store, cwd: "/repo/jc" })
    const res = await tool.call({ goal: "Summarize AAPL earnings", maxTurns: 7 }, ctxOf())
    expect(res.isError).toBeFalsy()

    // The created job shows up for this project, with the goal + readOnly default.
    const jobs = store.listByProject(projectHash("/repo/jc"))
    expect(jobs.length).toBe(1)
    const created = jobs[0]!
    expect(created.goal).toBe("Summarize AAPL earnings")
    expect(created.maxTurns).toBe(7)
    expect(created.readOnly).toBe(true)
    // The returned id must reference the persisted job.
    expect(String(res.output)).toContain(created.id)
  })

  test("stores a schedule when provided", async () => {
    const tool = createScheduleJobTool({ store, cwd: "/repo/jc" })
    const schedule = { kind: "interval", everyMinutes: 60 }
    await tool.call({ goal: "Snapshot MSFT", schedule }, ctxOf())
    const created = store.listByProject(projectHash("/repo/jc"))[0]!
    expect(created.schedule).toEqual(schedule)
  })
})

describe("createListJobsTool", () => {
  test("declares effectClass 'read' and is read-only", () => {
    const tool = createListJobsTool({ store, cwd: "/repo/jc" })
    expect(tool.name).toBe("list_jobs")
    expect(tool.effectClass).toBe("read")
    expect(tool.isReadOnly({})).toBe(true)
  })

  test("returns jobs created for this project (id + goal + status surfaced)", async () => {
    const created = store.create({ id: "jc-1", cwd: "/repo/jc", goal: "List me", maxTurns: 4 })
    const tool = createListJobsTool({ store, cwd: "/repo/jc" })
    const res = await tool.call({}, ctxOf())
    const text = String(res.output)
    expect(text).toContain(created.id)
    expect(text).toContain("List me")
    expect(text).toContain(created.status)
  })

  test("only lists this project's jobs (not another project's)", async () => {
    store.create({ id: "mine", cwd: "/repo/jc", goal: "mine" })
    store.create({ id: "other", cwd: "/repo/other", goal: "other" })
    const tool = createListJobsTool({ store, cwd: "/repo/jc" })
    const text = String((await tool.call({}, ctxOf())).output)
    expect(text).toContain("mine")
    expect(text).not.toContain("other")
  })

  test("empty project returns a benign 'no jobs' message", async () => {
    const tool = createListJobsTool({ store, cwd: "/repo/empty" })
    const res = await tool.call({}, ctxOf())
    expect(res.isError).toBeFalsy()
    expect(String(res.output).length).toBeGreaterThan(0)
  })
})
