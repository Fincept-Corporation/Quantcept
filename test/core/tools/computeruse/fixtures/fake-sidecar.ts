// Fake computer-use sidecar for integration tests. Reads newline-delimited JSON requests on
// stdin and writes one JSON response per line on stdout, echoing the action count in `cursor`
// so tests can verify id-correlation. Mirrors the real sidecar's transport, not its behaviour.
const decoder = new TextDecoder()
let buf = ""
for await (const chunk of Bun.stdin.stream()) {
  buf += decoder.decode(chunk as Uint8Array, { stream: true })
  let nl = buf.indexOf("\n")
  while (nl >= 0) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    nl = buf.indexOf("\n")
    if (!line) continue
    let req: { id: number; actions?: unknown[]; capture?: unknown; control?: string }
    try {
      req = JSON.parse(line)
    } catch {
      continue
    }
    const actionCount = Array.isArray(req.actions) ? req.actions.length : 0
    const res: Record<string, unknown> = { id: req.id }
    if (req.control === "release_all") {
      res.released = true
    } else {
      res.cursor = [actionCount, 0]
      if (req.capture) {
        res.screenshot = { data: "FAKEPNG", width: 1024, height: 768, originalWidth: 2048, originalHeight: 1536 }
      }
    }
    process.stdout.write(`${JSON.stringify(res)}\n`)
  }
}
