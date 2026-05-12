import { describe, expect, it } from "vitest"
import {
  STALE_INLINE_EDIT_VISUAL_VERSION,
  isInlineEditDocumentVisualReady,
  isInlineEditVisualFresh,
} from "../useInlineEditSession"

describe("isInlineEditVisualFresh", () => {
  it("treats inactive editing as visually fresh", () => {
    expect(isInlineEditVisualFresh(null, 3, 0)).toBe(true)
  })

  it("keeps active editing stale until the visual version catches up", () => {
    expect(isInlineEditVisualFresh("p1", 0, STALE_INLINE_EDIT_VISUAL_VERSION)).toBe(false)
    expect(isInlineEditVisualFresh("p1", 2, 1)).toBe(false)
    expect(isInlineEditVisualFresh("p1", 2, 2)).toBe(true)
    expect(isInlineEditVisualFresh("p1", 2, 3)).toBe(true)
  })

  it("keeps document visual disabled during the short typing lock", () => {
    expect(isInlineEditDocumentVisualReady("p1", 2, 2, false)).toBe(true)
    expect(isInlineEditDocumentVisualReady("p1", 2, 2, true)).toBe(false)
    expect(isInlineEditDocumentVisualReady("p1", 2, 1, false)).toBe(false)
  })
})
