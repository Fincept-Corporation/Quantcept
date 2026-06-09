import { expect, test } from "bun:test"
import { publishSessionInvalidated, subscribeSessionInvalidated } from "@core/fincept/session-events"

test("publish reaches subscribers; unsubscribe stops delivery", () => {
  const seen: string[] = []
  const off = subscribeSessionInvalidated((r) => seen.push(r))
  publishSessionInvalidated("reason-1")
  off()
  publishSessionInvalidated("reason-2")
  expect(seen).toEqual(["reason-1"])
})

test("a throwing subscriber never breaks the publisher", () => {
  const off1 = subscribeSessionInvalidated(() => { throw new Error("boom") })
  let reached = false
  const off2 = subscribeSessionInvalidated(() => { reached = true })
  expect(() => publishSessionInvalidated("x")).not.toThrow()
  expect(reached).toBe(true)
  off1(); off2()
})
