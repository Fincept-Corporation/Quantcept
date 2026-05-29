import type { LoadedSkill } from "./manifest"

/** System-prompt block making the model aware of available skills. "" if none. */
export function skillsSystemBlock(skills: LoadedSkill[]): string {
  if (skills.length === 0) return ""
  const lines = skills.map((s) => `- /${s.name} (${s.name}: ${s.description})`).join("\n")
  return `The user has these skills available (invoke with \`/<name>\`):\n${lines}`
}
