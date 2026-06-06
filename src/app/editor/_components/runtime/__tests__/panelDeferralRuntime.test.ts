import { describe, expect, it } from "vitest"
import { createPanelDeferralRuntime } from "../panelDeferralRuntime"

function createTestRuntime() {
  let clock = 100
  const runtime = createPanelDeferralRuntime({
    idFactory: (generation) => `panel-${generation}`,
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

describe("PanelDeferralRuntime", () => {
  it("begins a snapshot-active deferral", () => {
    const { runtime } = createTestRuntime()

    const state = runtime.beginPanelDeferral({
      transactionId: "tx-1",
      generation: 1,
      structuralKind: "split",
      nodeId: "p2",
      reason: "structural-split",
    })

    expect(state).toMatchObject({
      id: "panel-1",
      transactionId: "tx-1",
      generation: 1,
      phase: "snapshot-active",
      snapshotActive: true,
      nonInteractive: true,
      liveRestored: false,
    })
    expect(runtime.shouldUsePanelSnapshot()).toBe(true)
    expect(runtime.isPanelNonInteractive()).toBe(true)
  })

  it("schedules, starts, and completes a release", () => {
    const { runtime, tick } = createTestRuntime()
    const state = runtime.beginPanelDeferral({
      transactionId: "tx-1",
      generation: 1,
      structuralKind: "split",
      nodeId: "p2",
      reason: "structural-split",
    })

    tick()
    expect(runtime.scheduleRelease({
      id: state.id,
      generation: state.generation,
      reason: "idle-release",
    })).toMatchObject({ phase: "release-scheduled" })
    runtime.markUrgentStructuralFlushComplete(state.id)
    tick()
    expect(runtime.markReleaseStarted(state.id)).toMatchObject({
      phase: "release-running",
      snapshotActive: false,
      nonInteractive: false,
    })
    tick()
    expect(runtime.markReleaseCompleted(state.id)).toMatchObject({
      phase: "live-restored",
      snapshotActive: false,
      liveRestored: true,
    })
  })

  it("supersedes stale release from an older generation", () => {
    const { runtime } = createTestRuntime()
    const first = runtime.beginPanelDeferral({
      transactionId: "tx-1",
      generation: 1,
      structuralKind: "split",
      nodeId: "p2",
      reason: "structural-split",
    })
    const second = runtime.beginPanelDeferral({
      transactionId: "tx-2",
      generation: 2,
      structuralKind: "merge",
      nodeId: "p1",
      reason: "structural-merge",
    })

    expect(runtime.canApplyRelease({ id: first.id, generation: first.generation })).toBe(false)
    expect(runtime.canApplyRelease({ id: second.id, generation: second.generation })).toBe(true)
    expect(runtime.getCurrentDeferral()?.id).toBe(second.id)
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      panelDeferralSupersedeCount: 1,
      stalePanelReleaseIgnoredCount: 1,
    })
  })

  it("aborts and prevents stale apply", () => {
    const { runtime } = createTestRuntime()
    const state = runtime.beginPanelDeferral({
      transactionId: "tx-1",
      generation: 1,
      structuralKind: "split",
      nodeId: "p2",
      reason: "structural-split",
    })

    expect(runtime.abortDeferral(state.id, "setup-failed")).toMatchObject({
      phase: "aborted",
      snapshotActive: false,
      nonInteractive: false,
    })
    expect(runtime.shouldUsePanelSnapshot()).toBe(false)
    expect(runtime.canApplyRelease({ id: state.id, generation: state.generation })).toBe(false)
  })

  it("records input quiet window state", () => {
    const { runtime, tick } = createTestRuntime()
    const state = runtime.beginPanelDeferral({
      transactionId: "tx-1",
      generation: 1,
      structuralKind: "split",
      nodeId: "p2",
      reason: "structural-split",
    })

    tick(20)
    runtime.markInputDuringQuietWindow(state.id)
    expect(runtime.shouldDelayForInputQuietWindow(state.id, 140, tick(40))).toEqual({
      shouldDelay: true,
      lastInputAt: 120,
      elapsedMs: 40,
    })
    expect(runtime.shouldDelayForInputQuietWindow(state.id, 140, tick(160))).toEqual({
      shouldDelay: false,
      lastInputAt: 120,
      elapsedMs: 200,
    })
  })

  it("blocks old Enter release after Backspace begins a newer deferral", () => {
    const { runtime } = createTestRuntime()
    const enter = runtime.beginPanelDeferral({
      transactionId: "tx-enter",
      generation: 1,
      structuralKind: "split",
      nodeId: "p2",
      reason: "structural-split",
    })
    const backspace = runtime.beginPanelDeferral({
      transactionId: "tx-backspace",
      generation: 2,
      structuralKind: "merge",
      nodeId: "p1",
      reason: "structural-merge",
    })

    expect(runtime.canApplyRelease({ id: enter.id, generation: enter.generation })).toBe(false)
    expect(runtime.canApplyRelease({ id: backspace.id, generation: backspace.generation })).toBe(true)
  })

  it("does not apply while urgent structural flush is active", () => {
    const { runtime } = createTestRuntime()
    const state = runtime.beginPanelDeferral({
      transactionId: "tx-1",
      generation: 1,
      structuralKind: "split",
      nodeId: "p2",
      reason: "structural-split",
    })

    runtime.markUrgentStructuralFlushActive(state.id)
    expect(runtime.isReleaseBlockedByUrgentStructuralFlush(state.id)).toBe(true)
    runtime.markUrgentStructuralFlushComplete(state.id)
    expect(runtime.isReleaseBlockedByUrgentStructuralFlush(state.id)).toBe(false)
    expect(runtime.canApplyRelease({ id: state.id, generation: state.generation })).toBe(true)
  })
})
