export interface LoopbackCapture {
  /** The redirect URI to register with the OAuth client / pass to the transport. */
  redirectUri: string
  /** Resolves with the authorization code, or rejects on error/timeout. Stops the server. */
  waitForCode(): Promise<string>
  /** Stop the temporary server early (idempotent). */
  close(): void
}

export type CallbackOutcome = { kind: "code"; code: string } | { kind: "error"; message: string } | { kind: "ignore" }

// Pure decision logic for an incoming loopback request. Kept separate from Bun.serve so it
// can be unit-tested directly (under `bun test`, Bun.serve with port:0 does not report the
// real bound port, so a fetch-driven test of the live server is unreliable; the server glue
// is exercised in manual dev instead).
export function parseLoopbackCallback(reqUrl: string, callbackPath: string, expectedState?: string): CallbackOutcome {
  const url = new URL(reqUrl, "http://127.0.0.1")
  if (url.pathname !== callbackPath) return { kind: "ignore" }

  const error = url.searchParams.get("error")
  if (error) return { kind: "error", message: `OAuth authorization failed: ${error}` }

  const state = url.searchParams.get("state")
  if (expectedState !== undefined && state !== expectedState) {
    return { kind: "error", message: "OAuth state mismatch" }
  }

  const code = url.searchParams.get("code")
  if (!code) return { kind: "error", message: "No authorization code in callback" }

  return { kind: "code", code }
}

function htmlResponse(message: string): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif"><p>${message}</p>` +
      `<script>setTimeout(function(){window.close()},2000)</script></body></html>`,
    { headers: { "content-type": "text/html" } },
  )
}

// Starts a temporary localhost HTTP server on an ephemeral port to capture the OAuth
// authorization-code redirect. Validates the state parameter when provided.
export function startLoopbackCapture(
  opts: { state?: string; timeoutMs?: number; path?: string } = {},
): LoopbackCapture {
  const callbackPath = opts.path ?? "/callback"
  const timeoutMs = opts.timeoutMs ?? 300_000

  let resolveCode!: (code: string) => void
  let rejectCode!: (err: Error) => void
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const outcome = parseLoopbackCallback(req.url, callbackPath, opts.state)
      if (outcome.kind === "ignore") return new Response("Not found", { status: 404 })
      if (outcome.kind === "error") {
        rejectCode(new Error(outcome.message))
        return htmlResponse("Authorization failed. You can close this tab.")
      }
      resolveCode(outcome.code)
      return htmlResponse("Authorization complete. You can close this tab and return to Quantcept.")
    },
  })

  const redirectUri = `http://127.0.0.1:${server.port}${callbackPath}`

  let timer: ReturnType<typeof setTimeout> | undefined
  const guarded = new Promise<string>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`OAuth callback timed out after ${timeoutMs}ms`)), timeoutMs)
    codePromise.then(resolve, reject)
  })

  const close = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    server.stop(true)
  }

  return {
    redirectUri,
    waitForCode: () => guarded.finally(close),
    close,
  }
}
