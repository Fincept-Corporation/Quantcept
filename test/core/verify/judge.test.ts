import { describe, expect, test } from "bun:test"
import type { ChatRequest, ChatResult, Provider, StreamHandlers } from "@core/llm/types"
import { judgeAspects } from "@core/verify/judge"

/** Fake provider returning scripted text keyed by call order. */
function scriptedJudge(replies: string[]): Provider {
  let i = 0
  return {
    id: "fake-judge",
    async chat(_req: ChatRequest, _h?: StreamHandlers): Promise<ChatResult> {
      const text = replies[i++] ?? ""
      return { text, inputTokens: 1, outputTokens: 1, stopReason: "end_turn" }
    },
  }
}

describe("judgeAspects", () => {
  test("maps Yes/No replies to pass booleans in order", async () => {
    const judge = scriptedJudge(["Yes, it is well grounded.", "No — missing the risk section."])
    const out = await judgeAspects({
      judge,
      goal: "Write a brief",
      finalText: "the brief",
      aspects: ["cites sources", "covers risks"],
    })
    expect(out).toEqual([
      { aspect: "cites sources", pass: true },
      { aspect: "covers risks", pass: false },
    ])
  })

  test("case-insensitive leading token", async () => {
    const judge = scriptedJudge(["YES", "no"])
    const out = await judgeAspects({
      judge,
      goal: "g",
      finalText: "t",
      aspects: ["a", "b"],
    })
    expect(out.map((o) => o.pass)).toEqual([true, false])
  })

  test("unparseable reply defaults to false", async () => {
    const judge = scriptedJudge(["I'm not sure, perhaps?", ""])
    const out = await judgeAspects({
      judge,
      goal: "g",
      finalText: "t",
      aspects: ["a", "b"],
    })
    expect(out.map((o) => o.pass)).toEqual([false, false])
  })

  test("issues exactly one chat call per aspect", async () => {
    let calls = 0
    const judge: Provider = {
      id: "counting",
      async chat(): Promise<ChatResult> {
        calls++
        return { text: "yes", inputTokens: 0, outputTokens: 0, stopReason: "end_turn" }
      },
    }
    await judgeAspects({ judge, goal: "g", finalText: "t", aspects: ["a", "b", "c"] })
    expect(calls).toBe(3)
  })
})
