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

export class FinceptError extends QuantceptError {
  constructor(message: string, code = "FINCEPT") {
    super(message, code)
    this.name = "FinceptError"
  }
}

export class FinceptAuthError extends FinceptError {
  constructor(message = "Authentication required") {
    super(message, "FINCEPT_AUTH")
    this.name = "FinceptAuthError"
  }
}

/** 401 use_social_login — the account has no password (created via a social provider). */
export class SocialLoginRequiredError extends FinceptError {
  constructor(message = "This account uses social login") {
    super(message, "use_social_login")
    this.name = "SocialLoginRequiredError"
  }
}

export class InsufficientCreditsError extends FinceptError {
  constructor(
    readonly required: number,
    readonly available: number,
    message = "Insufficient credits",
  ) {
    super(message, "INSUFFICIENT_CREDITS")
    this.name = "InsufficientCreditsError"
  }
}
