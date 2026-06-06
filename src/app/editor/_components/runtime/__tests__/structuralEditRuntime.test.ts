import { describe, expect, it } from "vitest"
import {
  createStructuralEditRuntime,
  type StructuralEditRuntimeEvent,
} from "../structuralEditRuntime"

function createTestRuntime() {
  let clock = 100
  const events: StructuralEditRuntimeEvent[] = []
  const runtime = createStructuralEditRuntime({
    idFactory: (generation) => `tx-${generation}`,
    now: () => clock,
    onEvent: (event) => events.push(event),
  })

  return {
    events,
    runtime,
    tick: (ms = 1) => {
      clock += ms
      return clock
    },
  }
}

describe("StructuralEditRuntime", () => {
  it("begins transactions with stable ids and monotonically increasing generations", () => {
    const { events, runtime } = createTestRuntime()

    const split = runtime.beginTransaction({
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
      affectedPageIds: [0],
    })
    const merge = runtime.beginTransaction({
      kind: "merge",
      sourceNodeId: "p2",
      targetNodeId: "p1",
      removedNodeId: "p2",
      affectedPageIds: [0],
    })

    expect(split).toMatchObject({
      id: "tx-1",
      generation: 1,
      kind: "split",
      phase: "preparing",
    })
    expect(merge).toMatchObject({
      id: "tx-2",
      generation: 2,
      kind: "merge",
      phase: "preparing",
    })
    expect(runtime.getCurrentGeneration()).toBe(2)
    expect(runtime.getCurrentTransaction()?.id).toBe("tx-2")
    expect(events.map((event) => event.action)).toEqual(["begin", "superseded", "begin"])
  })

  it("tracks phase transitions without exposing mutable transaction state", () => {
    const { runtime, tick } = createTestRuntime()
    const tx = runtime.beginTransaction({
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
      affectedPageIds: [1],
      suppressedPageBreakNodeId: "break-1",
    })

    const external = runtime.getCurrentTransaction()
    external?.affectedPageIds.push(99)

    expect(runtime.markCommitting(tx)).toMatchObject({ phase: "committing" })
    tick()
    expect(runtime.markUrgentPainting(tx)).toMatchObject({ phase: "urgent-painting", urgentPaintAt: 101 })
    tick()
    expect(runtime.markUrgentPainted(tx)).toMatchObject({ phase: "urgent-painted", urgentPaintAt: 102 })
    tick()
    expect(runtime.markPanelReleasePending(tx)).toMatchObject({ phase: "panel-release-pending", panelReleaseAt: 103 })
    tick()
    expect(runtime.markSettling(tx)).toMatchObject({ phase: "settling", settleStartedAt: 104 })
    tick()
    expect(runtime.markComplete(tx)).toMatchObject({ phase: "complete", completedAt: 105 })

    expect(runtime.getCurrentTransaction()).toMatchObject({
      id: "tx-1",
      phase: "complete",
      affectedPageIds: [1],
      suppressedPageBreakNodeId: "break-1",
    })
  })

  it("ignores stale id and generation updates", () => {
    const { events, runtime } = createTestRuntime()
    const stale = runtime.beginTransaction({
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
    })
    const current = runtime.beginTransaction({
      kind: "merge",
      sourceNodeId: "p2",
      targetNodeId: "p1",
      removedNodeId: "p2",
    })

    expect(runtime.markComplete(stale)).toBeNull()
    expect(runtime.markCommitting({ id: current.id, generation: stale.generation })).toBeNull()
    expect(runtime.getCurrentTransaction()).toMatchObject({
      id: current.id,
      phase: "preparing",
    })
    expect(events.filter((event) => event.action === "stale-ignored")).toHaveLength(2)
  })

  it("aborts the current transaction and makes its generation non-current", () => {
    const { events, runtime } = createTestRuntime()
    const tx = runtime.beginTransaction({
      kind: "merge",
      sourceNodeId: "p2",
      targetNodeId: "p1",
      removedNodeId: "p2",
    })

    const aborted = runtime.abortTransaction(tx, "inline-setup-failed")

    expect(aborted).toMatchObject({
      id: "tx-1",
      phase: "aborted",
      abortReason: "inline-setup-failed",
    })
    expect(runtime.getCurrentTransaction()).toBeNull()
    expect(runtime.isCurrentGeneration(tx.generation)).toBe(false)
    expect(runtime.abortTransaction(tx, "stale-abort")).toBeNull()
    expect(events.map((event) => event.action)).toEqual(["begin", "aborted", "stale-ignored"])
  })

  it("clears only the current transaction", () => {
    const { runtime } = createTestRuntime()
    const tx = runtime.beginTransaction({
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
    })

    expect(runtime.clearIfCurrent({ id: tx.id, generation: 999 })).toBe(false)
    expect(runtime.getCurrentTransaction()?.id).toBe(tx.id)
    expect(runtime.clearIfCurrent(tx)).toBe(true)
    expect(runtime.getCurrentTransaction()).toBeNull()
  })

  it("allows Enter while idle", () => {
    const { runtime } = createTestRuntime()

    expect(runtime.canStartStructuralEdit({
      key: "Enter",
      nodeId: "p1",
      caretIndex: 3,
      isComposing: false,
      hasActiveComposition: false,
      timestamp: 100,
    })).toEqual({
      type: "allow",
      reason: "idle",
    })
  })

  it("guards repeated Enter while a split is preparing", () => {
    const { runtime } = createTestRuntime()
    const tx = runtime.beginStructuralEdit({
      key: "Enter",
      accepted: true,
      kind: "split",
      sourceNodeId: "p1",
    })

    const decision = runtime.canStartStructuralEdit({
      key: "Enter",
      nodeId: "p1",
      caretIndex: 5,
      isComposing: false,
      hasActiveComposition: false,
      currentActiveNodeId: "p1",
      timestamp: 100,
    })

    expect(decision).toMatchObject({
      type: "guard",
      reason: "repeated-enter-during-split",
      transactionId: tx.id,
      generation: tx.generation,
    })
    expect(runtime.getCurrentTransaction()).toMatchObject({
      guardedStructuralKeyCount: 1,
      lastGuardedReason: "repeated-enter-during-split",
    })
  })

  it("allows Backspace at the start of the committed split target", () => {
    const { runtime } = createTestRuntime()
    const tx = runtime.beginStructuralEdit({
      key: "Enter",
      accepted: true,
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
      expectedActiveNodeId: "p2",
    })
    runtime.markNodeCommitted(tx, "p2")
    runtime.markReadyForNextStructuralKey(tx)

    expect(runtime.canStartStructuralEdit({
      key: "Backspace",
      nodeId: "p2",
      caretIndex: 0,
      isComposing: false,
      hasActiveComposition: false,
      currentActiveNodeId: "p2",
      expectedNodeExists: true,
      timestamp: 100,
    })).toMatchObject({
      type: "allow",
      reason: "enter-after-split-backspace-allowed",
      transactionId: tx.id,
      generation: tx.generation,
    })
  })

  it("guards Backspace when the expected split target is missing", () => {
    const { runtime } = createTestRuntime()
    const tx = runtime.beginStructuralEdit({
      key: "Enter",
      accepted: true,
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
      expectedActiveNodeId: "p2",
    })

    expect(runtime.canStartStructuralEdit({
      key: "Backspace",
      nodeId: "p2",
      caretIndex: 0,
      isComposing: false,
      hasActiveComposition: false,
      currentActiveNodeId: "p2",
      expectedNodeExists: false,
      timestamp: 100,
    })).toMatchObject({
      type: "guard",
      reason: "expected-node-missing",
      transactionId: tx.id,
      generation: tx.generation,
    })
  })

  it("guards repeated Backspace targeting a removed merge source", () => {
    const { runtime } = createTestRuntime()
    const tx = runtime.beginStructuralEdit({
      key: "Backspace",
      accepted: true,
      kind: "merge",
      sourceNodeId: "p2",
      targetNodeId: "p1",
      removedNodeId: "p2",
      expectedActiveNodeId: "p1",
    })
    runtime.markNodeRemoved(tx, "p2")

    expect(runtime.canStartStructuralEdit({
      key: "Backspace",
      nodeId: "p2",
      caretIndex: 0,
      isComposing: false,
      hasActiveComposition: false,
      currentActiveNodeId: "p2",
      removedNodeStillExists: false,
      timestamp: 100,
    })).toMatchObject({
      type: "guard",
      reason: "repeated-backspace-removed-node",
      transactionId: tx.id,
      generation: tx.generation,
    })
  })

  it("ignores composition without starting a structural transaction", () => {
    const { runtime } = createTestRuntime()

    expect(runtime.canStartStructuralEdit({
      key: "Enter",
      nodeId: "p1",
      caretIndex: 1,
      isComposing: true,
      hasActiveComposition: true,
      timestamp: 100,
    })).toEqual({
      type: "ignore-composition",
      reason: "composition-active",
      transactionId: undefined,
      generation: undefined,
    })
    expect(runtime.getCurrentTransaction()).toBeNull()
  })

  it("ignores stale transaction guard updates", () => {
    const { runtime } = createTestRuntime()
    const stale = runtime.beginStructuralEdit({
      key: "Enter",
      accepted: true,
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
    })
    const current = runtime.beginStructuralEdit({
      key: "Backspace",
      accepted: true,
      kind: "merge",
      sourceNodeId: "p3",
      targetNodeId: "p2",
      removedNodeId: "p3",
    })

    expect(runtime.markNodeCommitted(stale, "p2")).toBeNull()
    expect(runtime.markReadyForNextStructuralKey(stale)).toBeNull()
    expect(runtime.getCurrentTransaction()).toMatchObject({
      id: current.id,
      kind: "merge",
      guardState: "active",
      targetNodeId: "p2",
    })
  })
})
