import type { LoadedSkill } from "./manifest"

export class SkillRegistry {
  private byName = new Map<string, LoadedSkill>()
  constructor(skills: LoadedSkill[]) {
    for (const s of skills) this.byName.set(s.name, s)
  }
  all(): LoadedSkill[] {
    return [...this.byName.values()]
  }
  get(name: string): LoadedSkill | undefined {
    return this.byName.get(name)
  }
}
