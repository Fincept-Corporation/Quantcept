import { describe, expect, test } from "bun:test"
import { substituteArgs } from "@ext/commands/arguments"

describe("substituteArgs", () => {
  test("replaces $ARGUMENTS with the full args string", () => {
    expect(substituteArgs("Brief on $ARGUMENTS", "NIFTY 50")).toBe("Brief on NIFTY 50")
  })
  test("replaces $@ with the full args string", () => {
    expect(substituteArgs("X: $@", "a b")).toBe("X: a b")
  })
  test("replaces positional $1 $2 split on whitespace", () => {
    expect(substituteArgs("$1 vs $2", "HDFC ICICI")).toBe("HDFC vs ICICI")
  })
  test("missing positional becomes empty string", () => {
    expect(substituteArgs("$1-$2", "only")).toBe("only-")
  })
  test("no placeholders: appends args on its own line when args present", () => {
    expect(substituteArgs("Do the thing", "extra")).toBe("Do the thing\n\nextra")
  })
  test("no placeholders and no args: returns template unchanged", () => {
    expect(substituteArgs("Do the thing", "")).toBe("Do the thing")
  })
})
