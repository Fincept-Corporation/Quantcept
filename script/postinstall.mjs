#!/usr/bin/env node
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const platformMap = { darwin: "darwin", linux: "linux", win32: "windows" }
const archMap = { x64: "x64", arm64: "arm64" }
const platform = platformMap[os.platform()] ?? os.platform()
const arch = archMap[os.arch()] ?? os.arch()
const pkgName = `quantcept-${platform}-${arch}`
const binName = platform === "windows" ? "quantcept.exe" : "quantcept"
const target = path.join(__dirname, "..", "bin", binName)

try {
  const pkgJson = require.resolve(`${pkgName}/package.json`)
  const source = path.join(path.dirname(pkgJson), "bin", binName)
  if (!fs.existsSync(source)) throw new Error(`binary missing at ${source}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (fs.existsSync(target)) fs.unlinkSync(target)
  try {
    fs.linkSync(source, target)
  } catch {
    fs.copyFileSync(source, target)
  }
  if (platform !== "windows") fs.chmodSync(target, 0o755)
  console.log(`quantcept: linked ${pkgName}`)
} catch {
  // Non-fatal and quiet: the platform binary package may not be installed
  // (e.g. installing from source, or before the platform packages are
  // published). The launcher's runtime findBinary() fallback handles
  // resolution, so we exit cleanly rather than spamming install output.
}
