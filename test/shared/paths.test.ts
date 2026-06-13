import { describe, expect, test } from "bun:test"
import { CONFIG_DIR_NAME, configRoot } from "@shared/paths"
import os from "os"
import path from "path"

describe("shared configRoot", () => {
  test("defaults to ~/.quantcept when QUANTCEPT_CONFIG_DIR is unset", () => {
    delete process.env.QUANTCEPT_CONFIG_DIR
    expect(configRoot()).toBe(path.join(os.homedir(), CONFIG_DIR_NAME))
  })
  test("honors QUANTCEPT_CONFIG_DIR for the whole user tree", () => {
    process.env.QUANTCEPT_CONFIG_DIR = "/tmp/qc-root"
    try {
      expect(configRoot()).toBe("/tmp/qc-root")
    } finally {
      delete process.env.QUANTCEPT_CONFIG_DIR
    }
  })
})
