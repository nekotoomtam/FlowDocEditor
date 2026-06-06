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
    const sourceStartedAt = startWysiwygPerfSpan()
    const source = resolveStructuralSourceDocument({
      doc: docRef.current,
      nodeId: pending.sourceNodeId,
      text,
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", sourceStartedAt, {
      nodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      source: source.textSupplied ? (source.textChanged ? "draft-text-replaced" : "draft-text-unchanged") : "doc-current",
      action: "draft-text-resolve",
      operation: "split",
      active: source.textResolved,
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: sourceStartedAt,
      durationMs: source.currentTextResolveMs,
      nodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      operation: "split",
      source: source.textSupplied ? "draft-text" : "doc-current",
      action: "current-text-resolve",
      active: source.textResolved,
    })
    if (source.textChanged) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-structural-attribution",
        startedAt: sourceStartedAt,
        durationMs: source.replaceDraftTextMs,
        nodeId: pending.sourceNodeId,
        sourceNodeId: pending.sourceNodeId,
        operation: "split",
        source: "draft-text-replaced",
        action: "replace-draft-text",
        active: true,
      })
    }
    const sourceDoc = source.doc
    const splitStartedAt = startWysiwygPerfSpan()
    const result = splitParagraphAtIndex(sourceDoc, pending.sourceNodeId, splitIndex, {
      newNodeId: pending.newNodeId,
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", splitStartedAt, {
      nodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      action: "split-operation",
      operation: "split",
      active: result.newNodeId === pending.newNodeId,
    })
    if (result.newNodeId !== pending.newNodeId) return false
    const paragraphResolveStartedAt = startWysiwygPerfSpan()
    const resultParagraph = resolveStructuralResultParagraph({
      doc: result.doc,
      nodeId: pending.newNodeId,
    })
    if (!resultParagraph.resolved) return false
    const newText = resultParagraph.text
    const newParagraph = resultParagraph.paragraph
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", paragraphResolveStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      action: "paragraph-resolve",
      operation: "split",
      textLength: newText.length,
      active: true,
    })
    const optimisticStartedAt = startWysiwygPerfSpan()
    const optimistic = createOptimisticSplitRefocusPaginated({
      doc: result.doc,
      paginated: paginatedRef.current,
      sourceNodeId: pending.sourceNodeId,
      newNodeId: pending.newNodeId,
      sourceFragment: pending.sourceFragment,
      textMeasurer: editorTextMeasurer,
    })
    const optimisticSummary = summarizeStructuralOptimisticPaginatedForPerf(optimistic?.paginated ?? null)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", optimisticStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: pending.sourceFragment.pageIndex,
      action: "optimistic-pagination",
      operation: "split",
      active: optimistic !== null,
      overflowedPage: optimistic?.overflowedPage,
      optimisticMode: optimistic?.mode,
      boundarySafeMode: optimistic?.mode === "boundary-safe",
      affectedPageIndex: optimistic?.newFragment.pageIndex ?? pending.sourceFragment.pageIndex,
      optimisticFragmentCount: optimisticSummary?.fragmentCount,
      ...(optimisticSummary ?? {}),
    })
    if (!optimistic) return false

    pending.prestarted = true
    pendingOptimisticSplitRefocusRef.current = pending
    paginatedRef.current = optimistic.paginated
    optimisticLayoutRef.current = { doc: result.doc, paginated: optimistic.paginated }
    optimisticStructuralSettleRef.current = { ...pending, newNodeId: pending.newNodeId }
    optimisticStructuralPreviewSettleGraceUntilRef.current = startWysiwygPerfSpan() + OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS
    suppressNextLayoutLoadingOverlayRef.current = true
    const pageKey = editorPageNavigation.pageKeyByPageIndex.get(optimistic.newFragment.pageIndex) ?? null
    if (!pageKey) return false
    const suppressionStartedAt = startWysiwygPerfSpan()
    const suppressedPageBreakNodeId = optimistic.mode === "boundary-safe"
      ? findImmediatePageBreakSiblingAfterNode(result.doc, pending.newNodeId)
      : null
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", suppressionStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      action: "boundary-safe-metadata",
      operation: "split",
      boundarySafeMode: optimistic.mode === "boundary-safe",
      suppressedPageBreakNodeId,
      affectedPageIndex: optimistic.newFragment.pageIndex,
    })
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
    flushSync(() => {
      const inlineSetupStartedAt = startWysiwygPerfSpan()
      inlineStarted = startInlineEditAfterOptimisticStructuralChange(
        pending.newNodeId,
        0,
        optimistic.paginated,
        optimistic.newFragment.pageIndex,
        result.doc,
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
      if (!inlineStarted || !textSessionStarted) return
      const dispatchStartedAt = startWysiwygPerfSpan()
      dispatchEditorAction({
        type: "SPLIT_PARAGRAPH",
        nodeId: pending.sourceNodeId,
        splitIndex,
        text,
        history,
        newNodeId: pending.newNodeId,
        precomputed: {
          doc: result.doc,
          newNodeId: pending.newNodeId,
        },
        precomputedDocValidation: "shell-optimistic-structural",
        paginated: optimistic.paginated,
      })
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
      structuralEditController.markSplitCommitted(structuralTransactionIdentity, pending.newNodeId)
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
    })
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
    const totalStartedAt = startWysiwygPerfSpan()
    const baseDoc = sourceDocOverride ?? docRef.current
    const sourceStartedAt = startWysiwygPerfSpan()
    const source = resolveStructuralSourceDocument({
      doc: baseDoc,
      nodeId,
      text,
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", sourceStartedAt, {
      nodeId,
      sourceNodeId: nodeId,
      source: source.textSupplied ? (source.textChanged ? "draft-text-replaced" : "draft-text-unchanged") : "doc-current",
      action: "draft-text-resolve",
      operation: "merge",
      active: source.textResolved,
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: sourceStartedAt,
      durationMs: source.currentTextResolveMs,
      nodeId,
      sourceNodeId: nodeId,
      operation: "merge",
      source: source.textSupplied ? "draft-text" : "doc-current",
      action: "current-text-resolve",
      active: source.textResolved,
    })
    if (source.textChanged) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-structural-attribution",
        startedAt: sourceStartedAt,
        durationMs: source.replaceDraftTextMs,
        nodeId,
        sourceNodeId: nodeId,
        operation: "merge",
        source: "draft-text-replaced",
        action: "replace-draft-text",
        active: true,
      })
    }
    const sourceDoc = source.doc
    if (!resolveStructuralParagraphEligibility({ doc: sourceDoc, nodeId }).eligible) return false

    const mergeStartedAt = startWysiwygPerfSpan()
    const result = mergeParagraphWithPrevious(sourceDoc, nodeId)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", mergeStartedAt, {
      nodeId,
      sourceNodeId: nodeId,
      action: "merge-operation",
      operation: "merge",
      active: result !== null,
      previousNodeId: result?.prevNodeId,
    })
    if (!result) return false
    if (isParagraphInsideTableCell(sourceDoc, result.prevNodeId)) return false
    if (isParagraphInsideFlowStack(sourceDoc, result.prevNodeId)) return false
    if (isParagraphInsideRowStack(sourceDoc, result.prevNodeId)) return false

    const paragraphResolveStartedAt = startWysiwygPerfSpan()
    const resultParagraph = resolveStructuralResultParagraph({
      doc: result.doc,
      nodeId: result.prevNodeId,
    })
    if (!resultParagraph.resolved) return false
    const previousParagraph = resultParagraph.paragraph
    const mergedText = resultParagraph.text
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", paragraphResolveStartedAt, {
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      sourceNodeId: nodeId,
      action: "paragraph-resolve",
      operation: "merge",
      textLength: mergedText.length,
      active: true,
    })

    const islandOnlyCurrentFragment = optimisticStructuralIslandOverride?.nodeId === nodeId &&
      optimisticStructuralIslandOverride.fragment.nodeType === "paragraph"
      ? optimisticStructuralIslandOverride.fragment
      : null
    const currentFragment = findWysiwygTextEngineFragment(paginatedRef.current, nodeId, inlineEditPageIndexRef.current)
      ?? findWysiwygTextEngineFragment(paginatedRef.current, nodeId, null)
      ?? islandOnlyCurrentFragment
    if (
      !currentFragment ||
      currentFragment.nodeType !== "paragraph" ||
      currentFragment.continuesFrom ||
      currentFragment.isContinued ||
      currentFragment.listMarker
    ) return false
    const previousFragment = findWysiwygTextEngineFragment(paginatedRef.current, result.prevNodeId, currentFragment.pageIndex)
    if (
      !previousFragment ||
      previousFragment.nodeType !== "paragraph" ||
      previousFragment.continuesFrom ||
      previousFragment.isContinued ||
      previousFragment.listMarker
    ) return false

    const optimisticStartedAt = startWysiwygPerfSpan()
    const optimistic = createOptimisticMergeRefocusPaginated({
      doc: result.doc,
      paginated: paginatedRef.current,
      previousNodeId: result.prevNodeId,
      currentNodeId: nodeId,
      previousFragment,
      currentFragment,
      textMeasurer: editorTextMeasurer,
    })
    const optimisticSummary = summarizeStructuralOptimisticPaginatedForPerf(optimistic?.paginated ?? null)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", optimisticStartedAt, {
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      sourceNodeId: nodeId,
      pageIndex: currentFragment.pageIndex,
      action: "optimistic-pagination",
      operation: "merge",
      active: optimistic !== null,
      overflowedPage: optimistic?.overflowedPage,
      optimisticMode: optimistic?.mode,
      boundarySafeMode: optimistic?.mode === "boundary-safe",
      affectedPageIndex: optimistic?.mergedFragment.pageIndex ?? currentFragment.pageIndex,
      optimisticFragmentCount: optimisticSummary?.fragmentCount,
      ...(optimisticSummary ?? {}),
    })
    if (!optimistic) return false

    const startedAt = startWysiwygPerfSpan()
    const previousPaginated = paginatedRef.current
    const previousOptimisticLayout = optimisticLayoutRef.current
    const previousStructuralSettle = optimisticStructuralSettleRef.current
    const previousStructuralPreviewGraceUntil = optimisticStructuralPreviewSettleGraceUntilRef.current
    const pending: PendingOptimisticMergeRefocus = {
      currentNodeId: nodeId,
      previousNodeId: result.prevNodeId,
      currentFragment,
      previousFragment,
      startedAt,
      prestarted: true,
    }
    const pageKey = editorPageNavigation.pageKeyByPageIndex.get(optimistic.mergedFragment.pageIndex) ?? null
    if (!pageKey) return false

    pendingOptimisticMergeRefocusRef.current = pending
    optimisticStructuralSettleRef.current = null
    optimisticStructuralPreviewSettleGraceUntilRef.current = startWysiwygPerfSpan() + OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS
    paginatedRef.current = optimistic.paginated
    optimisticLayoutRef.current = { doc: result.doc, paginated: optimistic.paginated }
    suppressNextLayoutLoadingOverlayRef.current = true

    let inlineStarted = false
    let textSessionStarted = false
    let mergeDispatched = false
    const structuralBridge = structuralEditController.beginMerge({
      currentNodeId: nodeId,
      previousNodeId: result.prevNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      startedAt,
    })
    const structuralTransaction = structuralBridge.transaction
    const structuralTransactionIdentity = structuralBridge.identity
    beginStructuralPanelReleaseDeferral(structuralBridge.panelDeferral)
    structuralEditController.markUrgentPainting(structuralTransactionIdentity)
    const flushStartedAt = startWysiwygPerfSpan()
    flushSync(() => {
      const inlineSetupStartedAt = startWysiwygPerfSpan()
      inlineStarted = startInlineEditAfterOptimisticStructuralChange(
        result.prevNodeId,
        result.caretIndex,
        optimistic.paginated,
        optimistic.mergedFragment.pageIndex,
        result.doc,
        mergedText,
      )
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", inlineSetupStartedAt, {
        nodeId: result.prevNodeId,
        previousNodeId: nodeId,
        sourceNodeId: nodeId,
        pageIndex: optimistic.mergedFragment.pageIndex,
        action: "inline-edit-session-setup",
        operation: "merge",
        active: inlineStarted,
      })
      const textSessionSetupStartedAt = startWysiwygPerfSpan()
      textSessionStarted = startPlainWysiwygTextSessionFromText({
        nodeId: result.prevNodeId,
        text: mergedText,
        caretOffset: result.caretIndex,
        pageIndex: optimistic.mergedFragment.pageIndex,
      })
      if (textSessionStarted) {
        beginWysiwygDraftRuntimeSession(createStructuralDraftSessionPlan({
          transaction: structuralTransaction,
          nodeId: result.prevNodeId,
          textLength: mergedText.length,
          caretIndex: result.caretIndex,
        }))
      }
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", textSessionSetupStartedAt, {
        nodeId: result.prevNodeId,
        previousNodeId: nodeId,
        sourceNodeId: nodeId,
        pageIndex: optimistic.mergedFragment.pageIndex,
        textLength: mergedText.length,
        action: "text-session-setup",
        operation: "merge",
        active: textSessionStarted,
      })
      if (!inlineStarted || !textSessionStarted) return
      const dispatchStartedAt = startWysiwygPerfSpan()
      dispatchEditorAction({
        type: "MERGE_PARAGRAPH",
        nodeId,
        text,
        history,
        precomputed: {
          doc: result.doc,
          prevNodeId: result.prevNodeId,
          caretIndex: result.caretIndex,
        },
        precomputedDocValidation: "shell-optimistic-structural",
        paginated: optimistic.paginated,
      })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", dispatchStartedAt, {
        nodeId: result.prevNodeId,
        previousNodeId: nodeId,
        sourceNodeId: nodeId,
        pageIndex: optimistic.mergedFragment.pageIndex,
        action: "dispatch",
        operation: "merge",
        commandType: "MERGE_PARAGRAPH",
        active: true,
      })
      mergeDispatched = true
      const islandOverrideStartedAt = startWysiwygPerfSpan()
      setOptimisticStructuralIslandOverride({
        nodeId: result.prevNodeId,
        paragraph: previousParagraph,
        fragment: optimistic.mergedFragment,
        pageKey,
        pages: optimistic.paginated.sections.flatMap((section) => section.pages),
        mode: optimistic.mode,
        settleRemovedNodeId: nodeId,
      })
      setOptimisticStructuralRefocusPaint({ nodeId: result.prevNodeId, startedAt })
      structuralEditController.markMergeCommitted(structuralTransactionIdentity, {
        removedNodeId: nodeId,
        committedNodeId: result.prevNodeId,
      })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", islandOverrideStartedAt, {
        nodeId: result.prevNodeId,
        previousNodeId: nodeId,
        sourceNodeId: nodeId,
        pageIndex: optimistic.mergedFragment.pageIndex,
        action: "island-override-setup",
        operation: "merge",
        boundarySafeMode: optimistic.mode === "boundary-safe",
        active: true,
      })
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", flushStartedAt, {
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      sourceNodeId: nodeId,
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
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      source: "optimistic-merge-prestarted",
      action: "merge-prestarted",
      active: true,
      usedFullPaginationBeforeIsland: false,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", totalStartedAt, {
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      sourceNodeId: nodeId,
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
