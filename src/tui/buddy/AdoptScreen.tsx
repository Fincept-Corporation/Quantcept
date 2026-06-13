import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useBuddy } from "./BuddyContext"
import { type Candidate, rosterCandidates } from "./candidates"
import { renderFace, renderSprite } from "./sprites"
import { RARITY_COLORS, RARITY_STARS, STAT_NAMES } from "./types"

// Roster grid width. 13 species → 3 rows of 5 (last row short). Up/down move by a full row.
const COLS = 5

function freshRoster(): Candidate[] {
  return rosterCandidates(crypto.randomUUID())
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

/**
 * First-run adoption screen: browse the full roster of every buddy species and pick the one you
 * want, with a live detail preview of the highlighted buddy. `r` re-rolls each buddy's look
 * (rarity/stats/etc) while keeping the roster complete. Shown by the gate in app.tsx whenever no
 * buddy has been chosen yet (re-openable via `/buddy choose`); on adopt, the gate falls through
 * to the dashboard.
 */
export function AdoptScreen() {
  const { theme } = useTheme()
  const buddy = useBuddy()
  const renderer = useRenderer()

  const [roster, setRoster] = createSignal<Candidate[]>(freshRoster())
  const [selected, setSelected] = createSignal(0)
  const rerender = () => renderer.requestRender()

  const current = createMemo(() => roster()[selected()])
  const rows = createMemo(() => chunk(roster(), COLS))

  function moveTo(next: number) {
    const n = roster().length
    if (next < 0 || next >= n) return
    setSelected(next)
    rerender()
  }
  function reroll() {
    setRoster(freshRoster())
    rerender()
  }
  function adopt() {
    const c = current()
    if (c) buddy.adopt(c.seed)
  }

  // biome-ignore lint/suspicious/noExplicitAny: @opentui keyboard event is untyped (matches other screens)
  useKeyboard((e: any) => {
    const i = selected()
    if (e.name === "left" || e.name === "h") {
      e.preventDefault?.()
      moveTo(i - 1)
    } else if (e.name === "right" || e.name === "l") {
      e.preventDefault?.()
      moveTo(i + 1)
    } else if (e.name === "up" || e.name === "k") {
      e.preventDefault?.()
      moveTo(i - COLS)
    } else if (e.name === "down" || e.name === "j") {
      e.preventDefault?.()
      moveTo(i + COLS)
    } else if (e.name === "return" || e.name === "kpenter") {
      e.preventDefault?.()
      adopt()
    } else if (e.name === "r") {
      e.preventDefault?.()
      reroll()
    } else if (e.name === "escape") {
      // Cancel only makes sense when an existing owner re-opened the chooser.
      if (buddy.chosen()) buddy.cancelChoosing()
    }
  })

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingLeft={2}
      paddingRight={2}
    >
      <text fg={theme.accent}>Choose your companion</text>
      <text fg={theme.textMuted}>
        A finance buddy that lives in your terminal — browse all {roster().length} and pick one.
      </text>
      <box height={1} minHeight={0} />

      {/* Roster grid — one cell per species */}
      <box flexDirection="column" alignItems="center">
        <For each={rows()}>
          {(row, r) => (
            <box flexDirection="row" gap={1}>
              <For each={row}>
                {(c, ci) => {
                  const idx = () => r() * COLS + ci()
                  const sel = () => idx() === selected()
                  return (
                    <box
                      flexDirection="column"
                      alignItems="center"
                      minWidth={11}
                      paddingLeft={1}
                      paddingRight={1}
                      backgroundColor={sel() ? theme.backgroundElement : undefined}
                    >
                      <text fg={sel() ? theme.accent : theme.text}>{renderFace(c.bones)}</text>
                      <text fg={sel() ? theme.accent : theme.textMuted}>{c.bones.species}</text>
                    </box>
                  )
                }}
              </For>
            </box>
          )}
        </For>
      </box>

      <box height={1} minHeight={0} />

      {/* Detail preview of the highlighted buddy */}
      <Show when={current()}>
        {(c) => (
          <box flexDirection="row" alignItems="center" gap={2}>
            <box flexDirection="column" alignItems="center" minWidth={12}>
              <For each={renderSprite(c().bones, 0)}>{(line) => <text fg={theme.accent}>{line}</text>}</For>
            </box>
            <box flexDirection="column">
              <text fg={theme.text}>{c().soul.name}</text>
              <text fg={theme[RARITY_COLORS[c().bones.rarity]]}>
                {c().bones.rarity} {RARITY_STARS[c().bones.rarity]}
                {c().bones.shiny ? " ✨" : ""} · {c().bones.species}
              </text>
              <text fg={theme.textMuted}>{STAT_NAMES.map((s) => `${s} ${c().bones.stats[s]}`).join("  ")}</text>
              <text fg={theme.textMuted}>{c().soul.personality}</text>
            </box>
          </box>
        )}
      </Show>

      <box height={1} minHeight={0} />
      <text fg={theme.textMuted}>
        ↑↓←→ move · Enter adopt · r reroll looks
        <Show when={buddy.chosen()}>
          <span> · Esc cancel</span>
        </Show>
      </text>
    </box>
  )
}
