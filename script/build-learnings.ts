import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Bundles the finceptgo `learnings` BitTorrent CLI alongside the Quantcept binary.
 *
 * The TUI is JavaScript and can't run a torrent client in-process, so P2P learnings download/seed
 * shells out to this Go binary (see core/learnings/sidecar.ts → binPath() looks next to the
 * executable). It lives in a SEPARATE repo (github.com/fincept/finceptgo, cmd/learnings), so this
 * step cross-compiles it from a local finceptgo checkout. It's pure Go (CGO disabled), so it
 * cross-compiles from any host for any target.
 *
 * This is best-effort: if Go isn't installed or the finceptgo source isn't found, the build logs a
 * reason and continues — P2P then falls back to plain HTTP download at runtime. (In CI, check out
 * finceptgo and set FINCEPTGO_DIR, or have finceptgo publish per-platform artifacts the release
 * fetches instead of building here.)
 */

/** Bun target os → Go GOOS. */
const GO_OS: Record<string, string> = { darwin: "darwin", linux: "linux", win32: "windows" }
/** Bun target arch → Go GOARCH. */
const GO_ARCH: Record<string, string> = { x64: "amd64", arm64: "arm64" }

/** Resolve the finceptgo checkout that holds cmd/learnings: FINCEPTGO_DIR, else sibling ../finceptgo. */
export function resolveFinceptgoDir(cwd: string = process.cwd()): string | undefined {
  const hasCmd = (d: string) => existsSync(path.join(d, "cmd", "learnings"))
  const fromEnv = process.env.FINCEPTGO_DIR
  if (fromEnv && hasCmd(fromEnv)) return fromEnv
  const sibling = path.resolve(cwd, "..", "finceptgo")
  if (hasCmd(sibling)) return sibling
  return undefined
}

/**
 * Cross-compile `learnings` for one Bun target into `binDir`. Returns true on success; false (with
 * a logged reason) when skipped, so the caller never has to handle it as fatal.
 */
export async function bundleLearningsBinary(opts: { os: string; arch: string; binDir: string }): Promise<boolean> {
  const goos = GO_OS[opts.os]
  const goarch = GO_ARCH[opts.arch]
  if (!goos || !goarch) {
    console.warn(`[learnings] no Go target for ${opts.os}/${opts.arch} — P2P binary not bundled`)
    return false
  }
  const dir = resolveFinceptgoDir()
  if (!dir) {
    console.warn(
      "[learnings] finceptgo source not found (set FINCEPTGO_DIR or check out ../finceptgo) — " +
        "P2P binary not bundled; runtime falls back to HTTP download",
    )
    return false
  }
  const exe = opts.os === "win32" ? "learnings.exe" : "learnings"
  // Absolute: `go build` runs with cwd=finceptgo, so a relative -o would land in the wrong repo.
  const outFile = path.resolve(opts.binDir, exe)
  try {
    const proc = Bun.spawn(["go", "build", "-trimpath", "-o", outFile, "./cmd/learnings"], {
      cwd: dir,
      env: { ...process.env, CGO_ENABLED: "0", GOOS: goos, GOARCH: goarch },
      stdout: "pipe",
      stderr: "pipe",
    })
    await proc.exited
    if (proc.exitCode !== 0) {
      const err = (await new Response(proc.stderr).text()).trim()
      console.warn(`[learnings] go build failed for ${goos}/${goarch} — P2P binary not bundled:\n${err}`)
      return false
    }
    console.log(`[learnings] bundled ${exe} for ${goos}/${goarch}`)
    return true
  } catch (e) {
    console.warn(
      `[learnings] could not run 'go build' (is Go installed?) — P2P binary not bundled: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
    return false
  }
}
