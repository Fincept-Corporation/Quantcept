import type { HookCommand, HookConfig, HookEvent } from "./types"

/** A source's hooks, grouped so they can be removed as a unit. */
interface Entry {
  source: string
  config: HookConfig
}

/** A matcher-less group always fires; a matcher-bearing group needs a defined toolName the regex accepts. */
function groupMatches(matcher: string | undefined, toolName: string | undefined): boolean {
  if (matcher === undefined) return true
  if (toolName === undefined) return false
  return new RegExp(matcher).test(toolName)
}

/** Holds plugin hooks keyed by source; flattens matching command hooks per event in insertion order. */
export class HookRegistry {
  private entries: Entry[] = []

  add(source: string, config: HookConfig): void {
    this.entries.push({ source, config })
  }

  remove(source: string): void {
    this.entries = this.entries.filter((e) => e.source !== source)
  }

  /** All command hooks whose matcher-group fires for `event` (and `toolName`, when relevant), in insertion order. */
  forEvent(event: HookEvent, toolName?: string): HookCommand[] {
    const out: HookCommand[] = []
    for (const { config } of this.entries) {
      for (const group of config[event] ?? []) {
        if (groupMatches(group.matcher, toolName)) out.push(...group.hooks)
      }
    }
    return out
  }

  isEmpty(): boolean {
    return this.entries.length === 0
  }
}
