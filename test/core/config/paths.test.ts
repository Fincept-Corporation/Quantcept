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
  test("userConfigDir honors QUANTCEPT_CONFIG_DIR so settings live with the data tree", () => {
    process.env.QUANTCEPT_CONFIG_DIR = "/tmp/qc-custom"
    try {
      expect(userConfigDir()).toBe("/tmp/qc-custom")
    } finally {
      delete process.env.QUANTCEPT_CONFIG_DIR
    }
  })
})
