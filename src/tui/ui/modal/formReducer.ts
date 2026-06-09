export interface FormState {
  /** Field labels (display only; logic keys off index/length). */
  fields: string[]
  stepIdx: number
  /** Banked values for completed steps. */
  vals: string[]
  /** Current field buffer. */
  buf: string
  /** Non-null once the last field is submitted: the full ordered value list. */
  done: string[] | null
}

export type FormAction =
  | { type: "char"; ch: string }
  | { type: "backspace" }
  | { type: "paste"; text: string }
  | { type: "submit" }

export function initForm(fields: string[], prefill = ""): FormState {
  return { fields, stepIdx: 0, vals: [], buf: prefill, done: null }
}

/** Pure multi-step text-entry transition. UI-free, so it is fully unit-testable. */
export function formReducer(s: FormState, a: FormAction): FormState {
  switch (a.type) {
    case "char":
      return { ...s, buf: s.buf + a.ch }
    case "paste":
      return { ...s, buf: s.buf + a.text }
    case "backspace":
      return { ...s, buf: s.buf.slice(0, -1) }
    case "submit": {
      const vals = [...s.vals, s.buf]
      if (s.stepIdx >= s.fields.length - 1) return { ...s, vals, buf: "", done: vals }
      return { ...s, vals, stepIdx: s.stepIdx + 1, buf: "" }
    }
  }
}
