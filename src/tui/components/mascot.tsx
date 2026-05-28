import { useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { readFileSync } from "fs"
import { resolve } from "path"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"

const MASCOT_ELEPHANT = readFileSync(resolve(import.meta.dir, "../assets/mascot.txt"), "utf-8")
const MASCOT_FROG = readFileSync(resolve(import.meta.dir, "../assets/mascot2.txt"), "utf-8")
const MASCOT_HORSE = readFileSync(resolve(import.meta.dir, "../assets/mascot3.txt"), "utf-8")
const MASCOT_DINO = readFileSync(resolve(import.meta.dir, "../assets/mascot4.txt"), "utf-8")
const MASCOT_DRAGON = readFileSync(resolve(import.meta.dir, "../assets/mascot5.txt"), "utf-8")
const MASCOT_BIRD = readFileSync(resolve(import.meta.dir, "../assets/mascot6.txt"), "utf-8")
const MASCOT_TURTLE = readFileSync(resolve(import.meta.dir, "../assets/mascot7.txt"), "utf-8")
const MASCOT_CAT = readFileSync(resolve(import.meta.dir, "../assets/mascot8.txt"), "utf-8")
const MASCOT_REX = readFileSync(resolve(import.meta.dir, "../assets/mascot9.txt"), "utf-8")
const MASCOT_SNAIL = readFileSync(resolve(import.meta.dir, "../assets/mascot10.txt"), "utf-8")
const MASCOT_OWL = readFileSync(resolve(import.meta.dir, "../assets/mascot11.txt"), "utf-8")
const MASCOT_MONKEY = readFileSync(resolve(import.meta.dir, "../assets/mascot12.txt"), "utf-8")
const MASCOT_SPIDER = readFileSync(resolve(import.meta.dir, "../assets/mascot13.txt"), "utf-8")

const MASCOTS = [
  MASCOT_ELEPHANT,
  MASCOT_FROG,
  MASCOT_HORSE,
  MASCOT_DINO,
  MASCOT_DRAGON,
  MASCOT_BIRD,
  MASCOT_TURTLE,
  MASCOT_CAT,
  MASCOT_REX,
  MASCOT_SNAIL,
  MASCOT_OWL,
  MASCOT_MONKEY,
  MASCOT_SPIDER,
]

// Rotate based on current second so consecutive launches get different mascots
const picked = Math.floor(Date.now() / 1000) % MASCOTS.length

const TIPS = [
  'Try: "Analyze NIFTY 50 trends"',
  'Try: "What\'s my portfolio risk?"',
  'Try: "Compare HDFC vs ICICI"',
  'Try: "Show top gainers today"',
  'Try: "Calculate my Sharpe ratio"',
  'Try: "Explain options Greeks"',
]

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0")
  return `#${c(r)}${c(g)}${c(b)}`
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(" ")
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)
  return lines
}

function buildCloud(message: string): string {
  const MAX_WIDTH = 24
  const lines = wrapText(message, MAX_WIDTH)
  const width = Math.max(...lines.map((l) => l.length)) + 2
  const top = ` ${"_".repeat(width + 2)} `
  const mid = lines.map((l) => `| ${l.padEnd(width)} |`).join("\n")
  const bot = ` ${"‾".repeat(width + 2)} `
  return `${top}\n${mid}\n${bot}`
}

export function Mascot() {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const [tick, setTick] = createSignal(0)
  const [tipIndex, setTipIndex] = createSignal(0)

  let animInterval: ReturnType<typeof setInterval>
  let tipInterval: ReturnType<typeof setInterval>
  onMount(() => {
    animInterval = setInterval(() => {
      setTick((t) => t + 1)
      renderer.requestRender()
    }, 100)
    tipInterval = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length)
    }, 4000)
  })
  onCleanup(() => {
    clearInterval(animInterval)
    clearInterval(tipInterval)
  })

  const mascotColor = createMemo(() => {
    const t = tick()
    const [ar, ag, ab] = hexToRgb(typeof theme.accent === "string" ? theme.accent : "#3ce067")
    const [mr, mg, mb] = hexToRgb(typeof theme.textMuted === "string" ? theme.textMuted : "#636363")

    const wave = Math.sin(t * 0.08 * Math.PI) * 0.5 + 0.5
    const intensity = 0.4 + wave * 0.6

    return rgbToHex(lerp(mr, ar, intensity), lerp(mg, ag, intensity), lerp(mb, ab, intensity))
  })

  const cloud = createMemo(() => buildCloud(TIPS[tipIndex()]!))
  const art = MASCOTS[picked]!

  return (
    <box flexDirection="row" alignItems="flex-start" gap={0}>
      <box flexDirection="column" maxHeight={15} overflow="hidden">
        <text fg={mascotColor()}>{art}</text>
      </box>
      <box flexDirection="column" paddingTop={0} paddingLeft={1}>
        <text fg={theme.text}>{cloud()}</text>
        <text fg={theme.textMuted}>{"   o"}</text>
        <text fg={theme.textMuted}>{"  o"}</text>
      </box>
    </box>
  )
}

export function MascotCompact() {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const [tick, setTick] = createSignal(0)
  const [tipIndex, setTipIndex] = createSignal(0)

  let animInterval: ReturnType<typeof setInterval>
  let tipInterval: ReturnType<typeof setInterval>
  onMount(() => {
    animInterval = setInterval(() => {
      setTick((t) => t + 1)
      renderer.requestRender()
    }, 100)
    tipInterval = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length)
    }, 4000)
  })
  onCleanup(() => {
    clearInterval(animInterval)
    clearInterval(tipInterval)
  })

  const color = createMemo(() => {
    const t = tick()
    const [ar, ag, ab] = hexToRgb(typeof theme.accent === "string" ? theme.accent : "#3ce067")
    const [mr, mg, mb] = hexToRgb(typeof theme.textMuted === "string" ? theme.textMuted : "#636363")
    const wave = Math.sin(t * 0.08 * Math.PI) * 0.5 + 0.5
    const intensity = 0.4 + wave * 0.6
    return rgbToHex(lerp(mr, ar, intensity), lerp(mg, ag, intensity), lerp(mb, ab, intensity))
  })

  const cloud = createMemo(() => buildCloud(TIPS[tipIndex()]!))
  const art = MASCOTS[picked]!

  return (
    <box flexDirection="column" maxHeight={15} overflow="hidden">
      <text fg={color()}>{art}</text>
      <box paddingTop={0}>
        <text fg={theme.textMuted}>{"  o"}</text>
        <text fg={theme.text}>{cloud()}</text>
      </box>
    </box>
  )
}
