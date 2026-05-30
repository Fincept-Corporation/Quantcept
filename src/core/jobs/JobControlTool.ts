import { projectHash } from "@core/storage/paths"
import { buildTool, type Tool } from "@core/tools/Tool"
import { z } from "zod/v4"
import type { JobStore } from "./store"

/**
 * Job-control tools let an agent drive Quantcept's autonomous-jobs system itself:
 * inspect this project's jobs and schedule new ones. They operate on the SAME JobStore
 * the CLI uses, so a job an agent schedules is picked up by `quantcept jobs tick`.
 *
 * Both are project-scoped via `projectHash(cwd)` — an agent only ever sees/affects jobs
 * for the workspace it is running in.
 */

const truncate = (s: string, n: number): string => {
  const oneLine = s.replace(/\s+/g, " ").trim()
  return oneLine.length <= n ? oneLine : `${oneLine.slice(0, n - 1)}…`
}

/** Read-only: list this project's jobs as a compact summary the model can reason over. */
export function createListJobsTool(deps: { store: JobStore; cwd: string }): Tool {
  return buildTool({
    name: "list_jobs",
    description:
      "List this project's autonomous jobs (id, status, turns used/max, next scheduled run, goal). Read-only.",
    inputSchema: z.object({}),
    effectClass: "read",
    isReadOnly: () => true,
    async call() {
      const jobs = deps.store.listByProject(projectHash(deps.cwd))
      if (!jobs.length) {
        return { output: "No jobs for this project. Use schedule_job to create one.", title: "list_jobs (0)" }
      }
      const rows = jobs.map((j) => ({
        id: j.id,
        status: j.status,
        turns: `${j.turnsUsed}/${j.maxTurns}`,
        nextRunAt: j.nextRunAt !== undefined ? new Date(j.nextRunAt).toISOString() : null,
        goal: truncate(j.goal, 120),
      }))
      return { output: JSON.stringify(rows, null, 2), title: `list_jobs (${jobs.length})` }
    },
  })
}

/**
 * Write: schedule a new autonomous job. Always created read-only (a runaway guard — an
 * agent-spawned job cannot itself write/trade). If a schedule is given it is stored as-is;
 * the actual `next_run_at` is computed by the CLI tick layer when the job is first ticked.
 */
export function createScheduleJobTool(deps: { store: JobStore; cwd: string }): Tool {
  return buildTool({
    name: "schedule_job",
    description:
      "Create a new autonomous job for this project (always read-only). Optionally attach a recurrence schedule and a success spec. Returns the new job id.",
    inputSchema: z.object({
      goal: z.string(),
      maxTurns: z.number().int().positive().optional(),
      schedule: z.unknown().optional(),
      successSpec: z.unknown().optional(),
    }),
    effectClass: "write",
    isReadOnly: () => false,
    async call(input) {
      const id = crypto.randomUUID().slice(0, 8)
      deps.store.create({
        id,
        cwd: deps.cwd,
        goal: input.goal,
        maxTurns: input.maxTurns,
        schedule: input.schedule,
        successSpec: input.successSpec,
        readOnly: true,
      })
      const scheduled = input.schedule !== undefined
      const note = scheduled ? " Schedule stored; its next run is computed when the job is first ticked." : ""
      return { output: `Scheduled job ${id}.${note}`, title: `schedule_job ${id}` }
    },
  })
}
