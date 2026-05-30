import fs from "node:fs/promises"
import { PluginManifestSchema } from "../manifest"
import type { AdaptResult } from "./types"

/** Neutral Quantcept plugin: validate the manifest as-is. */
export async function adaptNeutral(_dir: string, manifestPath: string): Promise<AdaptResult> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8"))
  return { manifest: PluginManifestSchema.parse(raw), format: "neutral", commandFormat: "md", contextDefaults: [] }
}
