import { dlopen, ptr } from "bun:ffi"
import type { ReadStream } from "node:tty"

const STD_INPUT_HANDLE = -10
const ENABLE_PROCESSED_INPUT = 0x0001
const ENABLE_VIRTUAL_TERMINAL_INPUT = 0x0200

/**
 * The console input mode the TUI needs on Windows, derived from the current mode:
 * - ENABLE_PROCESSED_INPUT cleared, so Ctrl+C arrives as a stdin byte (0x03)
 *   instead of being swallowed as a CTRL_C_EVENT.
 * - ENABLE_VIRTUAL_TERMINAL_INPUT set, so legacy conhost (cmd.exe) translates
 *   keypresses into the VT/xterm escape sequences OpenTUI's parser expects.
 *   Without it, Enter/Tab/arrows are dropped or mis-parsed on conhost; they only
 *   work in Windows Terminal because it enables VT input by default.
 *
 * All other bits are preserved, so this composes with whatever raw-mode flags
 * Bun/OpenTUI have set (Bun's setRawMode rewrites the whole mode word on Windows,
 * which is why the guard re-applies this after every toggle — see oven-sh/bun#25663).
 */
export function desiredInputMode(mode: number): number {
  return ((mode & ~ENABLE_PROCESSED_INPUT) | ENABLE_VIRTUAL_TERMINAL_INPUT) >>> 0
}

const kernel = () =>
  dlopen("kernel32.dll", {
    GetStdHandle: { args: ["i32"], returns: "ptr" },
    GetConsoleMode: { args: ["ptr", "ptr"], returns: "i32" },
    SetConsoleMode: { args: ["ptr", "u32"], returns: "i32" },
    FlushConsoleInputBuffer: { args: ["ptr"], returns: "i32" },
  })

let k32: ReturnType<typeof kernel> | undefined

function load() {
  if (process.platform !== "win32") return false
  try {
    k32 ??= kernel()
    return true
  } catch {
    return false
  }
}

/**
 * Put the console stdin handle into the mode the TUI needs: clear
 * ENABLE_PROCESSED_INPUT and set ENABLE_VIRTUAL_TERMINAL_INPUT (see
 * `desiredInputMode`).
 */
export function win32DisableProcessedInput() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)
  if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return

  const mode = buf[0]!
  const desired = desiredInputMode(mode)
  if (desired === mode) return
  k32!.symbols.SetConsoleMode(handle, desired)
}

/**
 * Discard any queued console input (mouse events, key presses, etc.).
 */
export function win32FlushInputBuffer() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  k32!.symbols.FlushConsoleInputBuffer(handle)
}

let unhook: (() => void) | undefined

/**
 * Keep the console input mode pinned to what the TUI needs (see
 * `desiredInputMode`): ENABLE_PROCESSED_INPUT disabled and
 * ENABLE_VIRTUAL_TERMINAL_INPUT enabled.
 *
 * On Windows, Ctrl+C becomes a CTRL_C_EVENT (instead of stdin input) when
 * ENABLE_PROCESSED_INPUT is set, and conhost only emits VT key sequences when
 * ENABLE_VIRTUAL_TERMINAL_INPUT is set. Various runtimes re-apply console modes
 * (Bun's setRawMode rewrites the whole word on Windows, sometimes on a later
 * tick), and the mode is console-global, not per-process.
 *
 * We combine:
 * - A `setRawMode(...)` hook to re-apply after known raw-mode toggles.
 * - A low-frequency poll as a backstop for native/external mode changes.
 */
export function win32InstallCtrlCGuard() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return
  if (unhook) return unhook

  const stdin = process.stdin as ReadStream
  const original = stdin.setRawMode

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)

  if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
  const initial = buf[0]!

  const enforce = () => {
    if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
    const mode = buf[0]!
    const desired = desiredInputMode(mode)
    if (desired === mode) return
    k32!.symbols.SetConsoleMode(handle, desired)
  }

  // Some runtimes can re-apply console modes on the next tick; enforce twice.
  const later = () => {
    enforce()
    setImmediate(enforce)
  }

  let wrapped: ReadStream["setRawMode"] | undefined

  if (typeof original === "function") {
    wrapped = (mode: boolean) => {
      const result = original.call(stdin, mode)
      later()
      return result
    }

    stdin.setRawMode = wrapped
  }

  // Ensure it's cleared immediately too (covers any earlier mode changes).
  later()

  const interval = setInterval(enforce, 100)
  interval.unref()

  let done = false
  unhook = () => {
    if (done) return
    done = true

    clearInterval(interval)
    if (wrapped && stdin.setRawMode === wrapped) {
      stdin.setRawMode = original
    }

    k32!.symbols.SetConsoleMode(handle, initial)
    unhook = undefined
  }

  return unhook
}
