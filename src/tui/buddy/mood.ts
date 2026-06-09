import { makeRng, pickWeighted } from "./rng"
import { type CompanionBones, MOODS, type Mood, type StatName } from "./types"

/**
 * Personality-driven mood model. A buddy's mood is NOT a task outcome — it's a human
 * emotional state that drifts over time, biased by the buddy's stats so every buddy
 * feels distinct (and recognizably itself). Pure + deterministic, so it's unit-testable
 * and survives re-render; the renderer (BuddySprite) reads the face maps below.
 */

/** How long a drifted mood holds before the buddy re-picks (a slow, lifelike cadence). */
export const DRIFT_MS = 240_000 // 4 minutes

/** Theme color key per mood (added to every theme JSON as `mood*`). */
export const MOOD_COLOR: Record<Mood, string> = {
  content: "moodContent",
  curious: "moodCurious",
  playful: "moodPlayful",
  excited: "moodExcited",
  sleepy: "moodSleepy",
  dreamy: "moodDreamy",
  smug: "moodSmug",
  bored: "moodBored",
  grumpy: "moodGrumpy",
  proud: "moodProud",
}

/** Single-column eye glyph per mood — drops into the shared eye slot of every species. */
export const MOOD_EYE: Record<Mood, string> = {
  content: "^",
  curious: "◉",
  playful: "•",
  excited: "✦",
  sleepy: "-",
  dreamy: "°",
  smug: "~",
  bored: "=",
  grumpy: ">",
  proud: "▲",
}

/** Optional one-line topper drawn above the sprite (centered to 12 cols by the renderer). */
export const MOOD_TOPPER: Record<Mood, string | undefined> = {
  content: undefined,
  curious: "?",
  playful: undefined,
  excited: "!",
  sleepy: "z",
  dreamy: "~",
  smug: undefined,
  bored: "…",
  grumpy: undefined,
  proud: undefined,
}

/** Small floor so no mood is ever impossible — even an extreme buddy can surprise you. */
const BASE = 1

/**
 * Per-buddy mood weights derived from its stats (each 1–10). Higher-weighted moods come
 * up more often during drift. The mixes give each stat a recognizable emotional signature.
 */
export function moodWeights(stats: Record<StatName, number>): Record<Mood, number> {
  const { ALPHA, PATIENCE, CHAOS, WISDOM, SNARK } = stats
  return {
    content: BASE + PATIENCE,
    curious: BASE + WISDOM,
    playful: BASE + CHAOS,
    excited: BASE + (CHAOS + ALPHA) / 2,
    sleepy: BASE + (10 - CHAOS),
    dreamy: BASE + WISDOM,
    smug: BASE + SNARK,
    bored: BASE + (10 - ALPHA),
    grumpy: BASE + (10 - PATIENCE),
    proud: BASE + ALPHA,
  }
}

/** Stable identity for a buddy — same seed → same bones → same key (bones drop the raw seed). */
function buddyKey(bones: CompanionBones): string {
  const stats = (["ALPHA", "PATIENCE", "CHAOS", "WISDOM", "SNARK"] as const).map((s) => bones.stats[s]).join(",")
  return `${bones.species}:${bones.eye}:${bones.hat}:${stats}`
}

/**
 * The buddy's drifted mood at a moment in time: a deterministic weighted pick keyed by
 * the buddy's identity + a coarse time bucket. Stable for ~DRIFT_MS, then re-picks. Pure —
 * `epochMs` is passed in (the caller supplies Date.now()) so it can be tested without clocks.
 */
export function driftMood(bones: CompanionBones, epochMs: number): Mood {
  const bucket = Math.floor(epochMs / DRIFT_MS)
  const rng = makeRng(`${buddyKey(bones)}:mood:${bucket}`)
  return pickWeighted(rng, moodWeights(bones.stats))
}

/** Re-export for callers that want the full list (e.g. exhaustiveness checks). */
export { MOODS }
