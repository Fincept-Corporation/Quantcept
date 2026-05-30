import type { ChatMessage } from "@core/llm/types"

export type JobStatus = "pending" | "running" | "done" | "paused" | "failed"
export type PauseReason = "budget" | "max-turns" | "needs-human" | "error"

export interface Job {
  id: string
  projectHash: string
  cwd: string
  goal: string
  status: JobStatus
  pauseReason?: PauseReason
  successSpec?: unknown
  schedule?: unknown
  budget?: unknown
  missedPolicy?: "catch_up" | "skip"
  maxTurns: number
  turnsUsed: number
  readOnly: boolean
  nextRunAt?: number
  lastRunAt?: number
  createdAt: number
  updatedAt: number
}

/** One persisted turn = the resume cursor + decision-audit record. */
export interface JobTurn {
  seq: number
  messages: ChatMessage[]
  text: string
  model?: string
  promptSha?: string
  inputTokens: number
  outputTokens: number
  ts: number
}
