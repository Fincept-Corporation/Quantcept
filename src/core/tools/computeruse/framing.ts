/**
 * Newline-delimited JSON decoder for the sidecar's stdout. A long-lived process streams
 * responses, and a single OS read can split or merge JSON objects across chunk boundaries,
 * so we buffer bytes and only emit complete lines. Malformed/blank lines are dropped rather
 * than throwing, so one bad line can't wedge the transport.
 */
export class JsonLineDecoder {
  private buf = ""

  push(chunk: string): unknown[] {
    this.buf += chunk
    const out: unknown[] = []
    let nl = this.buf.indexOf("\n")
    while (nl >= 0) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      if (line) {
        try {
          out.push(JSON.parse(line))
        } catch {
          // drop malformed line
        }
      }
      nl = this.buf.indexOf("\n")
    }
    return out
  }
}
