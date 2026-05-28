export function substituteArgs(template: string, args: string): string {
  const trimmed = args.trim()
  const positional = trimmed.length === 0 ? [] : trimmed.split(/\s+/)
  const hasPlaceholder = /\$ARGUMENTS|\$@|\$\d+/.test(template)

  if (!hasPlaceholder) {
    return trimmed.length === 0 ? template : `${template}\n\n${trimmed}`
  }

  let out = template.replace(/\$ARGUMENTS|\$@/g, trimmed)
  out = out.replace(/\$(\d+)/g, (_m, d: string) => positional[Number(d) - 1] ?? "")
  return out
}
