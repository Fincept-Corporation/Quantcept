export interface CommandContext {
  registry: CommandRegistry
}

export interface SlashCommand {
  name: string
  description: string
  run(args: string[], ctx: CommandContext): Promise<string>
}

export class CommandRegistry {
  private commands = new Map<string, SlashCommand>()

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd)
  }
  get(name: string): SlashCommand | undefined {
    return this.commands.get(name)
  }
  list(): SlashCommand[] {
    return [...this.commands.values()]
  }
}
