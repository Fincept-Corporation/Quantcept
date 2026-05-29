import type { ShellKind } from "./args"

export function detectShell(): { path: string; kind: ShellKind } {
  if (process.platform === "win32") {
    const pwsh = Bun.which("pwsh") ?? Bun.which("powershell")
    if (pwsh) return { path: pwsh, kind: "powershell" }
    const bash = Bun.which("bash")
    if (bash) return { path: bash, kind: "posix" }
    return { path: process.env.COMSPEC ?? "cmd.exe", kind: "cmd" }
  }
  const sh = process.env.SHELL ?? Bun.which("bash") ?? "/bin/sh"
  return { path: sh, kind: "posix" }
}
