import { logger } from "@shared/logger"

export type SpawnLike = (cmd: string[]) => { exited: Promise<number> }

const defaultSpawn: SpawnLike = (cmd) => Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" })

// Opens the system browser at `url`. Returns false (rather than throwing) when no browser
// can be launched — e.g. headless/SSH sessions — so callers can fall back to manual paste.
export async function openBrowser(url: string, spawn: SpawnLike = defaultSpawn): Promise<boolean> {
  const cmd =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url]
  try {
    const proc = spawn(cmd)
    // Do not await: the browser process outlives this call.
    void proc.exited
    return true
  } catch (e) {
    logger.warn("failed to open browser for MCP OAuth", { error: String(e) })
    return false
  }
}
