import type { EffectClass } from "./effects"

/** What the reference monitor does with a tool given its resolved effect class.
 *  `gate` requires a human approval; `deny` is an unconditional block. */
export type PolicyAction = "allow" | "deny" | "gate"

/** A total mapping from every effect class to its policy action. */
export type EffectPolicy = Record<EffectClass, PolicyAction>

/** Resolve the action this policy assigns to an effect class. */
export function evaluatePolicy(cls: EffectClass, policy: EffectPolicy): PolicyAction {
  return policy[cls]
}

/** Read-only stance: only `read` effects run; everything mutating is denied. */
export function readOnlyPolicy(): EffectPolicy {
  return { read: "allow", write: "deny", compensable: "deny", irreversible: "deny" }
}

/** Trading stance: read/write/compensable run; irreversible effects gate to a human. */
export function tradingPolicy(): EffectPolicy {
  return { read: "allow", write: "allow", compensable: "allow", irreversible: "gate" }
}
