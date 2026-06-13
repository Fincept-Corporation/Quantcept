import { bonesFromSeed } from "./companion"
import { fallbackSoul } from "./soul"
import { type CompanionBones, type CompanionSoul, SPECIES, type Species } from "./types"

export type Candidate = {
  seed: string
  bones: CompanionBones
  soul: CompanionSoul
}

// The buddy is reproduced purely from its persisted seed (`bonesFromSeed`), so to show a buddy
// of a *specific* species we must find a seed that actually hashes to that species — not override
// it after the fact (which would re-roll a different creature on the next launch). Species is
// uniform over the seed space, so a short deterministic search finds one within a few tries.
const MAX_TRIES = 5000

function seedForSpecies(salt: string, species: Species): string {
  for (let i = 0; i < MAX_TRIES; i++) {
    const seed = `${salt}:${species}:${i}`
    if (bonesFromSeed(seed).species === species) return seed
  }
  // Unreachable in practice (every species is hit within a handful of tries).
  return `${salt}:${species}:0`
}

/**
 * One adoption candidate per species (all 13), in `SPECIES` order, for the full-roster choose
 * screen. The non-species traits (rarity/eye/hat/shiny/stats) come from each found seed; passing
 * a fresh `salt` re-rolls every buddy's "look" while keeping the roster complete. Pure: same
 * `salt` → same roster.
 */
export function rosterCandidates(salt: string): Candidate[] {
  return SPECIES.map((species) => {
    const seed = seedForSpecies(salt, species)
    const bones = bonesFromSeed(seed)
    return { seed, bones, soul: fallbackSoul(bones, 0) }
  })
}
