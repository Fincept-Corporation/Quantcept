import type { Mood } from "./types"

export const QUIP_CACHE_CAP = 30

export const QUIP_POOLS: Record<Mood, string[]> = {
  content: [
    "Markets are calm. So am I. Coincidence? Probably.",
    "Just vibing at fair value.",
    "All positions accounted for. All snacks too.",
    "This is nice. Low volatility, low stress.",
    "Content. Like a portfolio that finally rebalanced itself.",
  ],
  curious: [
    "Ooh, what are we looking at?",
    "Tell me more. I'm aggressively interested.",
    "That's a curve I haven't seen before…",
    "Wait, what happens if we pull on this thread?",
    "I have questions. So many questions.",
  ],
  playful: [
    "Bet you can't say 'quantitative' five times fast.",
    "What if we just YOLO'd it? (We won't. But what if.)",
    "I hid a decimal point somewhere. Find it.",
    "Tag, you're it. Now back to the spreadsheets.",
    "Feeling spicy. Like a leveraged ETF.",
  ],
  excited: [
    "Ohh this is GOOD. Let's go let's go!",
    "I can feel the alpha from here!",
    "New data just dropped and I am THRILLED.",
    "Green everywhere. My circuits are buzzing.",
    "This is the most fun I've had since the last fun.",
  ],
  sleepy: [
    "Five more minutes… the markets can wait.",
    "Yawn. Even the candles look sleepy.",
    "Running on low-power mode and decaf.",
    "I'll wake up for a really good chart. Maybe.",
    "Zzz… buy low… zzz… sell high…",
  ],
  dreamy: [
    "Imagine a world where every backtest holds out of sample…",
    "Sometimes I gaze at the moving averages and just… drift.",
    "What if the efficient market is a state of mind?",
    "Lost in thought, somewhere past the third standard deviation.",
    "Daydreaming about a perfectly hedged book.",
  ],
  smug: [
    "Told you that level would hold. I always know.",
    "Oh, you're just seeing that now? Cute.",
    "I'd say 'I told you so' but my track record speaks for itself.",
    "Effortless. As usual.",
    "Some of us were just built for this.",
  ],
  bored: [
    "Sideways market. Riveting. Truly.",
    "I've recalculated this twice for fun. There was no fun.",
    "Wake me when something moves more than a tick.",
    "Watching paint dry, but the paint is a flat candle.",
    "Is this all there is? …Anyway.",
  ],
  grumpy: [
    "Who reordered my columns. WHO.",
    "Spreads are wide and so is my disappointment.",
    "Don't talk to me until the close.",
    "Everything's fine. (It is not fine.)",
    "I asked for clean data. This is not clean data.",
  ],
  proud: [
    "Built this analysis with my own two… well, whatever these are.",
    "Stand back. That's a thing of beauty.",
    "Chin up, chest out — that's a quality signal.",
    "I carry this whole terminal, you know.",
    "Frame this one. It's some of my best work.",
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
