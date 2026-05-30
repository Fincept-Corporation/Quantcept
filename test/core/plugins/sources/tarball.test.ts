import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fetchTarball } from "@core/plugins/sources/tarball"

/** A Response-like stub good enough for fetchTarball (ok + arrayBuffer). */
function fakeResponse(status: number, bytes: ArrayBuffer): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes,
  } as unknown as Response
}

describe("fetchTarball", () => {
  test("fetches the url, writes a temp archive, and extracts into destDir", async () => {
    const bytes = new TextEncoder().encode("x").buffer
    let fetched: string | undefined
    const calls: Array<{ archivePath: string; destDir: string }> = []

    const dest = path.join(os.tmpdir(), `qc-tarball-${Date.now()}`)
    await fetchTarball(
      { url: "https://example.com/p.tgz" },
      dest,
      {
        fetch: (async (url: string) => {
          fetched = url
          return fakeResponse(200, bytes)
        }) as unknown as typeof fetch,
        extract: async (archivePath, destDir) => {
          // archive must exist on disk at extract time, and destDir is forwarded.
          calls.push({ archivePath, destDir })
          expect(existsSync(archivePath)).toBe(true)
        },
      },
    )

    expect(fetched).toBe("https://example.com/p.tgz")
    expect(calls).toHaveLength(1)
    expect(calls[0]!.destDir).toBe(dest)
    expect(existsSync(dest)).toBe(true)
  })

  test("throws a QuantceptError on a non-ok response (404)", async () => {
    let extracted = false
    const promise = fetchTarball(
      { url: "https://example.com/missing.tgz" },
      path.join(os.tmpdir(), `qc-tarball-404-${Date.now()}`),
      {
        fetch: (async () => fakeResponse(404, new ArrayBuffer(0))) as unknown as typeof fetch,
        extract: async () => {
          extracted = true
        },
      },
    )
    await expect(promise).rejects.toThrow(/tarball/i)
    expect(extracted).toBe(false)
  })
})
