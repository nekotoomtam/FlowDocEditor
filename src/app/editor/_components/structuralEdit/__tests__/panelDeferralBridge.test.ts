import { describe, expect, it } from "vitest"
import { createPanelDeferralRuntime } from "../../runtime/panelDeferralRuntime"
import {
  abortStructuralPanelDeferralBridge,
  beginStructuralPanelDeferralBridge,
  cancelScheduledStructuralPanelReleaseBridge,
  canApplyStructuralPanelReleaseBridge,
  createScheduledStructuralPanelRelease,
  createStructuralPanelReleaseApplying,
  isStructuralPanelReleaseBlockedByUrgentFlushBridge,
  markStructuralPanelInputDuringDeferralBridge,
  markStructuralPanelReleaseCompletedBridge,
  markStructuralPanelReleaseStartedBridge,
  markStructuralPanelUrgentFlushCompleteBridge,
  matchesApplyingStructuralPanelReleaseTransaction,
  matchesScheduledStructuralPanelReleaseTransaction,
  matchesStructuralPanelReleaseTransaction,
  panelDeferralReasonForOperation,
  panelDeferralStructuralKindForOperation,
  scheduleStructuralPanelReleaseBridge,
  shouldDelayStructuralPanelReleaseForInputBridge,
} from "../panelDeferralBridge"

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

describe("panel deferral bridge", () => {
  it("begins split deferral with runtime reason and shell release metadata", () => {
    const { runtime } = createTestRuntime()

    const release = beginStructuralPanelDeferralBridge(runtime, {
      transactionId: "tx-1",
      generation: 1,
      operation: "split",
      nodeId: "p2",
      reason: "split-urgent-structural-paint",
      startedAt: 42,
    })

    expect(release).toEqual({
      deferralId: "panel-1",
      transactionId: "tx-1",
      generation: 1,
      pending: true,
      reason: "split-urgent-structural-paint",
      operation: "split",
      nodeId: "p2",
      startedAt: 42,
    })
    expect(runtime.getCurrentDeferral()).toMatchObject({
      id: "panel-1",
      transactionId: "tx-1",
      generation: 1,
      structuralKind: "split",
      reason: "structural-split",
      nodeId: "p2",
      snapshotActive: true,
      nonInteractive: true,
    })
  })

  it("schedules, cancels, marks input, starts, and completes release by deferral identity", () => {
    const { runtime, tick } = createTestRuntime()
    const release = beginStructuralPanelDeferralBridge(runtime, {
      transactionId: "tx-1",
      generation: 1,
      operation: "merge",
      nodeId: "p1",
      reason: "merge-urgent-structural-paint",
      startedAt: 100,
    })

    const scheduled = createScheduledStructuralPanelRelease(release, {
      reason: "structural-refocus-painted",
      scheduledAt: tick(10),
    })
    expect(scheduleStructuralPanelReleaseBridge(runtime, release, scheduled.scheduledAt)).toMatchObject({
      phase: "release-scheduled",
      reason: "idle-release",
    })
    expect(cancelScheduledStructuralPanelReleaseBridge(runtime, scheduled, "reschedule")).toMatchObject({
      phase: "snapshot-active",
    })

    const inputAt = tick(20)
    markStructuralPanelInputDuringDeferralBridge(runtime, release, inputAt)
    expect(shouldDelayStructuralPanelReleaseForInputBridge(runtime, release, 140, tick(40))).toEqual({
      shouldDelay: true,
      lastInputAt: inputAt,
      elapsedMs: 40,
    })

    markStructuralPanelUrgentFlushCompleteBridge(runtime, release)
    expect(isStructuralPanelReleaseBlockedByUrgentFlushBridge(runtime, release)).toBe(false)
    expect(canApplyStructuralPanelReleaseBridge(runtime, release)).toBe(true)

    const applyStartedAt = tick(160)
    expect(markStructuralPanelReleaseStartedBridge(runtime, release, applyStartedAt)).toMatchObject({
      phase: "release-running",
      snapshotActive: false,
      nonInteractive: false,
    })
    const applying = createStructuralPanelReleaseApplying(release, {
      scheduledAt: scheduled.scheduledAt,
      applyStartedAt,
    })
    expect(markStructuralPanelReleaseCompletedBridge(runtime, applying, tick(5))).toMatchObject({
      phase: "live-restored",
      liveRestored: true,
    })
  })

  it("keeps fallback operation mapping and transaction matching explicit", () => {
    expect(panelDeferralStructuralKindForOperation("rollback")).toBe("rollback")
    expect(panelDeferralStructuralKindForOperation("unknown")).toBe("unknown")
    expect(panelDeferralReasonForOperation("rollback")).toBe("idle-release")
    expect(panelDeferralReasonForOperation("unknown")).toBe("idle-release")

    const { runtime } = createTestRuntime()
    const release = beginStructuralPanelDeferralBridge(runtime, {
      transactionId: "tx-1",
      generation: 1,
      operation: "split",
      nodeId: "p2",
      reason: "split-urgent-structural-paint",
      startedAt: 100,
    })
    const scheduled = createScheduledStructuralPanelRelease(release, {
      reason: "structural-refocus-painted",
      scheduledAt: 120,
    })
    const applying = createStructuralPanelReleaseApplying(release, {
      scheduledAt: scheduled.scheduledAt,
      applyStartedAt: 150,
    })

    expect(matchesStructuralPanelReleaseTransaction(release, { id: "tx-1", generation: 1 })).toBe(true)
    expect(matchesScheduledStructuralPanelReleaseTransaction(scheduled, { id: "tx-1", generation: 1 })).toBe(true)
    expect(matchesApplyingStructuralPanelReleaseTransaction(applying, release)).toBe(true)
    expect(matchesStructuralPanelReleaseTransaction(release, { id: "tx-1", generation: 2 })).toBe(false)

    expect(abortStructuralPanelDeferralBridge(runtime, release, "setup-failed")).toMatchObject({
      phase: "aborted",
      snapshotActive: false,
      nonInteractive: false,
    })
  })
})
