import type { PermissionDecision, PermissionMode, ToolPermissionInfo } from "./schema"

export function checkPermission(tool: ToolPermissionInfo, mode: PermissionMode): PermissionDecision {
  if (tool.isReadOnly) return "allow"
  if (tool.isDestructive) return mode === "allow" ? "allow" : "ask"
  if (mode === "allow") return "allow"
  if (mode === "deny") return "deny"
  return "ask"
}
