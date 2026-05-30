import { JobStore } from "@core/jobs"
import type { Job } from "@core/jobs/types"
import { projectHash } from "@core/storage/paths"
import { createTextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { For } from "solid-js"
import { formatJobRow, statusColor } from "./jobs-view-format"

const BOLD = createTextAttributes({ bold: true })

export function JobsView(props: { onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()

  // Snapshot load (runs once on mount). Defensive: never let a store error crash the overlay.
  let jobs: Job[] = []
  let loadError: string | undefined
  try {
    const store = new JobStore()
    jobs = store.listByProject(projectHash(process.cwd()))
    store.close()
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }
  const now = Date.now()
  const rows = jobs.map((j) => formatJobRow(j, now))

  useKeyboard((e: any) => {
    if (e.name === "escape" || e.name === "q") {
      e.preventDefault?.()
      props.onClose()
    }
    renderer.requestRender()
  })

  return (
    <box flexDirection="column" gap={1}>
      <text fg={theme.accent} attributes={BOLD}>
        Jobs ({rows.length})
      </text>
      {loadError ? (
        <text fg="#ef4444">Failed to load jobs: {loadError}</text>
      ) : rows.length === 0 ? (
        <text fg={theme.textMuted}>{'No jobs yet. Create one: quantcept jobs add "<goal>"'}</text>
      ) : (
        <box flexDirection="column">
          <box flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>{"STATUS".padEnd(16)}</text>
            <text fg={theme.textMuted}>{"TURNS".padEnd(7)}</text>
            <text fg={theme.textMuted}>{"NEXT".padEnd(7)}</text>
            <text fg={theme.textMuted}>GOAL</text>
          </box>
          <For each={rows}>
            {(row) => (
              <box flexDirection="row" gap={1}>
                <text fg={statusColor(row.status.split(":")[0]!)}>{row.status.padEnd(16)}</text>
                <text fg={theme.text}>{row.turns.padEnd(7)}</text>
                <text fg={theme.text}>{row.next.padEnd(7)}</text>
                <text fg={theme.text}>{row.goal}</text>
              </box>
            )}
          </For>
        </box>
      )}
      <text fg={theme.textMuted}>Esc close</text>
    </box>
  )
}
