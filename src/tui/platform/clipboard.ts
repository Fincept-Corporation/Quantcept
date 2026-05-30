/**
 * Copy text to the system clipboard, robust across terminals.
 *
 * Many terminals block the OSC 52 escape (the only thing OpenTUI's renderer can
 * do on its own), so we prefer the platform's clipboard CLI, which needs no
 * terminal cooperation:
 *   1. Native CLI — `clip` (Windows), `pbcopy` (macOS), `wl-copy`/`xclip`/`xsel`
 *      (Linux). Reliable on a local machine.
 *   2. OSC 52 via the renderer — fallback for remote/SSH sessions where the
 *      local clipboard CLI can't be reached.
 */

export interface CopyResult {
  ok: boolean
  method: "native" | "osc52" | "none"
}

interface Osc52Capable {
  copyToClipboardOSC52(text: string): boolean
}

export async function copyToClipboard(text: string, osc52?: Osc52Capable): Promise<CopyResult> {
  if (await tryNative(text)) return { ok: true, method: "native" }
  if (osc52?.copyToClipboardOSC52(text)) return { ok: true, method: "osc52" }
  return { ok: false, method: "none" }
}

async function tryNative(text: string): Promise<boolean> {
  for (const cmd of nativeCommands()) {
    const tool = cmd[0]
    if (!tool) continue
    if (await spawnWithStdin(cmd, encodeFor(tool, text))) return true
  }
  return false
}

function nativeCommands(): string[][] {
  switch (process.platform) {
    case "win32":
      return [["clip"]]
    case "darwin":
      return [["pbcopy"]]
    default:
      return [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]]
  }
}

function encodeFor(tool: string, text: string): Uint8Array {
  // clip.exe mangles UTF-8 but auto-detects and decodes UTF-16LE correctly. No
  // BOM — clip keeps a BOM as a literal leading char. Every other tool takes UTF-8.
  return tool === "clip" ? utf16le(text) : new TextEncoder().encode(text)
}

async function spawnWithStdin(cmd: string[], bytes: Uint8Array): Promise<boolean> {
  try {
    const proc = Bun.spawn(cmd, { stdin: bytes, stdout: "ignore", stderr: "ignore" })
    return (await proc.exited) === 0
  } catch {
    // Command not present (e.g. no xclip installed) — let the next candidate try.
    return false
  }
}

function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    out[i * 2] = code & 0xff
    out[i * 2 + 1] = (code >> 8) & 0xff
  }
  return out
}
