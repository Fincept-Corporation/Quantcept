import { useTheme } from "@tui/context/theme"
import { For } from "solid-js"
import type { FormField, ModalForm as ModalFormState } from "./useModalForm"

const mask = (v: string) => "•".repeat(v.length)
const isSecret = (f: FormField | undefined) => typeof f === "object" && !!f.secret

/** Renders an active useModalForm: prior values, the current field + caret, footer.
 *  Secret fields are masked as dots. */
export function ModalForm(props: { form: ModalFormState; fields: FormField[]; title?: string; footer?: string }) {
  const { theme } = useTheme()
  const st = () => props.form.state()
  const display = (i: number, v: string) => (isSecret(props.fields[i]) ? mask(v) : v)
  return (
    <box flexDirection="column" gap={0}>
      {props.title ? <text fg={theme.accent}>{props.title}</text> : null}
      <For each={st().vals}>
        {(v, i) => (
          <text fg={theme.textMuted}>
            {st().fields[i()]}: {display(i(), v)}
          </text>
        )}
      </For>
      <text fg={theme.text}>
        {st().fields[st().stepIdx]}: {display(st().stepIdx, st().buf)}
        <span style={{ fg: theme.accent }}>▏</span>
      </text>
      <text fg={theme.textMuted}>{props.footer ?? "Enter · Esc cancel"}</text>
    </box>
  )
}
