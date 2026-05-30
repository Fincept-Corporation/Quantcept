import { userConfigDir } from "@core/config/paths"
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js"
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js"
import { logger } from "@shared/logger"
import fs from "fs"
import path from "path"

export interface McpAuthRecord {
  tokens?: OAuthTokens
  clientInformation?: OAuthClientInformationFull
  discoveryState?: OAuthDiscoveryState
}

type AuthFile = Record<string, McpAuthRecord>

// Persists OAuth tokens, dynamic-client-registration info, and discovery state per MCP
// server in ~/.quantcept/mcp-auth.json with owner-only (0600) permissions. A keychain
// backend could later slot in behind this same interface.
export class McpAuthStore {
  constructor(private readonly file: string = path.join(userConfigDir(), "mcp-auth.json")) {}

  private readAll(): AuthFile {
    try {
      if (!fs.existsSync(this.file)) return {}
      return JSON.parse(fs.readFileSync(this.file, "utf8")) as AuthFile
    } catch (e) {
      logger.warn("failed to read MCP auth store; treating as empty", { file: this.file, error: String(e) })
      return {}
    }
  }

  private writeAll(data: AuthFile): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), { mode: 0o600 })
    // mode on writeFileSync is ignored when the file already exists; tighten explicitly.
    // Best-effort: chmod is a no-op/throws on some Windows filesystems.
    try {
      fs.chmodSync(this.file, 0o600)
    } catch {
      // ignore — restrictive perms are best-effort on non-POSIX filesystems
    }
  }

  private update(server: string, patch: (rec: McpAuthRecord) => McpAuthRecord): void {
    const all = this.readAll()
    all[server] = patch(all[server] ?? {})
    this.writeAll(all)
  }

  get(server: string): McpAuthRecord | undefined {
    return this.readAll()[server]
  }

  setTokens(server: string, tokens: OAuthTokens): void {
    this.update(server, (r) => ({ ...r, tokens }))
  }

  setClientInformation(server: string, clientInformation: OAuthClientInformationFull): void {
    this.update(server, (r) => ({ ...r, clientInformation }))
  }

  setDiscoveryState(server: string, discoveryState: OAuthDiscoveryState): void {
    this.update(server, (r) => ({ ...r, discoveryState }))
  }

  clear(server: string): void {
    const all = this.readAll()
    if (server in all) {
      delete all[server]
      this.writeAll(all)
    }
  }
}
