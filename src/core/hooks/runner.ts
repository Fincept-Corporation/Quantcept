import type { HookCommand, HookEvent, HookInput, HookOutcome, HookOutput } from "@core/hooks/types"

/** Runs one hook command: feeds JSON on stdin, returns exit code + captured streams. */
export type HookSpawnFn = (
  command: string,
  opts: { stdin: string; cwd: string; env: Record<string, string | undefined>; timeoutMs?: number },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>

/** Structural registry shape — decoupled from the real HookRegistry. */
interface HookLookup {
  forEvent(event: HookEvent, toolName?: string): HookCommand[]
}

/** Best-effort parse of a hook's stdout into a HookOutput; JSON errors → {}. */
function parseOutput(stdout: string): HookOutput {
  try {
    const v = JSON.parse(stdout)
    return v && typeof v === "object" ? (v as HookOutput) : {}
  } catch {
    return {}
  }
}

/** Default spawn: run via the platform shell, writing `stdin`, with an optional timeout. */
const defaultSpawn: HookSpawnFn = async (command, opts) => {
  const argv = process.platform === "win32" ? ["cmd", "/c", command] : ["sh", "-c", command]
  const proc = Bun.spawn(argv, {
    cwd: opts.cwd,
    env: opts.env,
    stdin: new TextEncoder().encode(opts.stdin),
    stdout: "pipe",
    stderr: "pipe",
    ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
  })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const exitCode = await proc.exited
  return { exitCode, stdout, stderr }
}

/**
 * Fire every hook registered for `input.event` (and tool, for tool events), aggregating their
 * outputs. No matching hooks → no spawn. `decision==="block"` or exit code 2 blocks the action;
 * the first block's reason wins (falling back to stderr on a code-2 exit). All non-empty
 * `additionalContext` strings are collected in order.
 */
export async function runHooks(
  registry: HookLookup,
  input: HookInput,
  deps?: { spawn?: HookSpawnFn },
): Promise<HookOutcome> {
  const cmds = registry.forEvent(input.event, input.toolName)
  if (cmds.length === 0) return { blocked: false, additionalContext: [] }

  const spawn = deps?.spawn ?? defaultSpawn
  const stdin = JSON.stringify(input)
  const additionalContext: string[] = []
  let blocked = false
  let reason: string | undefined

  for (const cmd of cmds) {
    const { exitCode, stdout, stderr } = await spawn(cmd.command, {
      stdin,
      cwd: input.cwd,
      env: process.env,
      timeoutMs: cmd.timeout,
    })
    const out = parseOutput(stdout)
    const ctx = out.additionalContext
    if (typeof ctx === "string" && ctx.trim() !== "") additionalContext.push(ctx)

    const isBlock = out.decision === "block" || exitCode === 2
    if (isBlock && !blocked) {
      blocked = true
      reason = out.reason ?? (exitCode === 2 ? stderr : undefined)
    }
  }

  return { blocked, reason, additionalContext }
}
