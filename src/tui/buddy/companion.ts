import { makeRng, pickUniform, pickWeighted } from "./rng"
import { type CompanionBones, EYES, HATS, RARITY_WEIGHTS, SPECIES, STAT_NAMES, type StatName } from "./types"

export function bonesFromSeed(seed: string): CompanionBones {
  const rng = makeRng(seed)
  const rarity = pickWeighted(rng, RARITY_WEIGHTS)
  const species = pickUniform(rng, SPECIES)
  const eye = pickUniform(rng, EYES)
  const hat = pickUniform(rng, HATS)
  const shiny = rng() < 0.05
  const stats = {} as Record<StatName, number>
  for (const s of STAT_NAMES) stats[s] = 1 + Math.floor(rng() * 10)
  return { rarity, species, eye, hat, shiny, stats }
}
