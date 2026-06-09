import { appendFileSync, mkdirSync } from "node:fs"
import nodePath from "node:path"
import { loadConfig } from "@core/config/load"
import { createProvider } from "@core/llm/provider"
import { createComputerUseAgentTool } from "@core/tools/computeruse/ComputerUseAgentTool"
import { createComputerUseTool } from "@core/tools/computeruse/ComputerUseTool"
import { resolveSidecarBinary } from "@core/tools/computeruse/resolveBinary"
import { SpawnSidecarClient } from "@core/tools/computeruse/SpawnSidecarClient"
import type { ToolRegistry } from "@core/tools/registry"
import { onCleanup } from "solid-js"

const COMPUTER_USE_AUDIT = nodePath.join(process.cwd(), ".quantcept", "computeruse-audit.log")
function appendComputerUseAudit(line: string): void {
  try {
    mkdirSync(nodePath.dirname(COMPUTER_USE_AUDIT), { recursive: true })
    appendFileSync(COMPUTER_USE_AUDIT, `${line}\n`)
  } catch {
    // audit is best-effort; never break the loop over a logging failure
  }
}

type ComputerUse = { client: SpawnSidecarClient; visionProvider: ReturnType<typeof createProvider> | undefined }

/**
 * Register the computer-use tool if (and only if) a vision provider is configured AND the
 * sidecar binary is present — otherwise computer-use stays cleanly disabled. Returns the
 * live sidecar client + the constructed vision provider for the loop to route image turns to.
 */
function setupComputerUse(registry: ToolRegistry, config: ReturnType<typeof loadConfig>): ComputerUse | null {
  const vp = config.visionProvider
  if (!vp) return null
  const bin = resolveSidecarBinary()
  if (!bin) return null
  const client = new SpawnSidecarClient(bin)

  // Best path: OpenAI GA computer-use (gpt-5.5, pixel-grounded) via the self-contained
  // `computerUse` agent tool — the primary model just delegates the whole GUI task to it.
  const isOpenAI = vp.id === "openai-chat" && (vp.baseUrl?.includes("openai.com") ?? false)
  if (isOpenAI && vp.apiKey) {
    registry.register(
      createComputerUseAgentTool({
        sidecar: client,
        apiKey: vp.apiKey,
        model: "gpt-5.5",
        onAudit: appendComputerUseAudit,
      }),
    )
    return { client, visionProvider: undefined }
  }

  // Fallback (non-OpenAI vision, e.g. local Ollama): the grid Set-of-Marks `computer` tool,
  // driven step-by-step by the configured vision provider via the loop's image routing.
  let visionProvider: ReturnType<typeof createProvider>
  try {
    visionProvider = createProvider(vp)
  } catch {
    void client.dispose()
    return null // misconfigured vision provider (e.g. missing key) → stay disabled
  }
  registry.register(
    createComputerUseTool({ client, captureLimits: { maxLongEdge: 1024 }, onAudit: appendComputerUseAudit }),
  )
  return { client, visionProvider }
}

export interface ComputerUseHandle {
  /** Current vision provider for the loop to route image turns to (undefined when disabled). */
  visionProvider: () => ReturnType<typeof createProvider> | undefined
  /** Re-apply computer-use config live (e.g. after `/computer-use <key>`) — no restart needed. */
  reload: () => void
}

/**
 * Owns the computer-use tool's lifecycle for a session: registers it into `registry` on setup,
 * disposes the sidecar on cleanup, and exposes the current `visionProvider` + a live `reload`
 * (used by the /computer-use command). Lifting it out of the session route keeps the whole
 * sidecar lifecycle in one place.
 */
export function useComputerUse(registry: ToolRegistry): ComputerUseHandle {
  let computerUse = setupComputerUse(registry, loadConfig())
  onCleanup(() => {
    const cu = computerUse
    if (cu) void cu.client.releaseAll().finally(() => void cu.client.dispose())
  })
  function reload(): void {
    const old = computerUse
    registry.unregister("computerUse")
    registry.unregister("computer")
    if (old) {
      void old.client
        .releaseAll()
        .catch(() => {})
        .finally(() => void old.client.dispose())
    }
    computerUse = setupComputerUse(registry, loadConfig())
  }
  return { visionProvider: () => computerUse?.visionProvider, reload }
}
