import { effectClassOf } from "@core/tools/effects"
import { detectShell } from "@core/tools/shell/detect"
import { formatApproval } from "@core/tools/shell/format"
import { describeCommand } from "@core/tools/shell/parse"
import type { Tool } from "@core/tools/Tool"

/**
 * The outcome of the approval policy for one tool call: either an immediate decision, or a
 * prompt the UI should show. Keeping this as data (not a dialog call) makes the policy —
 * which tools auto-allow, what the prompt says, when computer-use is granted — unit-testable
 * without a terminal. The TUI renders `prompt` via DialogConfirm and applies the decision.
 */
export type ApprovalAsk =
  | { kind: "decide"; decision: "allow" | "deny" }
  | { kind: "prompt"; title: string; message: string; grantsComputerUse?: boolean }

export interface ApprovalContext {
  /** True once the user granted computer-use this session — later non-money actions auto-allow. */
  computerUseGranted: boolean
}

const confirmTitle = (tool: Tool, input: unknown) => `Run ${tool.name}?  ·  effect: ${effectClassOf(tool, input)}`

/**
 * Decide how to gate a tool call: shell shows a parsed, finance-labelled command breakdown;
 * computer-use is granted once per session (money-moving windows always re-confirm); everything
 * else gets a generic confirm. Pure + async only because the shell breakdown parses the command.
 */
export async function buildApproval(tool: Tool, input: unknown, ctx: ApprovalContext): Promise<ApprovalAsk> {
  if (tool.name === "shell" && input && typeof (input as { command?: unknown }).command === "string") {
    let message = `Input: ${JSON.stringify(input)}`
    try {
      const parts = await describeCommand((input as { command: string }).command, detectShell().kind)
      message = formatApproval(parts)
    } catch {
      // keep the default message on any parse failure
    }
    return { kind: "prompt", title: confirmTitle(tool, input), message }
  }

  if (tool.name === "computerUse" && input && typeof input === "object") {
    if (ctx.computerUseGranted) return { kind: "decide", decision: "allow" }
    const instr = (input as { instruction?: string }).instruction ?? ""
    return {
      kind: "prompt",
      title: "Allow computer use for this session?",
      message: `Quantcept will control the screen/keyboard to do this task, then run unattended.\nTask: ${instr.slice(0, 200)}`,
      grantsComputerUse: true,
    }
  }

  if (tool.name === "computer" && input && typeof input === "object") {
    const isMoney = (tool.permissionPatterns?.(input) ?? []).includes("computeruse:money")
    if (!isMoney && ctx.computerUseGranted) return { kind: "decide", decision: "allow" }
    const a = input as { action?: string; coordinate?: [number, number]; text?: string }
    const where = a.coordinate ? ` @ [${a.coordinate.join(", ")}]` : ""
    const what = a.text ? ` "${a.text}"` : ""
    const title = isMoney ? "Confirm money action?" : "Allow computer use for this session?"
    const message = isMoney
      ? `⚠ Money-action tripwire — the focused window looks money-moving.\nAction: ${a.action ?? "?"}${where}${what}`
      : `Quantcept will control the screen/keyboard for this task. Approve once and it runs unattended (money-moving windows still confirm).\nFirst action: ${a.action ?? "?"}${where}${what}`
    return { kind: "prompt", title, message, grantsComputerUse: !isMoney }
  }

  return { kind: "prompt", title: confirmTitle(tool, input), message: `Input: ${JSON.stringify(input)}` }
}
