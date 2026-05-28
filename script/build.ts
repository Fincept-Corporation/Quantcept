#!/usr/bin/env bun
import fs from "fs"
import path from "path"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const dir = path.resolve(import.meta.dir, "..")
process.chdir(dir)

const VERSION = JSON.parse(fs.readFileSync("package.json", "utf8")).version
const plugin = createSolidTransformPlugin()

// OpenTUI tree-sitter worker must be a separate entrypoint with its bunfs path injected.
const localWorker = path.resolve(dir, "node_modules/@opentui/core/parser.worker.js")
const parserWorker = fs.realpathSync(localWorker)

const singleFlag = process.argv.includes("--single")

const allTargets = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "x64" },
  { os: "win32", arch: "x64" },
] as const

const targets = singleFlag
  ? allTargets.filter((t) => t.os === process.platform && t.arch === process.arch)
  : allTargets

fs.rmSync("dist", { recursive: true, force: true })

for (const t of targets) {
  const name = `quantcept-${t.os === "win32" ? "windows" : t.os}-${t.arch}`
  const bunfsRoot = t.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerRel = path.relative(dir, parserWorker).replaceAll("\\", "/")
  fs.mkdirSync(`dist/${name}/bin`, { recursive: true })

  await Bun.build({
    conditions: ["browser"],
    tsconfig: "./tsconfig.json",
    plugins: [plugin],
    format: "esm",
    minify: true,
    splitting: true,
    entrypoints: ["./src/cli/index.ts", parserWorker],
    compile: {
      // The dev-time bunfig preload (@opentui/solid/preload) only registers the
      // JSX transform, which is already baked in at build time by the Solid plugin
      // below. Loading it inside the standalone binary fails ("preload not found"),
      // so disable bunfig/dotenv autoload for the compiled artifact.
      autoloadBunfig: false,
      autoloadDotenv: false,
      target: name.replace("quantcept", "bun") as never,
      outfile: `dist/${name}/bin/quantcept`,
    },
    define: {
      QUANTCEPT_VERSION: `'${VERSION}'`,
      OTUI_TREE_SITTER_WORKER_PATH: `'${bunfsRoot}${workerRel}'`,
    },
  })

  // Smoke test the current-platform build.
  if (t.os === process.platform && t.arch === process.arch) {
    const binPath = t.os === "win32" ? `./dist/${name}/bin/quantcept.exe` : `./dist/${name}/bin/quantcept`
    const out = await Bun.$`${binPath} --version`.text()
    if (!out.trim()) throw new Error(`Smoke test failed for ${name}`)
    console.log(`Smoke test passed for ${name}: ${out.trim()}`)
  }

  fs.writeFileSync(
    `dist/${name}/package.json`,
    JSON.stringify({ name, version: VERSION, os: [t.os], cpu: [t.arch] }, null, 2),
  )
}
console.log("Build complete")
