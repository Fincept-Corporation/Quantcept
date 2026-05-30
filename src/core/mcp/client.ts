import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { ProviderError } from "@shared/errors"
import { logger } from "@shared/logger"
import type { McpHttpServer, McpServer, McpStdioServer } from "./config"
import { httpTransportOptions } from "./headers"
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

export type TransportKind = "stdio" | "http" | "sse"

export type MakeClient = () => LowLevelClient
export type MakeTransport = (kind: TransportKind, config: McpServer) => unknown

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

const defaultMakeClient: MakeClient = () => {
  const c = new Client({ name: "quantcept", version: "0.0.0" })
  return c as unknown as LowLevelClient
}

export class McpClient {
  private client?: LowLevelClient
  private readonly makeClient: MakeClient
  private readonly makeTransport: MakeTransport

  constructor(
    private readonly serverName: string,
    private readonly config: McpServer,
    makeClient: MakeClient = defaultMakeClient,
    makeTransport?: MakeTransport,
    // Phase 3: supplied for http servers with auth:{type:"oauth"}; rides the transport.
    private readonly authProvider?: OAuthClientProvider,
  ) {
    this.makeClient = makeClient
    this.makeTransport = makeTransport ?? ((kind, cfg) => this.buildDefaultTransport(kind, cfg))
  }

  // Real SDK transports. Tests inject `makeTransport` to bypass this and observe selection.
  private buildDefaultTransport(kind: TransportKind, config: McpServer): unknown {
    if (kind === "stdio") {
      const c = config as McpStdioServer
      return new StdioClientTransport({ command: c.command, args: c.args, env: c.env, stderr: "pipe" })
    }
    const c = config as McpHttpServer
    const url = new URL(c.url)
    const opts: Record<string, unknown> = { ...httpTransportOptions(c.headers, process.env) }
    if (this.authProvider) opts.authProvider = this.authProvider
    return kind === "sse" ? new SSEClientTransport(url, opts) : new StreamableHTTPClientTransport(url, opts)
  }

  async connect(): Promise<void> {
    if (this.config.type === "http") {
      await this.connectHttp(this.config)
    } else {
      await this.connectVia("stdio")
    }
  }

  private async connectHttp(config: McpHttpServer): Promise<void> {
    if (config.transport === "sse") return this.connectVia("sse")
    if (config.transport === "http") return this.connectVia("http")
    // "auto": modern Streamable HTTP first, fall back to legacy SSE on failure.
    try {
      await this.connectVia("http")
    } catch (e) {
      logger.warn("MCP Streamable HTTP failed; falling back to SSE", {
        server: this.serverName,
        error: String(e),
      })
      await this.connectVia("sse")
    }
  }

  private async connectVia(kind: TransportKind): Promise<void> {
    const client = this.makeClient()
    const transport = this.makeTransport(kind, this.config)
    try {
      await withTimeout(client.connect(transport), this.config.timeout, "connect")
    } catch (e) {
      await client.close().catch(() => {})
      throw e
    }
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
