// Pure helpers for the session auto-approve toggle, split out so the key-mapping and the
// decision are unit-testable without an OpenTUI render context.

/** True when the pressed key is the auto-approve toggle (shift+tab). */
export function isAutoApproveToggle(key: { name?: string; shift?: boolean }): boolean {
  return key.name === "tab" && key.shift === true
}

/** The footer hint shown for the current auto-approve state. */
export function autoApproveLabel(on: boolean): string {
  return on ? "auto-accept ON (shift+tab to stop)" : "shift+tab auto-accept"
}
