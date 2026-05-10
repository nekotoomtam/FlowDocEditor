import { describe, expect, it } from "vitest"
import { shouldFinalizeInlineEditBlur } from "../inlineEditBlur"

describe("shouldFinalizeInlineEditBlur", () => {
  it("ignores blur when focus moved to the remounted textarea for the same node", () => {
    expect(shouldFinalizeInlineEditBlur("p1", "p1", "p1")).toBe(false)
  })

  it("finalizes when the same inline edit node loses focus outside the editor", () => {
    expect(shouldFinalizeInlineEditBlur("p1", "p1", null)).toBe(true)
  })

  it("does not finalize a newer inline edit session after the active node changed", () => {
    expect(shouldFinalizeInlineEditBlur("p1", "p2", "p2")).toBe(false)
  })

  it("finalizes when the blurred node is unknown", () => {
    expect(shouldFinalizeInlineEditBlur(null, "p1", null)).toBe(true)
  })
})
