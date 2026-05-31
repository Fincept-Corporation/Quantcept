import { JobStore } from "@core/jobs"
import type { Job } from "@core/jobs/types"
import { projectHash } from "@core/storage/paths"
import { createTextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createSignal, For, onCleanup, Show } from "solid-js"
import { formatJobRow, statusColor } from "./jobs-view-format"

const BOLD = createTextAttributes({ bold: true })

export function JobsView(props: { onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const ph = projectHash(process.cwd())
  const store = new JobStore()
  onCleanup(() => {
    try {
      store.close()
    } catch {
      /* already closed */
    }
  })

  const [jobs, setJobs] = createSignal<Job[]>([])
  const [cursor, setCursor] = createSignal(0) // 0 = "＋ New job" row; 1..n = jobs[cursor-1]
  const [err, setErr] = createSignal<string | undefined>()
  const [notice, setNotice] = createSignal<string | undefined>()
  const [adding, setAdding] = createSignal(false)
  const [buf, setBuf] = createSignal("")

  const rerender = () => renderer.requestRender()
  function refresh() {
    try {
      setJobs(store.listByProject(ph))
      setErr(undefined)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    rerender()
  }
  refresh()

  function createJob(goal: string) {
    const g = goal.trim()
    if (!g) return
    try {
      const id = crypto.randomUUID().slice(0, 8)
      store.create({ id, cwd: process.cwd(), goal: g, readOnly: true })
      setNotice(`Created job ${id} (read-only). Runs on the next \`quantcept jobs tick\`.`)
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      rerender()
    }
  }
  function deleteAt(i: number) {
    const j = jobs()[i]
    if (!j) return
    try {
      store.delete(j.id)
      setNotice(`Deleted job ${j.id}.`)
      setCursor((c) => Math.max(0, c - 1))
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      rerender()
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: @opentui keyboard event is untyped (matches SettingsModal)
  useKeyboard((e: any) => {
    if (adding()) {
      if (e.name === "escape") {
        setAdding(false)
        setBuf("")
        rerender()
      } else if (e.name === "return" || e.name === "kpenter") {
        const g = buf()
        setAdding(false)
        setBuf("")
        createJob(g)
      } else if (e.name === "backspace") {
        setBuf((b) => b.slice(0, -1))
        rerender()
      } else if (typeof e.sequence === "string" && e.sequence.length === 1 && !e.ctrl && !e.meta) {
        setBuf((b) => b + e.sequence)
        rerender()
      }
      return
    }
    if (e.name === "escape" || e.name === "q") {
      e.preventDefault?.()
      props.onClose()
      return
    }
    const max = jobs().length
    if (e.name === "up") {
      e.preventDefault?.()
      setCursor((c) => Math.max(0, c - 1))
      rerender()
      return
    }
    if (e.name === "down") {
      e.preventDefault?.()
      setCursor((c) => Math.min(max, c + 1))
      rerender()
      return
    }
    if (e.name === "return" || e.name === "kpenter") {
      e.preventDefault?.()
      if (cursor() === 0) {
        setAdding(true)
        setBuf("")
        setErr(undefined)
        rerender()
      }
      return
    }
    if ((e.name === "d" || e.sequence === "d") && cursor() > 0) {
      e.preventDefault?.()
      deleteAt(cursor() - 1)
    }
  })

  const nowTs = Date.now()

  return (
    <box flexDirection="column" gap={1}>
      <text fg={theme.accent} attributes={BOLD}>
        Jobs ({jobs().length})
      </text>

      <Show when={adding()}>
        <box flexDirection="column">
          <text fg={theme.accent}>New job — goal</text>
          <text fg={theme.text}>
            {buf()}
            <span style={{ fg: theme.accent }}>▏</span>
          </text>
          <text fg={theme.textMuted}>Enter · Esc cancel</text>
        </box>
      </Show>

      <Show when={!adding()}>
        <box flexDirection="column">
          <text
            fg={cursor() === 0 ? theme.accent : theme.text}
            bg={cursor() === 0 ? theme.backgroundElement : undefined}
          >
            {(cursor() === 0 ? "› " : "  ") + "＋ New job"}
          </text>
          <Show when={err()}>
            <text fg="#ef4444">Failed: {err()}</text>
          </Show>
          <Show when={jobs().length > 0}>
            <box flexDirection="row" gap={1}>
              <text fg={theme.textMuted}>{`  ${"STATUS".padEnd(14)}`}</text>
              <text fg={theme.textMuted}>{"TURNS".padEnd(7)}</text>
              <text fg={theme.textMuted}>{"NEXT".padEnd(7)}</text>
              <text fg={theme.textMuted}>GOAL</text>
            </box>
            <For each={jobs()}>
              {(j, i) => {
                const row = formatJobRow(j, nowTs)
                const sel = () => cursor() === i() + 1
                return (
                  <box flexDirection="row" gap={1} backgroundColor={sel() ? theme.backgroundElement : undefined}>
                    <text fg={statusColor(row.status.split(":")[0]!)}>
                      {(sel() ? "› " : "  ") + row.status.padEnd(14)}
                    </text>
                    <text fg={theme.text}>{row.turns.padEnd(7)}</text>
                    <text fg={theme.text}>{row.next.padEnd(7)}</text>
                    <text fg={theme.text}>{row.goal}</text>
                  </box>
                )
              }}
            </For>
          </Show>
        </box>
      </Show>

      <Show when={notice()}>
        <text fg={theme.accent}>{notice()}</text>
      </Show>
      <text fg={theme.textMuted}>↑/↓ move · Enter new job · d delete · Esc close</text>
    </box>
  )
}
