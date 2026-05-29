import { ToolRegistry } from "@core/tools/registry"

/** A registry containing only the allowed tools; returns `full` if allowed is undefined. */
export function filterRegistry(full: ToolRegistry, allowed?: string[]): ToolRegistry {
  if (!allowed) return full
  const allow = new Set(allowed)
  const filtered = new ToolRegistry()
  for (const tool of full.list()) {
    if (allow.has(tool.name)) filtered.register(tool)
  }
  return filtered
}
