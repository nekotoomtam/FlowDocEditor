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
import {
  executeParagraphSplitOperationPlan,
  executeParagraphMergeOperationPlan,
  type StructuralExecutionContext
} from "../operations/editorStructuralHandlers"
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
  PendingOptimisticMergeRefocus,
  PendingOptimisticSplitRefocus,
  SplitParagraphHistory,
} from "./editorShellTypes"

import { useEditorStructuralIslandStore, editorStructuralIslandStore } from "./editorStructuralIslandStore"

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
  paginatedRef,
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
  paginatedRef: MutableCurrentRef<PaginatedDocument>
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
  const { optimisticStructuralIslandOverride } = useEditorStructuralIslandStore()
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

  const getStructuralExecutionContext = (): StructuralExecutionContext => ({
    abortStructuralEditTransactionAndPanelDeferral,
    beginStructuralPanelReleaseDeferral,
    beginWysiwygDraftRuntimeSession,
    clearWysiwygDraftPagination,
    dispatchEditorAction,
    endRichWysiwygDraftSession,
    endWysiwygTextSession,
    setOptimisticStructuralIslandOverride: (override) => {
      if (typeof override === "function") {
        editorStructuralIslandStore.setState({ optimisticStructuralIslandOverride: (override as Function)(editorStructuralIslandStore.getState().optimisticStructuralIslandOverride) })
      } else {
        editorStructuralIslandStore.setState({ optimisticStructuralIslandOverride: override })
      }
    },
    setOptimisticStructuralRefocusPaint: (paint) => {
      if (typeof paint === "function") {
        editorStructuralIslandStore.setState({ optimisticStructuralRefocusPaint: (paint as Function)(editorStructuralIslandStore.getState().optimisticStructuralRefocusPaint) })
      } else {
        editorStructuralIslandStore.setState({ optimisticStructuralRefocusPaint: paint })
      }
    },
    startInlineEditAfterOptimisticStructuralChange,
    startPlainWysiwygTextSessionFromText,
    structuralEditController,
    setPendingOptimisticSplitRefocus: (val: any) => { pendingOptimisticSplitRefocusRef.current = val },
    setPendingOptimisticMergeRefocus: (val: any) => { pendingOptimisticMergeRefocusRef.current = val },
    setPaginatedRef: (val: any) => { paginatedRef.current = val },
    setOptimisticLayoutRef: (val: any) => { optimisticLayoutRef.current = val },
    setOptimisticStructuralSettleRef: (val: any) => { optimisticStructuralSettleRef.current = val },
    setOptimisticStructuralPreviewSettleGraceUntilRef: (val: any) => { optimisticStructuralPreviewSettleGraceUntilRef.current = val },
    setSuppressNextLayoutLoadingOverlayRef: (val: any) => { suppressNextLayoutLoadingOverlayRef.current = val },
    getPaginatedRef: () => paginatedRef.current,
    getOptimisticLayoutRef: () => optimisticLayoutRef.current,
    getOptimisticStructuralSettleRef: () => optimisticStructuralSettleRef.current,
    getOptimisticStructuralPreviewSettleGraceUntilRef: () => optimisticStructuralPreviewSettleGraceUntilRef.current,
  })

  const startOptimisticSplitRefocusBeforeDispatch = useCallback((
    pending: PendingOptimisticSplitRefocus,
    splitIndex: number,
    text?: string,
    history?: SplitParagraphHistory,
  ): boolean => {
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

    if (plan.status !== "success") return false

    return executeParagraphSplitOperationPlan(plan, pending, getStructuralExecutionContext())
  }, [
    displayPaginated,
    docRef,
    editorPageNavigation,
    editorTextMeasurer,
    inlineEditPageIndexRef,
    getStructuralExecutionContext,
    wysiwygTextSessionStateRef,
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

    if (plan.status !== "success") return false

    return executeParagraphMergeOperationPlan(plan, getStructuralExecutionContext())
  }, [
    docRef,
    editorPageNavigation,
    editorTextMeasurer,
    inlineEditPageIndexRef,
    optimisticStructuralIslandOverride,
    paginatedRef,
    getStructuralExecutionContext,
    wysiwygTextSessionStateRef,
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
    // Defer SET_PAGINATED dispatch: let the structuralEditController manage the transaction
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
        editorStructuralIslandStore.setState({
          optimisticStructuralIslandOverride: {
            nodeId,
            paragraph: newParagraph,
            fragment: optimistic.newFragment,
            pageKey,
            pages: optimistic.paginated.sections.flatMap((section) => section.pages),
            mode: optimistic.mode,
            suppressedPageBreakNodeId,
          }
        })
      }
    editorStructuralIslandStore.setState({ optimisticStructuralRefocusPaint: { nodeId, startedAt } })
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
