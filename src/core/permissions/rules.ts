import type { PermissionDecision } from "./schema"
import { wildcardMatch } from "./wildcard"

export interface PermissionRule {
  permission: string // tool-name glob, e.g. "shell" or "*"
  pattern: string // value glob, e.g. "git *"
  action: PermissionDecision
}

/** Returns the matched rule's action (latest-wins), or undefined when no rule matches. */
export function evaluate(permission: string, value: string, rules: PermissionRule[]): PermissionDecision | undefined {
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i]
    if (wildcardMatch(permission, r.permission) && wildcardMatch(value, r.pattern)) return r.action
  }
  return undefined
}
