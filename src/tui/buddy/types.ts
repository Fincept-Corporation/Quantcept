export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const
export type Rarity = (typeof RARITIES)[number]

export const SPECIES = [
  "duck",
  "goose",
  "cat",
  "dragon",
  "octopus",
  "owl",
  "penguin",
  "turtle",
  "snail",
  "ghost",
  "robot",
  "rabbit",
  "chonk",
] as const
export type Species = (typeof SPECIES)[number]

export const EYES = ["·", "✦", "×", "◉", "@", "°"] as const
export type Eye = (typeof EYES)[number]

export const HATS = ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"] as const
export type Hat = (typeof HATS)[number]

export const STAT_NAMES = ["ALPHA", "PATIENCE", "CHAOS", "WISDOM", "SNARK"] as const
export type StatName = (typeof STAT_NAMES)[number]

export const MOODS = ["idle", "thinking", "success", "error", "pet"] as const
export type Mood = (typeof MOODS)[number]

export const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
} as const satisfies Record<Rarity, number>

export const RARITY_STARS = {
  common: "★",
  uncommon: "★★",
  rare: "★★★",
  epic: "★★★★",
  legendary: "★★★★★",
} as const satisfies Record<Rarity, string>

// Maps to keys on the Theme proxy (src/tui/context/theme.tsx).
export const RARITY_COLORS = {
  common: "textMuted",
  uncommon: "success",
  rare: "info",
  epic: "secondary",
  legendary: "warning",
} as const satisfies Record<Rarity, string>

export type CompanionBones = {
  rarity: Rarity
  species: Species
  eye: Eye
  hat: Hat
  shiny: boolean
  stats: Record<StatName, number>
}
export type CompanionSoul = { name: string; personality: string; hatchedAt: number }
export type Companion = CompanionBones & CompanionSoul
