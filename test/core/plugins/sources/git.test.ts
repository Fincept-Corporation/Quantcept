import { describe, expect, test } from "bun:test"
import { QuantceptError } from "@shared/errors"
import { fetchGit, type SpawnFn } from "@core/plugins/sources/git"

type Call = { cmd: string; args: string[]; opts?: { cwd?: string } }

/** Fake SpawnFn that records every call and returns a fixed result. */
function recorder(result = { exitCode: 0, stdout: "", stderr: "" }): { spawn: SpawnFn; calls: Call[] } {
  const calls: Call[] = []
  const spawn: SpawnFn = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts })
    return result
  }
  return { spawn, calls }
}

describe("fetchGit", () => {
  test("shallow-clones with --depth 1, the url, and destDir", async () => {
    const { spawn, calls } = recorder()
    await fetchGit({ url: "https://example.com/r.git" }, "/dest", spawn)
    expect(calls.length).toBe(1)
    const { cmd, args } = calls[0]!
    expect(cmd).toBe("git")
    expect(args).toContain("clone")
    expect(args).toContain("--depth")
    expect(args).toContain("1")
    expect(args).toContain("https://example.com/r.git")
    expect(args).toContain("/dest")
    // depth flag carries its value
    expect(args[args.indexOf("--depth") + 1]).toBe("1")
  })

  test("adds --branch <ref> when ref is set", async () => {
    const { spawn, calls } = recorder()
    await fetchGit({ url: "https://example.com/r.git", ref: "main" }, "/dest", spawn)
    const { args } = calls[0]!
    expect(args).toContain("--branch")
    expect(args[args.indexOf("--branch") + 1]).toBe("main")
  })

  test("omits --branch when ref is unset", async () => {
    const { spawn, calls } = recorder()
    await fetchGit({ url: "https://example.com/r.git" }, "/dest", spawn)
    expect(calls[0]!.args).not.toContain("--branch")
  })

  test("fetch + checkout <sha> in destDir when sha is set", async () => {
    const { spawn, calls } = recorder()
    await fetchGit({ url: "https://example.com/r.git", sha: "deadbeef" }, "/dest", spawn)
    expect(calls.length).toBe(3)
    expect(calls[0]!.args).toContain("clone")
    expect(calls[1]!.args).toContain("fetch")
    expect(calls[1]!.opts?.cwd).toBe("/dest")
    expect(calls[2]!.args).toContain("checkout")
    expect(calls[2]!.args).toContain("deadbeef")
    expect(calls[2]!.opts?.cwd).toBe("/dest")
  })

  test("throws QuantceptError (code PLUGIN) including stderr on non-zero exit", async () => {
    const { spawn } = recorder({ exitCode: 128, stdout: "", stderr: "fatal: repo not found" })
    let err: unknown
    try {
      await fetchGit({ url: "https://example.com/r.git" }, "/dest", spawn)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(QuantceptError)
    expect((err as QuantceptError).code).toBe("PLUGIN")
    expect((err as Error).message).toContain("fatal: repo not found")
  })

  test("rejects a url starting with '-' (option injection) without spawning", async () => {
    const { spawn, calls } = recorder()
    await expect(fetchGit({ url: "--upload-pack=touch x" }, "/dest", spawn)).rejects.toBeInstanceOf(QuantceptError)
    expect(calls.length).toBe(0)
  })

  test("rejects an ext:: transport url (RCE vector)", async () => {
    const { spawn } = recorder()
    await expect(fetchGit({ url: "ext::sh -c id" }, "/dest", spawn)).rejects.toBeInstanceOf(QuantceptError)
  })

  test("rejects a ref starting with '-'", async () => {
    const { spawn } = recorder()
    await expect(fetchGit({ url: "https://e.com/r.git", ref: "--evil" }, "/dest", spawn)).rejects.toBeInstanceOf(
      QuantceptError,
    )
  })

  test("clone ends options with '--' before the url positional", async () => {
    const { spawn, calls } = recorder()
    await fetchGit({ url: "https://e.com/r.git" }, "/dest", spawn)
    const { args } = calls[0]!
    expect(args).toContain("--")
    expect(args.indexOf("--")).toBeLessThan(args.indexOf("https://e.com/r.git"))
  })

  test("rejects a subdir that escapes destDir (path traversal)", async () => {
    const { spawn } = recorder()
    await expect(
      fetchGit({ url: "https://e.com/r.git", subdir: "../../etc" }, "/dest", spawn),
    ).rejects.toBeInstanceOf(QuantceptError)
  })
})
