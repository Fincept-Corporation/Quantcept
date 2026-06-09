import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Drives the Go `learnings` binary (the BitTorrent client) as a sidecar — the
 * TUI is JavaScript and can't run anacrolix in-process. Download/seed run as
 * subprocesses; progress is parsed from the binary's `--json` NDJSON stdout.
 *
 * Auth is injected via env (LEARNINGS_API_URL/_API_KEY/_TRACKER_URL) so the
 * sidecar reuses Quantcept's logged-in key — no separate `learnings login`.
 */

/** One NDJSON event from the binary — mirrors cmd/learnings/jsonout.go. */
export interface SidecarEvent {
  event: "start" | "progress" | "done" | "error"
  id?: string
  title?: string
  pct?: number
  downloaded?: number
  total?: number
  peers?: number
  path?: string
  via?: "torrent" | "http"
  message?: string
}

export interface SidecarOptions {
  /** Fincept API base URL (the hosted backend, e.g. https://api.quantcept.io). */
  apiUrl: string
  /** Live API-key getter (the AuthProvider's token). */
  token: () => string | undefined
  /** Live tracker announce URL getter — required only for seeding. */
  trackerUrl?: () => string | undefined
  /** Explicit binary path; otherwise resolved from env / next-to-exe / PATH. */
  binPath?: string
}

export interface SeedHandle {
  stop: () => void
}

export class LearningsSidecar {
  constructor(private readonly opts: SidecarOptions) {}

  /** Locate the `learnings` binary: explicit → env → next to the Quantcept
   *  binary (bundled in prod) → PATH. */
  binPath(): string {
    if (this.opts.binPath) return this.opts.binPath
    const fromEnv = process.env.QUANTCEPT_LEARNINGS_BIN
    if (fromEnv) return fromEnv
    const exe = process.platform === "win32" ? "learnings.exe" : "learnings"
    try {
      const bundled = path.join(path.dirname(process.execPath), exe)
      if (existsSync(bundled)) return bundled
    } catch {
      /* fall through to PATH */
    }
    return exe
  }

  private env(): Record<string, string> {
    const e: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) e[k] = v
    e.LEARNINGS_API_URL = this.opts.apiUrl
    const tok = this.opts.token()
    if (tok) e.LEARNINGS_API_KEY = tok
    const tracker = this.opts.trackerUrl?.()
    if (tracker) e.LEARNINGS_TRACKER_URL = tracker
    return e
  }

  /**
   * Download a learning over P2P (torrent-first, HTTP fallback), streaming
   * progress via onEvent. Resolves with the terminal event (done or error).
   */
  async download(id: string, onEvent: (e: SidecarEvent) => void, outDir?: string): Promise<SidecarEvent> {
    const args = ["get", id, "--json"]
    if (outDir) args.push("--out", outDir)

    let last: SidecarEvent = { event: "start", id }
    try {
      const proc = Bun.spawn([this.binPath(), ...args], { env: this.env(), stdout: "pipe", stderr: "pipe" })
      const reader = proc.stdout.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          try {
            const ev = JSON.parse(line) as SidecarEvent
            last = ev
            onEvent(ev)
          } catch {
            /* ignore non-JSON noise on stdout */
          }
        }
      }
      await proc.exited
      if (proc.exitCode !== 0 && last.event !== "error") {
        const stderr = (await new Response(proc.stderr).text()).trim()
        const err: SidecarEvent = { event: "error", message: stderr || `learnings exited ${proc.exitCode}` }
        onEvent(err)
        return err
      }
      return last
    } catch (e) {
      // Most commonly the binary isn't found (spawn throws ENOENT).
      const err: SidecarEvent = {
        event: "error",
        message: `learnings sidecar failed (${this.binPath()}): ${e instanceof Error ? e.message : String(e)}. Is it installed? Set QUANTCEPT_LEARNINGS_BIN.`,
      }
      onEvent(err)
      return err
    }
  }

  /**
   * Start seeding the local store (contribute to the swarm) in the background.
   * Requires trackerUrl. Returns a handle to stop it.
   */
  seedStart(): SeedHandle {
    try {
      const proc = Bun.spawn([this.binPath(), "seed"], { env: this.env(), stdout: "ignore", stderr: "ignore" })
      return { stop: () => proc.kill() }
    } catch {
      return { stop: () => {} }
    }
  }
}
