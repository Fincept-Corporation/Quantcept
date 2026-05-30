/**
 * Pure key → action mapping for the confirm dialog. Kept separate from the component so it is
 * unit-testable without an OpenTUI render context. `selected` is true when "Yes" is highlighted.
 */
export type DialogKeyAction = { toggle: true } | { result: boolean } | null

export function dialogKeyAction(keyName: string, selected: boolean): DialogKeyAction {
  if (keyName === "left" || keyName === "right" || keyName === "up" || keyName === "down" || keyName === "tab") {
    return { toggle: true }
  }
  if (keyName === "y") return { result: true }
  if (keyName === "n" || keyName === "escape") return { result: false }
  if (keyName === "return" || keyName === "kpenter") return { result: selected }
  return null
}
