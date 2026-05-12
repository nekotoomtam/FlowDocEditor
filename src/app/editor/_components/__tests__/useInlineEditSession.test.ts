import { describe, expect, it } from "vitest"
import { isInlineEditVisualFresh } from "../useInlineEditSession"

describe("isInlineEditVisualFresh", () => {
  it("treats inactive editing as visually fresh", () => {
    expect(isInlineEditVisualFresh(null, 3, 0)).toBe(true)
  })

  it("keeps active editing stale until the visual version catches up", () => {
    expect(isInlineEditVisualFresh("p1", 2, 1)).toBe(false)
    expect(isInlineEditVisualFresh("p1", 2, 2)).toBe(true)
    expect(isInlineEditVisualFresh("p1", 2, 3)).toBe(true)
  })
})
