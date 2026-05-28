export type PermissionMode = "ask" | "allow" | "deny"
export type PermissionDecision = "allow" | "ask" | "deny"

export interface ToolPermissionInfo {
  isReadOnly: boolean
  isDestructive: boolean
}
