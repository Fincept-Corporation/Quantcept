// src/tui/buddy/BuddyContext.tsx
import { loadConfig } from "@core/config/load"
import { createProvider } from "@core/llm/provider"
import { createSimpleContext } from "@tui/context/helper"
import { useKV } from "@tui/context/kv"
import { createMemo, createSignal, type ParentProps } from "solid-js"
import { bonesFromSeed } from "./companion"
import { fallbackSoul, generateSoul } from "./soul"
import type { Companion, CompanionSoul, Mood } from "./types"

function randomSeed(): string {
  return crypto.randomUUID()
}

export const { use: useBuddy, provider: BuddyProvider } = createSimpleContext({
  name: "Buddy",
  init: () => {
    const kv = useKV()

    // Ensure a stable seed exists.
    let seed = kv.get("buddySeed") as string | undefined
    if (!seed) {
      seed = randomSeed()
      kv.set("buddySeed", seed)
    }
    const [seedSig, setSeedSig] = createSignal(seed)

    // Soul: instant curated fallback, upgraded by LLM in the background once.
    const storedSoul = kv.get("buddySoul") as CompanionSoul | undefined
    const [soul, setSoul] = createSignal<CompanionSoul>(storedSoul ?? fallbackSoul(bonesFromSeed(seed), Date.now()))
    if (!storedSoul) {
      const initial = soul()
      kv.set("buddySoul", initial)
      // Best-effort background upgrade — never blocks, never throws to UI.
      void (async () => {
        try {
          const provider = createProvider(loadConfig().provider)
          const upgraded = await generateSoul(provider, bonesFromSeed(seedSig()), initial.hatchedAt)
          setSoul(upgraded)
          kv.set("buddySoul", upgraded)
        } catch {
          /* keep fallback */
        }
      })()
    }

    const [muted, setMuted] = createSignal<boolean>(Boolean(kv.get("buddyMuted")))
    const [reaction, setReaction] = createSignal<{ mood: Mood; at: number } | undefined>(undefined)
    const [petAt, setPetAt] = createSignal(0)

    const companion = createMemo<Companion>(() => ({ ...bonesFromSeed(seedSig()), ...soul() }))

    return {
      companion,
      reaction,
      petAt,
      muted,
      react(mood: Mood) {
        setReaction({ mood, at: Date.now() })
      },
      clearReaction() {
        setReaction(undefined)
      },
      pet() {
        setPetAt(Date.now())
        setReaction({ mood: "pet", at: Date.now() })
      },
      toggleMute() {
        const next = !muted()
        setMuted(next)
        kv.set("buddyMuted", next)
        return next
      },
      reroll() {
        const next = randomSeed()
        kv.set("buddySeed", next)
        setSeedSig(next)
        const fresh = fallbackSoul(bonesFromSeed(next), Date.now())
        setSoul(fresh)
        kv.set("buddySoul", fresh)
      },
      setName(name: string) {
        const trimmed = name.slice(0, 16).trim()
        if (!trimmed) return
        const next = { ...soul(), name: trimmed }
        setSoul(next)
        kv.set("buddySoul", next)
      },
      ready: true,
    }
  },
})

export type BuddyProviderProps = ParentProps
