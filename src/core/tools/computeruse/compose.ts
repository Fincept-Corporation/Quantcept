import type { Primitive, SidecarButton } from "./protocol"

/**
 * Maps a high-level computer-use verb (Anthropic-style action) to the low-level primitive
 * sequence the sidecar executes, plus whether to capture a screenshot afterwards. Coordinates
 * are PHYSICAL pixels (the tool scales the model's coordinates up before calling this).
 *
 * Keeping composition here (pure, headless, unit-tested) means the Rust sidecar only ever
 * executes a flat list of primitives — it never interprets verbs or chords.
 */

export interface ComputerAction {
  action: string
  coordinate?: [number, number]
  startCoordinate?: [number, number]
  text?: string
  scrollDirection?: "up" | "down" | "left" | "right"
  scrollAmount?: number
  duration?: number
}

export interface ComposedActions {
  primitives: Primitive[]
  capture: boolean
}

function move(c?: [number, number]): Primitive {
  return { kind: "move", x: c?.[0] ?? 0, y: c?.[1] ?? 0 }
}

function button(b: SidecarButton, direction: "press" | "release" | "click"): Primitive {
  return { kind: "button", button: b, direction }
}

/** "ctrl+shift+s" -> press ctrl, press shift, click s, release shift, release ctrl. */
function keyChord(combo: string): Primitive[] {
  const keys = combo
    .split("+")
    .map((k) => k.trim())
    .filter(Boolean)
  if (keys.length <= 1) return [{ kind: "key", key: keys[0] ?? "", direction: "click" }]
  const mods = keys.slice(0, -1)
  const last = keys[keys.length - 1]!
  const out: Primitive[] = []
  for (const m of mods) out.push({ kind: "key", key: m, direction: "press" })
  out.push({ kind: "key", key: last, direction: "click" })
  for (const m of [...mods].reverse()) out.push({ kind: "key", key: m, direction: "release" })
  return out
}

function scrollPrim(a: ComputerAction): Primitive {
  const amt = a.scrollAmount ?? 1
  switch (a.scrollDirection) {
    case "up":
      return { kind: "scroll", axis: "vertical", amount: -amt }
    case "left":
      return { kind: "scroll", axis: "horizontal", amount: -amt }
    case "right":
      return { kind: "scroll", axis: "horizontal", amount: amt }
    default:
      return { kind: "scroll", axis: "vertical", amount: amt } // "down"
  }
}

export function composeAction(a: ComputerAction): ComposedActions {
  switch (a.action) {
    case "screenshot":
      return { primitives: [], capture: true }
    case "cursor_position":
      return { primitives: [], capture: false }
    case "mouse_move":
      return { primitives: [move(a.coordinate)], capture: true }
    case "left_click":
      return { primitives: [move(a.coordinate), button("left", "click")], capture: true }
    case "right_click":
      return { primitives: [move(a.coordinate), button("right", "click")], capture: true }
    case "middle_click":
      return { primitives: [move(a.coordinate), button("middle", "click")], capture: true }
    case "double_click":
      return { primitives: [move(a.coordinate), button("left", "click"), button("left", "click")], capture: true }
    case "triple_click":
      return {
        primitives: [move(a.coordinate), button("left", "click"), button("left", "click"), button("left", "click")],
        capture: true,
      }
    case "left_click_drag":
      return {
        primitives: [move(a.startCoordinate), button("left", "press"), move(a.coordinate), button("left", "release")],
        capture: true,
      }
    case "type":
      return { primitives: [{ kind: "text", text: a.text ?? "" }], capture: true }
    case "key":
      return { primitives: keyChord(a.text ?? ""), capture: true }
    case "scroll":
      return { primitives: [move(a.coordinate), scrollPrim(a)], capture: true }
    case "wait":
      return { primitives: [{ kind: "wait", seconds: a.duration ?? 1 }], capture: true }
    default:
      return { primitives: [], capture: true }
  }
}
