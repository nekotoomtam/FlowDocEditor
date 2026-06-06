import { describe, expect, it, vi } from "vitest"
import {
  PREVIEW_SETTLE_SHELL_ADAPTER_CONTRACT_VERSION,
  applyDraftPreviewShellMutation,
  applyPaginatedOutputBrowserPreviewShellMutation,
  applyPartialWorkerBrowserPreviewShellMutation,
  applyPrecomputedBrowserPreviewShellMutation,
  applyVisualOnlyBrowserPreviewShellMutation,
  createBrowserPreviewShellMutationPlan,
  createDraftPreviewShellMutationPlan,
  summarizePreviewSettleShellMutationPlan,
  type BrowserPreviewShellMutationApplyPlan,
  type DraftPreviewShellMutationPlan,
} from "../previewSettleShellAdapter"

describe("preview settle shell adapter", () => {
  const browserApplyPlan = {
    action: "apply" as const,
    reason: "current-request",
    decision: { type: "apply" as const, reason: "current-request" },
    generation: 4,
    currentGeneration: 4,
    scheduledActiveInlineNodeId: null,
    currentActiveInlineNodeId: null,
    scheduledDraftVersion: null,
    currentDraftVersion: null,
  }

  it("maps draft ignore and reschedule plans without mutation steps", () => {
    expect(createDraftPreviewShellMutationPlan({
      applyPlan: {
        action: "ignore",
        reason: "stale-generation",
        nodeId: "p1",
      },
      nextPageIndex: null,
      previousInlineEditPageIndex: null,
      isInlineEditVisualLocked: false,
      draftPaginationNodeId: null,
      markInlineEditVisualFreshVersion: null,
    })).toEqual({
      lane: "draft-pagination",
      action: "ignore",
      reason: "stale-generation",
      nodeId: "p1",
      steps: [],
    })

    expect(createDraftPreviewShellMutationPlan({
      applyPlan: {
        action: "reschedule",
        reason: "source-revision-changed",
        nodeId: "p1",
        requestedDelayMs: 16,
        sourceRevision: 4,
        nextSourceRevision: 5,
      },
      nextPageIndex: null,
      previousInlineEditPageIndex: null,
      isInlineEditVisualLocked: false,
      draftPaginationNodeId: null,
      markInlineEditVisualFreshVersion: null,
    })).toMatchObject({
      lane: "draft-pagination",
      action: "reschedule",
      nodeId: "p1",
      requestedDelayMs: 16,
      steps: ["schedule-draft-pagination"],
    })
  })

  it("builds draft apply mutation metadata including inline page relocation", () => {
    expect(createDraftPreviewShellMutationPlan({
      applyPlan: {
        action: "apply",
        reason: "current-source",
        nodeId: "p1",
        sourceRevision: 7,
      },
      nextPageIndex: 3,
      previousInlineEditPageIndex: 1,
      isInlineEditVisualLocked: false,
      draftPaginationNodeId: "p1",
      markInlineEditVisualFreshVersion: 7,
    })).toEqual({
      lane: "draft-pagination",
      action: "apply",
      nodeId: "p1",
      sourceRevision: 7,
      nextPageIndex: 3,
      previousInlineEditPageIndex: 1,
      shouldRelocateInlineEditPage: true,
      shouldFollowInlineEditPage: true,
      draftPaginationNodeId: "p1",
      markInlineEditVisualFreshVersion: 7,
      steps: [
        "write-paginated-ref",
        "write-optimistic-layout",
        "relocate-inline-edit-page",
        "follow-inline-edit-page",
        "set-draft-pagination-node",
        "dispatch-set-paginated",
        "mark-inline-edit-visual-fresh",
      ],
    })
  })

  it("keeps draft apply page relocation off while the visual page is locked", () => {
    expect(createDraftPreviewShellMutationPlan({
      applyPlan: {
        action: "apply",
        reason: "current-source",
        nodeId: "p1",
        sourceRevision: 7,
      },
      nextPageIndex: 3,
      previousInlineEditPageIndex: 1,
      isInlineEditVisualLocked: true,
      draftPaginationNodeId: null,
      markInlineEditVisualFreshVersion: null,
    })).toMatchObject({
      action: "apply",
      shouldRelocateInlineEditPage: false,
      shouldFollowInlineEditPage: false,
      steps: [
        "write-paginated-ref",
        "write-optimistic-layout",
        "set-draft-pagination-node",
        "dispatch-set-paginated",
        "mark-inline-edit-visual-fresh",
      ],
    })
  })

  it("executes draft reschedule and ignore plans without output mutations", () => {
    const reschedulePlan = createDraftPreviewShellMutationPlan({
      applyPlan: {
        action: "reschedule",
        reason: "source-revision-changed",
        nodeId: "p1",
        requestedDelayMs: 16,
        sourceRevision: 4,
        nextSourceRevision: 5,
      },
      nextPageIndex: null,
      previousInlineEditPageIndex: null,
      isInlineEditVisualLocked: false,
      draftPaginationNodeId: null,
      markInlineEditVisualFreshVersion: null,
    })
    const scheduleDraftPagination = vi.fn()
    const writePaginatedRef = vi.fn()

    expect(applyDraftPreviewShellMutation({
      plan: reschedulePlan,
      optimisticLayout: { id: "draft-layout" },
      paginated: { id: "draft-paginated" },
      fallbackInlineEditVisualFreshVersion: 9,
      scheduleDraftPagination,
      writePaginatedRef,
      writeOptimisticLayout: vi.fn(),
      relocateInlineEditPage: vi.fn(),
      followInlineEditPage: vi.fn(),
      setDraftPaginationNodeId: vi.fn(),
      dispatchSetPaginated: vi.fn(),
      markInlineEditVisualFresh: vi.fn(),
    })).toBe(true)

    expect(scheduleDraftPagination).toHaveBeenCalledTimes(1)
    expect(scheduleDraftPagination).toHaveBeenCalledWith("p1", 16)
    expect(writePaginatedRef).not.toHaveBeenCalled()

    const ignorePlan = createDraftPreviewShellMutationPlan({
      applyPlan: {
        action: "ignore",
        reason: "stale-generation",
        nodeId: "p1",
      },
      nextPageIndex: null,
      previousInlineEditPageIndex: null,
      isInlineEditVisualLocked: false,
      draftPaginationNodeId: null,
      markInlineEditVisualFreshVersion: null,
    })
    scheduleDraftPagination.mockClear()

    expect(applyDraftPreviewShellMutation({
      plan: ignorePlan,
      optimisticLayout: { id: "draft-layout" },
      paginated: { id: "draft-paginated" },
      fallbackInlineEditVisualFreshVersion: 9,
      scheduleDraftPagination,
      writePaginatedRef,
      writeOptimisticLayout: vi.fn(),
      relocateInlineEditPage: vi.fn(),
      followInlineEditPage: vi.fn(),
      setDraftPaginationNodeId: vi.fn(),
      dispatchSetPaginated: vi.fn(),
      markInlineEditVisualFresh: vi.fn(),
    })).toBe(true)

    expect(scheduleDraftPagination).not.toHaveBeenCalled()
    expect(writePaginatedRef).not.toHaveBeenCalled()
  })

  it("executes draft apply output callbacks in the existing Shell order", () => {
    const plan = createDraftPreviewShellMutationPlan({
      applyPlan: {
        action: "apply",
        reason: "current-source",
        nodeId: "p1",
        sourceRevision: 7,
      },
      nextPageIndex: 3,
      previousInlineEditPageIndex: 1,
      isInlineEditVisualLocked: false,
      draftPaginationNodeId: "p1",
      markInlineEditVisualFreshVersion: 7,
    })
    const events: string[] = []
    const optimisticLayout = { id: "draft-layout" }
    const paginated = { id: "draft-paginated" }

    expect(applyDraftPreviewShellMutation({
      plan,
      optimisticLayout,
      paginated,
      fallbackInlineEditVisualFreshVersion: 9,
      scheduleDraftPagination: vi.fn(),
      writePaginatedRef: (nextPaginated) => {
        events.push("write-paginated-ref")
        expect(nextPaginated).toBe(paginated)
      },
      writeOptimisticLayout: (layout) => {
        events.push("write-optimistic-layout")
        expect(layout).toBe(optimisticLayout)
      },
      relocateInlineEditPage: (pageIndex) => {
        events.push("relocate-inline-edit-page")
        expect(pageIndex).toBe(3)
      },
      followInlineEditPage: (pageIndex) => {
        events.push("follow-inline-edit-page")
        expect(pageIndex).toBe(3)
      },
      setDraftPaginationNodeId: (nodeId) => {
        events.push("set-draft-pagination-node")
        expect(nodeId).toBe("p1")
      },
      dispatchSetPaginated: (nextPaginated) => {
        events.push("dispatch-set-paginated")
        expect(nextPaginated).toBe(paginated)
      },
      markInlineEditVisualFresh: (draftVersion) => {
        events.push("mark-inline-edit-visual-fresh")
        expect(draftVersion).toBe(7)
      },
    })).toBe(true)

    expect(events).toEqual([
      "write-paginated-ref",
      "write-optimistic-layout",
      "relocate-inline-edit-page",
      "follow-inline-edit-page",
      "set-draft-pagination-node",
      "dispatch-set-paginated",
      "mark-inline-edit-visual-fresh",
    ])
  })

  it("executes draft apply fallback visual freshness without relocation callbacks", () => {
    const plan: DraftPreviewShellMutationPlan = {
      lane: "draft-pagination",
      action: "apply",
      nodeId: "p1",
      sourceRevision: 7,
      nextPageIndex: null,
      previousInlineEditPageIndex: null,
      shouldRelocateInlineEditPage: false,
      shouldFollowInlineEditPage: false,
      draftPaginationNodeId: null,
      markInlineEditVisualFreshVersion: null,
      steps: [
        "write-paginated-ref",
        "write-optimistic-layout",
        "set-draft-pagination-node",
        "dispatch-set-paginated",
        "mark-inline-edit-visual-fresh",
      ],
    }
    const relocateInlineEditPage = vi.fn()
    const followInlineEditPage = vi.fn()
    const markInlineEditVisualFresh = vi.fn()

    expect(applyDraftPreviewShellMutation({
      plan,
      optimisticLayout: { id: "draft-layout" },
      paginated: { id: "draft-paginated" },
      fallbackInlineEditVisualFreshVersion: 9,
      scheduleDraftPagination: vi.fn(),
      writePaginatedRef: vi.fn(),
      writeOptimisticLayout: vi.fn(),
      relocateInlineEditPage,
      followInlineEditPage,
      setDraftPaginationNodeId: vi.fn(),
      dispatchSetPaginated: vi.fn(),
      markInlineEditVisualFresh,
    })).toBe(true)

    expect(relocateInlineEditPage).not.toHaveBeenCalled()
    expect(followInlineEditPage).not.toHaveBeenCalled()
    expect(markInlineEditVisualFresh).toHaveBeenCalledWith(9)
  })

  it("maps browser ignore plans without mutation steps", () => {
    expect(createBrowserPreviewShellMutationPlan({
      applyPlan: {
        action: "ignore",
        reason: "draft-version-advanced",
        decision: { type: "ignore-stale", reason: "draft-version-advanced" },
        generation: 4,
        currentGeneration: 5,
        scheduledActiveInlineNodeId: "p1",
        currentActiveInlineNodeId: "p1",
        scheduledDraftVersion: 3,
        currentDraftVersion: 4,
      },
      mode: "paginated-output",
      source: "document-preview-worker",
      generation: 4,
      isTextMeasurerReady: true,
      hasStructuralSettleForInlineNode: true,
    })).toEqual({
      lane: "browser-preview",
      action: "ignore",
      source: "document-preview-worker",
      reason: "draft-version-advanced",
      decisionType: "ignore-stale",
      generation: 4,
      currentGeneration: 5,
      steps: [],
    })
  })

  it("builds browser precomputed and visual-only mutation metadata", () => {
    expect(createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "precomputed",
      source: "precomputed-browser-pagination",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: false,
    })).toMatchObject({
      action: "apply",
      browserPreviewLayout: "unchanged",
      shouldWritePaginatedRef: false,
      shouldDispatchSetPaginated: false,
      shouldMarkPreviewSettleLifecycle: true,
      steps: [
        "write-optimistic-layout",
        "clear-partial-preview",
        "mark-preview-settle-lifecycle",
      ],
    })

    expect(createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "visual-only",
      source: "visual-only-fast-lane",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: false,
    })).toMatchObject({
      action: "apply",
      browserPreviewLayout: "full",
      shouldWritePaginatedRef: true,
      shouldDispatchSetPaginated: true,
      steps: [
        "write-optimistic-layout",
        "write-paginated-ref",
        "clear-partial-preview",
        "update-browser-preview-layout",
        "dispatch-set-paginated",
        "mark-preview-settle-lifecycle",
      ],
    })
  })

  it("executes precomputed browser preview optimistic layout and partial clear callbacks", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "precomputed",
      source: "precomputed-browser-pagination",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const optimisticLayout = { id: "precomputed-layout" }
    const writeOptimisticLayout = vi.fn()
    const clearPartialPreview = vi.fn()
    const setBrowserPreviewLayout = vi.fn()
    const markPreviewSettleLifecycle = vi.fn()

    expect(applyPrecomputedBrowserPreviewShellMutation({
      plan,
      optimisticLayout,
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      writeOptimisticLayout,
      clearPartialPreview,
      setBrowserPreviewLayout,
      markPreviewSettleLifecycle,
    })).toBe(true)

    expect(writeOptimisticLayout).toHaveBeenCalledTimes(1)
    expect(writeOptimisticLayout).toHaveBeenCalledWith(optimisticLayout)
    expect(clearPartialPreview).toHaveBeenCalledTimes(1)
    expect(setBrowserPreviewLayout).not.toHaveBeenCalled()
    expect(markPreviewSettleLifecycle).toHaveBeenCalledTimes(1)
  })

  it("executes precomputed browser preview full layout callback when requested", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "precomputed",
      source: "precomputed-browser-pagination",
      generation: 4,
      isTextMeasurerReady: true,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const setBrowserPreviewLayout = vi.fn()

    applyPrecomputedBrowserPreviewShellMutation({
      plan,
      optimisticLayout: { id: "precomputed-layout" },
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      writeOptimisticLayout: vi.fn(),
      clearPartialPreview: vi.fn(),
      setBrowserPreviewLayout,
      markPreviewSettleLifecycle: vi.fn(),
    })

    expect(setBrowserPreviewLayout).toHaveBeenCalledTimes(1)
    expect(setBrowserPreviewLayout).toHaveBeenCalledWith({ status: "full", generation: 4 })
  })

  it("does not call precomputed browser preview callbacks for disabled flags", () => {
    const plan: BrowserPreviewShellMutationApplyPlan = {
      lane: "browser-preview",
      action: "apply",
      source: "precomputed-browser-pagination",
      mode: "precomputed",
      generation: 4,
      browserPreviewLayout: "unchanged",
      shouldWriteOptimisticLayout: false,
      shouldWritePaginatedRef: false,
      shouldSetPartialPreview: false,
      shouldClearPartialPreview: false,
      shouldDispatchSetPaginated: false,
      shouldMarkPreviewSettleLifecycle: false,
      shouldMarkInlineEditVisualFresh: false,
      shouldCompleteStructuralSettle: false,
      steps: [],
    }
    const callbacks = {
      writeOptimisticLayout: vi.fn(),
      clearPartialPreview: vi.fn(),
      setBrowserPreviewLayout: vi.fn(),
      markPreviewSettleLifecycle: vi.fn(),
    }

    expect(applyPrecomputedBrowserPreviewShellMutation({
      plan,
      optimisticLayout: { id: "precomputed-layout" },
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      ...callbacks,
    })).toBe(true)

    expect(callbacks.writeOptimisticLayout).not.toHaveBeenCalled()
    expect(callbacks.clearPartialPreview).not.toHaveBeenCalled()
    expect(callbacks.setBrowserPreviewLayout).not.toHaveBeenCalled()
    expect(callbacks.markPreviewSettleLifecycle).not.toHaveBeenCalled()
  })

  it("does not execute non-precomputed browser preview plans through the precomputed executor", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "visual-only",
      source: "visual-only-fast-lane",
      generation: 4,
      isTextMeasurerReady: true,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const writeOptimisticLayout = vi.fn()

    expect(applyPrecomputedBrowserPreviewShellMutation({
      plan,
      optimisticLayout: { id: "visual-only-layout" },
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      writeOptimisticLayout,
      clearPartialPreview: vi.fn(),
      setBrowserPreviewLayout: vi.fn(),
      markPreviewSettleLifecycle: vi.fn(),
    })).toBe(false)

    expect(writeOptimisticLayout).not.toHaveBeenCalled()
  })

  it("executes visual-only browser preview output callbacks", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "visual-only",
      source: "visual-only-fast-lane",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const optimisticLayout = { doc: "preview-doc", paginated: "visual-paginated" }
    const paginated = { id: "visual-paginated" }
    const writeOptimisticLayout = vi.fn()
    const writePaginatedRef = vi.fn()
    const clearPartialPreview = vi.fn()
    const setBrowserPreviewLayout = vi.fn()
    const dispatchSetPaginated = vi.fn()
    const markPreviewSettleLifecycle = vi.fn()

    expect(applyVisualOnlyBrowserPreviewShellMutation({
      plan,
      optimisticLayout,
      paginated,
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      writeOptimisticLayout,
      writePaginatedRef,
      clearPartialPreview,
      setBrowserPreviewLayout,
      dispatchSetPaginated,
      markPreviewSettleLifecycle,
    })).toBe(true)

    expect(writeOptimisticLayout).toHaveBeenCalledTimes(1)
    expect(writeOptimisticLayout).toHaveBeenCalledWith(optimisticLayout)
    expect(writePaginatedRef).toHaveBeenCalledTimes(1)
    expect(writePaginatedRef).toHaveBeenCalledWith(paginated)
    expect(clearPartialPreview).toHaveBeenCalledTimes(1)
    expect(setBrowserPreviewLayout).toHaveBeenCalledTimes(1)
    expect(setBrowserPreviewLayout).toHaveBeenCalledWith({ status: "full", generation: 4 })
    expect(dispatchSetPaginated).toHaveBeenCalledTimes(1)
    expect(dispatchSetPaginated).toHaveBeenCalledWith(paginated)
    expect(markPreviewSettleLifecycle).toHaveBeenCalledTimes(1)
  })

  it("does not call visual-only browser preview callbacks for disabled flags", () => {
    const plan: BrowserPreviewShellMutationApplyPlan = {
      lane: "browser-preview",
      action: "apply",
      source: "visual-only-fast-lane",
      mode: "visual-only",
      generation: 4,
      browserPreviewLayout: "unchanged",
      shouldWriteOptimisticLayout: false,
      shouldWritePaginatedRef: false,
      shouldSetPartialPreview: false,
      shouldClearPartialPreview: false,
      shouldDispatchSetPaginated: false,
      shouldMarkPreviewSettleLifecycle: false,
      shouldMarkInlineEditVisualFresh: false,
      shouldCompleteStructuralSettle: false,
      steps: [],
    }
    const callbacks = {
      writeOptimisticLayout: vi.fn(),
      writePaginatedRef: vi.fn(),
      clearPartialPreview: vi.fn(),
      setBrowserPreviewLayout: vi.fn(),
      dispatchSetPaginated: vi.fn(),
      markPreviewSettleLifecycle: vi.fn(),
    }

    expect(applyVisualOnlyBrowserPreviewShellMutation({
      plan,
      optimisticLayout: { doc: "preview-doc", paginated: "visual-paginated" },
      paginated: { id: "visual-paginated" },
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      ...callbacks,
    })).toBe(true)

    expect(callbacks.writeOptimisticLayout).not.toHaveBeenCalled()
    expect(callbacks.writePaginatedRef).not.toHaveBeenCalled()
    expect(callbacks.clearPartialPreview).not.toHaveBeenCalled()
    expect(callbacks.setBrowserPreviewLayout).not.toHaveBeenCalled()
    expect(callbacks.dispatchSetPaginated).not.toHaveBeenCalled()
    expect(callbacks.markPreviewSettleLifecycle).not.toHaveBeenCalled()
  })

  it("does not execute non-visual-only browser preview plans through the visual-only executor", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "paginated-output",
      source: "document-preview",
      generation: 4,
      isTextMeasurerReady: true,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const writePaginatedRef = vi.fn()

    expect(applyVisualOnlyBrowserPreviewShellMutation({
      plan,
      optimisticLayout: { doc: "preview-doc", paginated: "visual-paginated" },
      paginated: { id: "visual-paginated" },
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      writeOptimisticLayout: vi.fn(),
      writePaginatedRef,
      clearPartialPreview: vi.fn(),
      setBrowserPreviewLayout: vi.fn(),
      dispatchSetPaginated: vi.fn(),
      markPreviewSettleLifecycle: vi.fn(),
    })).toBe(false)

    expect(writePaginatedRef).not.toHaveBeenCalled()
  })

  it("builds browser partial-worker mutation metadata without final commit steps", () => {
    expect(createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "partial-worker",
      source: "document-preview-worker-partial",
      generation: 4,
      isTextMeasurerReady: true,
      hasStructuralSettleForInlineNode: false,
    })).toEqual({
      lane: "browser-preview",
      action: "apply",
      source: "document-preview-worker-partial",
      mode: "partial-worker",
      generation: 4,
      browserPreviewLayout: "partial",
      shouldWriteOptimisticLayout: false,
      shouldWritePaginatedRef: false,
      shouldSetPartialPreview: true,
      shouldClearPartialPreview: false,
      shouldDispatchSetPaginated: false,
      shouldMarkPreviewSettleLifecycle: false,
      shouldMarkInlineEditVisualFresh: false,
      shouldCompleteStructuralSettle: false,
      steps: [
        "set-partial-preview",
        "update-browser-preview-layout",
      ],
    })
  })

  it("executes partial-worker browser preview partial payload and layout callbacks", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "partial-worker",
      source: "document-preview-worker-partial",
      generation: 4,
      isTextMeasurerReady: true,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const partialPreview = { generation: 4, requestId: 9, paginated: { pages: 2 } }
    const setPartialPreview = vi.fn()
    const setBrowserPreviewLayout = vi.fn()

    expect(applyPartialWorkerBrowserPreviewShellMutation({
      plan,
      partialPreview,
      createPartialBrowserPreviewLayout: (generation) => ({ status: "partial", generation }),
      setPartialPreview,
      setBrowserPreviewLayout,
    })).toBe(true)

    expect(setPartialPreview).toHaveBeenCalledTimes(1)
    expect(setPartialPreview).toHaveBeenCalledWith(partialPreview)
    expect(setBrowserPreviewLayout).toHaveBeenCalledTimes(1)
    expect(setBrowserPreviewLayout).toHaveBeenCalledWith({ status: "partial", generation: 4 })
  })

  it("does not call partial-worker browser preview callbacks for disabled flags", () => {
    const plan: BrowserPreviewShellMutationApplyPlan = {
      lane: "browser-preview",
      action: "apply",
      source: "document-preview-worker-partial",
      mode: "partial-worker",
      generation: 4,
      browserPreviewLayout: "unchanged",
      shouldWriteOptimisticLayout: false,
      shouldWritePaginatedRef: false,
      shouldSetPartialPreview: false,
      shouldClearPartialPreview: false,
      shouldDispatchSetPaginated: false,
      shouldMarkPreviewSettleLifecycle: false,
      shouldMarkInlineEditVisualFresh: false,
      shouldCompleteStructuralSettle: false,
      steps: [],
    }
    const setPartialPreview = vi.fn()
    const setBrowserPreviewLayout = vi.fn()

    expect(applyPartialWorkerBrowserPreviewShellMutation({
      plan,
      partialPreview: { generation: 4, requestId: 9, paginated: { pages: 2 } },
      createPartialBrowserPreviewLayout: (generation) => ({ status: "partial", generation }),
      setPartialPreview,
      setBrowserPreviewLayout,
    })).toBe(true)

    expect(setPartialPreview).not.toHaveBeenCalled()
    expect(setBrowserPreviewLayout).not.toHaveBeenCalled()
  })

  it("does not execute non-partial browser preview plans through the partial-worker executor", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "visual-only",
      source: "visual-only-fast-lane",
      generation: 4,
      isTextMeasurerReady: true,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const setPartialPreview = vi.fn()

    expect(applyPartialWorkerBrowserPreviewShellMutation({
      plan,
      partialPreview: { generation: 4, requestId: 9, paginated: { pages: 2 } },
      createPartialBrowserPreviewLayout: (generation) => ({ status: "partial", generation }),
      setPartialPreview,
      setBrowserPreviewLayout: vi.fn(),
    })).toBe(false)

    expect(setPartialPreview).not.toHaveBeenCalled()
  })

  it("builds browser paginated-output mutation metadata", () => {
    const applyPlan = {
      action: "apply" as const,
      reason: "current-request",
      decision: { type: "apply" as const, reason: "current-request" },
      generation: 4,
      currentGeneration: 4,
      scheduledActiveInlineNodeId: "p1",
      currentActiveInlineNodeId: "p1",
      scheduledDraftVersion: 6,
      currentDraftVersion: 6,
    }

    expect(createBrowserPreviewShellMutationPlan({
      applyPlan,
      mode: "paginated-output",
      source: "inline-edit-preview",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: true,
    })).toMatchObject({
      action: "apply",
      browserPreviewLayout: "settling-blocking",
      shouldWritePaginatedRef: true,
      shouldDispatchSetPaginated: true,
      shouldMarkInlineEditVisualFresh: true,
      shouldCompleteStructuralSettle: true,
      steps: [
        "write-optimistic-layout",
        "write-paginated-ref",
        "clear-partial-preview",
        "update-browser-preview-layout",
        "dispatch-set-paginated",
        "mark-preview-settle-lifecycle",
        "mark-inline-edit-visual-fresh",
        "complete-structural-settle",
      ],
    })

    expect(createBrowserPreviewShellMutationPlan({
      applyPlan: { ...applyPlan, scheduledDraftVersion: null },
      mode: "paginated-output",
      source: "document-preview-worker",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: false,
    })).toMatchObject({
      action: "apply",
      browserPreviewLayout: "full",
      shouldMarkInlineEditVisualFresh: false,
      shouldCompleteStructuralSettle: false,
    })
  })

  it("executes paginated-output browser preview final output callbacks", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: {
        ...browserApplyPlan,
        scheduledActiveInlineNodeId: null,
        currentActiveInlineNodeId: null,
        scheduledDraftVersion: null,
        currentDraftVersion: null,
      },
      mode: "paginated-output",
      source: "document-preview-worker",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const optimisticLayout = { doc: "preview-doc", paginated: "final-paginated" }
    const paginated = { id: "final-paginated" }
    const writeOptimisticLayout = vi.fn()
    const writePaginatedRef = vi.fn()
    const clearPartialPreview = vi.fn()
    const setBrowserPreviewLayout = vi.fn()
    const dispatchSetPaginated = vi.fn()
    const markPreviewSettleLifecycle = vi.fn()
    const markInlineEditVisualFresh = vi.fn()
    const completeStructuralSettle = vi.fn()

    expect(applyPaginatedOutputBrowserPreviewShellMutation({
      plan,
      optimisticLayout,
      paginated,
      inlineEditVisualFreshVersion: null,
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      createSettlingBlockingBrowserPreviewLayout: (generation) => ({ status: "settling", generation }),
      writeOptimisticLayout,
      writePaginatedRef,
      clearPartialPreview,
      setBrowserPreviewLayout,
      dispatchSetPaginated,
      markPreviewSettleLifecycle,
      markInlineEditVisualFresh,
      completeStructuralSettle,
    })).toBe(true)

    expect(writeOptimisticLayout).toHaveBeenCalledWith(optimisticLayout)
    expect(writePaginatedRef).toHaveBeenCalledWith(paginated)
    expect(clearPartialPreview).toHaveBeenCalledTimes(1)
    expect(setBrowserPreviewLayout).toHaveBeenCalledWith({ status: "full", generation: 4 })
    expect(dispatchSetPaginated).toHaveBeenCalledWith(paginated)
    expect(markPreviewSettleLifecycle).toHaveBeenCalledTimes(1)
    expect(markInlineEditVisualFresh).not.toHaveBeenCalled()
    expect(completeStructuralSettle).not.toHaveBeenCalled()
  })

  it("executes paginated-output inline freshness and structural settle callbacks", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: {
        action: "apply",
        reason: "current-request",
        decision: { type: "apply", reason: "current-request" },
        generation: 4,
        currentGeneration: 4,
        scheduledActiveInlineNodeId: "p1",
        currentActiveInlineNodeId: "p1",
        scheduledDraftVersion: 6,
        currentDraftVersion: 6,
      },
      mode: "paginated-output",
      source: "inline-edit-preview",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: true,
    }) as BrowserPreviewShellMutationApplyPlan
    const setBrowserPreviewLayout = vi.fn()
    const markInlineEditVisualFresh = vi.fn()
    const completeStructuralSettle = vi.fn()

    applyPaginatedOutputBrowserPreviewShellMutation({
      plan,
      optimisticLayout: { doc: "preview-doc", paginated: "final-paginated" },
      paginated: { id: "final-paginated" },
      inlineEditVisualFreshVersion: 6,
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      createSettlingBlockingBrowserPreviewLayout: (generation) => ({ status: "settling", generation, blocksCanvas: true }),
      writeOptimisticLayout: vi.fn(),
      writePaginatedRef: vi.fn(),
      clearPartialPreview: vi.fn(),
      setBrowserPreviewLayout,
      dispatchSetPaginated: vi.fn(),
      markPreviewSettleLifecycle: vi.fn(),
      markInlineEditVisualFresh,
      completeStructuralSettle,
    })

    expect(setBrowserPreviewLayout).toHaveBeenCalledWith({ status: "settling", generation: 4, blocksCanvas: true })
    expect(markInlineEditVisualFresh).toHaveBeenCalledTimes(1)
    expect(markInlineEditVisualFresh).toHaveBeenCalledWith(6)
    expect(completeStructuralSettle).toHaveBeenCalledTimes(1)
  })

  it("does not call paginated-output callbacks for disabled flags", () => {
    const plan: BrowserPreviewShellMutationApplyPlan = {
      lane: "browser-preview",
      action: "apply",
      source: "document-preview",
      mode: "paginated-output",
      generation: 4,
      browserPreviewLayout: "unchanged",
      shouldWriteOptimisticLayout: false,
      shouldWritePaginatedRef: false,
      shouldSetPartialPreview: false,
      shouldClearPartialPreview: false,
      shouldDispatchSetPaginated: false,
      shouldMarkPreviewSettleLifecycle: false,
      shouldMarkInlineEditVisualFresh: false,
      shouldCompleteStructuralSettle: false,
      steps: [],
    }
    const callbacks = {
      writeOptimisticLayout: vi.fn(),
      writePaginatedRef: vi.fn(),
      clearPartialPreview: vi.fn(),
      setBrowserPreviewLayout: vi.fn(),
      dispatchSetPaginated: vi.fn(),
      markPreviewSettleLifecycle: vi.fn(),
      markInlineEditVisualFresh: vi.fn(),
      completeStructuralSettle: vi.fn(),
    }

    expect(applyPaginatedOutputBrowserPreviewShellMutation({
      plan,
      optimisticLayout: { doc: "preview-doc", paginated: "final-paginated" },
      paginated: { id: "final-paginated" },
      inlineEditVisualFreshVersion: 6,
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      createSettlingBlockingBrowserPreviewLayout: (generation) => ({ status: "settling", generation }),
      ...callbacks,
    })).toBe(true)

    expect(callbacks.writeOptimisticLayout).not.toHaveBeenCalled()
    expect(callbacks.writePaginatedRef).not.toHaveBeenCalled()
    expect(callbacks.clearPartialPreview).not.toHaveBeenCalled()
    expect(callbacks.setBrowserPreviewLayout).not.toHaveBeenCalled()
    expect(callbacks.dispatchSetPaginated).not.toHaveBeenCalled()
    expect(callbacks.markPreviewSettleLifecycle).not.toHaveBeenCalled()
    expect(callbacks.markInlineEditVisualFresh).not.toHaveBeenCalled()
    expect(callbacks.completeStructuralSettle).not.toHaveBeenCalled()
  })

  it("does not execute non-paginated-output plans through the paginated-output executor", () => {
    const plan = createBrowserPreviewShellMutationPlan({
      applyPlan: browserApplyPlan,
      mode: "visual-only",
      source: "visual-only-fast-lane",
      generation: 4,
      isTextMeasurerReady: true,
      hasStructuralSettleForInlineNode: false,
    }) as BrowserPreviewShellMutationApplyPlan
    const dispatchSetPaginated = vi.fn()

    expect(applyPaginatedOutputBrowserPreviewShellMutation({
      plan,
      optimisticLayout: { doc: "preview-doc", paginated: "final-paginated" },
      paginated: { id: "final-paginated" },
      inlineEditVisualFreshVersion: 6,
      createFullBrowserPreviewLayout: (generation) => ({ status: "full", generation }),
      createSettlingBlockingBrowserPreviewLayout: (generation) => ({ status: "settling", generation }),
      writeOptimisticLayout: vi.fn(),
      writePaginatedRef: vi.fn(),
      clearPartialPreview: vi.fn(),
      setBrowserPreviewLayout: vi.fn(),
      dispatchSetPaginated,
      markPreviewSettleLifecycle: vi.fn(),
      markInlineEditVisualFresh: vi.fn(),
      completeStructuralSettle: vi.fn(),
    })).toBe(false)

    expect(dispatchSetPaginated).not.toHaveBeenCalled()
  })

  it("summarizes shell mutation plans with a stable diagnostic contract", () => {
    const draftPlan = createDraftPreviewShellMutationPlan({
      applyPlan: {
        action: "reschedule",
        reason: "source-revision-changed",
        nodeId: "p1",
        requestedDelayMs: 16,
        sourceRevision: 4,
        nextSourceRevision: 5,
      },
      nextPageIndex: null,
      previousInlineEditPageIndex: null,
      isInlineEditVisualLocked: false,
      draftPaginationNodeId: null,
      markInlineEditVisualFreshVersion: null,
    })
    expect(summarizePreviewSettleShellMutationPlan(draftPlan)).toEqual({
      contractVersion: PREVIEW_SETTLE_SHELL_ADAPTER_CONTRACT_VERSION,
      lane: "draft-pagination",
      action: "reschedule",
      steps: "schedule-draft-pagination",
      stepCount: 1,
      nodeId: "p1",
      reason: "source-revision-changed",
    })

    const browserPlan = createBrowserPreviewShellMutationPlan({
      applyPlan: {
        action: "apply",
        reason: "current-request",
        decision: { type: "apply", reason: "current-request" },
        generation: 4,
        currentGeneration: 4,
        scheduledActiveInlineNodeId: "p1",
        currentActiveInlineNodeId: "p1",
        scheduledDraftVersion: 6,
        currentDraftVersion: 6,
      },
      mode: "paginated-output",
      source: "inline-edit-preview",
      generation: 4,
      isTextMeasurerReady: false,
      hasStructuralSettleForInlineNode: true,
    })
    expect(summarizePreviewSettleShellMutationPlan(browserPlan)).toEqual({
      contractVersion: PREVIEW_SETTLE_SHELL_ADAPTER_CONTRACT_VERSION,
      lane: "browser-preview",
      action: "apply",
      steps: "write-optimistic-layout,write-paginated-ref,clear-partial-preview,update-browser-preview-layout,dispatch-set-paginated,mark-preview-settle-lifecycle,mark-inline-edit-visual-fresh,complete-structural-settle",
      stepCount: 8,
      source: "inline-edit-preview",
      mode: "paginated-output",
      generation: 4,
      browserPreviewLayout: "settling-blocking",
      shouldDispatchSetPaginated: true,
      shouldWritePaginatedRef: true,
      shouldWriteOptimisticLayout: true,
      shouldSetPartialPreview: false,
      shouldClearPartialPreview: true,
    })
  })
})
