import type { Mood } from "./types"

export const QUIP_CACHE_CAP = 30

export const QUIP_POOLS: Record<Mood, string[]> = {
  idle: [
    "I diversified my snacks. Risk-adjusted crumbs.",
    "Markets sleep. I do not. Mostly because I can't blink properly.",
    "Tip: Ctrl+L clears the room. Emotionally too.",
    "Your portfolio called. It wants attention.",
    "I shorted boredom. Still waiting on the fill.",
    "Type a question. I'm extremely qualified to nod.",
    "Bull, bear, or just vibes today?",
  ],
  thinking: [
    "Crunching numbers like they owe me money...",
    "Consulting the spreadsheets of destiny...",
    "Running the math. Carry the one. Carry the anxiety.",
    "Thinking hard. Please hold your applause and your stop-losses.",
    "Modeling scenarios. Most of them end in coffee.",
  ],
  success: [
    "Nailed it. Put that on the quarterly report.",
    "Alpha located. You're welcome.",
    "Clean execution. Chef's kiss. Analyst's nod.",
    "Done and dusted, like a well-hedged book.",
    "That's a green candle if I ever saw one.",
  ],
  error: [
    "Well. That was a drawdown.",
    "Error. I'm rebalancing my feelings.",
    "That trade did not go through. Neither did my plan.",
    "Red candle moment. We regroup.",
    "Something broke. Probably not the market. Probably.",
  ],
  pet: [
    "Best decision you've made all session.",
    "I'm basically a blue-chip now.",
    "Pet received. Sentiment: bullish.",
    "Do that again and I'll upgrade your rating.",
  ],
}

// Picks a line for `mood`, avoiding the last entry of `recentlyUsed` when possible.
export function pickQuip(mood: Mood, recentlyUsed: string[] = []): string {
  const pool = QUIP_POOLS[mood]
  const last = recentlyUsed[recentlyUsed.length - 1]
  const candidates = pool.length > 1 && last ? pool.filter((q) => q !== last) : pool
  return candidates[Math.floor(Math.random() * candidates.length)]!
}

// Caps the LLM quip cache to the most recent QUIP_CACHE_CAP entries.
export function mergeCachedQuips(cache: { mood: Mood; line: string }[]): { mood: Mood; line: string }[] {
  return cache.slice(-QUIP_CACHE_CAP)
}
