// 32-bit FNV-1a hash — stable across runs, no crypto dependency.
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// mulberry32 PRNG seeded from the hash; returns floats in [0, 1).
export function makeRng(seed: string): () => number {
  let a = hashString(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickUniform<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

export function pickWeighted<K extends string>(rng: () => number, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = rng() * total
  for (const [key, w] of entries) {
    roll -= w
    if (roll < 0) return key
  }
  return entries[entries.length - 1]![0]
}
