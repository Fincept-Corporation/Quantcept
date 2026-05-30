import { type OAIAction, oaiActionToPrimitives } from "@core/tools/computeruse/openaiActions"
import type { Primitive } from "@core/tools/computeruse/protocol"
import type { SidecarClient } from "@core/tools/computeruse/sidecarClient"
import { ProviderError } from "@shared/errors"

/**
 * OpenAI GA computer-use (`{type:"computer"}` tool on gpt-5.5/gpt-5.4) over the Responses API.
 * The model is trained for pixel grounding, so it returns real screen coordinates — no grid.
 * We execute its batched actions on the sidecar, screenshot, and feed it back via
 * `previous_response_id` until it stops emitting `computer_call`.
 */

// biome-ignore lint/suspicious/noExplicitAny: raw Responses API JSON
type Json = Record<string, any>

export interface ComputerCall {
  callId: string
  actions: OAIAction[]
}

export interface ResponsesTurn {
  id: string
  computerCall?: ComputerCall
  text: string
}

export function parseResponsesTurn(j: Json): ResponsesTurn {
  const output: Json[] = j.output ?? []
  const cc = output.find((o) => o?.type === "computer_call")
  const computerCall: ComputerCall | undefined = cc
    ? { callId: cc.call_id, actions: (cc.actions ?? []) as OAIAction[] }
    : undefined
  let text = ""
  for (const o of output) {
    if (o?.type === "message" && Array.isArray(o.content)) {
      for (const c of o.content) if (c?.type === "output_text" && typeof c.text === "string") text += c.text
    } else if (o?.type === "output_text" && typeof o.text === "string") {
      text += o.text
    }
  }
  return { id: j.id, computerCall, text }
}

export class OpenAIComputerClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {}

  start(instruction: string): Promise<ResponsesTurn> {
    return this.post({ model: this.model, tools: [{ type: "computer" }], input: instruction })
  }

  next(previousResponseId: string, callId: string, screenshotB64: string): Promise<ResponsesTurn> {
    return this.post({
      model: this.model,
      tools: [{ type: "computer" }],
      previous_response_id: previousResponseId,
      input: [
        {
          type: "computer_call_output",
          call_id: callId,
          output: {
            type: "computer_screenshot",
            image_url: `data:image/png;base64,${screenshotB64}`,
            detail: "original",
          },
        },
      ],
    })
  }

  private async post(body: Json): Promise<ResponsesTurn> {
    const r = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new ProviderError(`OpenAI computer-use error ${r.status}: ${(await r.text()).slice(0, 300)}`)
    return parseResponsesTurn(await r.json())
  }
}

export interface ComputerUseRunDeps {
  responses: OpenAIComputerClient
  sidecar: SidecarClient
  maxSteps?: number
  onAudit?: (line: string) => void
  onStep?: (info: { step: number; actions: OAIAction[] }) => void
  abort?: AbortSignal
}

/** Drive the OpenAI computer-use loop to completion; returns the model's final text. */
export async function runOpenAIComputerUse(instruction: string, deps: ComputerUseRunDeps): Promise<string> {
  const maxSteps = deps.maxSteps ?? 40
  let turn = await deps.responses.start(instruction)
  // scale + monitor origin of the screenshot we LAST sent (the space the model's coords are in).
  let lastShot: { scale: number; ox: number; oy: number } | undefined

  for (let step = 0; step < maxSteps; step++) {
    if (deps.abort?.aborted) return "(stopped)"
    if (!turn.computerCall) return turn.text || "(done)"
    const { callId, actions } = turn.computerCall
    deps.onStep?.({ step, actions })

    const toPhys = (x: number, y: number): [number, number] =>
      lastShot ? [Math.round(x / lastShot.scale) + lastShot.ox, Math.round(y / lastShot.scale) + lastShot.oy] : [x, y]

    const prims: Primitive[] = []
    for (const a of actions) {
      if (deps.onAudit) deps.onAudit(`${new Date().toISOString()}\t${a.type}\t${a.x ?? "-"},${a.y ?? "-"}\t${a.text ?? a.keys?.join("+") ?? "-"}`)
      if (a.type !== "screenshot") prims.push(...oaiActionToPrimitives(a, toPhys))
    }
    if (prims.length) {
      const r = await deps.sidecar.send({ actions: prims })
      if (r.error) return `sidecar error: ${r.error}`
    }

    const cap = await deps.sidecar.send({ actions: [], capture: { maxLongEdge: 1440 } })
    if (cap.error) return `sidecar capture error: ${cap.error}`
    const shot = cap.screenshot
    if (!shot) return "(no screenshot from sidecar)"
    lastShot = {
      scale: shot.originalWidth > 0 ? shot.width / shot.originalWidth : 1,
      ox: shot.originX,
      oy: shot.originY,
    }
    turn = await deps.responses.next(turn.id, callId, shot.data)
  }
  return "(reached max steps)"
}
