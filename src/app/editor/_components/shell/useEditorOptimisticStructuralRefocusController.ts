import { useCallback, useLayoutEffect, useRef } from "react"
import { flushSync } from "react-dom"
import type { TextMeasurer } from "@/layout"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import {
  createParagraphNode,
  isTextRunOnlyParagraph,
  mergeParagraphWithPrevious,
  splitParagraphAtIndex,
} from "@/document"
import type { OptimisticLayoutSnapshot } from "../layoutReconciliation"
import {
  createOptimisticMergeRefocusPaginated,
  createOptimisticSplitRefocusPaginated,
} from "../optimisticStructuralRefocus"
import {
  createParagraphMergeOperationPlan,
  createParagraphSplitOperationPlan,
} from "../operations/editorStructuralOperationPlans"
import type { StructuralEditController } from "../structuralEdit/structuralEditBridgeTypes"
import { createStructuralDraftSessionPlan } from "../structuralEdit/structuralEditPlans"
import type { StructuralPreviewSettleSnapshot } from "../structuralEdit/previewSettleBridge"
import {
  resolveStructuralParagraphEligibility,
  resolveStructuralResultParagraph,
  resolveStructuralSourceDocument,
  summarizeStructuralOptimisticPaginatedForPerf,
} from "../structuralEdit/structuralEditPreparationPlans"
import {
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import {
  finishWysiwygPerfSpan,
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
} from "../wysiwygPerformance"
import {
  findWysiwygTextEngineFragment,
  isParagraphInsideFlowStack,
  isParagraphInsideRowStack,
  isParagraphInsideTableCell,
  isWysiwygTextEngineFragmentEligible,
} from "../wysiwygTextEligibility"
import type { EditorAction } from "../editorReducer"
import {
  findImmediatePageBreakSiblingAfterNode,
  getParagraphFromDoc,
} from "./editorDocumentLookup"
import type { EditorPageNavigationIndex } from "./editorCanvasNavigation"
import { OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS } from "./editorShellConstants"
import type {
  OptimisticStructuralIslandOverride,
  OptimisticStructuralRefocusPaint,
  PendingOptimisticMergeRefocus,
  PendingOptimisticSplitRefocus,
  SplitParagraphHistory,
} from "./editorShellTypes"

type MutableCurrentRef<T> = {
  current: T
}

type StartPlainWysiwygTextSessionFromText = (input: {
  nodeId: string
  text: string
  caretOffset?: number | null
  pageIndex?: number | null
}) => boolean

type BeginWysiwygDraftRuntimeSession = (input: ReturnType<typeof createStructuralDraftSessionPlan>) => unknown

export function useEditorOptimisticStructuralRefocusController({
  abortStructuralEditTransactionAndPanelDeferral,
  beginStructuralPanelReleaseDeferral,
  beginWysiwygDraftRuntimeSession,
  clearWysiwygDraftPagination,
  consumeInlineEditHistory,
  dispatch,
  dispatchEditorAction,
  displayPaginated,
  docRef,
  editorPageNavigation,
  editorTextMeasurer,
  endRichWysiwygDraftSession,
  endWysiwygTextSession,
  inlineEditPageIndexRef,
  listExitNodeId,
  listLevelChangeResult,
  mergeResult,
  moveWysiwygTextCaret,
  optimisticLayoutRef,
  optimisticStructuralIslandOverride,
  paginatedRef,
  setOptimisticStructuralIslandOverride,
  setOptimisticStructuralRefocusPaint,
  startInlineEditAfterOptimisticStructuralChange,
  startInlineEditAfterStructuralChange,
  startPlainWysiwygTextSessionFromText,
  startWysiwygTextSession,
  structuralEditController,
  suppressNextLayoutLoadingOverlayRef,
  wysiwygTextSessionStateRef,
  lastSplitNodeId,
}: {
  abortStructuralEditTransactionAndPanelDeferral: (identity: Parameters<StructuralEditController["markUrgentPainting"]>[0], reason: string) => void
  beginStructuralPanelReleaseDeferral: (plan: ReturnType<StructuralEditController["beginSplit"]>["panelDeferral"]) => unknown
  beginWysiwygDraftRuntimeSession: BeginWysiwygDraftRuntimeSession
  clearWysiwygDraftPagination: () => void
  consumeInlineEditHistory: (nodeId: string) => SplitParagraphHistory
  dispatch: (action: EditorAction) => void
  dispatchEditorAction: (action: EditorAction) => void
  displayPaginated: PaginatedDocument
  docRef: MutableCurrentRef<DocumentNode>
  editorPageNavigation: EditorPageNavigationIndex
  editorTextMeasurer: TextMeasurer
  endRichWysiwygDraftSession: () => void
  endWysiwygTextSession: () => void
  inlineEditPageIndexRef: MutableCurrentRef<number | null>
  listExitNodeId: string | null
  listLevelChangeResult: { nodeId: string; caretIndex: number | null } | null
  mergeResult: { prevNodeId: string; caretIndex: number } | null
  moveWysiwygTextCaret: (caretIndex: number | null) => void
  optimisticLayoutRef: MutableCurrentRef<OptimisticLayoutSnapshot | null>
  optimisticStructuralIslandOverride: OptimisticStructuralIslandOverride | null
  paginatedRef: MutableCurrentRef<PaginatedDocument>
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
  startInlineEditAfterStructuralChange: (nodeId: string, caretIndex: number | null) => PaginatedDocument | null
  startPlainWysiwygTextSessionFromText: StartPlainWysiwygTextSessionFromText
  startWysiwygTextSession: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => unknown
  structuralEditController: StructuralEditController
  suppressNextLayoutLoadingOverlayRef: MutableCurrentRef<boolean>
  wysiwygTextSessionStateRef: MutableCurrentRef<{ nodeId: string | null }>
  lastSplitNodeId: string | null
}) {
  const pendingOptimisticSplitRefocusRef = useRef<PendingOptimisticSplitRefocus | null>(null)
  const pendingOptimisticMergeRefocusRef = useRef<PendingOptimisticMergeRefocus | null>(null)
  const optimisticStructuralSettleRef = useRef<(PendingOptimisticSplitRefocus & StructuralPreviewSettleSnapshot) | null>(null)
  const optimisticStructuralPreviewSettleGraceUntilRef = useRef(0)

  const prepareOptimisticSplitRefocus = useCallback((nodeId: string): PendingOptimisticSplitRefocus | null => {
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return null
    if (wysiwygTextSessionStateRef.current.nodeId !== nodeId) return null
    const doc = docRef.current
    if (!resolveStructuralParagraphEligibility({ doc, nodeId }).eligible) return null
    const activeFragment = findWysiwygTextEngineFragment(displayPaginated, nodeId, inlineEditPageIndexRef.current)
      ?? findWysiwygTextEngineFragment(displayPaginated, nodeId, null)
    if (
      !activeFragment ||
      activeFragment.nodeType !== "paragraph" ||
      activeFragment.continuesFrom ||
      activeFragment.isContinued ||
      activeFragment.listMarker
    ) return null
    const pageKey = editorPageNavigation.pageKeyByPageIndex.get(activeFragment.pageIndex) ?? null
    if (!pageKey) return null

    const startedAt = startWysiwygPerfSpan()
    const pending: PendingOptimisticSplitRefocus = {
      sourceNodeId: nodeId,
      newNodeId: createParagraphNode("").id,
      sourceFragment: activeFragment,
      startedAt,
      prestarted: false,
    }
    pendingOptimisticSplitRefocusRef.current = pending
    suppressNextLayoutLoadingOverlayRef.current = true
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt,
      durationMs: 0,
      nodeId,
      pageIndex: activeFragment.pageIndex,
      source: "optimistic-prepared",
      action: "prepared",
      active: true,
      usedFullPaginationBeforeIsland: false,
    })
    return pending
  }, [
    displayPaginated,
    docRef,
    editorPageNavigation.pageKeyByPageIndex,
    inlineEditPageIndexRef,
    suppressNextLayoutLoadingOverlayRef,
    wysiwygTextSessionStateRef,
  ])

  const startOptimisticSplitRefocusBeforeDispatch = useCallback((
    pending: PendingOptimisticSplitRefocus,
    splitIndex: number,
    text?: string,
    history?: SplitParagraphHistory,
  ): boolean => {
    const totalStartedAt = startWysiwygPerfSpan()
    const plan = createParagraphSplitOperationPlan({
      doc: docRef.current,
      displayPaginated,
      nodeId: pending.sourceNodeId,
      splitIndex,
      text,
      history,
      newNodeId: pending.newNodeId,
      wysiwygTextSessionStateNodeId: wysiwygTextSessionStateRef.current.nodeId,
      inlineEditPageIndex: inlineEditPageIndexRef.current,
      editorPageNavigation,
      editorTextMeasurer,
    })

    if (
      plan.status !== "success" ||
      !plan.optimisticLayout ||
      !plan.optimisticFragment ||
      !plan.newParagraph ||
      !plan.newText ||
      !plan.pageKey ||
      !plan.operation
    ) {
      return false
    }

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

    pending.prestarted = true
    pendingOptimisticSplitRefocusRef.current = pending
    paginatedRef.current = optimisticLayout.paginated
    optimisticLayoutRef.current = optimisticLayout
    optimisticStructuralSettleRef.current = { ...pending, newNodeId: newNodeId! }
    optimisticStructuralPreviewSettleGraceUntilRef.current = startWysiwygPerfSpan() + OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS
    suppressNextLayoutLoadingOverlayRef.current = true

    const optimistic = {
      paginated: optimisticLayout.paginated,
      newFragment: optimisticFragment,
      mode: mode ?? "same-page",
      overflowedPage: overflowedPage ?? false,
    }

    let inlineStarted = false
    let textSessionStarted = false
    let splitDispatched = false
    const structuralBridge = structuralEditController.beginSplit({
      sourceNodeId: pending.sourceNodeId,
      newNodeId: pending.newNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      suppressedPageBreakNodeId,
      startedAt: pending.startedAt,
    })
    const structuralTransaction = structuralBridge.transaction
    const structuralTransactionIdentity = structuralBridge.identity
    const failAfterStructuralTransactionBegin = (reason: string) => {
      abortStructuralEditTransactionAndPanelDeferral(structuralTransactionIdentity, reason)
      return false
    }
    beginStructuralPanelReleaseDeferral(structuralBridge.panelDeferral)
    structuralEditController.markUrgentPainting(structuralTransactionIdentity)
    const flushStartedAt = startWysiwygPerfSpan()
    const inlineSetupStartedAt = startWysiwygPerfSpan()
    inlineStarted = startInlineEditAfterOptimisticStructuralChange(
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
    textSessionStarted = startPlainWysiwygTextSessionFromText({
      nodeId: pending.newNodeId,
      text: newText,
      caretOffset: 0,
      pageIndex: optimistic.newFragment.pageIndex,
    })
    if (textSessionStarted) {
      beginWysiwygDraftRuntimeSession(createStructuralDraftSessionPlan({
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
    const islandOverrideStartedAt = startWysiwygPerfSpan()
    setOptimisticStructuralIslandOverride({
      nodeId: pending.newNodeId,
      paragraph: newParagraph,
      fragment: optimistic.newFragment,
      pageKey,
      pages: optimistic.paginated.sections.flatMap((section) => section.pages),
      mode: optimistic.mode,
      suppressedPageBreakNodeId,
    })
    setOptimisticStructuralRefocusPaint({ nodeId: pending.newNodeId, startedAt: pending.startedAt })
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

    const dispatchStartedAt = startWysiwygPerfSpan()
    dispatchEditorAction(plan.operation.action)
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

    structuralEditController.markSplitCommitted(structuralTransactionIdentity, pending.newNodeId)
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
    if (!inlineStarted) return failAfterStructuralTransactionBegin("split-inline-session-setup-failed")
    if (!textSessionStarted) return failAfterStructuralTransactionBegin("split-text-session-setup-failed")
    if (!splitDispatched) return failAfterStructuralTransactionBegin("split-dispatch-failed")
    endRichWysiwygDraftSession()
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
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", totalStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      action: "total",
      operation: "split",
      active: true,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    return true
  }, [
    abortStructuralEditTransactionAndPanelDeferral,
    beginStructuralPanelReleaseDeferral,
    beginWysiwygDraftRuntimeSession,
    dispatchEditorAction,
    docRef,
    editorPageNavigation.pageKeyByPageIndex,
    editorTextMeasurer,
    endRichWysiwygDraftSession,
    optimisticLayoutRef,
    paginatedRef,
    setOptimisticStructuralIslandOverride,
    setOptimisticStructuralRefocusPaint,
    startInlineEditAfterOptimisticStructuralChange,
    startPlainWysiwygTextSessionFromText,
    structuralEditController,
    suppressNextLayoutLoadingOverlayRef,
  ])

  const startOptimisticMergeRefocusBeforeDispatch = useCallback((
    nodeId: string,
    text: string | undefined,
    history: SplitParagraphHistory,
    sourceDocOverride?: DocumentNode | null,
  ): boolean => {
    const baseDoc = sourceDocOverride ?? docRef.current

    const plan = createParagraphMergeOperationPlan({
      doc: baseDoc,
      displayPaginated: paginatedRef.current,
      nodeId,
      text,
      history,
      wysiwygTextSessionStateNodeId: wysiwygTextSessionStateRef.current.nodeId,
      inlineEditPageIndex: inlineEditPageIndexRef.current,
      editorPageNavigation,
      editorTextMeasurer,
      optimisticStructuralIslandOverride,
    })

    if (plan.status !== "success") {
      return false
    }

    const optimisticLayout = plan.optimisticLayout
    const optimistic = {
      paginated: optimisticLayout.paginated,
      mergedFragment: plan.mergedFragment,
      mode: plan.mode ?? "same-page",
      overflowedPage: plan.overflowedPage ?? false,
    }

    const previousPaginated = paginatedRef.current
    const previousOptimisticLayout = optimisticLayoutRef.current
    const previousStructuralSettle = optimisticStructuralSettleRef.current
    const previousStructuralPreviewGraceUntil = optimisticStructuralPreviewSettleGraceUntilRef.current
    const pending: PendingOptimisticMergeRefocus = {
      currentNodeId: plan.sourceNodeId,
      previousNodeId: plan.previousNodeId,
      currentFragment: plan.sourceFragment!,
      previousFragment: plan.previousFragment!,
      startedAt: plan.perf!.startedAt,
      prestarted: true,
    }

    pendingOptimisticMergeRefocusRef.current = pending
    optimisticStructuralSettleRef.current = null
    optimisticStructuralPreviewSettleGraceUntilRef.current = startWysiwygPerfSpan() + OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS
    paginatedRef.current = optimistic.paginated
    optimisticLayoutRef.current = { doc: optimisticLayout.doc, paginated: optimistic.paginated }
    suppressNextLayoutLoadingOverlayRef.current = true

    let inlineStarted = false
    let textSessionStarted = false
    let mergeDispatched = false
    const structuralBridge = structuralEditController.beginMerge({
      currentNodeId: plan.sourceNodeId,
      previousNodeId: plan.previousNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      startedAt: plan.perf!.startedAt,
    })
    const structuralTransaction = structuralBridge.transaction
    const structuralTransactionIdentity = structuralBridge.identity
    beginStructuralPanelReleaseDeferral(structuralBridge.panelDeferral)
    structuralEditController.markUrgentPainting(structuralTransactionIdentity)
    const flushStartedAt = startWysiwygPerfSpan()
    flushSync(() => {
      const inlineSetupStartedAt = startWysiwygPerfSpan()
    inlineStarted = startInlineEditAfterOptimisticStructuralChange(
      plan.previousNodeId,
      plan.operation.action.type === "MERGE_PARAGRAPH" && plan.operation.action.precomputed ? plan.operation.action.precomputed.caretIndex : 0,
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
    textSessionStarted = startPlainWysiwygTextSessionFromText({
      nodeId: plan.previousNodeId,
      text: plan.mergedText,
      caretOffset: plan.operation.action.type === "MERGE_PARAGRAPH" && plan.operation.action.precomputed ? plan.operation.action.precomputed.caretIndex : 0,
      pageIndex: optimistic.mergedFragment.pageIndex,
    })
      if (textSessionStarted) {
      beginWysiwygDraftRuntimeSession(createStructuralDraftSessionPlan({
        transaction: structuralTransaction,
        nodeId: plan.previousNodeId,
        textLength: plan.mergedText.length,
        caretIndex: plan.operation.action.type === "MERGE_PARAGRAPH" && plan.operation.action.precomputed ? plan.operation.action.precomputed.caretIndex : 0,
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
    setOptimisticStructuralIslandOverride({
      nodeId: plan.previousNodeId,
      paragraph: plan.previousParagraph,
      fragment: optimistic.mergedFragment,
      pageKey: plan.pageKey,
      pages: optimistic.paginated.sections.flatMap((section) => section.pages),
      mode: optimistic.mode,
      settleRemovedNodeId: plan.sourceNodeId,
    })
    setOptimisticStructuralRefocusPaint({ nodeId: plan.previousNodeId, startedAt: plan.perf!.startedAt })
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
      abortStructuralEditTransactionAndPanelDeferral(
        structuralTransactionIdentity,
        !inlineStarted
          ? "merge-inline-session-setup-failed"
          : "merge-text-session-setup-failed"
      )
      pendingOptimisticMergeRefocusRef.current = null
      optimisticStructuralSettleRef.current = previousStructuralSettle
      optimisticStructuralPreviewSettleGraceUntilRef.current = previousStructuralPreviewGraceUntil
      paginatedRef.current = previousPaginated
      optimisticLayoutRef.current = previousOptimisticLayout
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return false
    }

    const dispatchStartedAt = startWysiwygPerfSpan()
    dispatchEditorAction(plan.operation.action)
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

    structuralEditController.markMergeCommitted(structuralTransactionIdentity, {
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
    if (!inlineStarted || !textSessionStarted || !mergeDispatched) {
      abortStructuralEditTransactionAndPanelDeferral(
        structuralTransactionIdentity,
        !inlineStarted
          ? "merge-inline-session-setup-failed"
          : !textSessionStarted
          ? "merge-text-session-setup-failed"
          : "merge-dispatch-failed",
      )
      pendingOptimisticMergeRefocusRef.current = null
      optimisticStructuralSettleRef.current = previousStructuralSettle
      optimisticStructuralPreviewSettleGraceUntilRef.current = previousStructuralPreviewGraceUntil
      paginatedRef.current = previousPaginated
      optimisticLayoutRef.current = previousOptimisticLayout
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return false
    }
    endRichWysiwygDraftSession()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt: plan.perf!.startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - plan.perf!.startedAt),
      nodeId: plan.previousNodeId,
      previousNodeId: plan.sourceNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      source: "optimistic-merge-prestarted",
      action: "merge-prestarted",
      active: true,
      usedFullPaginationBeforeIsland: false,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", plan.perf!.startedAt, {
      nodeId: plan.previousNodeId,
      previousNodeId: plan.sourceNodeId,
      sourceNodeId: plan.sourceNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      action: "total",
      operation: "merge",
      active: true,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    return true
  }, [
    abortStructuralEditTransactionAndPanelDeferral,
    beginStructuralPanelReleaseDeferral,
    beginWysiwygDraftRuntimeSession,
    clearWysiwygDraftPagination,
    dispatchEditorAction,
    docRef,
    editorPageNavigation.pageKeyByPageIndex,
    editorTextMeasurer,
    endRichWysiwygDraftSession,
    endWysiwygTextSession,
    inlineEditPageIndexRef,
    optimisticLayoutRef,
    optimisticStructuralIslandOverride,
    paginatedRef,
    setOptimisticStructuralIslandOverride,
    setOptimisticStructuralRefocusPaint,
    startInlineEditAfterOptimisticStructuralChange,
    startPlainWysiwygTextSessionFromText,
    structuralEditController,
    suppressNextLayoutLoadingOverlayRef,
  ])

  const handleSplitParagraph = useCallback((nodeId: string, splitIndex: number, text?: string) => {
    const history = consumeInlineEditHistory(nodeId)
    const optimisticPending = prepareOptimisticSplitRefocus(nodeId)
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
    }
    const optimisticStarted = optimisticPending
      ? startOptimisticSplitRefocusBeforeDispatch(optimisticPending, splitIndex, text, history)
      : false
    if (!optimisticPending || !optimisticStarted) {
      pendingOptimisticSplitRefocusRef.current = optimisticPending
    }
    if (optimisticStarted) return
    dispatchEditorAction({
      type: "SPLIT_PARAGRAPH",
      nodeId,
      splitIndex,
      text,
      history,
      newNodeId: optimisticPending?.newNodeId,
    })
  }, [
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    dispatchEditorAction,
    endWysiwygTextSession,
    prepareOptimisticSplitRefocus,
    startOptimisticSplitRefocusBeforeDispatch,
    wysiwygTextSessionStateRef,
  ])

  const handleMergeParagraph = useCallback((nodeId: string, text?: string) => {
    const history = consumeInlineEditHistory(nodeId)
    const canTryOptimisticMerge = WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId
    const pendingSplit = pendingOptimisticSplitRefocusRef.current
    const pendingSplitDoc = canTryOptimisticMerge &&
      pendingSplit?.prestarted &&
      pendingSplit.newNodeId === nodeId
      ? optimisticLayoutRef.current?.doc ?? null
      : null
    const currentDocContainsNode = canTryOptimisticMerge && getParagraphFromDoc(docRef.current, nodeId) !== null
    const optimisticLayoutDoc = optimisticLayoutRef.current?.doc ?? null
    const optimisticDocContainingNode = canTryOptimisticMerge &&
      !currentDocContainsNode &&
      optimisticLayoutDoc &&
      getParagraphFromDoc(optimisticLayoutDoc, nodeId) !== null
      ? optimisticLayoutDoc
      : null
    const optimisticMergeSourceDoc = pendingSplitDoc ?? optimisticDocContainingNode
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
    }
    if (canTryOptimisticMerge && startOptimisticMergeRefocusBeforeDispatch(nodeId, text, history, optimisticMergeSourceDoc)) {
      if (pendingSplit?.newNodeId === nodeId) {
        pendingOptimisticSplitRefocusRef.current = null
      }
      return
    }
    pendingOptimisticMergeRefocusRef.current = null
    dispatchEditorAction({ type: "MERGE_PARAGRAPH", nodeId, text, history })
  }, [
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    dispatchEditorAction,
    docRef,
    endWysiwygTextSession,
    optimisticLayoutRef,
    startOptimisticMergeRefocusBeforeDispatch,
    wysiwygTextSessionStateRef,
  ])

  const startInlineEditAfterModelStructuralChange = useCallback((nodeId: string, caretIndex: number | null) => {
    const structuralPaginated = startInlineEditAfterStructuralChange(nodeId, caretIndex)
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return
    if (!structuralPaginated) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return
    }
    paginatedRef.current = structuralPaginated
    if (!isWysiwygTextEngineFragmentEligible({
      doc: docRef.current,
      paginated: structuralPaginated,
      nodeId,
    })) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return
    }
    startWysiwygTextSession(nodeId, caretIndex, null)
  }, [
    clearWysiwygDraftPagination,
    docRef,
    endWysiwygTextSession,
    paginatedRef,
    startInlineEditAfterStructuralChange,
    startWysiwygTextSession,
  ])

  const startOptimisticInlineEditAfterSplit = useCallback((nodeId: string, caretIndex: number | null): boolean => {
    const pending = pendingOptimisticSplitRefocusRef.current
    if (!pending) return false
    if (pending.prestarted && pending.newNodeId === nodeId) {
      pendingOptimisticSplitRefocusRef.current = null
      return true
    }
    pendingOptimisticSplitRefocusRef.current = null
    const startedAt = pending.startedAt
    const optimistic = createOptimisticSplitRefocusPaginated({
      doc: docRef.current,
      paginated: paginatedRef.current,
      sourceNodeId: pending.sourceNodeId,
      newNodeId: nodeId,
      sourceFragment: pending.sourceFragment,
      textMeasurer: editorTextMeasurer,
    })
    if (!optimistic) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "structural-refocus-used-full-pagination-before-island",
        startedAt,
        durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
        nodeId,
        previousNodeId: pending.sourceNodeId,
        pageIndex: pending.sourceFragment.pageIndex,
        source: "optimistic-unavailable-fallback",
        action: "fallback",
        active: false,
        usedFullPaginationBeforeIsland: true,
      })
      return false
    }

    paginatedRef.current = optimistic.paginated
    optimisticLayoutRef.current = { doc: docRef.current, paginated: optimistic.paginated }
    optimisticStructuralSettleRef.current = { ...pending, newNodeId: nodeId }
    suppressNextLayoutLoadingOverlayRef.current = true
    const pageKey = editorPageNavigation.pageKeyByPageIndex.get(optimistic.newFragment.pageIndex) ?? null
    if (!pageKey) return false
    dispatch({ type: "SET_PAGINATED", paginated: optimistic.paginated })
    const sessionStarted = startInlineEditAfterOptimisticStructuralChange(
      nodeId,
      caretIndex,
      optimistic.paginated,
      optimistic.newFragment.pageIndex,
    )
    if (!sessionStarted) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return false
    }
    const fragmentEligible = optimistic.mode === "boundary-safe" || isWysiwygTextEngineFragmentEligible({
      doc: docRef.current,
      paginated: optimistic.paginated,
      nodeId,
      pageIndex: optimistic.newFragment.pageIndex,
    })
    if (!fragmentEligible) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return false
    }
    startWysiwygTextSession(nodeId, caretIndex, optimistic.newFragment.pageIndex)
    const newParagraph = getParagraphFromDoc(docRef.current, nodeId)
    if (newParagraph && isTextRunOnlyParagraph(newParagraph)) {
      const suppressedPageBreakNodeId = optimistic.mode === "boundary-safe"
        ? findImmediatePageBreakSiblingAfterNode(docRef.current, nodeId)
        : null
      setOptimisticStructuralIslandOverride({
        nodeId,
        paragraph: newParagraph,
        fragment: optimistic.newFragment,
        pageKey,
        pages: optimistic.paginated.sections.flatMap((section) => section.pages),
        mode: optimistic.mode,
        suppressedPageBreakNodeId,
      })
    }
    setOptimisticStructuralRefocusPaint({ nodeId, startedAt })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId,
      previousNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      source: "optimistic-started",
      action: "started",
      active: true,
      usedFullPaginationBeforeIsland: false,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    return true
  }, [
    clearWysiwygDraftPagination,
    dispatch,
    docRef,
    editorPageNavigation.pageKeyByPageIndex,
    editorTextMeasurer,
    endWysiwygTextSession,
    optimisticLayoutRef,
    paginatedRef,
    setOptimisticStructuralIslandOverride,
    setOptimisticStructuralRefocusPaint,
    startInlineEditAfterOptimisticStructuralChange,
    startWysiwygTextSession,
    suppressNextLayoutLoadingOverlayRef,
  ])

  const startOptimisticInlineEditAfterMerge = useCallback((nodeId: string, caretIndex: number | null): boolean => {
    const pending = pendingOptimisticMergeRefocusRef.current
    if (!pending) return false
    if (pending.prestarted && pending.previousNodeId === nodeId) {
      pendingOptimisticMergeRefocusRef.current = null
      moveWysiwygTextCaret(caretIndex)
      return true
    }
    pendingOptimisticMergeRefocusRef.current = null
    return false
  }, [moveWysiwygTextCaret])

  useLayoutEffect(() => {
    if (!lastSplitNodeId) return
    const nodeId = lastSplitNodeId
    if (!startOptimisticInlineEditAfterSplit(nodeId, 0)) {
      startInlineEditAfterModelStructuralChange(nodeId, 0)
    }
    dispatch({ type: "CLEAR_SPLIT_NODE_ID" })
  }, [
    dispatch,
    lastSplitNodeId,
    startInlineEditAfterModelStructuralChange,
    startOptimisticInlineEditAfterSplit,
  ])

  useLayoutEffect(() => {
    if (!mergeResult) return
    const nodeId = mergeResult.prevNodeId
    if (!startOptimisticInlineEditAfterMerge(nodeId, mergeResult.caretIndex)) {
      startInlineEditAfterModelStructuralChange(nodeId, mergeResult.caretIndex)
    }
    dispatch({ type: "CLEAR_MERGE_RESULT" })
  }, [
    dispatch,
    mergeResult,
    startInlineEditAfterModelStructuralChange,
    startOptimisticInlineEditAfterMerge,
  ])

  useLayoutEffect(() => {
    if (!listExitNodeId) return
    startInlineEditAfterModelStructuralChange(listExitNodeId, 0)
    dispatch({ type: "CLEAR_LIST_EXIT_NODE_ID" })
  }, [dispatch, listExitNodeId, startInlineEditAfterModelStructuralChange])

  useLayoutEffect(() => {
    if (!listLevelChangeResult) return
    startInlineEditAfterModelStructuralChange(
      listLevelChangeResult.nodeId,
      listLevelChangeResult.caretIndex,
    )
    dispatch({ type: "CLEAR_LIST_LEVEL_CHANGE_RESULT" })
  }, [dispatch, listLevelChangeResult, startInlineEditAfterModelStructuralChange])

  return {
    handleMergeParagraph,
    handleSplitParagraph,
    optimisticStructuralPreviewSettleGraceUntilRef,
    optimisticStructuralSettleRef,
  }
}
