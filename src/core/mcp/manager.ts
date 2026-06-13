import type { ToolRegistry } from "@core/tools/registry"
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import { logger } from "@shared/logger"
import { openBrowser as defaultOpenBrowser } from "./auth/browser"
import { type LoopbackCapture, startLoopbackCapture } from "./auth/loopback"
import { QuantceptOAuthProvider } from "./auth/provider"
import { McpAuthStore } from "./auth/store"
import { bridgeMcpTool } from "./bridge"
import { isUnauthorized, McpClient } from "./client"
import type { McpConfig, McpHttpServer, McpServer } from "./config"
import type { McpToolDef } from "./types"

// A connected client exposes just what the manager needs.
export interface ManagedClient {
  connect(): Promise<void>
  listTools(): Promise<McpToolDef[]>
  callTool(bareName: string, args: unknown): Promise<{ output: string; isError: boolean }>
  close(): Promise<void>
  finishAuth?(code: string): Promise<void>
}

export type McpClientFactory = (
  serverName: string,
  config: McpServer,
  authProvider?: OAuthClientProvider,
) => ManagedClient

export type ServerState = "connected" | "needs-auth" | "failed" | "disabled"

export interface McpServerStatus {
  name: string
  type: "stdio" | "http"
  transport?: "auto" | "http" | "sse"
  state: ServerState
  toolCount: number
}

export interface AuthResult {
  ok: boolean
  message: string
  toolCount?: number
  authUrl?: string
}

export interface AddResult {
  ok: boolean
  message: string
  state?: ServerState
  toolCount?: number
}

interface ServerRecord {
  name: string
  config: McpServer
  client?: ManagedClient
  state: ServerState
  toolNames: string[]
  // The last connect-failure detail (includes server stderr when available), surfaced to
  // the caller of addServer so the agent can act on the real cause.
  error?: string
}

export interface McpManagerDeps {
  makeClient?: McpClientFactory
  store?: McpAuthStore
  startLoopback?: (opts: { state?: string; timeoutMs?: number }) => LoopbackCapture
  openBrowser?: (url: string) => Promise<boolean>
}

const defaultFactory: McpClientFactory = (name, config, authProvider) =>
  new McpClient(name, config, undefined, undefined, authProvider)

export class McpManager {
  private records = new Map<string, ServerRecord>()
  private registry?: ToolRegistry
  private started = false
  private readonly makeClient: McpClientFactory
  private readonly store: McpAuthStore
  private readonly startLoopback: (opts: { state?: string; timeoutMs?: number }) => LoopbackCapture
  private readonly openBrowser: (url: string) => Promise<boolean>

  // Accepts either a bare client factory (Phase 1/2 call sites) or a deps object.
  constructor(deps: McpClientFactory | McpManagerDeps = {}) {
    const d: McpManagerDeps = typeof deps === "function" ? { makeClient: deps } : deps
    this.makeClient = d.makeClient ?? defaultFactory
    this.store = d.store ?? new McpAuthStore()
    this.startLoopback = d.startLoopback ?? ((o) => startLoopbackCapture(o))
    this.openBrowser = d.openBrowser ?? defaultOpenBrowser
  }

  async start(cfg: McpConfig, registry: ToolRegistry): Promise<void> {
    if (this.started) return
    this.started = true
    this.registry = registry
    await Promise.all(
      Object.entries(cfg.servers).map(async ([name, s]) => {
        const rec: ServerRecord = { name, config: s, state: "disabled", toolNames: [] }
        this.records.set(name, rec)
        if (!s.enabled) return
        if (s.type === "http" && s.auth?.type === "oauth") {
          await this.startOAuthServer(rec, s)
        } else {
          await this.connectAndRegister(rec, this.makeClient(name, s))
        }
      }),
    )
  }

  // Non-OAuth (stdio + open/static-header http): connect, list, and register.
  private async connectAndRegister(rec: ServerRecord, client: ManagedClient): Promise<boolean> {
    // Track the client on the record up front — BEFORE connect() — so that a concurrent
    // disconnect()/removeServer() mid-handshake can close the in-flight transport (the spawned
    // subprocess / open socket) instead of orphaning it once connect() finally resolves.
    rec.client = client
    try {
      await client.connect()
      const defs = await client.listTools()
      this.registerDefs(rec, defs, client)
      rec.state = "connected"
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      rec.error = msg
      logger.warn("MCP server failed to start", { server: rec.name, error: msg })
      rec.state = "failed"
      return false
    }
  }

  // OAuth servers connect silently at startup ONLY when a token is already stored. Missing
  // tokens (or a failed silent refresh) → "needs-auth"; we never open a browser here.
  private async startOAuthServer(rec: ServerRecord, s: McpHttpServer): Promise<void> {
    if (!this.store.get(rec.name)?.tokens) {
      rec.state = "needs-auth"
      return
    }
    const provider = this.makeProvider(rec.name, s, "http://127.0.0.1:0/callback", async () => {})
    const client = this.makeClient(rec.name, s, provider)
    rec.client = client // track before connect so a mid-handshake disconnect can close it
    try {
      await client.connect()
      const defs = await client.listTools()
      this.registerDefs(rec, defs, client)
      rec.state = "connected"
    } catch (e) {
      if (isUnauthorized(e)) {
        rec.state = "needs-auth"
      } else {
        logger.warn("MCP OAuth server failed to start", { server: rec.name, error: String(e) })
        rec.state = "failed"
      }
    }
  }

  // Interactive browser authorization for one server, then register its tools live.
  async authenticate(name: string): Promise<AuthResult> {
    const rec = this.records.get(name)
    if (!rec) return { ok: false, message: `Unknown MCP server: ${name}` }
    const s = rec.config
    if (s.type !== "http" || s.auth?.type !== "oauth") {
      return { ok: false, message: `Server ${name} is not an OAuth server` }
    }

    // Clean slate for a re-auth: drop any existing connection + its tools.
    await this.disconnect(name)

    const loop = this.startLoopback({ timeoutMs: 300_000 })
    let authUrl: string | undefined
    const provider = this.makeProvider(name, s, loop.redirectUri, async (url) => {
      authUrl = url.toString()
      const opened = await this.openBrowser(authUrl)
      if (!opened) logger.warn("Could not open a browser; authorize manually", { url: authUrl })
    })
    const client = this.makeClient(name, s, provider)
    rec.client = client // track before the (possibly long) browser+connect flow so it can be closed

    try {
      try {
        await client.connect()
      } catch (e) {
        if (!isUnauthorized(e)) throw e
        // The SDK called redirectToAuthorization during connect (browser opened); now wait
        // for the loopback callback, exchange the code, and reconnect with fresh tokens.
        const code = await loop.waitForCode()
        if (!client.finishAuth) throw new Error("client does not support finishAuth")
        await client.finishAuth(code)
        await client.connect()
      }
      const defs = await client.listTools()
      this.registerDefs(rec, defs, client)
      rec.state = "connected"
      return { ok: true, message: `Authenticated ${name} — ${defs.length} tool(s) available`, toolCount: defs.length }
    } catch (e) {
      rec.state = "needs-auth"
      const detail = e instanceof Error ? e.message : String(e)
      const hint = authUrl ? ` Authorize manually at: ${authUrl}` : ""
      return { ok: false, message: `Auth failed for ${name}: ${detail}.${hint}`, authUrl }
    } finally {
      loop.close()
    }
  }

  // Add a server at runtime: connect + register its tools live. Independent of the one-shot
  // `start()` guard. Does NOT persist — the caller writes settings.json on success, so a
  // persist failure can't unwind a live connection and a failed connect is never saved.
  async addServer(name: string, config: McpServer): Promise<AddResult> {
    if (!this.registry) return { ok: false, message: "MCP manager not started" }
    if (this.records.has(name)) return { ok: false, message: `MCP server "${name}" already exists` }

    const rec: ServerRecord = { name, config, state: "disabled", toolNames: [] }
    this.records.set(name, rec)
    if (!config.enabled) return { ok: true, message: `Added "${name}" (disabled)`, state: "disabled" }

    if (config.type === "http" && config.auth?.type === "oauth") {
      await this.startOAuthServer(rec, config) // → needs-auth (no browser at add time)
    } else {
      await this.connectAndRegister(rec, this.makeClient(name, config))
    }
    if (rec.state === "failed") {
      const detail = rec.error ? `: ${rec.error}` : ""
      this.records.delete(name) // don't leave a half-added, broken server behind
      return { ok: false, message: `"${name}" failed to connect; not added${detail}` }
    }
    return {
      ok: true,
      message: `Added "${name}" — ${rec.toolNames.length} tool(s)`,
      state: rec.state,
      toolCount: rec.toolNames.length,
    }
  }

  // Remove a server entirely: disconnect, unregister its tools, drop the record + creds.
  async removeServer(name: string): Promise<{ ok: boolean; message: string }> {
    if (!this.records.has(name)) return { ok: false, message: `Unknown MCP server: ${name}` }
    await this.disconnect(name)
    this.records.delete(name)
    this.store.clear(name)
    return { ok: true, message: `Removed "${name}"` }
  }

  // Clear stored credentials and disconnect; the server returns to "needs-auth".
  async logout(name: string): Promise<{ ok: boolean; message: string }> {
    const rec = this.records.get(name)
    if (!rec) return { ok: false, message: `Unknown MCP server: ${name}` }
    await this.disconnect(name)
    this.store.clear(name)
    if (rec.config.type === "http" && rec.config.auth?.type === "oauth") rec.state = "needs-auth"
    return { ok: true, message: `Logged out of ${name}` }
  }

  // Close a server's connection and unregister its tools (keeps the record + stored creds).
  async disconnect(name: string): Promise<void> {
    const rec = this.records.get(name)
    if (!rec) return
    for (const toolName of rec.toolNames) this.registry?.unregister(toolName)
    rec.toolNames = []
    if (rec.client) {
      await rec.client.close().catch(() => {})
      rec.client = undefined
    }
  }

  status(): McpServerStatus[] {
    return [...this.records.values()].map((rec) => ({
      name: rec.name,
      type: rec.config.type,
      transport: rec.config.type === "http" ? rec.config.transport : undefined,
      state: rec.state,
      toolCount: rec.toolNames.length,
    }))
  }

  async stop(): Promise<void> {
    await Promise.all([...this.records.values()].map((rec) => rec.client?.close().catch(() => {})))
    this.records.clear()
    this.registry = undefined
    this.started = false
  }

  private makeProvider(
    server: string,
    s: McpHttpServer,
    redirectUrl: string,
    onRedirect: (url: URL) => void | Promise<void>,
  ): OAuthClientProvider {
    return new QuantceptOAuthProvider({
      store: this.store,
      server,
      redirectUrl,
      scopes: s.auth?.type === "oauth" ? s.auth.scopes : undefined,
      onRedirect,
    })
  }

  private registerDefs(rec: ServerRecord, defs: McpToolDef[], client: ManagedClient): void {
    for (const def of defs) {
      const tool = bridgeMcpTool(rec.name, def, client as unknown as McpClient)
      if (this.registry?.has(tool.name)) this.registry.unregister(tool.name)
      this.registry?.register(tool)
      rec.toolNames.push(tool.name)
    }
  }
}
