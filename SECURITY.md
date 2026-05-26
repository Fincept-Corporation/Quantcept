# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Quantcept, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email: nikultilak@gmail.com

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix release**: Depending on severity, typically within 2 weeks for critical issues

## Scope

The following are in scope:

- The `quantcept` npm package
- Permission system bypasses
- Arbitrary code execution without user consent
- API key/credential exposure
- Tool execution without proper permission checks

## Best Practices for Users

- Never store API keys in project-level `.quantcept/settings.json` if the project is shared
- Review tool permissions before granting `/allow` to destructive tools
- Use environment variables for credentials rather than config files
- Keep Quantcept updated to the latest version
