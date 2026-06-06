import { describe, expect, it } from "vitest"
import { createPreviewSettleRuntime } from "../previewSettleRuntime"

function createTestRuntime() {
  let clock = 100
  const runtime = createPreviewSettleRuntime({
    idFactory: (generation) => `preview-${generation}`,
    now: () => clock,
  })

  return {
    runtime,
    tick: (ms = 1) => {
      clock += ms
      return clock
    },
  }
}

describe("PreviewSettleRuntime", () => {
  it("schedules requests with increasing generations", () => {
    const { runtime } = createTestRuntime()

    const first = runtime.scheduleSettle({ kind: "text-edit", reason: "draft-change" })
    const second = runtime.scheduleSettle({ kind: "manual-refresh", reason: "refresh" })

    expect(first).toMatchObject({
      id: "preview-1",
      generation: 1,
      phase: "scheduled",
    })
    expect(second).toMatchObject({
      id: "preview-2",
      generation: 2,
      phase: "scheduled",
    })
    expect(runtime.getCurrentRequest()?.id).toBe("preview-2")
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      previewSettleScheduledCount: 2,
      previewSettleSupersededCount: 1,
      previewSettleGeneration: 2,
      previewSettleCurrentPhase: "scheduled",
    })
  })

  it("starts, completes, and applies the latest request", () => {
    const { runtime, tick } = createTestRuntime()
    const request = runtime.scheduleSettle({ kind: "text-edit", reason: "draft-change" })

    tick()
    expect(runtime.markSettleStarted(request)).toMatchObject({ phase: "running" })
    tick()
    expect(runtime.markSettleCompleted(request)).toMatchObject({ phase: "completed" })
    expect(runtime.getApplyDecision(request)).toEqual({
      type: "apply",
      reason: "current-request",
    })
    tick()
    expect(runtime.markSettleApplied(request)).toMatchObject({ phase: "applied" })
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      previewSettleStartedCount: 1,
      previewSettleCompletedCount: 1,
      previewSettleAppliedCount: 1,
      previewSettleLatestAppliedGeneration: 1,
    })
  })

  it("supersedes an old request when a newer request is scheduled", () => {
    const { runtime } = createTestRuntime()
    const first = runtime.scheduleSettle({ kind: "structural-split", reason: "split" })
    const second = runtime.scheduleSettle({ kind: "structural-merge", reason: "merge" })

    expect(runtime.getApplyDecision(first)).toEqual({
      type: "ignore-stale",
      reason: "newer-request-current",
    })
    expect(runtime.getCurrentRequest()?.id).toBe(second.id)
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      previewSettleSupersededCount: 1,
    })
  })

  it("does not apply a stale result that completes after a newer request exists", () => {
    const { runtime } = createTestRuntime()
    const first = runtime.scheduleSettle({ kind: "structural-split", reason: "split" })
    runtime.markSettleStarted(first)
    const second = runtime.scheduleSettle({ kind: "structural-merge", reason: "merge" })

    expect(runtime.markSettleCompleted(first)).toBeNull()
    expect(runtime.getApplyDecision(first)).toEqual({
      type: "ignore-stale",
      reason: "newer-request-current",
    })
    expect(runtime.getCurrentRequest()?.id).toBe(second.id)
  })

  it("applies the latest completed result", () => {
    const { runtime } = createTestRuntime()
    const request = runtime.scheduleSettle({ kind: "manual-refresh", reason: "refresh" })

    runtime.markSettleCompleted(request)

    expect(runtime.getApplyDecision(request)).toEqual({
      type: "apply",
      reason: "current-request",
    })
  })

  it("blocks apply when the structural generation changed", () => {
    const { runtime } = createTestRuntime()
    const request = runtime.scheduleSettle({
      kind: "structural-split",
      reason: "split",
      structuralGeneration: 1,
    })

    runtime.markSettleCompleted(request)

    expect(runtime.getApplyDecision({
      id: request.id,
      generation: request.generation,
      currentStructuralGeneration: 2,
    })).toEqual({
      type: "ignore-stale",
      reason: "structural-generation-mismatch",
    })
  })

  it("blocks apply when the active draft version advanced", () => {
    const { runtime } = createTestRuntime()
    const request = runtime.scheduleSettle({
      kind: "text-edit",
      reason: "draft",
      activeInlineNodeId: "p1",
      draftVersion: 1,
    })

    runtime.markSettleCompleted(request)

    expect(runtime.getApplyDecision({
      id: request.id,
      generation: request.generation,
      currentActiveInlineNodeId: "p1",
      currentDraftVersion: 2,
    })).toEqual({
      type: "ignore-stale",
      reason: "draft-version-advanced",
    })
  })

  it("prevents cancelled and failed requests from applying", () => {
    const { runtime } = createTestRuntime()
    const cancelled = runtime.scheduleSettle({ kind: "manual-refresh", reason: "refresh" })
    runtime.markSettleCancelled(cancelled, "cancelled")

    expect(runtime.getApplyDecision(cancelled)).toEqual({
      type: "cancel",
      reason: "request-cancelled",
    })

    const failed = runtime.scheduleSettle({ kind: "manual-refresh", reason: "refresh-again" })
    runtime.markSettleFailed(failed, new Error("worker failed"))

    expect(runtime.getApplyDecision(failed)).toEqual({
      type: "cancel",
      reason: "request-failed",
    })
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      previewSettleCancelledCount: 1,
      previewSettleFailedCount: 1,
    })
  })

  it("reports metrics for scheduled, completed, applied, superseded, ignored, and failed requests", () => {
    const { runtime } = createTestRuntime()
    const ignored = runtime.scheduleSettle({ kind: "text-edit", reason: "draft", activeInlineNodeId: "p1" })
    runtime.markSettleIgnored(ignored, "inline-edit-node-changed")
    const superseded = runtime.scheduleSettle({ kind: "structural-split", reason: "split" })
    runtime.markSettleSuperseded(superseded, "cleanup")
    const failed = runtime.scheduleSettle({ kind: "manual-refresh", reason: "manual" })
    runtime.markSettleFailed(failed, "failed")
    const applied = runtime.scheduleSettle({ kind: "manual-refresh", reason: "manual-2" })
    runtime.markSettleCompleted(applied)
    runtime.markSettleApplied(applied)

    expect(runtime.getMetricsSnapshot()).toMatchObject({
      previewSettleScheduledCount: 4,
      previewSettleCompletedCount: 1,
      previewSettleAppliedCount: 1,
      previewSettleSupersededCount: 1,
      previewSettleIgnoredStaleCount: 1,
      previewSettleFailedCount: 1,
      previewSettleLatestAppliedGeneration: applied.generation,
    })
  })
})
