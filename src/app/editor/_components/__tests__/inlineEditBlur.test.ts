import { describe, expect, it } from "vitest"
import { decideInlineEditStart, getFocusedInlineEditNodeId, shouldFinalizeInlineEditBlur } from "../inlineEditBlur"

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

describe("getFocusedInlineEditNodeId", () => {
  it("reads inline edit identity from any focused element with the data attribute", () => {
    const active = {
      getAttribute: (name: string) => name === "data-inline-edit-node-id" ? "p1" : null,
    } as Element

    expect(getFocusedInlineEditNodeId(active)).toBe("p1")
  })

  it("returns null when the focused element is not an inline edit surface", () => {
    const active = {
      getAttribute: () => null,
    } as unknown as Element

    expect(getFocusedInlineEditNodeId(active)).toBe(null)
    expect(getFocusedInlineEditNodeId(null)).toBe(null)
  })
})

describe("decideInlineEditStart", () => {
  it("starts a fresh session when no transaction is open", () => {
    expect(decideInlineEditStart(null, "p1", false)).toBe("start")
    expect(decideInlineEditStart("p1", "p1", false)).toBe("start")
  })

  it("keeps the current transaction when the same paragraph is activated again", () => {
    expect(decideInlineEditStart("p1", "p1", true)).toBe("continue-current")
  })

  it("finalizes the previous transaction before editing another paragraph", () => {
    expect(decideInlineEditStart("p1", "p2", true)).toBe("finalize-previous")
  })
})
