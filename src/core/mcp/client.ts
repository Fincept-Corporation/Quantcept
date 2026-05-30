import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
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

interface FinishAuthTransport {
  finishAuth?(code: string): Promise<void>
}

export type TransportKind = "stdio" | "http" | "sse"

export type MakeClient = () => LowLevelClient
export type MakeTransport = (kind: TransportKind, config: McpServer) => unknown

// Name-based as well as instanceof: an UnauthorizedError can originate from the SDK's
// own transport module, and bun's test runner can load the SDK class more than once.
export function isUnauthorized(e: unknown): boolean {
  return e instanceof UnauthorizedError || (e instanceof Error && e.name === "UnauthorizedError")
}

// A stdio MCP server that crashes on startup (bad config, a missing required env var) writes
// the reason to its OWN stderr and exits; the SDK then only sees the stdio pipe close and
// rejects connect() with a generic message, hiding the real cause. We wrap the transport's
// start() to drain its stderr into a capped buffer so that cause can be folded into the error
// the agent/user ultimately sees. Returns a getter for whatever was captured.
function captureTransportStderr(transport: unknown): () => string {
  const t = transport as {
    start?: () => Promise<void>
    stderr?: { on?: (event: string, cb: (chunk: unknown) => void) => void } | null
  }
  if (typeof t.start !== "function") return () => ""
  let buf = ""
  const MAX = 4000
  const realStart = t.start.bind(t)
  t.start = async () => {
    try {
      await realStart()
    } finally {
      // stderr exists only once the child is spawned (during start). A piped stream buffers
      // data emitted before this listener attaches, so earlier output is not lost.
      const s = t.stderr
      s?.on?.("data", (chunk: unknown) => {
        if (buf.length < MAX) buf += String(chunk)
      })
    }
  }
  return () => buf.trim().slice(0, MAX)
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

const defaultMakeClient: MakeClient = () => {
  const c = new Client({ name: "quantcept", version: "0.0.0" })
  return c as unknown as LowLevelClient
}

export class McpClient {
  private client?: LowLevelClient
  // The most recently built transport. Retained even when connect throws UnauthorizedError
  // so the OAuth code exchange (finishAuth) runs on the transport that began the flow.
  private lastTransport?: unknown
  private readonly makeClient: MakeClient
  private readonly makeTransport: MakeTransport

  constructor(
    private readonly serverName: string,
    private readonly config: McpServer,
    makeClient: MakeClient = defaultMakeClient,
    makeTransport?: MakeTransport,
    // Supplied for http servers with auth:{type:"oauth"}; rides the transport.
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
    // "auto": modern Streamable HTTP first, fall back to legacy SSE on a transport error.
    // An UnauthorizedError means the server is reachable but needs auth — never fall back.
    try {
      await this.connectVia("http")
    } catch (e) {
      if (isUnauthorized(e)) throw e
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
    this.lastTransport = transport
    // stdio servers can crash on startup and only explain themselves on their own stderr.
    const readStderr = kind === "stdio" ? captureTransportStderr(transport) : () => ""
    try {
      await withTimeout(client.connect(transport), this.config.timeout, "connect")
    } catch (e) {
      // Keep the transport reference for an OAuth finishAuth; only tear the client down on
      // non-auth failures so an orphaned subprocess/socket isn't left behind.
      if (!isUnauthorized(e)) await client.close().catch(() => {})
      const stderr = readStderr()
      if (stderr && !isUnauthorized(e)) {
        throw new ProviderError(`${e instanceof Error ? e.message : String(e)} — server stderr: ${stderr}`)
      }
      throw e
    }
    this.client = client
  }

  // Exchange the OAuth authorization code on the transport that began the flow, then a
  // subsequent connect() reads the freshly-saved tokens from the auth provider.
  async finishAuth(code: string): Promise<void> {
    const t = this.lastTransport as FinishAuthTransport | undefined
    if (!t?.finishAuth) throw new ProviderError("active MCP transport does not support finishAuth")
    await t.finishAuth(code)
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
    this.lastTransport = undefined
  }
}
