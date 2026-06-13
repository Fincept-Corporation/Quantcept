// src/tui/buddy/BuddyContext.tsx
import { loadConfig } from "@core/config/load"
import { createProvider } from "@core/llm/provider"
import { createSimpleContext } from "@tui/context/helper"
import { useKV } from "@tui/context/kv"
import { createMemo, createSignal, type ParentProps } from "solid-js"
import { bonesFromSeed } from "./companion"
import { fallbackSoul, generateSoul } from "./soul"
import type { Companion, CompanionSoul, Mood } from "./types"

export const { use: useBuddy, provider: BuddyProvider } = createSimpleContext({
  name: "Buddy",
  init: () => {
    const kv = useKV()

    // A buddy exists only once the user has adopted one (a seed is persisted). Until then
    // the Adopt screen owns the flow; we do NOT auto-create a random buddy here.
    const existingSeed = kv.get("buddySeed") as string | undefined
    const [seedSig, setSeedSig] = createSignal(existingSeed ?? "")
    const [chosen, setChosen] = createSignal(Boolean(existingSeed))
    // Set true to re-open the Adopt screen for an existing owner (/buddy choose).
    const [choosing, setChoosing] = createSignal(false)

    // Soul: the persisted curated/LLM soul for an existing owner; a harmless placeholder
    // otherwise (never rendered — BuddySprite mounts only behind the adopt gate).
    const storedSoul = kv.get("buddySoul") as CompanionSoul | undefined
    const [soul, setSoul] = createSignal<CompanionSoul>(
      storedSoul ?? fallbackSoul(bonesFromSeed(seedSig()), Date.now()),
    )

    // Best-effort background LLM soul upgrade — never blocks, never throws to UI.
    function upgradeSoul(seed: string, hatchedAt: number) {
      void (async () => {
        try {
          const provider = createProvider(loadConfig().provider)
          const upgraded = await generateSoul(provider, bonesFromSeed(seed), hatchedAt)
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
    // "Engaged" flag: pinned true while the agent is generating so the buddy looks curious
    // (watching what you're doing), then resumes its own personality drift. NOT a task outcome.
    const [busy, setBusy] = createSignal(false)

    const companion = createMemo<Companion>(() => ({ ...bonesFromSeed(seedSig()), ...soul() }))

    return {
      companion,
      chosen,
      choosing,
      reaction,
      petAt,
      muted,
      busy,
      setBusy: (b: boolean) => setBusy(b),
      react(mood: Mood) {
        setReaction({ mood, at: Date.now() })
      },
      clearReaction() {
        setReaction(undefined)
      },
      pet() {
        setPetAt(Date.now())
        // Affection → a brief excited spike (interaction, not a task outcome).
        setReaction({ mood: "excited", at: Date.now() })
      },
      toggleMute() {
        const next = !muted()
        setMuted(next)
        kv.set("buddyMuted", next)
        return next
      },
      /** Commit a chosen candidate seed as the user's buddy and kick the LLM soul upgrade. */
      adopt(seed: string) {
        kv.set("buddySeed", seed)
        setSeedSig(seed)
        const fresh = fallbackSoul(bonesFromSeed(seed), Date.now())
        setSoul(fresh)
        kv.set("buddySoul", fresh)
        setChosen(true)
        setChoosing(false)
        upgradeSoul(seed, fresh.hatchedAt)
      },
      /** Re-open the Adopt screen for an existing owner. */
      openChooser() {
        setChoosing(true)
      },
      /** Dismiss the Adopt screen without changing the current buddy (existing owners only). */
      cancelChoosing() {
        setChoosing(false)
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
