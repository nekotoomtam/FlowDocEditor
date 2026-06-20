import { useCallback, useLayoutEffect, useRef } from "react"
import { flushSync } from "react-dom"
import type { TextMeasurer } from "@/layout"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import {
  createParagraphNode,
  deleteEmptyFlowTableCellParagraph,
} from "@/document"
import type { OptimisticLayoutSnapshot } from "../layoutReconciliation"
import {
  createParagraphMergeOperationPlan,
  createParagraphSplitOperationPlan,
} from "../operations/editorStructuralOperationPlans"
import { executeModelStructuralRefocus } from "../operations/editorStructuralModelRefocus"
import {
  executePostCommitOptimisticMergeRefocus,
  executePostCommitOptimisticSplitRefocus,
} from "../operations/editorStructuralPostCommitRefocus"
import { resolveOptimisticMergeSourceDocument } from "../operations/editorStructuralMergeSource"
import { replaceEditableParagraphTextInDocument } from "../wysiwygTextCommit"
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
} from "../structuralEdit/structuralEditPreparationPlans"
import {
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import {
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
} from "../wysiwygPerformance"
import {
  findWysiwygTextEngineFragment,
} from "../wysiwygTextEligibility"
import type { EditorAction } from "../editorReducer"
import type { EditorOperationEnvelope } from "../operations/editorOperationTypes"
import type { EditorPageNavigationIndex } from "./editorCanvasNavigation"
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
  dispatchEditorOperation,
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
  dispatchEditorOperation: (operation: EditorOperationEnvelope) => void
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
    dispatchEditorOperation,
    endRichWysiwygDraftSession,
    endWysiwygTextSession,
    runSynchronousEditorUpdate: (callback) => flushSync(callback),
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
    activeWysiwygTextSessionNodeId?: string | null,
  ): boolean => {
    const plan = createParagraphSplitOperationPlan({
      doc: docRef.current,
      displayPaginated,
      nodeId: pending.sourceNodeId,
      splitIndex,
      text,
      history,
      newNodeId: pending.newNodeId,
      wysiwygTextSessionStateNodeId: activeWysiwygTextSessionNodeId ?? wysiwygTextSessionStateRef.current.nodeId,
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
    const activeWysiwygTextSessionNodeId = wysiwygTextSessionStateRef.current.nodeId
    if (WYSIWYG_TEXT_ENGINE_ENABLED && activeWysiwygTextSessionNodeId === nodeId) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
    }
    const optimisticStarted = optimisticPending
      ? startOptimisticSplitRefocusBeforeDispatch(
        optimisticPending,
        splitIndex,
        text,
        history,
        activeWysiwygTextSessionNodeId,
      )
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
    const hadActiveWysiwygTextSession = WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId
    const pendingSplit = pendingOptimisticSplitRefocusRef.current
    const optimisticLayoutDoc = optimisticLayoutRef.current?.doc ?? null
    const optimisticMergeSourceDoc = resolveOptimisticMergeSourceDocument({
      canTryOptimisticMerge,
      nodeId,
      currentDoc: docRef.current,
      optimisticLayoutDoc,
      pendingSplitRefocus: pendingSplit,
    })
    if (canTryOptimisticMerge && startOptimisticMergeRefocusBeforeDispatch(nodeId, text, history, optimisticMergeSourceDoc)) {
      if (pendingSplit?.newNodeId === nodeId) {
        pendingOptimisticSplitRefocusRef.current = null
      }
      return
    }
    if (hadActiveWysiwygTextSession) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
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

  const handleDeleteEmptyTableCellParagraph = useCallback((nodeId: string, text?: string): boolean => {
    const sourceDoc = text === undefined
      ? docRef.current
      : replaceEditableParagraphTextInDocument(docRef.current, nodeId, text)
    const result = deleteEmptyFlowTableCellParagraph(sourceDoc, nodeId)
    if (!result) return false
    const history = consumeInlineEditHistory(nodeId)
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
    }
    if (pendingOptimisticSplitRefocusRef.current?.newNodeId === nodeId) {
      pendingOptimisticSplitRefocusRef.current = null
    }
    pendingOptimisticMergeRefocusRef.current = null
    dispatchEditorAction({ type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH", nodeId, text, history })
    return true
  }, [
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    dispatchEditorAction,
    docRef,
    endWysiwygTextSession,
    wysiwygTextSessionStateRef,
  ])

  const startInlineEditAfterModelStructuralChange = useCallback((nodeId: string, caretIndex: number | null) => {
    executeModelStructuralRefocus({
      nodeId,
      caretIndex,
    }, {
      doc: docRef.current,
      startInlineEditAfterStructuralChange,
      setPaginatedRef: (paginated) => {
        paginatedRef.current = paginated
      },
      clearWysiwygDraftPagination,
      endWysiwygTextSession,
      startWysiwygTextSession,
    })
  }, [
    clearWysiwygDraftPagination,
    docRef,
    endWysiwygTextSession,
    paginatedRef,
    startInlineEditAfterStructuralChange,
    startWysiwygTextSession,
  ])

  const startOptimisticInlineEditAfterSplit = useCallback((nodeId: string, caretIndex: number | null): boolean => {
    return executePostCommitOptimisticSplitRefocus({
      nodeId,
      caretIndex,
      pending: pendingOptimisticSplitRefocusRef.current,
    }, {
      doc: docRef.current,
      paginated: paginatedRef.current,
      textMeasurer: editorTextMeasurer,
      pageKeyByPageIndex: editorPageNavigation.pageKeyByPageIndex,
      setPendingOptimisticSplitRefocus: (pending) => {
        pendingOptimisticSplitRefocusRef.current = pending
      },
      setPaginatedRef: (paginated) => {
        paginatedRef.current = paginated
      },
      setOptimisticLayoutRef: (layout) => {
        optimisticLayoutRef.current = layout
      },
      setOptimisticStructuralSettleRef: (settle) => {
        optimisticStructuralSettleRef.current = settle
      },
      setSuppressNextLayoutLoadingOverlayRef: (suppress) => {
        suppressNextLayoutLoadingOverlayRef.current = suppress
      },
      dispatchEditorAction: dispatch,
      startInlineEditAfterOptimisticStructuralChange,
      clearWysiwygDraftPagination,
      endWysiwygTextSession,
      startWysiwygTextSession,
      setOptimisticStructuralIslandOverride: (override) => {
        editorStructuralIslandStore.setState({ optimisticStructuralIslandOverride: override })
      },
      setOptimisticStructuralRefocusPaint: (paint) => {
        editorStructuralIslandStore.setState({ optimisticStructuralRefocusPaint: paint })
      },
    })
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
    return executePostCommitOptimisticMergeRefocus({
      nodeId,
      caretIndex,
      pending: pendingOptimisticMergeRefocusRef.current,
    }, {
      setPendingOptimisticMergeRefocus: (pending) => {
        pendingOptimisticMergeRefocusRef.current = pending
      },
      moveWysiwygTextCaret,
    })
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
    handleDeleteEmptyTableCellParagraph,
    handleMergeParagraph,
    handleSplitParagraph,
    optimisticStructuralPreviewSettleGraceUntilRef,
    optimisticStructuralSettleRef,
  }
}
