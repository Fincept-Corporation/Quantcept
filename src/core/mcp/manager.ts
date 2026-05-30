import type { ToolRegistry } from "@core/tools/registry"
import { logger } from "@shared/logger"
import { bridgeMcpTool } from "./bridge"
import { McpClient } from "./client"
import type { McpConfig, McpServer } from "./config"
import type { McpToolDef } from "./types"

// A connected client exposes just what the manager needs.
export interface ManagedClient {
  connect(): Promise<void>
  listTools(): Promise<McpToolDef[]>
  callTool(bareName: string, args: unknown): Promise<{ output: string; isError: boolean }>
  close(): Promise<void>
}

export type McpClientFactory = (serverName: string, config: McpServer) => ManagedClient

const defaultFactory: McpClientFactory = (name, config) => new McpClient(name, config)

export class McpManager {
  private clients: ManagedClient[] = []
  private started = false
  constructor(private readonly makeClient: McpClientFactory = defaultFactory) {}

  async start(cfg: McpConfig, registry: ToolRegistry): Promise<void> {
    if (this.started) return
    this.started = true
    await Promise.all(
      Object.entries(cfg.servers)
        .filter(([, s]) => s.enabled)
        .map(async ([name, s]) => {
          try {
            const client = this.makeClient(name, s)
            await client.connect()
            const defs = await client.listTools()
            for (const def of defs) registry.register(bridgeMcpTool(name, def, client as unknown as McpClient))
            this.clients.push(client)
          } catch (e) {
            logger.warn("MCP server failed to start", { server: name, error: String(e) })
          }
        }),
    )
  }

  async stop(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.close().catch(() => {})))
    this.clients = []
    this.started = false
  }
}
