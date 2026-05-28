export class QuantceptError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = "QuantceptError"
  }
}

export class ConfigError extends QuantceptError {
  constructor(message: string) {
    super(message, "CONFIG")
    this.name = "ConfigError"
  }
}

export class ProviderError extends QuantceptError {
  constructor(message: string) {
    super(message, "PROVIDER")
    this.name = "ProviderError"
  }
}

export class ToolError extends QuantceptError {
  constructor(message: string) {
    super(message, "TOOL")
    this.name = "ToolError"
  }
}
