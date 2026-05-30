import { describe, expect, test } from "bun:test"
import { fetchNpm } from "@core/plugins/sources/npm"

/** A packument with a single version and a "latest" dist-tag. */
function packument() {
  return {
    "dist-tags": { latest: "1.0.0" },
    versions: { "1.0.0": { dist: { tarball: "https://x/p.tgz" } } },
  }
}

/** Build a fake fetch that returns the given JSON and records the requested URL. */
function fakeFetch(json: unknown, urls: string[]) {
  return (async (url: string | URL | Request) => {
    urls.push(String(url))
    return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
}

describe("fetchNpm", () => {
  test("resolves dist-tags.latest and calls fetchTarball with the tarball url", async () => {
    const urls: string[] = []
    let resolved = ""
    let destSeen = ""
    await fetchNpm(
      { package: "p" },
      "/tmp/dest",
      {
        fetch: fakeFetch(packument(), urls),
        fetchTarball: async (s, destDir) => {
          resolved = s.url
          destSeen = destDir
        },
      },
    )
    expect(resolved).toBe("https://x/p.tgz")
    expect(destSeen).toBe("/tmp/dest")
    expect(urls[0]).toBe("https://registry.npmjs.org/p")
  })

  test("uses an explicit version when present", async () => {
    const urls: string[] = []
    let resolved = ""
    const pk = {
      "dist-tags": { latest: "2.0.0" },
      versions: {
        "1.0.0": { dist: { tarball: "https://x/p-1.tgz" } },
        "2.0.0": { dist: { tarball: "https://x/p-2.tgz" } },
      },
    }
    await fetchNpm({ package: "p", version: "1.0.0" }, "/tmp/dest", {
      fetch: fakeFetch(pk, urls),
      fetchTarball: async (s) => {
        resolved = s.url
      },
    })
    expect(resolved).toBe("https://x/p-1.tgz")
  })

  test("scoped package name is percent-encoded in the request url", async () => {
    const urls: string[] = []
    await fetchNpm({ package: "@acme/p" }, "/tmp/dest", {
      fetch: fakeFetch(packument(), urls),
      fetchTarball: async () => {},
    })
    expect(urls[0]).toContain("%2F")
    expect(urls[0]).toBe("https://registry.npmjs.org/@acme%2Fp")
  })

  test("honors a custom registry (trailing slash tolerated)", async () => {
    const urls: string[] = []
    await fetchNpm({ package: "p", registry: "https://npm.example.com/" }, "/tmp/dest", {
      fetch: fakeFetch(packument(), urls),
      fetchTarball: async () => {},
    })
    expect(urls[0]).toBe("https://npm.example.com/p")
  })

  test("throws PLUGIN when the package is missing (non-ok response)", async () => {
    const fetch404 = (async () => new Response("Not found", { status: 404 })) as unknown as typeof fetch
    await expect(
      fetchNpm({ package: "nope" }, "/tmp/dest", { fetch: fetch404, fetchTarball: async () => {} }),
    ).rejects.toMatchObject({ code: "PLUGIN" })
  })

  test("throws PLUGIN when the requested version is not found", async () => {
    const urls: string[] = []
    await expect(
      fetchNpm({ package: "p", version: "9.9.9" }, "/tmp/dest", {
        fetch: fakeFetch(packument(), urls),
        fetchTarball: async () => {},
      }),
    ).rejects.toMatchObject({ code: "PLUGIN" })
  })

  test("throws PLUGIN when the version has no tarball", async () => {
    const urls: string[] = []
    const pk = { "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": { dist: {} } } }
    await expect(
      fetchNpm({ package: "p" }, "/tmp/dest", {
        fetch: fakeFetch(pk, urls),
        fetchTarball: async () => {},
      }),
    ).rejects.toMatchObject({ code: "PLUGIN" })
  })

  test("throws PLUGIN when dist-tags.latest is missing and no version given", async () => {
    const urls: string[] = []
    const pk = { versions: { "1.0.0": { dist: { tarball: "https://x/p.tgz" } } } }
    await expect(
      fetchNpm({ package: "p" }, "/tmp/dest", {
        fetch: fakeFetch(pk, urls),
        fetchTarball: async () => {},
      }),
    ).rejects.toMatchObject({ code: "PLUGIN" })
  })
})
