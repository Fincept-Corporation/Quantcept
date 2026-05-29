const CAP = 2000 // per-scope char cap on the injected index

function clip(text: string): string {
  return text.length > CAP ? `${text.slice(0, CAP)}\n…(truncated)` : text
}

/** System-prompt block listing memory indexes. "" when both are empty. */
export function memorySystemBlock(globalIndex: string, projectIndex: string): string {
  const sections: string[] = []
  if (globalIndex.trim()) sections.push(`### Global memory\n${clip(globalIndex.trim())}`)
  if (projectIndex.trim()) sections.push(`### Project memory\n${clip(projectIndex.trim())}`)
  if (sections.length === 0) return ""
  return `You have persistent memory below (pointers only). Use the \`recall\` tool to read a topic's full content when relevant, and the \`remember\` tool to save durable new facts.\n\n${sections.join("\n\n")}`
}
