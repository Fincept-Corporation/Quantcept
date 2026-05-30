// Tiered completion verifier (Phase 3). Replaces "an LLM says it looks done" with a
// tiered, mostly-deterministic gate: pure checks → grounded re-derivation → judge ensemble.

export { artifactExists, citationsGrounded, numericInRange } from "./deterministic"
export { groundedValue } from "./grounded"
export type { JudgeOpts } from "./judge"
export { judgeAspects } from "./judge"
export type { Criterion, SuccessSpec, Verdict } from "./types"
export type { VerifierDeps } from "./verifier"
export { makeVerifier } from "./verifier"
