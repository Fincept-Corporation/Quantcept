import { describe, expect, test } from "bun:test"
import { userConfigDir, projectConfigDir } from "@core/config/paths"
import os from "os"
import path from "path"

describe("config paths", () => {
  test("userConfigDir is ~/.quantcept", () => {
    expect(userConfigDir()).toBe(path.join(os.homedir(), ".quantcept"))
  })
  test("projectConfigDir is <cwd>/.quantcept", () => {
    expect(projectConfigDir("/tmp/proj")).toBe(path.join("/tmp/proj", ".quantcept"))
  })
})
