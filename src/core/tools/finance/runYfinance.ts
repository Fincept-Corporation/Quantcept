import path from "node:path"

export type YfKind = "info" | "income" | "balance" | "cashflow" | "history"
export type RunResult = { data: unknown } | { error: string }

let cachedPython: string | null | undefined

export function resolvePython(): string | null {
  if (cachedPython !== undefined) return cachedPython
  cachedPython = Bun.which("python") ?? Bun.which("python3") ?? Bun.which("py") ?? null
  return cachedPython
}

const SIDECAR = path.join(import.meta.dir, "sidecar.py")
const TIMEOUT_MS = 30_000

export async function runYfinance(ticker: string, kind: YfKind, opts?: { period?: string }): Promise<RunResult> {
  const py = resolvePython()
  if (!py) {
    return {
      error: "Finance tools require Python on PATH. Install Python 3, then `pip install yfinance`.",
    }
  }
  const args = [SIDECAR, ticker, kind]
  if (kind === "history" && opts?.period) args.push(opts.period)

  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn([py, ...args], { stdout: "pipe", stderr: "pipe" })
  } catch (e) {
    return { error: `Failed to start Python: ${e instanceof Error ? e.message : String(e)}` }
  }

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, TIMEOUT_MS)
  try {
    // Drain stdout AND stderr concurrently: yfinance/pandas are chatty on stderr, and a piped
    // stderr that nobody reads will fill the OS pipe buffer (~64KB) and deadlock the child on
    // its next write, so the process never exits. We read both before awaiting exit.
    const [out] = await Promise.all([
      new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
      new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
    ])
    await proc.exited
    if (timedOut) return { error: `yfinance call timed out after ${TIMEOUT_MS}ms` }
    const lastLine = out.trim().split("\n").at(-1) ?? "{}"
    let parsed: { data?: unknown; error?: string }
    try {
      parsed = JSON.parse(lastLine)
    } catch {
      return { error: `yfinance returned unparseable output: ${out.slice(0, 300)}` }
    }
    if (parsed.error === "yfinance_not_installed") {
      return { error: "Finance tools require the yfinance package. Run `pip install yfinance`." }
    }
    if (parsed.error) return { error: parsed.error }
    return { data: parsed.data ?? {} }
  } finally {
    clearTimeout(timer)
  }
}
