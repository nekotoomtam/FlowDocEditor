import { describe, expect, it } from "vitest"
import { createStructuralEditRuntime } from "../../runtime/structuralEditRuntime"
import {
  createMergeStructuralEditPlan,
  createSplitStructuralEditPlan,
  createStructuralDraftSessionPlan,
  createStructuralPanelDeferralPlan,
  createStructuralTransactionIdentity,
} from "../structuralEditPlans"
import { createStructuralEditController } from "../useStructuralEditController"

describe("structural edit bridge plans", () => {
  it("creates split transaction, panel, and draft metadata without DOM state", () => {
    const plan = createSplitStructuralEditPlan({
      sourceNodeId: "cover_note",
      newNodeId: "split-node",
      pageIndex: 0,
      suppressedPageBreakNodeId: "cover_break",
      startedAt: 42,
    })

    expect(plan).toEqual({
      key: "Enter",
      accepted: true,
      kind: "split",
      sourceNodeId: "cover_note",
      targetNodeId: "split-node",
      expectedActiveNodeId: "split-node",
      affectedPageIds: [0],
      suppressedPageBreakNodeId: "cover_break",
      startedAt: 42,
    })

    const runtime = createStructuralEditRuntime({
      idFactory: (generation) => `tx-${generation}`,
      now: () => 42,
    })
    const transaction = runtime.beginStructuralEdit(plan)

    expect(createStructuralTransactionIdentity(transaction)).toEqual({
      id: "tx-1",
      generation: 1,
    })
    expect(createStructuralPanelDeferralPlan({
      transaction,
      operation: "split",
      nodeId: "split-node",
      startedAt: 42,
    })).toEqual({
      transactionId: "tx-1",
      generation: 1,
      operation: "split",
      nodeId: "split-node",
      reason: "split-urgent-structural-paint",
      startedAt: 42,
    })
    expect(createStructuralDraftSessionPlan({
      transaction,
      nodeId: "split-node",
      textLength: 12,
      caretIndex: 0,
    })).toMatchObject({
      nodeId: "split-node",
      mode: "plain-text",
      source: "shell-refocus",
      initialTextLength: 12,
      caretIndex: 0,
      structuralTransactionId: "tx-1",
      structuralGeneration: 1,
    })
  })

  it("creates merge transaction metadata for immediate Backspace after split", () => {
    expect(createMergeStructuralEditPlan({
      currentNodeId: "split-node",
      previousNodeId: "cover_note",
      pageIndex: 0,
      startedAt: 80,
    })).toEqual({
      key: "Backspace",
      accepted: true,
      kind: "merge",
      sourceNodeId: "split-node",
      targetNodeId: "cover_note",
      removedNodeId: "split-node",
      expectedActiveNodeId: "cover_note",
      affectedPageIds: [0],
      startedAt: 80,
    })
  })

  it("keeps controller ordering focused on structural runtime phases", () => {
    const events: string[] = []
    const runtime = createStructuralEditRuntime({
      idFactory: (generation) => `tx-${generation}`,
      now: () => 100,
      onEvent: (event) => events.push(event.action),
    })
    const controller = createStructuralEditController({ structuralRuntime: runtime })

    const begun = controller.beginMerge({
      currentNodeId: "split-node",
      previousNodeId: "cover_note",
      pageIndex: 0,
      startedAt: 100,
    })
    controller.markUrgentPainting(begun.identity)
    controller.markMergeCommitted(begun.identity, {
      removedNodeId: "split-node",
      committedNodeId: "cover_note",
    })

    expect(begun.panelDeferral).toMatchObject({
      transactionId: "tx-1",
      generation: 1,
      operation: "merge",
      nodeId: "cover_note",
      reason: "merge-urgent-structural-paint",
    })
    expect(runtime.getCurrentTransaction()).toMatchObject({
      id: "tx-1",
      phase: "urgent-painting",
      expectedNodeCommitted: true,
      removedNodeCommitted: true,
      guardState: "ready",
    })
    expect(events).toEqual([
      "begin",
      "guard-accepted",
      "phase",
      "phase",
      "node-removed",
      "node-committed",
      "ready-for-next-structural-key",
    ])
  })
})
