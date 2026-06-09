import { arityPrefix } from "@core/permissions/arity"
import { z } from "zod/v4"
import { shellArgs } from "../shell/args"
import { detectShell } from "../shell/detect"
import { tokenizeCommands } from "../shell/tokenize"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  command: z.string(),
  timeout: z.number().int().positive().optional(),
  cwd: z.string().optional(),
  description: z.string().optional(),
})

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_OUTPUT = 100_000

export const ShellTool = buildTool({
  name: "shell",
  description:
    "Run a shell command (PowerShell on Windows, bash/sh on unix). Chained commands (&&, ||, ;, |) are each permission-checked. Use for scripts and system tasks — not for fetching URLs or downloading files (use the dedicated data tools for that).",
  inputSchema: InputSchema,
  isDestructive: () => true,
  permissionPatterns(input) {
    return tokenizeCommands(input.command).map((seg) => arityPrefix(seg).join(" "))
  },
  async call(input, ctx) {
    try {
      const { path, kind } = detectShell()
      const proc = Bun.spawn([path, ...shellArgs(kind, input.command)], {
        cwd: input.cwd ?? ctx.cwd,
        stdout: "pipe",
        stderr: "pipe",
      })
      const timeoutMs = input.timeout ?? DEFAULT_TIMEOUT_MS
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        proc.kill()
      }, timeoutMs)
      try {
        const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
        await proc.exited
        const combined = stdout + stderr
        let output = combined.slice(0, MAX_OUTPUT)
        if (combined.length > MAX_OUTPUT) output += "\n[output truncated]"
        if (timedOut) {
          return { output: `${output}\n[timed out after ${timeoutMs}ms]`, isError: true, title: "shell timeout" }
        }
        const code = proc.exitCode ?? 0
        return { output, title: `shell exit ${code}`, isError: code !== 0 }
      } finally {
        clearTimeout(timer)
      }
    } catch (e) {
      return { output: `shell failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
