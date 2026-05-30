import type { Provider } from "@core/llm/types"

// ---------------------------------------------------------------------------
// Tier 2 — LLM judge ensemble. Runs only when a judge provider is supplied.
// ---------------------------------------------------------------------------
//
// Anti-self-preference: the judge SHOULD be a different model/provider from the
// generator that produced `finalText`. LLM judges measurably favor their own
// outputs, so the caller is responsible for wiring a distinct provider via config.
// This module does not — and cannot — enforce that; it just runs whatever it's given.

const DEFAULT_SYSTEM =
  "You are a strict completion auditor. You judge whether a deliverable satisfies ONE specific quality " +
  "aspect. Answer with a single word on the first line: 'Yes' if the aspect is fully satisfied and " +
  "grounded in cited evidence, otherwise 'No'. Do not be generous; when in doubt, answer No."

export interface JudgeOpts {
  judge: Provider
  goal: string
  finalText: string
  aspects: string[]
  system?: string
}

/** Parse a leading yes/no from a reply. Anything else → false (fail-closed). */
function parseYesNo(text: string): boolean {
  const token = text
    .trim()
    .toLowerCase()
    .match(/^[a-z]+/)?.[0]
  if (token === "yes" || token === "y") return true
  return false
}

/**
 * Ask the judge, one tightly-scoped call per aspect, whether `finalText` satisfies it.
 * Order of the returned array matches `aspects`. One `judge.chat` call per aspect.
 */
export async function judgeAspects(opts: JudgeOpts): Promise<{ aspect: string; pass: boolean }[]> {
  const system = opts.system ?? DEFAULT_SYSTEM
  const results: { aspect: string; pass: boolean }[] = []
  for (const aspect of opts.aspects) {
    const prompt =
      `GOAL:\n${opts.goal}\n\n` +
      `ASPECT TO JUDGE:\n${aspect}\n\n` +
      `DELIVERABLE (final assistant text):\n${opts.finalText}\n\n` +
      "Does the deliverable fully satisfy the aspect? Answer 'Yes' or 'No' on the first line."
    const res = await opts.judge.chat({
      messages: [{ role: "user", content: prompt }],
      system,
    })
    results.push({ aspect, pass: parseYesNo(res.text) })
  }
  return results
}
