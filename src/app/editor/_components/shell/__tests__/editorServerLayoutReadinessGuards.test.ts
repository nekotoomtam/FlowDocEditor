import { describe, expect, it } from "vitest"
import type { LayoutWarningSummary } from "@/pagination"
import {
  areLayoutWarningSummariesEqual,
  createServerPaginationSnapshotIdentity,
  resolveServerPaginationSnapshotFreshness,
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
  it("marks server pagination current only for the active layout version", () => {
    const identity = createServerPaginationSnapshotIdentity({
      layoutVersion: 7,
      documentId: "doc-1",
    })

    expect(resolveServerPaginationSnapshotFreshness({
      identity,
      currentLayoutVersion: 7,
      cancelled: false,
      aborted: false,
    })).toEqual({
      identity,
      freshness: "current",
      reason: "server-pagination-current",
    })
  })

  it("marks cancelled, aborted, and superseded server pagination as stale", () => {
    const identity = createServerPaginationSnapshotIdentity({ layoutVersion: 7 })

    expect(resolveServerPaginationSnapshotFreshness({
      identity,
      currentLayoutVersion: 7,
      cancelled: true,
      aborted: false,
    })).toMatchObject({
      freshness: "stale",
      reason: "server-pagination-cancelled",
    })
    expect(resolveServerPaginationSnapshotFreshness({
      identity,
      currentLayoutVersion: 7,
      cancelled: false,
      aborted: true,
    })).toMatchObject({
      freshness: "stale",
      reason: "server-pagination-aborted",
    })
    expect(resolveServerPaginationSnapshotFreshness({
      identity,
      currentLayoutVersion: 8,
      cancelled: false,
      aborted: false,
    })).toMatchObject({
      freshness: "stale",
      reason: "server-pagination-layout-version-mismatch",
    })
  })

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
