import { describe, expect, test } from "bun:test"
import { StorageError } from "@shared/errors"
import { translateFsWriteError, windowsLockdownArgv, writeOwnerFile } from "@shared/fsperm"
import { mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const fsErr = (code: string) => Object.assign(new Error("raw"), { code })

describe("windowsLockdownArgv", () => {
  test("builds icacls argv that strips inheritance and grants the user only (win32)", () => {
    expect(windowsLockdownArgv("C:\\Users\\t\\.quantcept\\settings.json", "tilak", "win32")).toEqual([
      "C:\\Users\\t\\.quantcept\\settings.json",
      "/inheritance:r",
      "/grant:r",
      "tilak:F",
    ])
  })
  test("returns null off Windows (POSIX uses chmod instead)", () => {
    expect(windowsLockdownArgv("/home/t/.quantcept/settings.json", "tilak", "linux")).toBeNull()
    expect(windowsLockdownArgv("/Users/t/.quantcept/settings.json", "tilak", "darwin")).toBeNull()
  })
})

describe("translateFsWriteError", () => {
  test("maps EACCES to a readable StorageError naming the path + the override hint", () => {
    const out = translateFsWriteError(fsErr("EACCES"), "/x/settings.json")
    expect(out).toBeInstanceOf(StorageError)
    expect((out as Error).message).toContain("/x/settings.json")
    expect((out as Error).message).toContain("permission denied")
    expect((out as Error).message).toContain("QUANTCEPT_CONFIG_DIR")
  })
  test("maps the other write-failure codes to StorageError", () => {
    expect(translateFsWriteError(fsErr("EPERM"), "/x")).toBeInstanceOf(StorageError)
    expect(translateFsWriteError(fsErr("EROFS"), "/x")).toBeInstanceOf(StorageError)
    expect(translateFsWriteError(fsErr("ENOSPC"), "/x")).toBeInstanceOf(StorageError)
  })
  test("passes unrelated errors through unchanged (no false friendly wrap)", () => {
    const eexist = fsErr("EEXIST")
    expect(translateFsWriteError(eexist, "/x")).toBe(eexist)
    const plain = new Error("no code")
    expect(translateFsWriteError(plain, "/x")).toBe(plain)
  })
})

describe("writeOwnerFile", () => {
  test("creates missing parent dirs and writes the contents", () => {
    const tmp = mkdtempSync(join(tmpdir(), "qc-fsperm-"))
    try {
      const file = join(tmp, "nested", "deep", "out.json")
      writeOwnerFile(file, '{"a":1}')
      expect(readFileSync(file, "utf8")).toBe('{"a":1}')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
