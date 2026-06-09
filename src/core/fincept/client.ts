import { FinceptAuthError, FinceptError, InsufficientCreditsError, SocialLoginRequiredError } from "@shared/errors"
import { publishCredits } from "./credits"
import { fetchTransport, type HttpTransport } from "./http"
import { publishSessionInvalidated } from "./session-events"
import type { FinceptEnvelope, FinceptSession } from "./types"

export interface FinceptRequest {
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  body?: unknown
  token?: string
  idempotencyKey?: string
  timeoutMs?: number
}

export interface FinceptResult<T> {
  data: T
  message?: string
  creditsBalance?: number
  creditsCost?: number
}

/**
 * Minimal HTTP client for the Fincept backend. Parses the standard response envelope
 * ({ success, data, error, ... }) and maps failures to typed errors:
 *  - 401              -> FinceptAuthError      (key missing/invalid/revoked -> re-gate)
 *  - 402 / insufficient_credits -> InsufficientCreditsError(required, available)
 *  - other non-2xx    -> FinceptError(message, <error code>)
 *  - network/timeout  -> FinceptError(message, "NETWORK")
 * Mirrors the LLM adapter pattern in core/llm/adapters.
 */
export class FinceptClient {
  constructor(
    private readonly baseUrl: string,
    private readonly transport: HttpTransport = fetchTransport,
    private readonly session?: () => FinceptSession | undefined,
  ) {}

  /** X-Session-Token from the bound session getter, when present. */
  private sessionHeaders(): Record<string, string> {
    const st = this.session?.()?.sessionToken
    return st ? { "X-Session-Token": st } : {}
  }

  /** JSON request/response. */
  async request<T>(req: FinceptRequest): Promise<FinceptResult<T>> {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...this.sessionHeaders() }
    if (req.token) headers.Authorization = `Bearer ${req.token}`
    if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey
    const res = await this.send(
      req.path,
      { method: req.method, headers, body: req.body === undefined ? undefined : JSON.stringify(req.body) },
      req.timeoutMs,
    )
    return this.parse<T>(res)
  }

  /**
   * Multipart upload (FormData). Deliberately omits Content-Type so the runtime
   * adds the correct multipart boundary. Same envelope + error mapping as request().
   */
  async upload<T>(path: string, form: FormData, token?: string, timeoutMs?: number): Promise<FinceptResult<T>> {
    const headers: Record<string, string> = { ...this.sessionHeaders() }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await this.send(path, { method: "POST", headers, body: form }, timeoutMs ?? 60_000)
    return this.parse<T>(res)
  }

  private async send(path: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
    const url = this.baseUrl.replace(/\/+$/, "") + path
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? 30_000)
    try {
      return await this.transport(url, { ...init, signal: ctrl.signal })
    } catch (e) {
      throw new FinceptError(`network error: ${(e as Error)?.message ?? String(e)}`, "NETWORK")
    } finally {
      clearTimeout(timer)
    }
  }

  private async parse<T>(res: Response): Promise<FinceptResult<T>> {
    let env: FinceptEnvelope<T> = {} as FinceptEnvelope<T>
    const text = await res.text()
    if (text) {
      try {
        env = JSON.parse(text) as FinceptEnvelope<T>
      } catch {
        /* non-JSON body — leave env empty and fall through to status-based error */
      }
    }

    if (!res.ok || env.success === false) {
      const code = env.error ?? `http_${res.status}`
      const raw = (env as unknown as Record<string, unknown>).message
      const msg = typeof raw === "string" ? raw : `Request failed (${res.status})`
      if (res.status === 401) {
        if (code === "session_invalidated") {
          publishSessionInvalidated(code)
          throw new FinceptAuthError(msg)
        }
        if (code === "use_social_login") throw new SocialLoginRequiredError(msg)
        throw new FinceptAuthError(msg)
      }
      if (res.status === 402 || code === "insufficient_credits") {
        const c = env.credits ?? { required: 0, available: 0 }
        throw new InsufficientCreditsError(c.required, c.available, msg)
      }
      throw new FinceptError(msg, code)
    }

    const num = (h: string) => {
      const v = res.headers.get(h)
      return v == null ? undefined : Number(v)
    }
    const creditsBalance = num("Credits-Balance")
    // Keep the displayed balance in sync everywhere: any response carrying the header updates it.
    if (creditsBalance !== undefined && Number.isFinite(creditsBalance)) publishCredits(creditsBalance)
    return {
      data: env.data as T,
      message: env.message,
      creditsBalance,
      creditsCost: num("Credits-Cost"),
    }
  }
}
