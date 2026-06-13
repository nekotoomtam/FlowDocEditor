import { describe, expect, it } from "vitest"
import type { LayoutWarningSummary } from "@/pagination"
import {
  areLayoutWarningSummariesEqual,
  shouldApplyServerLayoutWarnings,
} from "../editorServerLayoutReadinessGuards"

function warning(
  code: LayoutWarningSummary["code"],
  count: number,
  message: string,
): LayoutWarningSummary {
  return { code, count, message }
}

describe("editor server layout readiness guards", () => {
  it("treats repeated empty warning arrays as equal", () => {
    expect(areLayoutWarningSummariesEqual([], [])).toBe(true)
    expect(shouldApplyServerLayoutWarnings([], [])).toBe(false)
  })

  it("treats structurally equal warning summaries as unchanged", () => {
    const current = [
      warning("layout-overflow", 2, "2 nodes overflowed their layout bounds."),
      warning("forced-progress", 1, "Pagination forced progress for 1 node."),
    ]
    const next = [
      warning("layout-overflow", 2, "2 nodes overflowed their layout bounds."),
      warning("forced-progress", 1, "Pagination forced progress for 1 node."),
    ]

    expect(areLayoutWarningSummariesEqual(current, next)).toBe(true)
    expect(shouldApplyServerLayoutWarnings(current, next)).toBe(false)
  })

  it("detects changed warning count, message, or order", () => {
    const current = [
      warning("layout-overflow", 2, "2 nodes overflowed their layout bounds."),
      warning("forced-progress", 1, "Pagination forced progress for 1 node."),
    ]

    expect(shouldApplyServerLayoutWarnings(current, [
      warning("layout-overflow", 3, "2 nodes overflowed their layout bounds."),
      warning("forced-progress", 1, "Pagination forced progress for 1 node."),
    ])).toBe(true)

    expect(shouldApplyServerLayoutWarnings(current, [
      warning("layout-overflow", 2, "Layout overflow changed."),
      warning("forced-progress", 1, "Pagination forced progress for 1 node."),
    ])).toBe(true)

    expect(shouldApplyServerLayoutWarnings(current, [
      warning("forced-progress", 1, "Pagination forced progress for 1 node."),
      warning("layout-overflow", 2, "2 nodes overflowed their layout bounds."),
    ])).toBe(true)
  })
})
