import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js"
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js"
import type { McpAuthStore } from "./store"

export interface OAuthProviderDeps {
  store: McpAuthStore
  server: string
  /** The loopback callback URL the authorization server redirects back to. */
  redirectUrl: string
  scopes?: string[]
  /** Invoked when the SDK needs the user to authorize — opens the browser. */
  onRedirect: (url: URL) => void | Promise<void>
}

// Implements the SDK's OAuthClientProvider, persisting everything through McpAuthStore.
// The SDK drives PKCE, dynamic client registration, discovery, and token refresh; this
// class only supplies storage + the redirect. The PKCE code verifier is kept in memory
// for the duration of a single interactive flow (not persisted).
export class QuantceptOAuthProvider implements OAuthClientProvider {
  private _codeVerifier?: string

  constructor(private readonly deps: OAuthProviderDeps) {}

  get redirectUrl(): string {
    return this.deps.redirectUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Quantcept",
      redirect_uris: [this.deps.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      ...(this.deps.scopes?.length ? { scope: this.deps.scopes.join(" ") } : {}),
    }
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return this.deps.store.get(this.deps.server)?.clientInformation
  }

  saveClientInformation(info: OAuthClientInformationFull): void {
    this.deps.store.setClientInformation(this.deps.server, info)
  }

  tokens(): OAuthTokens | undefined {
    return this.deps.store.get(this.deps.server)?.tokens
  }

  saveTokens(tokens: OAuthTokens): void {
    this.deps.store.setTokens(this.deps.server, tokens)
  }

  redirectToAuthorization(authorizationUrl: URL): void | Promise<void> {
    return this.deps.onRedirect(authorizationUrl)
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier
  }

  codeVerifier(): string {
    if (!this._codeVerifier) throw new Error("No PKCE code verifier saved")
    return this._codeVerifier
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.deps.store.setDiscoveryState(this.deps.server, state)
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.deps.store.get(this.deps.server)?.discoveryState
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    if (scope === "verifier") {
      this._codeVerifier = undefined
      return
    }
    // For all/client/tokens/discovery, clearing the persisted record is the safe reset
    // that forces a clean re-auth on the next attempt.
    this.deps.store.clear(this.deps.server)
    if (scope === "all") this._codeVerifier = undefined
  }
}
