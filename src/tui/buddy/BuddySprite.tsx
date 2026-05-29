import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useBuddy } from "./BuddyContext"
import { pickQuip } from "./quips"
import { renderFace, renderSprite, spriteFrameCount } from "./sprites"
import { type Mood, RARITY_COLORS } from "./types"

const TICK_MS = 500
const REACTION_TICKS = 16 // ~8s visible
const IDLE_QUIP_EVERY = 24 // ticks → new idle quip ~every 12s
const PET_BURST_MS = 2500
const MIN_COLS_FOR_FULL_SPRITE = 60
// Mostly rest; occasional fidget (1,2); -1 = blink on frame 0.
const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0]
const HEARTS = ["  ♥   ♥  ", " ♥  ♥  ♥ ", "♥   ♥   ♥", " ·   ·  ·"]
// Expressive-reaction tuning.
const THINK_BLINK_EVERY = 3 // fast blink cadence while thinking
const SUCCESS_JUMP_TICKS = 4 // how long the success bob-jump lasts
const SHAKE_TICKS = 6 // how long the error shake lasts

export function BuddySprite(props: { compact?: boolean }) {
  const buddy = useBuddy()
  const { theme } = useTheme()
  const renderer = useRenderer()
  const dims = useTerminalDimensions()

  const [tick, setTick] = createSignal(0)
  const [quip, setQuip] = createSignal<string>("")
  // Current visible mood: 'idle' or the active reaction's mood.
  const [shownMood, setShownMood] = createSignal<Mood>("idle")
  const recent: string[] = []
  let reactionStartTick = -Infinity
  let lastSeenReactionAt = 0

  let timer: ReturnType<typeof setInterval>
  onMount(() => {
    timer = setInterval(() => {
      const t = tick() + 1
      setTick(t)

      const r = buddy.reaction()
      if (r && r.at !== lastSeenReactionAt) {
        // A new reaction just arrived — snapshot its start tick, set its quip.
        lastSeenReactionAt = r.at
        reactionStartTick = t
        setShownMood(r.mood)
        const line = pickQuip(r.mood, recent)
        recent.push(line)
        if (recent.length > 8) recent.shift()
        setQuip(line)
      } else if (r && t - reactionStartTick > REACTION_TICKS) {
        // Reaction expired — clear it and fall back to idle.
        buddy.clearReaction()
        setShownMood("idle")
        setQuip("")
        lastSeenReactionAt = 0
      } else if (!r && t % IDLE_QUIP_EVERY === 0) {
        // Idle cadence — rotate an idle quip.
        setShownMood("idle")
        const line = pickQuip("idle", recent)
        recent.push(line)
        if (recent.length > 8) recent.shift()
        setQuip(line)
      }

      renderer.requestRender()
    }, TICK_MS)
  })
  onCleanup(() => clearInterval(timer))

  const moodColorKey = createMemo<string>(() => {
    const m = shownMood()
    if (m === "success") return "success"
    if (m === "error") return "error"
    if (m === "thinking") return "accent"
    return RARITY_COLORS[buddy.companion().rarity]
  })

  // Ticks elapsed since the current reaction began (Infinity when idle).
  const reactionAge = createMemo(() => (shownMood() === "idle" ? Number.POSITIVE_INFINITY : tick() - reactionStartTick))

  const frame = createMemo(() => {
    const mood = shownMood()
    const count = spriteFrameCount(buddy.companion().species)
    // While thinking, blink rapidly instead of running the idle sequence.
    if (mood === "thinking") {
      return { index: 0, blink: tick() % THINK_BLINK_EVERY === 0 }
    }
    const step = IDLE_SEQUENCE[tick() % IDLE_SEQUENCE.length]!
    return step === -1 ? { index: 0, blink: true } : { index: step % count, blink: false }
  })

  // petAt is wall-clock; compared to wall-clock — correct. Re-evaluated each tick
  // because it reads tick().
  const petting = createMemo(() => {
    tick()
    return buddy.petAt() > 0 && Date.now() - buddy.petAt() < PET_BURST_MS
  })

  const lines = createMemo(() => {
    const f = frame()
    const c = buddy.companion()
    const mood = shownMood()
    const age = reactionAge()

    // Eye glyph: "-" for a blink, "v" while drooping on error, else the real eye.
    const eyeOverride = f.blink ? "-" : mood === "error" ? "v" : undefined
    let body = renderSprite(c, f.index, eyeOverride)

    // Error: horizontal shake — jitter the column 1 space on alternating ticks.
    if (mood === "error" && age < SHAKE_TICKS) {
      const pad = tick() % 2 === 0 ? " " : ""
      body = body.map((l) => pad + l)
    }

    // Mood topper line above the sprite (thinking "?", success sparkle).
    let topper: string | undefined
    if (mood === "thinking") topper = "     ?      "
    else if (mood === "success" && age < SUCCESS_JUMP_TICKS) topper = "     ✦      "

    // Success: bob-jump — lift the sprite one row for the first few ticks by
    // adding a blank line below (so the topper stays put and the body "hops").
    const hop = mood === "success" && age < SUCCESS_JUMP_TICKS && tick() % 2 === 0

    if (topper) body = [topper, ...body]
    if (hop) body = [...body, "            "]
    if (petting()) body = [HEARTS[tick() % HEARTS.length]!, ...body]
    return body
  })

  return (
    <Show when={!buddy.muted()}>
      <Show
        when={!props.compact && dims().width >= MIN_COLS_FOR_FULL_SPRITE}
        fallback={
          <box flexDirection="column" alignItems="center">
            <text fg={theme[moodColorKey()]}>{renderFace(buddy.companion())}</text>
            <text fg={theme.textMuted}>{quip() || buddy.companion().name}</text>
          </box>
        }
      >
        <box flexDirection="row" alignItems="flex-start" gap={1}>
          <box flexDirection="column" alignItems="center" maxHeight={15} overflow="hidden">
            {lines().map((line) => (
              <text fg={theme[moodColorKey()]}>{line}</text>
            ))}
            <text fg={theme.textMuted}>{buddy.companion().name}</text>
          </box>
          <Show when={quip()}>
            <box flexDirection="column" paddingTop={1} maxWidth={28}>
              <text fg={theme.text}>{quip()}</text>
            </box>
          </Show>
        </box>
      </Show>
    </Show>
  )
}
