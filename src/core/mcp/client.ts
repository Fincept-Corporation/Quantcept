import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { ProviderError } from "@shared/errors"
import type { McpStdioServer } from "./config"
import type { McpToolDef } from "./types"

interface LowLevelClient {
  connect(transport: unknown): Promise<void>
  listTools(): Promise<{ tools: McpToolDef[] }>
  callTool(req: {
    name: string
    arguments: unknown
  }): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>
  close(): Promise<void>
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderError(`MCP ${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export class McpClient {
  private client?: LowLevelClient
  constructor(
    private readonly serverName: string,
    private readonly config: McpStdioServer,
    private readonly makeClient: () => LowLevelClient = () => {
      const c = new Client({ name: "quantcept", version: "0.0.0" })
      return c as unknown as LowLevelClient
    },
  ) {}

  async connect(): Promise<void> {
    const client = this.makeClient()
    const transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env,
      stderr: "pipe",
    })
    await withTimeout(client.connect(transport), this.config.timeout, "connect")
    this.client = client
  }

  async listTools(): Promise<McpToolDef[]> {
    if (!this.client) throw new ProviderError("MCP client not connected")
    const res = await withTimeout(this.client.listTools(), this.config.timeout, "listTools")
    return res.tools
  }

  async callTool(bareName: string, args: unknown): Promise<{ output: string; isError: boolean }> {
    if (!this.client) throw new ProviderError("MCP client not connected")
    const r = await this.client.callTool({ name: bareName, arguments: args ?? {} })
    const output = (r.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
    return { output, isError: !!r.isError }
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = undefined
  }
}
