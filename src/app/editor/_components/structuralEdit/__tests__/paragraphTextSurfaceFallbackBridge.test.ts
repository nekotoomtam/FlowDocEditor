import { describe, expect, it } from "vitest"
import { createStructuralEditRuntime } from "../../runtime/structuralEditRuntime"
import { canStartParagraphTextSurfaceFallbackStructuralEditBridge } from "../paragraphTextSurfaceFallbackBridge"

describe("paragraph text surface fallback bridge", () => {
  it("allows idle structural keys through StructuralEditRuntime", () => {
    const runtime = createStructuralEditRuntime()

    expect(canStartParagraphTextSurfaceFallbackStructuralEditBridge(runtime, {
      key: "Enter",
      operation: "split",
      nodeId: "p1",
      caretIndex: 4,
      isComposing: false,
      hasActiveComposition: false,
      currentActiveNodeId: "p1",
      expectedNodeExists: true,
      timestamp: 10,
      source: "test-enter",
    })).toBe(true)
  })

  it("guards repeated Enter while a split transaction is active", () => {
    const runtime = createStructuralEditRuntime()
    const transaction = runtime.beginStructuralEdit({
      key: "Enter",
      accepted: true,
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
      startedAt: 10,
    })

    expect(canStartParagraphTextSurfaceFallbackStructuralEditBridge(runtime, {
      key: "Enter",
      operation: "split",
      nodeId: "p1",
      caretIndex: 4,
      isComposing: false,
      hasActiveComposition: false,
      currentActiveNodeId: "p1",
      expectedNodeExists: true,
      timestamp: 12,
      source: "test-repeat-enter",
    })).toBe(false)

    expect(runtime.getCurrentTransaction()).toMatchObject({
      id: transaction.id,
      guardedStructuralKeyCount: 1,
      droppedStructuralKeyCount: 1,
      lastGuardedReason: "test-repeat-enter:repeated-enter-during-split",
    })
  })

  it("allows immediate Backspace after the split target is ready", () => {
    const runtime = createStructuralEditRuntime()
    const transaction = runtime.beginStructuralEdit({
      key: "Enter",
      accepted: true,
      kind: "split",
      sourceNodeId: "p1",
      targetNodeId: "p2",
      startedAt: 10,
    })
    runtime.markNodeCommitted(transaction, "p2")
    runtime.markReadyForNextStructuralKey(transaction)

    expect(canStartParagraphTextSurfaceFallbackStructuralEditBridge(runtime, {
      key: "Backspace",
      operation: "merge",
      nodeId: "p2",
      caretIndex: 0,
      isComposing: false,
      hasActiveComposition: false,
      currentActiveNodeId: "p2",
      expectedNodeExists: true,
      removedNodeStillExists: true,
      timestamp: 14,
      source: "test-immediate-backspace",
    })).toBe(true)
  })

  it("does not allow structural handling during composition", () => {
    const runtime = createStructuralEditRuntime()

    expect(canStartParagraphTextSurfaceFallbackStructuralEditBridge(runtime, {
      key: "Enter",
      operation: "split",
      nodeId: "p1",
      caretIndex: 4,
      isComposing: true,
      hasActiveComposition: true,
      currentActiveNodeId: "p1",
      expectedNodeExists: true,
      timestamp: 10,
      source: "test-composition",
    })).toBe(false)
  })
})
