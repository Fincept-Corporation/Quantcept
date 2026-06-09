import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useBuddy } from "./BuddyContext"
import { driftMood, MOOD_COLOR, MOOD_EYE, MOOD_TOPPER } from "./mood"
import { pickQuip } from "./quips"
import { renderFace, renderSprite, spriteFrameCount } from "./sprites"
import type { Mood } from "./types"

const TICK_MS = 500
const REACTION_TICKS = 16 // ~8s visible
const IDLE_QUIP_EVERY = 24 // ticks → new quip ~every 12s
const PET_BURST_MS = 2500
const MIN_COLS_FOR_FULL_SPRITE = 60
// Mostly rest; occasional fidget (1,2); -1 = blink on frame 0.
const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0]
const HEARTS = ["  ♥   ♥  ", " ♥  ♥  ♥ ", "♥   ♥   ♥", " ·   ·  ·"]
const EXCITED_HOP_TICKS = 4 // a fresh pet → a brief bob-hop

/** Center a single topper glyph on a 12-column line (sprite art width). */
function centerTopper(ch: string): string {
  const width = 12
  const left = Math.floor((width - 1) / 2)
  return " ".repeat(left) + ch + " ".repeat(width - left - 1)
}

export function BuddySprite(props: { compact?: boolean; minimal?: boolean }) {
  const buddy = useBuddy()
  const { theme } = useTheme()
  const renderer = useRenderer()
  const dims = useTerminalDimensions()

  const [tick, setTick] = createSignal(0)
  const [quip, setQuip] = createSignal<string>("")
  // The buddy's current human mood: engaged ("curious") while the agent works, the active
  // reaction (petting → "excited") for its window, otherwise its own personality drift.
  const [shownMood, setShownMood] = createSignal<Mood>("content")
  const recent: string[] = []
  let reactionStartTick = -Infinity
  let lastSeenReactionAt = 0
  // Repaint gate: the tick fires every 500ms but the sprite is usually visually identical
  // (it mostly rests + drifts slowly). Only request a render when the output actually changed.
  let lastSig = ""

  function rotateQuip(mood: Mood) {
    const line = pickQuip(mood, recent)
    recent.push(line)
    if (recent.length > 8) recent.shift()
    setQuip(line)
  }

  let timer: ReturnType<typeof setInterval>
  onMount(() => {
    timer = setInterval(() => {
      const t = tick() + 1
      setTick(t)

      const r = buddy.reaction()
      if (r && r.at !== lastSeenReactionAt) {
        // A new reaction (petting) arrived — snapshot its start tick + a matching quip.
        lastSeenReactionAt = r.at
        reactionStartTick = t
        rotateQuip(r.mood)
      } else if (r && t - reactionStartTick > REACTION_TICKS) {
        buddy.clearReaction()
        lastSeenReactionAt = 0
      }

      const rNow = buddy.reaction()
      const reactionActive = !!rNow && !buddy.busy() && t - reactionStartTick <= REACTION_TICKS
      const mood: Mood = buddy.busy()
        ? "curious"
        : reactionActive && rNow
          ? rNow.mood
          : driftMood(buddy.companion(), Date.now())
      setShownMood(mood)

      // Rotate an ambient quip for the current mood while not in a reaction window.
      if (!reactionActive && t % IDLE_QUIP_EVERY === 0) rotateQuip(mood)

      const effCompact = props.compact || dims().width < MIN_COLS_FOR_FULL_SPRITE
      const sig = buddy.muted()
        ? "muted"
        : effCompact
          ? `c|${quip() || buddy.companion().name}|${moodColor()}|${shownMood()}`
          : `f|${lines().join("\n")}|${quip()}|${moodColor()}`
      if (sig !== lastSig) {
        lastSig = sig
        renderer.requestRender()
      }
    }, TICK_MS)
  })
  onCleanup(() => clearInterval(timer))

  const moodColor = createMemo<string>(() => MOOD_COLOR[shownMood()])

  // Ticks since the active reaction began (Infinity when drifting / engaged).
  const reactionAge = createMemo(() => {
    const r = buddy.reaction()
    return r && !buddy.busy() ? tick() - reactionStartTick : Number.POSITIVE_INFINITY
  })

  const frame = createMemo(() => {
    const count = spriteFrameCount(buddy.companion().species)
    const step = IDLE_SEQUENCE[tick() % IDLE_SEQUENCE.length]!
    return step === -1 ? { index: 0, blink: true } : { index: step % count, blink: false }
  })

  // petAt is wall-clock; compared to wall-clock — correct. Re-evaluated each tick (reads tick()).
  const petting = createMemo(() => {
    tick()
    return buddy.petAt() > 0 && Date.now() - buddy.petAt() < PET_BURST_MS
  })

  const lines = createMemo(() => {
    const f = frame()
    const c = buddy.companion()
    const mood = shownMood()
    const age = reactionAge()

    // Eyes reflect the mood; "content" keeps the buddy's OWN eye glyph (identity), and a
    // blink temporarily shows "-". The mood eye drops into the shared slot of every species.
    const moodEye = mood === "content" ? undefined : MOOD_EYE[mood]
    const eyeOverride = f.blink ? "-" : moodEye
    let body = renderSprite(c, f.index, eyeOverride)

    // Grumpy: an occasional 1-column twitch (not a constant shake — grumpy is a sustained mood).
    if (mood === "grumpy" && tick() % 8 === 0) body = body.map((l) => ` ${l}`)

    // Mood topper above the sprite (e.g. curious "?", excited "!", sleepy "z").
    const topperCh = MOOD_TOPPER[mood]
    if (topperCh) body = [centerTopper(topperCh), ...body]

    // A fresh pet → brief bob-hop while excited.
    const hop = mood === "excited" && age < EXCITED_HOP_TICKS && tick() % 2 === 0
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
            <text fg={theme[moodColor()]}>
              {renderFace(buddy.companion(), shownMood() === "content" ? undefined : MOOD_EYE[shownMood()])}
            </text>
            {/* `minimal` (the slim session column) shows just the name; full compact also rotates quips. */}
            <text fg={theme.textMuted}>
              {props.minimal ? buddy.companion().name : quip() || buddy.companion().name}
            </text>
          </box>
        }
      >
        <box flexDirection="row" alignItems="flex-start" gap={1}>
          <box flexDirection="column" alignItems="center" maxHeight={15} overflow="hidden">
            {lines().map((line) => (
              <text fg={theme[moodColor()]}>{line}</text>
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
