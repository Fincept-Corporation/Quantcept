// Resolve ${ENV_VAR} references inside MCP HTTP header values so secrets stay in the
// environment rather than in settings.json. A missing referenced variable throws; the
// manager's per-server try/catch turns that into a skipped server (logged), never a crash.
export function interpolateHeaders(
  headers: Record<string, string> | undefined,
  env: Record<string, string | undefined>,
): Record<string, string> | undefined {
  if (!headers) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key] = value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => {
      const resolved = env[name]
      if (resolved === undefined) throw new Error(`Missing env var for MCP header: ${name}`)
      return resolved
    })
  }
  return out
}

// Build the HTTP transport options object (the `requestInit.headers` shape both
// StreamableHTTPClientTransport and SSEClientTransport accept) from configured headers.
export function httpTransportOptions(
  headers: Record<string, string> | undefined,
  env: Record<string, string | undefined>,
): { requestInit?: { headers: Record<string, string> } } {
  const resolved = interpolateHeaders(headers, env)
  return resolved ? { requestInit: { headers: resolved } } : {}
}
