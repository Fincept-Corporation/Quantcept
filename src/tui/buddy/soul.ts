import type { Provider } from "@core/llm/types"
import { makeRng, pickUniform } from "./rng"
import type { CompanionBones, CompanionSoul, Species } from "./types"

const NAME_POOLS: Record<Species, string[]> = {
  duck: ["Quackers", "Mallard", "Bilby"],
  goose: ["Honk", "Gander", "Pemberton"],
  cat: ["Mittens", "Felix", "Sir Pounce"],
  dragon: ["Ember", "Smaug Jr.", "Cinder"],
  octopus: ["Inkwell", "Tako", "Eight"],
  owl: ["Hoot", "Minerva", "Professor"],
  penguin: ["Tux", "Waddles", "Pingu"],
  turtle: ["Shelby", "Franklin", "Slowpoke"],
  snail: ["Gary", "Escargot", "Speedy"],
  ghost: ["Boo", "Casper", "Specter"],
  robot: ["Unit-7", "Bolt", "Clank"],
  rabbit: ["Thumper", "Hops", "Clover"],
  chonk: ["Biscuit", "Meatball", "Chairman"],
}

const TRAITS = [
  "dry and unbothered",
  "relentlessly cheerful",
  "chaotic but lovable",
  "wise beyond its pixels",
  "sarcastic with a heart of gold",
]

export function fallbackSoul(bones: CompanionBones, hatchedAt: number): CompanionSoul {
  const rng = makeRng(`${bones.species}-${bones.eye}-${bones.rarity}`)
  return {
    name: pickUniform(rng, NAME_POOLS[bones.species]),
    personality: pickUniform(rng, TRAITS),
    hatchedAt,
  }
}

// Best-effort LLM soul; falls back without throwing on any error/bad output.
export async function generateSoul(
  provider: Provider,
  bones: CompanionBones,
  hatchedAt: number,
): Promise<CompanionSoul> {
  const fb = fallbackSoul(bones, hatchedAt)
  try {
    const result = await provider.chat({
      messages: [
        {
          role: "user",
          content:
            `Name a ${bones.rarity} ${bones.species} terminal mascot for a finance app and give it a one-line personality. ` +
            `Reply ONLY as compact JSON: {"name":"...","personality":"..."}. Name max 16 chars, personality max 60 chars.`,
        },
      ],
    })
    const match = result.text.match(/\{[\s\S]*\}/)
    if (!match) return fb
    const parsed = JSON.parse(match[0]) as { name?: unknown; personality?: unknown }
    const name = typeof parsed.name === "string" ? parsed.name.slice(0, 16).trim() : ""
    const personality = typeof parsed.personality === "string" ? parsed.personality.slice(0, 60).trim() : ""
    if (!name) return fb
    return { name, personality: personality || fb.personality, hatchedAt }
  } catch {
    return fb
  }
}
