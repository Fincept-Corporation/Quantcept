import { describe, expect, test } from "bun:test"
import { discoverWithPrecedence, loadManifestDir } from "@core/manifest/load"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "qc-manifest-"))
}

describe("loadManifestDir", () => {
  test("missing directory → empty array", async () => {
    expect(await loadManifestDir({ dir: path.join(os.tmpdir(), "qc-nope-xyz"), kind: "file", parse: () => 1 })).toEqual([])
  })

  test("kind:file parses *.md, skips non-md and a throwing entry (warns, no crash)", async () => {
    const dir = await tmp()
    await fs.writeFile(path.join(dir, "a.md"), "A", "utf8")
    await fs.writeFile(path.join(dir, "b.md"), "BOOM", "utf8")
    await fs.writeFile(path.join(dir, "c.txt"), "ignored", "utf8")
    const out = await loadManifestDir<string>({
      dir,
      kind: "file",
      parse: async (file) => {
        const raw = await fs.readFile(file, "utf8")
        if (raw === "BOOM") throw new Error("bad entry")
        return raw
      },
    })
    expect(out.sort()).toEqual(["A"])
    await fs.rm(dir, { recursive: true, force: true })
  })

  test("kind:dir iterates subdirectories only", async () => {
    const dir = await tmp()
    await fs.mkdir(path.join(dir, "one"))
    await fs.mkdir(path.join(dir, "two"))
    await fs.writeFile(path.join(dir, "loose.md"), "x", "utf8")
    const out = await loadManifestDir<string>({ dir, kind: "dir", parse: (p) => path.basename(p) })
    expect(out.sort()).toEqual(["one", "two"])
    await fs.rm(dir, { recursive: true, force: true })
  })

  test("custom match filter", async () => {
    const dir = await tmp()
    await fs.writeFile(path.join(dir, "keep.toml"), "1", "utf8")
    await fs.writeFile(path.join(dir, "skip.md"), "2", "utf8")
    const out = await loadManifestDir<string>({
      dir,
      kind: "file",
      match: (n) => n.endsWith(".toml"),
      parse: (p) => path.basename(p),
    })
    expect(out).toEqual(["keep.toml"])
    await fs.rm(dir, { recursive: true, force: true })
  })
})

describe("discoverWithPrecedence", () => {
  test("later layers override earlier ones by key, first-seen position retained", () => {
    const builtin = [{ name: "a", v: 1 }, { name: "b", v: 1 }]
    const user = [{ name: "b", v: 2 }]
    const project = [{ name: "a", v: 3 }, { name: "c", v: 3 }]
    expect(discoverWithPrecedence([builtin, user, project], (x) => x.name)).toEqual([
      { name: "a", v: 3 },
      { name: "b", v: 2 },
      { name: "c", v: 3 },
    ])
  })

  test("empty layers are fine", () => {
    expect(discoverWithPrecedence<{ name: string }>([[], []], (x) => x.name)).toEqual([])
  })
})
