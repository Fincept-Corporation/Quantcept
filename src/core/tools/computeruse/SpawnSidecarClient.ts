import { JsonLineDecoder } from "./framing"
import type { SidecarRequest, SidecarResponse } from "./protocol"
import type { SidecarClient } from "./sidecarClient"

export interface SpawnOptions {
  /** Per-request timeout. A hung sidecar must not wedge the agent loop. */
  timeoutMs?: number
}

interface Pending {
  resolve: (r: SidecarResponse) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Long-lived JSON-RPC client over a sidecar process's stdin/stdout. Requests carry an
 * incrementing id; responses are correlated back by id (so concurrent in-flight requests
 * resolve to the right caller), framed by {@link JsonLineDecoder}. Mirrors the runYfinance
 * sidecar discipline (spawn + timeout) but keeps the process alive across calls so held
 * drag/key state survives between actions.
 */
export class SpawnSidecarClient implements SidecarClient {
  private readonly proc: Bun.Subprocess
  private readonly stdin: Bun.FileSink
  private readonly pending = new Map<number, Pending>()
  private readonly decoder = new JsonLineDecoder()
  private readonly timeoutMs: number
  private nextId = 1
  private disposed = false

  constructor(binaryPath: string, args: string[] = [], opts: SpawnOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 30_000
    this.proc = Bun.spawn([binaryPath, ...args], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
    this.stdin = this.proc.stdin as unknown as Bun.FileSink
    void this.consume()
    void this.drainStderr()
  }

  /**
   * Continuously read and discard the sidecar's stderr. A piped stderr that nobody consumes will
   * fill the OS pipe buffer (~64KB) and block the child on its next write, wedging this long-lived
   * process forever. We drain it (rather than `stderr: "ignore"`) so a future caller can tap it;
   * chunks are dropped immediately, so nothing is retained.
   */
  private async drainStderr(): Promise<void> {
    const stderr = this.proc.stderr as unknown as AsyncIterable<Uint8Array>
    try {
      for await (const _chunk of stderr) {
        // discard — drained purely to keep the pipe from filling
      }
    } catch {
      // stderr error/close — nothing to do; stdout closure drives lifecycle
    }
  }

  private async consume(): Promise<void> {
    const td = new TextDecoder()
    // Bun's stdout stream is async-iterable at runtime; the DOM ReadableStream type isn't.
    const stdout = this.proc.stdout as unknown as AsyncIterable<Uint8Array>
    try {
      for await (const chunk of stdout) {
        for (const obj of this.decoder.push(td.decode(chunk, { stream: true }))) {
          const res = obj as SidecarResponse
          const p = this.pending.get(res.id)
          if (p) {
            clearTimeout(p.timer)
            this.pending.delete(res.id)
            p.resolve(res)
          }
        }
      }
    } catch {
      // stdout error — fall through and reject everything still in flight
    }
    this.rejectAll(new Error("sidecar stdout closed"))
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
  }

  send(req: Omit<SidecarRequest, "id">): Promise<SidecarResponse> {
    if (this.disposed) return Promise.reject(new Error("sidecar disposed"))
    const id = this.nextId++
    const payload = `${JSON.stringify({ id, ...req })}\n`
    return new Promise<SidecarResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`sidecar request ${id} timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.stdin.write(payload)
      this.stdin.flush()
    })
  }

  async releaseAll(): Promise<void> {
    await this.send({ actions: [], control: "release_all" })
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    try {
      this.stdin.end()
    } catch {
      // ignore
    }
    this.proc.kill()
    this.rejectAll(new Error("sidecar disposed"))
  }
}
