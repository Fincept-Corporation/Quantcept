import { RGBA } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { type Accessor, createEffect, createMemo, createSignal } from "solid-js"
import catppuccinTheme from "../themes/catppuccin.json"
import draculaTheme from "../themes/dracula.json"
import nordTheme from "../themes/nord.json"
import quantceptTheme from "../themes/quantcept.json"
import tokyonightTheme from "../themes/tokyonight.json"
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"

type HexColor = string
type ThemeColors = Record<string, HexColor>

interface ThemeJson {
  defs?: Record<string, string>
  theme: Record<string, string | { dark?: string; light?: string }>
}

const BUNDLED_THEMES: Record<string, ThemeJson> = {
  quantcept: quantceptTheme as ThemeJson,
  dracula: draculaTheme as ThemeJson,
  nord: nordTheme as ThemeJson,
  tokyonight: tokyonightTheme as ThemeJson,
  catppuccin: catppuccinTheme as ThemeJson,
}

function resolveColor(
  value: string | { dark?: string; light?: string },
  defs: Record<string, string>,
  mode: "dark" | "light",
  visited = new Set<string>(),
): string {
  if (typeof value === "object") {
    const raw = mode === "dark" ? (value.dark ?? value.light ?? "#888888") : (value.light ?? value.dark ?? "#888888")
    return resolveColor(raw, defs, mode, visited)
  }
  if (value.startsWith("#")) return value
  if (value === "transparent" || value === "none") return "#00000000"
  if (visited.has(value)) return "#ff00ff"
  visited.add(value)
  if (defs[value]) return resolveColor(defs[value]!, defs, mode, visited)
  return value.startsWith("#") ? value : "#888888"
}

function resolveTheme(json: ThemeJson, mode: "dark" | "light"): ThemeColors {
  const defs = json.defs ?? {}
  const result: ThemeColors = {}
  for (const [key, value] of Object.entries(json.theme)) {
    result[key] = resolveColor(value, defs, mode)
  }
  return result
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1
  return { r, g, b, a }
}

export function tint(a: RGBA | string, b: RGBA | string, t: number): RGBA {
  const ac = typeof a === "string" ? RGBA.fromHex(a) : a
  const bc = typeof b === "string" ? RGBA.fromHex(b) : b
  return RGBA.fromValues(
    ac.r + (bc.r - ac.r) * t,
    ac.g + (bc.g - ac.g) * t,
    ac.b + (bc.b - ac.b) * t,
    ac.a + (bc.a - ac.a) * t,
  )
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: (props: { mode?: "dark" | "light" }) => {
    const kv = useKV()
    const renderer = useRenderer()
    const [mode, setMode] = createSignal<"dark" | "light">(kv.get("theme_mode") ?? props.mode ?? "dark")
    const [selected, setSelectedRaw] = createSignal<string>(kv.get("theme") ?? "quantcept")
    const [locked, setLocked] = createSignal<boolean>(kv.get("theme_mode_lock") != null)

    const resolved = createMemo(() => {
      const name = selected()
      const json = BUNDLED_THEMES[name] ?? BUNDLED_THEMES["quantcept"]!
      return resolveTheme(json, mode())
    })

    const theme = new Proxy({} as ThemeColors, {
      get(_, prop: string) {
        return resolved()[prop] ?? "#ff00ff"
      },
    })

    createEffect(() => {
      const bg = resolved().background
      if (bg) {
        renderer.setBackgroundColor(bg)
      }
    })

    return {
      theme,
      get selected() {
        return selected()
      },
      all() {
        return BUNDLED_THEMES
      },
      has(name: string) {
        return name in BUNDLED_THEMES
      },
      mode: mode as Accessor<"dark" | "light">,
      setMode(m: "dark" | "light") {
        setMode(m)
        kv.set("theme_mode", m)
      },
      locked,
      lock() {
        setLocked(true)
        kv.set("theme_mode_lock", mode())
      },
      unlock() {
        setLocked(false)
        kv.set("theme_mode_lock", undefined)
      },
      set(name: string) {
        if (!(name in BUNDLED_THEMES)) return false
        setSelectedRaw(name)
        kv.set("theme", name)
        return true
      },
      ready: true,
    }
  },
})
