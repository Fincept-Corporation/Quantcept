import type { Primitive, SidecarButton } from "./protocol"

/** An action item from OpenAI's GA `computer` tool (`computer_call.actions[]`). */
export interface OAIAction {
  type: string
  x?: number
  y?: number
  button?: string
  text?: string
  keys?: string[]
  scrollX?: number
  scrollY?: number
  path?: Array<[number, number] | { x: number; y: number }>
}

/** OpenAI emits UPPERCASE key tokens; map to the names the sidecar's parse_key understands. */
function normKey(k: string): string {
  const l = k.toLowerCase()
  if (l === "arrowup") return "up"
  if (l === "arrowdown") return "down"
  if (l === "arrowleft") return "left"
  if (l === "arrowright") return "right"
  return l
}

function btn(b?: string): SidecarButton {
  return b === "right" ? "right" : b === "middle" ? "middle" : "left"
}

function point(p: [number, number] | { x: number; y: number }): [number, number] {
  return Array.isArray(p) ? p : [p.x, p.y]
}

/**
 * Lower a single OpenAI computer action to sidecar primitives. `toPhys` maps the model's
 * screenshot-space coordinate to physical screen pixels (image/scale + monitor origin).
 * Mouse actions hold any `keys[]` modifiers around the action; `keypress` is a standalone chord.
 */
export function oaiActionToPrimitives(a: OAIAction, toPhys: (x: number, y: number) => [number, number]): Primitive[] {
  const mods = (a.keys ?? []).map(normKey)
  const hold = mods.map((k): Primitive => ({ kind: "key", key: k, direction: "press" }))
  const release = [...mods].reverse().map((k): Primitive => ({ kind: "key", key: k, direction: "release" }))
  const moveTo = (x: number, y: number): Primitive => {
    const [px, py] = toPhys(x, y)
    return { kind: "move", x: px, y: py }
  }

  switch (a.type) {
    case "screenshot":
      return []
    case "click":
      return [...hold, moveTo(a.x ?? 0, a.y ?? 0), { kind: "button", button: btn(a.button), direction: "click" }, ...release]
    case "double_click":
      return [
        ...hold,
        moveTo(a.x ?? 0, a.y ?? 0),
        { kind: "button", button: btn(a.button), direction: "click" },
        { kind: "button", button: btn(a.button), direction: "click" },
        ...release,
      ]
    case "move":
      return [...hold, moveTo(a.x ?? 0, a.y ?? 0), ...release]
    case "type":
      return [{ kind: "text", text: a.text ?? "" }]
    case "keypress": {
      const keys = (a.keys ?? []).map(normKey)
      return [
        ...keys.map((k): Primitive => ({ kind: "key", key: k, direction: "press" })),
        ...[...keys].reverse().map((k): Primitive => ({ kind: "key", key: k, direction: "release" })),
      ]
    }
    case "scroll": {
      const out: Primitive[] = [...hold, moveTo(a.x ?? 0, a.y ?? 0)]
      if (a.scrollY) out.push({ kind: "scroll", axis: "vertical", amount: a.scrollY })
      if (a.scrollX) out.push({ kind: "scroll", axis: "horizontal", amount: a.scrollX })
      out.push(...release)
      return out
    }
    case "drag": {
      const pts = (a.path ?? []).map(point)
      if (pts.length < 2) return []
      const out: Primitive[] = [...hold, moveTo(pts[0]![0], pts[0]![1]), { kind: "button", button: "left", direction: "press" }]
      for (let i = 1; i < pts.length; i++) out.push(moveTo(pts[i]![0], pts[i]![1]))
      out.push({ kind: "button", button: "left", direction: "release" }, ...release)
      return out
    }
    case "wait":
      return [{ kind: "wait", seconds: 1.5 }]
    default:
      return []
  }
}
