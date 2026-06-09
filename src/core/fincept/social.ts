import { FinceptError } from "@shared/errors"
import type { FinceptSession } from "./types"

export type SocialProvider = "google" | "github" | "apple" | "microsoft"

export interface SocialLoginDeps {
  baseUrl: string
  /** Opens the provider-start URL in a browser. Injected so tests drive the callback directly. */
  open: (url: string) => void | Promise<void>
  /** Loopback timeout (ms). Default 3 minutes. */
  timeoutMs?: number
}

/**
 * Desktop loopback social login. Spins a one-shot server on 127.0.0.1:<ephemeral>, opens the
 * system browser to `/v1/auth/{provider}/start?redirect=<loopback>`, and resolves when the API
 * 302s back with `?api_key&session_token` (success) or rejects on `?error=<code>` / timeout.
 * Only the loopback host is involved between this process and the API (no provider registration).
 */
export function startSocialLogin(provider: SocialProvider, deps: SocialLoginDeps): Promise<FinceptSession> {
  const timeoutMs = deps.timeoutMs ?? 180_000
  return new Promise<FinceptSession>((resolve, reject) => {
    let settled = false
    const html =
      "<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;padding:2rem\">" +
      "<h3>Signed in to Quantcept.</h3><p>You can close this tab and return to the terminal.</p></body>"

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const u = new URL(req.url)
        if (u.pathname !== "/callback") return new Response("not found", { status: 404 })
        const apiKey = u.searchParams.get("api_key")
        const sessionToken = u.searchParams.get("session_token") ?? undefined
        const error = u.searchParams.get("error")
        queueMicrotask(() => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          server.stop(true)
          if (apiKey) resolve({ apiKey, sessionToken })
          else reject(new FinceptError(`social login failed: ${error ?? "no_credentials"}`, error ?? "oauth_failed"))
        })
        return new Response(html, { headers: { "Content-Type": "text/html" } })
      },
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      server.stop(true)
      reject(new FinceptError("social login timed out or was cancelled", "oauth_timeout"))
    }, timeoutMs)

    const redirect = `http://127.0.0.1:${server.port}/callback`
    const start = `${deps.baseUrl.replace(/\/+$/, "")}/v1/auth/${provider}/start?redirect=${encodeURIComponent(redirect)}`
    void Promise.resolve(deps.open(start)).catch(() => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.stop(true)
      reject(new FinceptError("could not open the browser for social login", "browser_open_failed"))
    })
  })
}
