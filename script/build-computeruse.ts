import { copyFileSync, existsSync } from "node:fs"
import path from "node:path"

/**
 * Bundles the `quantcept-computeruse` Rust sidecar alongside the Quantcept binary.
 *
 * Computer-use (screen capture + mouse/keyboard) shells out to this native binary over a JSON-RPC
 * stdio protocol (see core/tools/computeruse/resolveBinary.ts → it looks next to the running
 * executable in a published install). The crate lives in-repo at `sidecar/computeruse`.
 *
 * Unlike the Go learnings binary, this CANNOT be cross-compiled: xcap/enigo link platform GUI
 * frameworks, so each target must be built on its own OS (the release matrix does exactly that).
 * We therefore only build when the requested target matches the host; for any other target we skip
 * (the matching native runner produces it).
 *
 * Best-effort: if Rust isn't installed or the build fails, we log a reason and continue — computer-use
 * then stays cleanly disabled at runtime (resolveSidecarBinary returns null) rather than breaking
 * the whole build.
 */

const CRATE_REL = path.join("sidecar", "computeruse")

/** Cargo crate dir (holds Cargo.toml), or undefined if not present. */
export function resolveComputeruseCrate(cwd: string = process.cwd()): string | undefined {
  const dir = path.resolve(cwd, CRATE_REL)
  return existsSync(path.join(dir, "Cargo.toml")) ? dir : undefined
}

/**
 * Build `quantcept-computeruse` for one Bun target into `binDir`. Returns true on success; false
 * (with a logged reason) when skipped, so the caller never has to treat it as fatal.
 */
export async function bundleComputeruseBinary(opts: { os: string; arch: string; binDir: string }): Promise<boolean> {
  // Rust sidecar can't cross-compile (native GUI frameworks) — only the host target is buildable here.
  if (opts.os !== process.platform || opts.arch !== process.arch) {
    console.warn(
      `[computeruse] skip ${opts.os}/${opts.arch} (host is ${process.platform}/${process.arch}; ` +
        "xcap/enigo can't cross-compile — its own native runner builds it)",
    )
    return false
  }
  const crate = resolveComputeruseCrate()
  if (!crate) {
    console.warn("[computeruse] sidecar/computeruse not found — computer-use binary not bundled")
    return false
  }
  const exe = opts.os === "win32" ? "quantcept-computeruse.exe" : "quantcept-computeruse"
  try {
    // On Windows, static-link the mingw runtime so the .exe is self-contained (matches the crate
    // README). No-op effect on macОS/Linux, where we leave RUSTFLAGS untouched.
    const env =
      opts.os === "win32"
        ? { ...process.env, RUSTFLAGS: `${process.env.RUSTFLAGS ?? ""} -C target-feature=+crt-static`.trim() }
        : process.env
    const proc = Bun.spawn(["cargo", "build", "--release"], { cwd: crate, env, stdout: "pipe", stderr: "pipe" })
    await proc.exited
    if (proc.exitCode !== 0) {
      const err = (await new Response(proc.stderr).text()).trim()
      console.warn(`[computeruse] cargo build failed — computer-use binary not bundled:\n${err}`)
      return false
    }
    const built = path.join(crate, "target", "release", exe)
    if (!existsSync(built)) {
      console.warn(`[computeruse] build succeeded but ${built} is missing — not bundled`)
      return false
    }
    copyFileSync(built, path.resolve(opts.binDir, exe))
    console.log(`[computeruse] bundled ${exe} for ${opts.os}/${opts.arch}`)
    return true
  } catch (e) {
    console.warn(
      `[computeruse] could not run 'cargo build' (is Rust installed?) — computer-use binary not bundled: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
    return false
  }
}
