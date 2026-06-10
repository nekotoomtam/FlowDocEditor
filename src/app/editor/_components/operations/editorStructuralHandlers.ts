import { flushSync } from "react-dom"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import {
  finishWysiwygPerfSpan,
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
} from "../wysiwygPerformance"
import { createStructuralDraftSessionPlan } from "../structuralEdit/structuralEditPlans"
import type { EditorAction } from "../editorReducer"
import type { StructuralEditController } from "../structuralEdit/structuralEditBridgeTypes"
import type { OptimisticLayoutSnapshot } from "../layoutReconciliation"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import type {
  OptimisticStructuralIslandOverride,
  OptimisticStructuralRefocusPaint,
  PendingOptimisticSplitRefocus,
  PendingOptimisticMergeRefocus,
} from "../shell/editorShellTypes"
import type {
  ParagraphMergeOperationPlan,
  ParagraphSplitOperationPlan,
} from "./editorStructuralOperationPlans"
import type { StructuralPreviewSettleSnapshot } from "../structuralEdit/previewSettleBridge"
import { OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS } from "../shell/editorShellConstants"

export interface StructuralExecutionContext {
  abortStructuralEditTransactionAndPanelDeferral: (identity: Parameters<StructuralEditController["markUrgentPainting"]>[0], reason: string) => void
  beginStructuralPanelReleaseDeferral: (plan: ReturnType<StructuralEditController["beginSplit"]>["panelDeferral"]) => unknown
  beginWysiwygDraftRuntimeSession: (plan: ReturnType<typeof createStructuralDraftSessionPlan>) => unknown
  dispatchEditorAction: (action: EditorAction) => void
  endRichWysiwygDraftSession: () => void
  setOptimisticStructuralIslandOverride: (value: OptimisticStructuralIslandOverride | null) => void
  setOptimisticStructuralRefocusPaint: (value: OptimisticStructuralRefocusPaint | null) => void
  startInlineEditAfterOptimisticStructuralChange: (
    nodeId: string,
    caretIndex: number | null,
    beforePaginated: PaginatedDocument,
    nextPageIndex?: number | null,
    beforeDocOverride?: DocumentNode,
    beforeTextOverride?: string | null,
  ) => boolean
  startPlainWysiwygTextSessionFromText: (input: {
    nodeId: string
    text: string
    caretOffset?: number | null
    pageIndex?: number | null
  }) => boolean
  structuralEditController: StructuralEditController
  
  // Refs mutated during operation
  setPendingOptimisticSplitRefocus: (pending: PendingOptimisticSplitRefocus | null) => void
  setPendingOptimisticMergeRefocus: (pending: PendingOptimisticMergeRefocus | null) => void
  setPaginatedRef: (paginated: PaginatedDocument) => void
  setOptimisticLayoutRef: (layout: OptimisticLayoutSnapshot | null) => void
  setOptimisticStructuralSettleRef: (settle: (PendingOptimisticSplitRefocus & StructuralPreviewSettleSnapshot) | null) => void
  setOptimisticStructuralPreviewSettleGraceUntilRef: (time: number) => void
  setSuppressNextLayoutLoadingOverlayRef: (suppress: boolean) => void

  clearWysiwygDraftPagination: () => void
  endWysiwygTextSession: () => void
  getPaginatedRef: () => PaginatedDocument
  getOptimisticLayoutRef: () => OptimisticLayoutSnapshot | null
  getOptimisticStructuralSettleRef: () => (PendingOptimisticSplitRefocus & StructuralPreviewSettleSnapshot) | null
  getOptimisticStructuralPreviewSettleGraceUntilRef: () => number
}

export function executeParagraphSplitOperationPlan(
  plan: ParagraphSplitOperationPlan,
  pending: PendingOptimisticSplitRefocus,
  context: StructuralExecutionContext,
): boolean {
  const handlerStartedAt = startWysiwygPerfSpan()
  
  const {
    newNodeId,
    optimisticLayout,
    optimisticFragment,
    newParagraph,
    newText,
    mode,
    overflowedPage,
    suppressedPageBreakNodeId,
    pageKey,
  } = plan

  if (!newNodeId || !optimisticLayout || !optimisticFragment || !newParagraph || !newText || !pageKey || !plan.operation) {
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "structural-operation-handler-execute", handlerStartedAt, {
      operation: "split",
      status: "abort",
      reason: "invalid-plan-payload",
    })
    return false
  }

  // --- 1. Apply State & Mutate Refs ---
  pending.prestarted = true
  context.setPendingOptimisticSplitRefocus(pending)
  context.setPaginatedRef(optimisticLayout.paginated)
  context.setOptimisticLayoutRef(optimisticLayout)
  context.setOptimisticStructuralSettleRef({ ...pending, newNodeId: newNodeId })
  context.setOptimisticStructuralPreviewSettleGraceUntilRef(startWysiwygPerfSpan() + OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS)
  context.setSuppressNextLayoutLoadingOverlayRef(true)

  const optimistic = {
    paginated: optimisticLayout.paginated,
    newFragment: optimisticFragment,
    mode: mode ?? "same-page",
    overflowedPage: overflowedPage ?? false,
  }

  let inlineStarted = false
  let textSessionStarted = false
  let splitDispatched = false

  // --- 2. Begin Structural Edit Transaction ---
  const structuralBridge = context.structuralEditController.beginSplit({
    sourceNodeId: pending.sourceNodeId,
    newNodeId: pending.newNodeId,
    pageIndex: optimistic.newFragment.pageIndex,
    suppressedPageBreakNodeId,
    startedAt: pending.startedAt,
  })
  const structuralTransaction = structuralBridge.transaction
  const structuralTransactionIdentity = structuralBridge.identity
  
  const failAfterStructuralTransactionBegin = (reason: string) => {
    context.abortStructuralEditTransactionAndPanelDeferral(structuralTransactionIdentity, reason)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "structural-operation-handler-execute", handlerStartedAt, {
      operation: "split",
      status: "abort",
      reason,
    })
    return false
  }

  context.beginStructuralPanelReleaseDeferral(structuralBridge.panelDeferral)
  context.structuralEditController.markUrgentPainting(structuralTransactionIdentity)

  // --- 3. Manage Sessions ---
  const flushStartedAt = startWysiwygPerfSpan()
  const inlineSetupStartedAt = startWysiwygPerfSpan()
  inlineStarted = context.startInlineEditAfterOptimisticStructuralChange(
    pending.newNodeId,
    0,
    optimistic.paginated,
    optimistic.newFragment.pageIndex,
    optimisticLayout.doc,
    newText,
  )
  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", inlineSetupStartedAt, {
    nodeId: pending.newNodeId,
    previousNodeId: pending.sourceNodeId,
    sourceNodeId: pending.sourceNodeId,
    pageIndex: optimistic.newFragment.pageIndex,
    action: "inline-edit-session-setup",
    operation: "split",
    active: inlineStarted,
  })

  const textSessionSetupStartedAt = startWysiwygPerfSpan()
  textSessionStarted = context.startPlainWysiwygTextSessionFromText({
    nodeId: pending.newNodeId,
    text: newText,
    caretOffset: 0,
    pageIndex: optimistic.newFragment.pageIndex,
  })
  if (textSessionStarted) {
    context.beginWysiwygDraftRuntimeSession(createStructuralDraftSessionPlan({
      transaction: structuralTransaction,
      nodeId: pending.newNodeId,
      textLength: newText.length,
      caretIndex: 0,
    }))
  }
  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", textSessionSetupStartedAt, {
    nodeId: pending.newNodeId,
    previousNodeId: pending.sourceNodeId,
    sourceNodeId: pending.sourceNodeId,
    pageIndex: optimistic.newFragment.pageIndex,
    textLength: newText.length,
    action: "text-session-setup",
    operation: "split",
    active: textSessionStarted,
  })

  // --- 4. Render Optimistic Island ---
  const islandOverrideStartedAt = startWysiwygPerfSpan()
  context.setOptimisticStructuralIslandOverride({
    nodeId: pending.newNodeId,
    paragraph: newParagraph,
    fragment: optimistic.newFragment,
    pageKey,
    pages: optimistic.paginated.sections.flatMap((section: any) => section.pages),
    mode: optimistic.mode,
    suppressedPageBreakNodeId,
  })
  context.setOptimisticStructuralRefocusPaint({ nodeId: pending.newNodeId, startedAt: pending.startedAt })
  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", islandOverrideStartedAt, {
    nodeId: pending.newNodeId,
    previousNodeId: pending.sourceNodeId,
    sourceNodeId: pending.sourceNodeId,
    pageIndex: optimistic.newFragment.pageIndex,
    action: "island-override-setup",
    operation: "split",
    boundarySafeMode: optimistic.mode === "boundary-safe",
    suppressedPageBreakNodeId,
    active: true,
  })

  if (!inlineStarted) return failAfterStructuralTransactionBegin("split-inline-session-setup-failed")
  if (!textSessionStarted) return failAfterStructuralTransactionBegin("split-text-session-setup-failed")

  // --- 5. Dispatch Mutation ---
  context.dispatchEditorAction({ type: "SET_PAGINATED", paginated: optimistic.paginated })
  const operationAction = { ...plan.operation.action, isOptimistic: true }
  setTimeout(() => {
    const dispatchStartedAt = startWysiwygPerfSpan()
    context.dispatchEditorAction(operationAction)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", dispatchStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      action: "dispatch",
      operation: "split",
      commandType: "SPLIT_PARAGRAPH",
      active: true,
    })
    splitDispatched = true
    
    context.structuralEditController.markSplitCommitted(structuralTransactionIdentity, pending.newNodeId)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", flushStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      action: "flush-sync-transition",
      operation: "split",
      active: inlineStarted && textSessionStarted && splitDispatched,
      optimisticMode: optimistic.mode,
    })

    context.endRichWysiwygDraftSession()

    // --- 6. Finalize Telemetry ---
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt: pending.startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - pending.startedAt),
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      source: "optimistic-prestarted",
      action: "prestarted",
      active: true,
      usedFullPaginationBeforeIsland: false,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })

    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "structural-operation-handler-execute", handlerStartedAt, {
      operation: "split",
      status: "success",
    })
  }, 0)

  return true
}

export function executeParagraphMergeOperationPlan(
  plan: ParagraphMergeOperationPlan,
  context: StructuralExecutionContext,
): boolean {
  if (plan.status !== "success") return false

  const optimisticLayout = plan.optimisticLayout
  const optimistic = {
    paginated: optimisticLayout.paginated,
    mergedFragment: plan.mergedFragment,
    mode: plan.mode ?? "same-page",
    overflowedPage: plan.overflowedPage ?? false,
  }

  const previousPaginated = context.getPaginatedRef()
  const previousOptimisticLayout = context.getOptimisticLayoutRef()
  const previousStructuralSettle = context.getOptimisticStructuralSettleRef()
  const previousStructuralPreviewGraceUntil = context.getOptimisticStructuralPreviewSettleGraceUntilRef()
  
  const pending: PendingOptimisticMergeRefocus = {
    currentNodeId: plan.sourceNodeId,
    previousNodeId: plan.previousNodeId,
    currentFragment: plan.sourceFragment!,
    previousFragment: plan.previousFragment!,
    startedAt: plan.perf!.startedAt,
    prestarted: true,
  }

  context.setPendingOptimisticMergeRefocus(pending)
  context.setOptimisticStructuralSettleRef(null)
  context.setOptimisticStructuralPreviewSettleGraceUntilRef(startWysiwygPerfSpan() + OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS)
  context.setPaginatedRef(optimistic.paginated)
  context.setOptimisticLayoutRef({ doc: optimisticLayout.doc, paginated: optimistic.paginated })
  context.setSuppressNextLayoutLoadingOverlayRef(true)

  let inlineStarted = false
  let textSessionStarted = false
  let mergeDispatched = false

  const structuralBridge = context.structuralEditController.beginMerge({
    currentNodeId: plan.sourceNodeId,
    previousNodeId: plan.previousNodeId,
    pageIndex: optimistic.mergedFragment.pageIndex,
    startedAt: plan.perf!.startedAt,
  })
  const structuralTransaction = structuralBridge.transaction
  const structuralTransactionIdentity = structuralBridge.identity
  
  context.beginStructuralPanelReleaseDeferral(structuralBridge.panelDeferral)
  context.structuralEditController.markUrgentPainting(structuralTransactionIdentity)
  
  const flushStartedAt = startWysiwygPerfSpan()
  flushSync(() => {
    const inlineSetupStartedAt = startWysiwygPerfSpan()
    const caretIndex = plan.operation.action.type === "MERGE_PARAGRAPH" && plan.operation.action.precomputed ? plan.operation.action.precomputed.caretIndex : 0
    inlineStarted = context.startInlineEditAfterOptimisticStructuralChange(
      plan.previousNodeId,
      caretIndex,
      optimistic.paginated,
      optimistic.mergedFragment.pageIndex,
      optimisticLayout.doc,
      plan.mergedText,
    )
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", inlineSetupStartedAt, {
      nodeId: plan.previousNodeId,
      previousNodeId: plan.sourceNodeId,
      sourceNodeId: plan.sourceNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      action: "inline-edit-session-setup",
      operation: "merge",
      active: inlineStarted,
    })
    
    const textSessionSetupStartedAt = startWysiwygPerfSpan()
    textSessionStarted = context.startPlainWysiwygTextSessionFromText({
      nodeId: plan.previousNodeId,
      text: plan.mergedText,
      caretOffset: caretIndex,
      pageIndex: optimistic.mergedFragment.pageIndex,
    })
    if (textSessionStarted) {
      context.beginWysiwygDraftRuntimeSession(createStructuralDraftSessionPlan({
        transaction: structuralTransaction,
        nodeId: plan.previousNodeId,
        textLength: plan.mergedText.length,
        caretIndex,
      }))
    }
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", textSessionSetupStartedAt, {
      nodeId: plan.previousNodeId,
      previousNodeId: plan.sourceNodeId,
      sourceNodeId: plan.sourceNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      textLength: plan.mergedText.length,
      action: "text-session-setup",
      operation: "merge",
      active: textSessionStarted,
    })
    
    const islandOverrideStartedAt = startWysiwygPerfSpan()
    context.setOptimisticStructuralIslandOverride({
      nodeId: plan.previousNodeId,
      paragraph: plan.previousParagraph,
      fragment: optimistic.mergedFragment,
      pageKey: plan.pageKey,
      pages: optimistic.paginated.sections.flatMap((section: any) => section.pages),
      mode: optimistic.mode,
      settleRemovedNodeId: plan.sourceNodeId,
    })
    context.setOptimisticStructuralRefocusPaint({ nodeId: plan.previousNodeId, startedAt: plan.perf!.startedAt })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", islandOverrideStartedAt, {
      nodeId: plan.previousNodeId,
      previousNodeId: plan.sourceNodeId,
      sourceNodeId: plan.sourceNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      action: "island-override-setup",
      operation: "merge",
      boundarySafeMode: optimistic.mode === "boundary-safe",
      active: true,
    })
  })

  if (!inlineStarted || !textSessionStarted) {
    context.abortStructuralEditTransactionAndPanelDeferral(
      structuralTransactionIdentity,
      !inlineStarted ? "merge-inline-session-setup-failed" : "merge-text-session-setup-failed"
    )
    context.setPendingOptimisticMergeRefocus(null)
    context.setOptimisticStructuralSettleRef(previousStructuralSettle)
    context.setOptimisticStructuralPreviewSettleGraceUntilRef(previousStructuralPreviewGraceUntil)
    context.setPaginatedRef(previousPaginated)
    context.setOptimisticLayoutRef(previousOptimisticLayout)
    context.clearWysiwygDraftPagination()
    context.endWysiwygTextSession()
    return false
  }

  const operationAction = { ...plan.operation.action, isOptimistic: true }
  setTimeout(() => {
    const dispatchStartedAt = startWysiwygPerfSpan()
    context.dispatchEditorAction(operationAction)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", dispatchStartedAt, {
      nodeId: plan.previousNodeId,
      previousNodeId: plan.sourceNodeId,
      sourceNodeId: plan.sourceNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      action: "dispatch",
      operation: "merge",
      commandType: "MERGE_PARAGRAPH",
      active: true,
    })
    mergeDispatched = true

    context.structuralEditController.markMergeCommitted(structuralTransactionIdentity, {
      removedNodeId: plan.sourceNodeId,
      committedNodeId: plan.previousNodeId,
    })

    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", flushStartedAt, {
      nodeId: plan.previousNodeId,
      previousNodeId: plan.sourceNodeId,
      sourceNodeId: plan.sourceNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      action: "flush-sync-transition",
      operation: "merge",
      active: inlineStarted && textSessionStarted && mergeDispatched,
      optimisticMode: optimistic.mode,
    })
    
    context.endRichWysiwygDraftSession()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt: plan.perf!.startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - plan.perf!.startedAt),
      nodeId: plan.previousNodeId,
      previousNodeId: plan.sourceNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      source: "optimistic-prestarted",
      action: "prestarted",
      active: true,
      usedFullPaginationBeforeIsland: false,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "structural-operation-handler-execute", plan.perf!.startedAt, {
      operation: "merge",
      status: "success",
    })
  }, 0)
  
  return true
}

