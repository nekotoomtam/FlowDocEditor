import { describe, expect, it } from "vitest"
import { createPreviewSettleRuntime } from "../../runtime/previewSettleRuntime"
import type { StructuralEditTransaction } from "../../runtime/structuralEditRuntime"
import {
  affectedNodeIdsForPreviewSettle,
  createBrowserPreviewSettleApplyPlan,
  createDraftPreviewPaginationApplyPlan,
  createDraftPreviewPaginationSchedulePlan,
  getCurrentPreviewSettleGenerationBridge,
  getPreviewSettleApplyDecisionBridge,
  invalidatePreviewSettleBridge,
  markPreviewSettleAppliedBridge,
  markPreviewSettleCompletedBridge,
  markPreviewSettleIgnoredBridge,
  markPreviewSettleStartedBridge,
  markPreviewSettleSupersededBridge,
  matchesPreviewSettleStructuralTransaction,
  previewSettleKindForContext,
  resolveActivePreviewSettleStructuralTransaction,
  resolveDraftPreviewPaginationClearedGeneration,
  resolveDraftPreviewPaginationDelayMsBridge,
  resolveDraftPreviewPaginationResponsiveNodeId,
  resolvePreviewSettleDebounceMs,
  resolvePreviewSettleGraceRemainingMs,
  schedulePreviewSettleBridge,
  shouldSchedulePlainBoundaryDraftPagination,
  shouldRescheduleDraftPreviewPaginationForRevision,
  shouldRunDraftPreviewPagination,
  shouldSupersedePreviewSettleOnCleanup,
} from "../previewSettleBridge"

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

function structuralTransaction(overrides: Partial<StructuralEditTransaction> = {}): StructuralEditTransaction {
  return {
    id: "tx-1",
    generation: 4,
    kind: "split",
    phase: "urgent-painting",
    sourceNodeId: "p1",
    targetNodeId: "p2",
    affectedPageIds: [0],
    startedAt: 100,
    expectedNodeCommitted: false,
    removedNodeCommitted: false,
    guardState: "active",
    acceptedStructuralKeyCount: 1,
    guardedStructuralKeyCount: 0,
    droppedStructuralKeyCount: 0,
    compositionIgnoredCount: 0,
    ...overrides,
  }
}

describe("preview settle bridge", () => {
  it("maps schedule context to a structural settle request", () => {
    const { runtime } = createTestRuntime()
    const transaction = structuralTransaction()

    const request = schedulePreviewSettleBridge({
      runtime,
      activeStructuralTransaction: transaction,
      activeInlineNodeId: "p2",
      draftVersion: 7,
      structuralSettle: { sourceNodeId: "p1", newNodeId: "p2" },
      scheduledAt: 120,
    })

    expect(request).toMatchObject({
      id: "preview-1",
      generation: 1,
      kind: "structural-split",
      reason: "browser-preview",
      structuralTransactionId: "tx-1",
      structuralGeneration: 4,
      activeInlineNodeId: "p2",
      draftVersion: 7,
      affectedNodeIds: ["p1", "p2"],
      affectedPageIds: [0],
      scheduledAt: 120,
    })
    expect(matchesPreviewSettleStructuralTransaction(request, { id: "tx-1", generation: 4 })).toBe(true)
  })

  it("keeps kind and affected-node decisions explicit and DOM-free", () => {
    expect(previewSettleKindForContext({
      activeStructuralTransaction: structuralTransaction({ kind: "merge" }),
      activeInlineNodeId: "p1",
    })).toBe("structural-merge")
    expect(previewSettleKindForContext({
      activeStructuralTransaction: structuralTransaction({ kind: "delete-empty" }),
      activeInlineNodeId: null,
    })).toBe("structural-merge")
    expect(previewSettleKindForContext({
      activeStructuralTransaction: null,
      activeInlineNodeId: "p1",
    })).toBe("text-edit")
    expect(previewSettleKindForContext({
      activeStructuralTransaction: null,
      activeInlineNodeId: null,
    })).toBe("unknown")

    expect(affectedNodeIdsForPreviewSettle({
      structuralSettle: null,
      activeStructuralTransaction: structuralTransaction({
        sourceNodeId: "p1",
        targetNodeId: "p2",
        removedNodeId: "p3",
      }),
    })).toEqual(["p1", "p2", "p3"])
  })

  it("filters terminal structural transactions before scheduling", () => {
    const active = structuralTransaction({ phase: "urgent-painted" })

    expect(resolveActivePreviewSettleStructuralTransaction(active)).toBe(active)
    expect(resolveActivePreviewSettleStructuralTransaction(null)).toBeNull()
    expect(resolveActivePreviewSettleStructuralTransaction(structuralTransaction({ phase: "complete" }))).toBeNull()
    expect(resolveActivePreviewSettleStructuralTransaction(structuralTransaction({ phase: "aborted" }))).toBeNull()
  })

  it("keeps preview settle debounce decisions DOM-free", () => {
    expect(resolvePreviewSettleGraceRemainingMs({
      graceUntil: 1600,
      now: 1000,
    })).toBe(600)
    expect(resolvePreviewSettleGraceRemainingMs({
      graceUntil: 900,
      now: 1000,
    })).toBe(0)

    expect(resolvePreviewSettleDebounceMs({
      activeInlineNodeId: null,
      structuralSettleNewNodeId: null,
      structuralPreviewGraceRemainingMs: 0,
      structuralDebounceMs: 1500,
      inlineEditDebounceMs: 0,
      idleDebounceMs: 16,
    })).toBe(16)
    expect(resolvePreviewSettleDebounceMs({
      activeInlineNodeId: "p2",
      structuralSettleNewNodeId: "p2",
      structuralPreviewGraceRemainingMs: 240,
      structuralDebounceMs: 1500,
      inlineEditDebounceMs: 0,
      idleDebounceMs: 16,
    })).toBe(240)
    expect(resolvePreviewSettleDebounceMs({
      activeInlineNodeId: "p2",
      structuralSettleNewNodeId: "p2",
      structuralPreviewGraceRemainingMs: 0,
      structuralDebounceMs: 1500,
      inlineEditDebounceMs: 0,
      idleDebounceMs: 16,
    })).toBe(1500)
    expect(resolvePreviewSettleDebounceMs({
      activeInlineNodeId: "p3",
      structuralSettleNewNodeId: "p2",
      structuralPreviewGraceRemainingMs: 0,
      structuralDebounceMs: 1500,
      inlineEditDebounceMs: 0,
      idleDebounceMs: 16,
    })).toBe(0)
  })

  it("marks only pending structural cleanups as superseded", () => {
    expect(shouldSupersedePreviewSettleOnCleanup({
      hasPendingDebounce: true,
      structuralSettle: { sourceNodeId: "p1", newNodeId: "p2" },
    })).toBe(true)
    expect(shouldSupersedePreviewSettleOnCleanup({
      hasPendingDebounce: false,
      structuralSettle: { sourceNodeId: "p1", newNodeId: "p2" },
    })).toBe(false)
    expect(shouldSupersedePreviewSettleOnCleanup({
      hasPendingDebounce: true,
      structuralSettle: null,
    })).toBe(false)
  })

  it("creates draft pagination schedule plans without owning pagination output", () => {
    const plan = createDraftPreviewPaginationSchedulePlan({
      nodeId: "p1",
      requestedDelayMs: 16,
      pendingRequest: null,
      latestSnapshot: { nodeId: "p1", draftText: "draft", caretOffset: 5, revision: 7 },
      session: { nodeId: "p1", draftText: "older", caretOffset: 0, dirtyVersion: 3 },
      nowMs: 1000,
      currentGeneration: 4,
      responsiveDelayMs: 16,
      quietWindowMs: 48,
      maxLagMs: 160,
      canUseAnimationFrame: true,
    })

    expect(plan).toEqual({
      request: {
        nodeId: "p1",
        requestedDelayMs: 16,
        firstRequestedAtMs: 1000,
      },
      generation: 5,
      requestedDelayMs: 16,
      scheduledDelayMs: 48,
      firstRequestedAtMs: 1000,
      draftVersion: 7,
      source: "responsive",
      useAnimationFrame: false,
    })
  })

  it("reuses the responsive draft pagination window while coalescing", () => {
    const plan = createDraftPreviewPaginationSchedulePlan({
      nodeId: "p1",
      requestedDelayMs: 16,
      pendingRequest: {
        nodeId: "p1",
        requestedDelayMs: 16,
        firstRequestedAtMs: 1000,
      },
      latestSnapshot: null,
      session: { nodeId: "p1", draftText: "draft", caretOffset: 3, dirtyVersion: 8 },
      nowMs: 1030,
      currentGeneration: 8,
      responsiveDelayMs: 16,
      quietWindowMs: 48,
      maxLagMs: 160,
      canUseAnimationFrame: true,
    })

    expect(plan.firstRequestedAtMs).toBe(1000)
    expect(plan.scheduledDelayMs).toBe(48)
    expect(plan.generation).toBe(9)
    expect(plan.draftVersion).toBe(8)
  })

  it("keeps settled draft pagination on timer and responsive settled fragments marked by node", () => {
    expect(createDraftPreviewPaginationSchedulePlan({
      nodeId: "p2",
      requestedDelayMs: 450,
      pendingRequest: null,
      latestSnapshot: null,
      session: { nodeId: "p1", draftText: "draft", caretOffset: 0, dirtyVersion: 1 },
      nowMs: 1000,
      currentGeneration: 1,
      responsiveDelayMs: 16,
      quietWindowMs: 48,
      maxLagMs: 160,
      canUseAnimationFrame: true,
    })).toMatchObject({
      scheduledDelayMs: 450,
      draftVersion: null,
      source: "settled",
      useAnimationFrame: false,
    })

    expect(resolveDraftPreviewPaginationResponsiveNodeId({
      nodeId: "p1",
      isFlowStackParagraph: true,
      isTableCellParagraph: false,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBe("p1")
    expect(resolveDraftPreviewPaginationResponsiveNodeId({
      nodeId: "p1",
      isFlowStackParagraph: false,
      isTableCellParagraph: false,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBeNull()

    expect(shouldSchedulePlainBoundaryDraftPagination({
      pageCount: 64,
      pageLimit: 64,
    })).toBe(true)
    expect(shouldSchedulePlainBoundaryDraftPagination({
      pageCount: 65,
      pageLimit: 64,
    })).toBe(false)
  })

  it("keeps draft pagination lifecycle decisions explicit", () => {
    expect(resolveDraftPreviewPaginationClearedGeneration(4)).toBe(5)
    expect(resolveDraftPreviewPaginationDelayMsBridge({
      isFlowStackParagraph: true,
      isTableCellParagraph: false,
      draftPaginationActive: true,
      defaultDelayMs: 450,
      flowStackBoundaryDelayMs: 16,
    })).toBe(16)
    expect(shouldRunDraftPreviewPagination({
      scheduledGeneration: 2,
      currentGeneration: 2,
      hasActiveRequest: true,
    })).toBe(true)
    expect(shouldRunDraftPreviewPagination({
      scheduledGeneration: 2,
      currentGeneration: 3,
      hasActiveRequest: true,
    })).toBe(false)
    expect(shouldRunDraftPreviewPagination({
      scheduledGeneration: 2,
      currentGeneration: 2,
      hasActiveRequest: false,
    })).toBe(false)
    expect(shouldRescheduleDraftPreviewPaginationForRevision({
      sourceRevision: 4,
      nextSourceRevision: 5,
    })).toBe(true)
    expect(shouldRescheduleDraftPreviewPaginationForRevision({
      sourceRevision: 4,
      nextSourceRevision: 4,
    })).toBe(false)
  })

  it("creates draft pagination apply plans without owning output mutation", () => {
    expect(createDraftPreviewPaginationApplyPlan({
      nodeId: "p1",
      requestedDelayMs: 16,
      scheduledGeneration: 2,
      currentGeneration: 3,
      sourceRevision: 4,
      nextSourceRevision: 4,
    })).toEqual({
      action: "ignore",
      reason: "stale-generation",
      nodeId: "p1",
    })

    expect(createDraftPreviewPaginationApplyPlan({
      nodeId: "p1",
      requestedDelayMs: 16,
      scheduledGeneration: 2,
      currentGeneration: 2,
      sourceRevision: 4,
      nextSourceRevision: null,
    })).toEqual({
      action: "ignore",
      reason: "missing-current-source",
      nodeId: "p1",
    })

    expect(createDraftPreviewPaginationApplyPlan({
      nodeId: "p1",
      requestedDelayMs: 16,
      scheduledGeneration: 2,
      currentGeneration: 2,
      sourceRevision: 4,
      nextSourceRevision: 5,
    })).toEqual({
      action: "reschedule",
      reason: "source-revision-changed",
      nodeId: "p1",
      requestedDelayMs: 16,
      sourceRevision: 4,
      nextSourceRevision: 5,
    })

    expect(createDraftPreviewPaginationApplyPlan({
      nodeId: "p1",
      requestedDelayMs: 16,
      scheduledGeneration: 2,
      currentGeneration: 2,
      sourceRevision: 5,
      nextSourceRevision: 5,
    })).toEqual({
      action: "apply",
      reason: "current-source",
      nodeId: "p1",
      sourceRevision: 5,
    })
  })

  it("creates browser preview settle apply plans from runtime decisions", () => {
    expect(createBrowserPreviewSettleApplyPlan({
      decision: { type: "apply", reason: "current-request" },
      generation: 3,
      currentGeneration: 3,
      scheduledActiveInlineNodeId: "p1",
      currentActiveInlineNodeId: "p1",
      scheduledDraftVersion: 4,
      currentDraftVersion: 4,
    })).toEqual({
      action: "apply",
      reason: "current-request",
      decision: { type: "apply", reason: "current-request" },
      generation: 3,
      currentGeneration: 3,
      scheduledActiveInlineNodeId: "p1",
      currentActiveInlineNodeId: "p1",
      scheduledDraftVersion: 4,
      currentDraftVersion: 4,
    })

    expect(createBrowserPreviewSettleApplyPlan({
      decision: { type: "ignore-stale", reason: "draft-version-advanced" },
      generation: 3,
      currentGeneration: 4,
      scheduledActiveInlineNodeId: "p1",
      currentActiveInlineNodeId: "p1",
      scheduledDraftVersion: 4,
      currentDraftVersion: 5,
    })).toEqual({
      action: "ignore",
      reason: "draft-version-advanced",
      decision: { type: "ignore-stale", reason: "draft-version-advanced" },
      generation: 3,
      currentGeneration: 4,
      scheduledActiveInlineNodeId: "p1",
      currentActiveInlineNodeId: "p1",
      scheduledDraftVersion: 4,
      currentDraftVersion: 5,
    })

    expect(createBrowserPreviewSettleApplyPlan({
      decision: { type: "supersede", reason: "request-superseded" },
      generation: 3,
      currentGeneration: 4,
      scheduledActiveInlineNodeId: null,
      currentActiveInlineNodeId: null,
      scheduledDraftVersion: null,
      currentDraftVersion: null,
    })).toMatchObject({
      action: "ignore",
      reason: "request-superseded",
    })

    expect(createBrowserPreviewSettleApplyPlan({
      decision: { type: "cancel", reason: "request-cancelled" },
      generation: 3,
      currentGeneration: 4,
      scheduledActiveInlineNodeId: null,
      currentActiveInlineNodeId: null,
      scheduledDraftVersion: null,
      currentDraftVersion: null,
    })).toMatchObject({
      action: "ignore",
      reason: "request-cancelled",
    })
  })

  it("runs start, complete, decision, apply, ignore, supersede, and invalidate through the bridge", () => {
    const { runtime, tick } = createTestRuntime()
    const request = schedulePreviewSettleBridge({
      runtime,
      activeStructuralTransaction: null,
      activeInlineNodeId: "p1",
      draftVersion: 1,
      structuralSettle: null,
      scheduledAt: 100,
    })

    tick()
    expect(markPreviewSettleStartedBridge(runtime, request)).toMatchObject({ phase: "running" })
    tick()
    expect(markPreviewSettleCompletedBridge(runtime, request)).toMatchObject({ phase: "completed" })
    expect(getPreviewSettleApplyDecisionBridge({
      runtime,
      request,
      activeStructuralTransaction: null,
      currentStructuralGeneration: null,
      currentActiveInlineNodeId: "p1",
      currentDraftVersion: 1,
    })).toEqual({ type: "apply", reason: "current-request" })
    expect(markPreviewSettleAppliedBridge(runtime, request)).toMatchObject({ phase: "applied" })

    const ignored = schedulePreviewSettleBridge({
      runtime,
      activeStructuralTransaction: null,
      activeInlineNodeId: "p1",
      draftVersion: 1,
      structuralSettle: null,
      scheduledAt: tick(),
    })
    const decision = getPreviewSettleApplyDecisionBridge({
      runtime,
      request: ignored,
      activeStructuralTransaction: null,
      currentStructuralGeneration: null,
      currentActiveInlineNodeId: "p2",
      currentDraftVersion: 1,
    })
    expect(decision).toEqual({ type: "ignore-stale", reason: "inline-edit-node-changed" })
    if (decision.type !== "apply") {
      expect(markPreviewSettleIgnoredBridge(runtime, ignored, decision)).toMatchObject({
        phase: "ignored-stale",
        reason: "inline-edit-node-changed",
      })
    }

    const superseded = schedulePreviewSettleBridge({
      runtime,
      activeStructuralTransaction: structuralTransaction({ kind: "merge" }),
      activeInlineNodeId: "p1",
      draftVersion: null,
      structuralSettle: null,
      scheduledAt: tick(),
    })
    expect(markPreviewSettleSupersededBridge(runtime, superseded, "cleanup")).toMatchObject({
      phase: "superseded",
      reason: "cleanup",
    })
    expect(invalidatePreviewSettleBridge(runtime, "inline-edit-node-changed")).toBe(getCurrentPreviewSettleGenerationBridge(runtime))
  })
})
