import { JobStore } from "@core/jobs"
import type { Job } from "@core/jobs/types"
import { projectHash } from "@core/storage/paths"
import { createTextAttributes } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { useListNav, useModalForm, useModalKeyboard, useNotice } from "@tui/ui/modal"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { formatJobRow, statusColor } from "./jobs-view-format"

const BOLD = createTextAttributes({ bold: true })

type Row = { kind: "new" } | { kind: "job"; job: Job }

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
  const notice = useNotice()
  const form = useModalForm({ onError: notice.fail })

  // Row 0 is the synthetic "＋ New job" row; rows 1..n are the jobs (cursor over the combined list).
  const rows = createMemo<Row[]>(() => [{ kind: "new" }, ...jobs().map((job): Row => ({ kind: "job", job }))])

  function refresh() {
    try {
      setJobs(store.listByProject(ph))
      notice.clear()
    } catch (e) {
      notice.fail(e)
    }
    renderer.requestRender()
  }
  refresh()

  function createJob(goal: string) {
    const g = goal.trim()
    if (!g) return
    try {
      const id = crypto.randomUUID().slice(0, 8)
      store.create({ id, cwd: process.cwd(), goal: g, readOnly: true })
      notice.flash(`Created job ${id} (read-only). Runs on the next \`quantcept jobs tick\`.`)
      refresh()
    } catch (e) {
      notice.fail(e)
    }
  }
  function deleteJob(job: Job) {
    try {
      store.delete(job.id)
      notice.flash(`Deleted job ${job.id}.`)
      refresh()
    } catch (e) {
      notice.fail(e)
    }
  }
  function startNew() {
    form.start({ fields: ["goal"], onComplete: ([g]) => createJob(g ?? "") })
  }

  const nav = useListNav<Row>({
    items: rows,
    onSelect: (r) => {
      if (r.kind === "new") startNew()
    },
    onEscape: props.onClose,
    onKey: (e, r) => {
      if (e.name === "q") {
        props.onClose()
        return true
      }
      if ((e.name === "d" || e.sequence === "d") && r?.kind === "job") {
        deleteJob(r.job)
        nav.setCursor(Math.max(0, nav.cursor() - 1))
        return true
      }
      return false
    },
  })
  useModalKeyboard({ form, nav })

  const nowTs = Date.now()
  const sel = (i: number) => nav.cursor() === i

  return (
    <box flexDirection="column" gap={1}>
      <text fg={theme.accent} attributes={BOLD}>
        Jobs ({jobs().length})
      </text>

      <Show when={form.active()}>
        <box flexDirection="column">
          <text fg={theme.accent}>New job — goal</text>
          <text fg={theme.text}>
            {form.state().buf}
            <span style={{ fg: theme.accent }}>▏</span>
          </text>
          <text fg={theme.textMuted}>Enter · Esc cancel</text>
        </box>
      </Show>

      <Show when={!form.active()}>
        <box flexDirection="column">
          <text fg={sel(0) ? theme.accent : theme.text} bg={sel(0) ? theme.backgroundElement : undefined}>
            {(sel(0) ? "› " : "  ") + "＋ New job"}
          </text>
          <Show when={notice.err()}>
            <text fg="#ef4444">Failed: {notice.err()}</text>
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
                const selected = () => sel(i() + 1)
                return (
                  <box flexDirection="row" gap={1} backgroundColor={selected() ? theme.backgroundElement : undefined}>
                    <text fg={statusColor(row.status.split(":")[0]!)}>
                      {(selected() ? "› " : "  ") + row.status.padEnd(14)}
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

      <Show when={notice.notice()}>
        <text fg={theme.accent}>{notice.notice()}</text>
      </Show>
      <text fg={theme.textMuted}>↑/↓ move · Enter new job · d delete · Esc close</text>
    </box>
  )
}
