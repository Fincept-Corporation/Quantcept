/**
 * A fixed-size grid of characters that the diagram layouts draw onto.
 *
 * Everything is monospace-cell based: (x, y) is (column, row), origin top-left.
 * All writes are clipped to the grid — drawing off the edge is a no-op, never an
 * error, so layout code can be sloppy about bounds without crashing the TUI.
 * `toString()` is the portable text artifact: trailing whitespace per line is
 * trimmed and trailing blank lines are dropped so diagrams copy/paste cleanly.
 */
export class Canvas {
  readonly width: number
  readonly height: number
  private readonly cells: string[][]

  constructor(width: number, height: number) {
    this.width = Math.max(0, width)
    this.height = Math.max(0, height)
    this.cells = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => " "))
  }

  set(x: number, y: number, ch: string): void {
    if (!ch) return
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    // Guard against accidental multi-char writes overflowing a single cell.
    this.cells[y]![x] = ch[0]!
  }

  drawText(x: number, y: number, text: string): void {
    for (let i = 0; i < text.length; i++) this.set(x + i, y, text[i]!)
  }

  hLine(x: number, y: number, len: number, ch = "─"): void {
    for (let i = 0; i < len; i++) this.set(x + i, y, ch)
  }

  vLine(x: number, y: number, len: number, ch = "│"): void {
    for (let i = 0; i < len; i++) this.set(x, y + i, ch)
  }

  drawBox(x: number, y: number, w: number, h: number): void {
    if (w < 2 || h < 2) return
    const right = x + w - 1
    const bottom = y + h - 1
    this.hLine(x + 1, y, w - 2)
    this.hLine(x + 1, bottom, w - 2)
    this.vLine(x, y + 1, h - 2)
    this.vLine(right, y + 1, h - 2)
    this.set(x, y, "┌")
    this.set(right, y, "┐")
    this.set(x, bottom, "└")
    this.set(right, bottom, "┘")
  }

  toString(): string {
    const lines = this.cells.map((row) => row.join("").replace(/\s+$/u, ""))
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
    return lines.join("\n")
  }
}
