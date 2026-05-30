/**
 * Coalesce a high-frequency stream of text chunks into far fewer commits.
 *
 * LLM tokens can arrive dozens of times per second; re-parsing markdown on every
 * one is wasted work. `push()` buffers chunks and emits them via `onFlush` at
 * most once per `intervalMs`, but flushes immediately on a paragraph boundary
 * (`\n\n`) so completed blocks reveal promptly and align with OpenTUI's
 * block-stabilization. `flush()` forces a commit (call at stream end and before
 * any structural change); `dispose()` drops buffered text and cancels timers.
 *
 * `onFlush` receives the delta accumulated since the previous flush.
 */
export interface Coalescer {
  push(chunk: string): void
  flush(): void
  dispose(): void
}

export interface CoalescerOptions {
  onFlush: (delta: string) => void
  /** Minimum gap between time-based flushes. Default 32ms (~30fps). */
  intervalMs?: number
  /** Injectable scheduler (tests pass a manual one); returns a canceller. */
  schedule?: (fn: () => void, ms: number) => () => void
}

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms)
  return () => clearTimeout(id)
}

export function createCoalescer(opts: CoalescerOptions): Coalescer {
  const interval = opts.intervalMs ?? 32
  const schedule = opts.schedule ?? defaultSchedule
  let buffer = ""
  let cancel: (() => void) | null = null

  function emit(): void {
    if (cancel) {
      cancel()
      cancel = null
    }
    if (!buffer) return
    const delta = buffer
    buffer = ""
    opts.onFlush(delta)
  }

  return {
    push(chunk: string): void {
      if (!chunk) return
      buffer += chunk
      // A paragraph break finalizes a block — commit at once for a snappy reveal.
      if (buffer.includes("\n\n")) {
        emit()
        return
      }
      if (!cancel) cancel = schedule(emit, interval)
    },
    flush(): void {
      emit()
    },
    dispose(): void {
      if (cancel) {
        cancel()
        cancel = null
      }
      buffer = ""
    },
  }
}
