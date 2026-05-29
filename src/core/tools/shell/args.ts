export type ShellKind = "posix" | "powershell" | "cmd"

export function shellArgs(kind: ShellKind, command: string): string[] {
  if (kind === "powershell") return ["-NoProfile", "-NonInteractive", "-Command", command]
  if (kind === "cmd") return ["/c", command]
  return ["-c", command]
}
