#!/usr/bin/env bun
// A dependency-free MCP stdio server (newline-delimited JSON-RPC 2.0). It needs no node_modules,
// so it runs even from the install cache. Exposes one tool, `ping`, returning "pong".
import { stdin, stdout } from "node:process"

const TOOLS = [
  {
    name: "ping",
    description: "Health check: returns 'pong', echoing an optional message.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string", description: "optional text to echo back" } },
    },
  },
]

function send(msg) {
  stdout.write(`${JSON.stringify(msg)}\n`)
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result })
}
function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } })
}

function handle(req) {
  const { id, method, params } = req
  switch (method) {
    case "initialize":
      return reply(id, {
        // Echo the client's requested protocol version for maximum compatibility.
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "quantcept-sample-echo", version: "1.0.0" },
      })
    case "tools/list":
      return reply(id, { tools: TOOLS })
    case "tools/call": {
      if (params?.name !== "ping") return fail(id, -32601, `Unknown tool: ${params?.name}`)
      const message = params?.arguments?.message
      return reply(id, { content: [{ type: "text", text: message ? `pong: ${message}` : "pong" }] })
    }
    case "ping":
      return reply(id, {})
    default:
      // Notifications carry no id and need no response; unknown requests get method-not-found.
      if (id !== undefined && id !== null) fail(id, -32601, `Method not found: ${method}`)
  }
}

let buffer = ""
stdin.setEncoding("utf8")
stdin.on("data", (chunk) => {
  buffer += chunk
  let nl = buffer.indexOf("\n")
  while (nl !== -1) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (line) {
      try {
        handle(JSON.parse(line))
      } catch {
        // ignore malformed lines
      }
    }
    nl = buffer.indexOf("\n")
  }
})
