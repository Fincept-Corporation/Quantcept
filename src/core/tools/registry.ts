import { ToolError } from "@shared/errors"
import type { Tool } from "./Tool"

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) throw new ToolError(`Tool already registered: ${tool.name}`)
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  unregister(name: string): void {
    this.tools.delete(name)
  }

  list(): Tool[] {
    return [...this.tools.values()]
  }
}
