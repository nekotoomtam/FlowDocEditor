import { useCallback, useEffect, useRef } from "react"
import { assertDocument, getTextRunParagraphText } from "@/document"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import type { OptimisticLayoutSnapshot } from "../layoutReconciliation"
import type { WysiwygRichTextDraftSessionState } from "../richTextDraftSession"
import type { WysiwygDraftRuntime, WysiwygDraftSession, WysiwygDraftSessionIdentity } from "../runtime/wysiwygDraftRuntime"
import type { InlineEditHistoryEntry } from "../useInlineEditSession"
import type { WysiwygTextSessionState } from "../useWysiwygTextSession"
import {
  createWysiwygDraftRuntimeSessionIdentity,
  markTrackedWysiwygDraftRuntimeSessionCommittedBridge,
  markTrackedWysiwygDraftRuntimeSessionCommittingBridge,
} from "../wysiwygDraftRuntimeBridge"
import { flushAllWysiwygDrafts } from "./wysiwygDraftStore"
import {
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_RICH_TEXT_DRAFT_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import {
  finishWysiwygPerfSpan,
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
} from "../wysiwygPerformance"
import { resolveWysiwygDraftPaginationSource, type WysiwygDraftPaginationLatestSnapshot } from "../wysiwygReflow"
import {
  findWysiwygTextEngineFragment,
  isParagraphInsideFlowStack,
  isParagraphInsideRowStack,
  isParagraphInsideTableCell,
  isWysiwygTextEngineFragmentEligible,
} from "../wysiwygTextEligibility"
import {
  replaceEditableParagraphInDocument,
  replaceEditableParagraphTextInDocument,
} from "../wysiwygTextCommit"
import type { EditorAction } from "../editorReducer"
import { getParagraphTextFromDoc } from "./editorDocumentLookup"
import type {
  DeferredInlineEditEnd,
  DeferredInlineEditStart,
  PendingClickAction,
  WysiwygFinalizeMode,
} from "./editorShellTypes"

type MutableCurrentRef<T> = {
  current: T
}

type InlineEditEndReason = "blur" | "keyboard"

import { editorStructuralIslandStore } from "./editorStructuralIslandStore"

export function useEditorInlineEditLifecycleController({
  clearWysiwygDraftPagination,
  consumeInlineEditHistory,
  dispatch,
  displayPaginated,
  docRef,
  editorPageCount,
  editorRootRef,
  endInlineEditSession,
  endWysiwygTextSession,
  finalizeLegacyInlineEditBeforeAction,
  getCurrentWysiwygDraftRuntimeSession,
  inlineEditNodeIdRef,
  inlineEditPageIndex,
  isTemplateMode,
  moveWysiwygTextCaret,
  optimisticLayoutRef,
  paginatePreviewDoc,
  paginatedRef,
  pendingBoundarySafeInlineEditEndRef,
  resetInlineEditStateForDocumentReplace,
  richWysiwygDraftSessionState,
  startInlineEditSession,
  startWysiwygTextSession,
  suppressNextLayoutLoadingOverlayRef,
  wysiwygDraftRuntime,
  wysiwygDraftSessionIdentityRef,
  wysiwygLatestDraftPaginationSnapshotRef,
  wysiwygTextSessionNodeId,
  wysiwygTextSessionStateRef,
}: {
  clearWysiwygDraftPagination: () => void
  consumeInlineEditHistory: (nodeId: string) => InlineEditHistoryEntry | undefined
  dispatch: (action: EditorAction) => void
  displayPaginated: PaginatedDocument
  docRef: MutableCurrentRef<DocumentNode>
  editorPageCount: number
  editorRootRef: MutableCurrentRef<HTMLDivElement | null>
  endInlineEditSession: (nodeId?: string, reason?: InlineEditEndReason) => void
  endWysiwygTextSession: () => void
  finalizeLegacyInlineEditBeforeAction: () => boolean
  getCurrentWysiwygDraftRuntimeSession: (nodeId?: string | null) => WysiwygDraftSession | null
  inlineEditNodeIdRef: MutableCurrentRef<string | null>
  inlineEditPageIndex: number | null
  isTemplateMode: boolean
  moveWysiwygTextCaret: (caretIndex: number | null) => void
  optimisticLayoutRef: MutableCurrentRef<OptimisticLayoutSnapshot | null>
  paginatePreviewDoc: (doc: DocumentNode) => PaginatedDocument
  paginatedRef: MutableCurrentRef<PaginatedDocument>
  pendingBoundarySafeInlineEditEndRef: MutableCurrentRef<DeferredInlineEditEnd | null>
  resetInlineEditStateForDocumentReplace: () => void
  richWysiwygDraftSessionState: WysiwygRichTextDraftSessionState
  startInlineEditSession: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => void
  startWysiwygTextSession: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => unknown
  suppressNextLayoutLoadingOverlayRef: MutableCurrentRef<boolean>
  wysiwygDraftRuntime: WysiwygDraftRuntime
  wysiwygDraftSessionIdentityRef: MutableCurrentRef<WysiwygDraftSessionIdentity | null>
  wysiwygLatestDraftPaginationSnapshotRef: MutableCurrentRef<WysiwygDraftPaginationLatestSnapshot | null>
  wysiwygTextSessionNodeId: string | null
  wysiwygTextSessionStateRef: MutableCurrentRef<WysiwygTextSessionState>
}) {
  const deferredInlineEditStartRef = useRef<DeferredInlineEditStart | null>(null)
  const deferredInlineEditEndRef = useRef<DeferredInlineEditEnd | null>(null)

  const finalizeWysiwygTextSessionBeforeAction = useCallback((mode: WysiwygFinalizeMode = "settled-preview"): boolean => {
    flushAllWysiwygDrafts()
    const useResponsivePreview = mode === "responsive-preview"
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED) {
      const richSession = richWysiwygDraftSessionState
      if (WYSIWYG_TEXT_ENGINE_ENABLED && richSession.nodeId && richSession.draft) {
        const richDraft = richSession.draft
        const draftRuntimeSession = getCurrentWysiwygDraftRuntimeSession(richSession.nodeId)
        const draftRuntimeIdentity = createWysiwygDraftRuntimeSessionIdentity(draftRuntimeSession)
        const finalizeStartedAt = startWysiwygPerfSpan()
        const afterDoc = replaceEditableParagraphInDocument(docRef.current, richSession.nodeId, richDraft.paragraph)
        try {
          assertDocument(afterDoc)
        } catch (error) {
          console.error("WYSIWYG rich text finalize produced invalid document:", error)
          return false
        }
        if (draftRuntimeIdentity) {
          markTrackedWysiwygDraftRuntimeSessionCommittingBridge(
            wysiwygDraftRuntime,
            draftRuntimeIdentity,
            startWysiwygPerfSpan(),
          )
        }
        const draftText = getTextRunParagraphText(richDraft.paragraph) ?? ""
        const responsivePreviewMatchesDraft = useResponsivePreview &&
          optimisticLayoutRef.current?.doc &&
          getParagraphTextFromDoc(optimisticLayoutRef.current.doc, richSession.nodeId) === draftText
        const afterPaginated = responsivePreviewMatchesDraft ? paginatedRef.current : paginatePreviewDoc(afterDoc)
        const history = consumeInlineEditHistory(richSession.nodeId)
        docRef.current = afterDoc
        paginatedRef.current = afterPaginated
        if (responsivePreviewMatchesDraft) suppressNextLayoutLoadingOverlayRef.current = true
        dispatch({
          type: "COMMIT_WYSIWYG_RICH_TEXT_EDIT",
          nodeId: richSession.nodeId,
          paragraph: richDraft.paragraph,
          history,
          afterPaginated,
        })
        if (draftRuntimeIdentity) {
          markTrackedWysiwygDraftRuntimeSessionCommittedBridge(
            wysiwygDraftRuntime,
            wysiwygDraftSessionIdentityRef,
            draftRuntimeIdentity,
            startWysiwygPerfSpan(),
          )
        }
        clearWysiwygDraftPagination()
        endWysiwygTextSession()
        resetInlineEditStateForDocumentReplace()
        finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-finalize", finalizeStartedAt, {
          nodeId: richSession.nodeId,
          textLength: draftText.length,
          source: responsivePreviewMatchesDraft ? mode : "settled-preview",
          richDraft: true,
          ...summarizePaginatedForWysiwygPerf(afterPaginated),
        })
        return true
      }
    }
    const session = wysiwygTextSessionStateRef.current
    if (!WYSIWYG_TEXT_ENGINE_ENABLED || !session.nodeId) return false
    const draftRuntimeSession = getCurrentWysiwygDraftRuntimeSession(session.nodeId)
    const draftRuntimeIdentity = createWysiwygDraftRuntimeSessionIdentity(draftRuntimeSession)
    const finalizeStartedAt = startWysiwygPerfSpan()
    const draftSource = resolveWysiwygDraftPaginationSource({
      nodeId: session.nodeId,
      session,
      latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
    })
    if (!draftSource) return false
    const draftText = draftSource.draftText
    const afterDoc = replaceEditableParagraphTextInDocument(docRef.current, session.nodeId, draftText)
    try {
      assertDocument(afterDoc)
    } catch (error) {
      console.error("WYSIWYG text finalize produced invalid document:", error)
      return false
    }
    if (draftRuntimeIdentity) {
      markTrackedWysiwygDraftRuntimeSessionCommittingBridge(
        wysiwygDraftRuntime,
        draftRuntimeIdentity,
        startWysiwygPerfSpan(),
      )
    }
    const responsivePreviewMatchesDraft = useResponsivePreview &&
      optimisticLayoutRef.current?.doc &&
      getParagraphTextFromDoc(optimisticLayoutRef.current.doc, session.nodeId) === draftText
    const afterPaginated = responsivePreviewMatchesDraft ? paginatedRef.current : paginatePreviewDoc(afterDoc)
    const history = consumeInlineEditHistory(session.nodeId)
    docRef.current = afterDoc
    paginatedRef.current = afterPaginated
    if (responsivePreviewMatchesDraft) suppressNextLayoutLoadingOverlayRef.current = true
    dispatch({
      type: "COMMIT_WYSIWYG_TEXT_EDIT",
      nodeId: session.nodeId,
      text: draftText,
      beforeText: session.baseText,
      history,
      afterPaginated,
    })
    if (draftRuntimeIdentity) {
      markTrackedWysiwygDraftRuntimeSessionCommittedBridge(
        wysiwygDraftRuntime,
        wysiwygDraftSessionIdentityRef,
        draftRuntimeIdentity,
        startWysiwygPerfSpan(),
      )
    }
    clearWysiwygDraftPagination()
    endWysiwygTextSession()
    resetInlineEditStateForDocumentReplace()
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-finalize", finalizeStartedAt, {
      nodeId: session.nodeId,
      textLength: draftText.length,
      source: responsivePreviewMatchesDraft ? mode : "settled-preview",
      draftVersion: draftSource.revision,
      ...summarizePaginatedForWysiwygPerf(afterPaginated),
    })
    return true
  }, [
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    dispatch,
    docRef,
    endWysiwygTextSession,
    getCurrentWysiwygDraftRuntimeSession,
    optimisticLayoutRef,
    paginatePreviewDoc,
    paginatedRef,
    resetInlineEditStateForDocumentReplace,
    richWysiwygDraftSessionState,
    suppressNextLayoutLoadingOverlayRef,
    wysiwygDraftRuntime,
    wysiwygDraftSessionIdentityRef,
    wysiwygLatestDraftPaginationSnapshotRef,
    wysiwygTextSessionStateRef,
  ])

  const finalizeInlineEditBeforeAction = useCallback((mode: WysiwygFinalizeMode = "settled-preview"): boolean => {
    if (finalizeWysiwygTextSessionBeforeAction(mode)) return true
    return finalizeLegacyInlineEditBeforeAction()
  }, [finalizeLegacyInlineEditBeforeAction, finalizeWysiwygTextSessionBeforeAction])

  const finalizeInlineEditBeforeResponsiveAction = useCallback((): boolean => (
    finalizeInlineEditBeforeAction("responsive-preview")
  ), [finalizeInlineEditBeforeAction])

  const finalizeInlineEditBeforeActionRef = useRef(finalizeInlineEditBeforeAction)
  useEffect(() => {
    finalizeInlineEditBeforeActionRef.current = finalizeInlineEditBeforeAction
  }, [finalizeInlineEditBeforeAction])

  const handleInlineEditStart = useCallback((nodeId: string, caretIndex: number | null = null, pageIndex: number | null = null, finalizeMode: WysiwygFinalizeMode = "settled-preview") => {
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionNodeId && wysiwygTextSessionNodeId !== nodeId) {
      finalizeInlineEditBeforeAction(finalizeMode)
    }
    const wasInlineEditingSameNode = inlineEditNodeIdRef.current === nodeId
    startInlineEditSession(nodeId, caretIndex, pageIndex)
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return
    if (!isWysiwygTextEngineFragmentEligible({
      doc: docRef.current,
      paginated: paginatedRef.current,
      nodeId,
      pageIndex,
    })) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return
    }
    const currentWysiwygTextSessionNodeId = wysiwygTextSessionStateRef.current.nodeId ?? wysiwygTextSessionNodeId
    if (currentWysiwygTextSessionNodeId === nodeId && wasInlineEditingSameNode) {
      moveWysiwygTextCaret(caretIndex)
      return
    }
    startWysiwygTextSession(nodeId, caretIndex, pageIndex)
  }, [
    clearWysiwygDraftPagination,
    docRef,
    endWysiwygTextSession,
    finalizeInlineEditBeforeAction,
    inlineEditNodeIdRef,
    moveWysiwygTextCaret,
    paginatedRef,
    startInlineEditSession,
    startWysiwygTextSession,
    wysiwygTextSessionStateRef,
    wysiwygTextSessionNodeId,
  ])

  const cancelDeferredInlineEditStart = useCallback(() => {
    const pending = deferredInlineEditStartRef.current
    if (!pending) return
    if (pending.frameId !== null) window.cancelAnimationFrame(pending.frameId)
    if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId)
    deferredInlineEditStartRef.current = null
  }, [])

  useEffect(() => () => cancelDeferredInlineEditStart(), [cancelDeferredInlineEditStart])

  const cancelDeferredInlineEditEnd = useCallback(() => {
    const pending = deferredInlineEditEndRef.current
    if (!pending) return
    if (pending.frameId !== null) window.cancelAnimationFrame(pending.frameId)
    if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId)
    deferredInlineEditEndRef.current = null
  }, [])

  useEffect(() => () => cancelDeferredInlineEditEnd(), [cancelDeferredInlineEditEnd])

  const scheduleInlineEditStartAfterSelectionPaint = useCallback((clickAction: PendingClickAction) => {
    cancelDeferredInlineEditStart()

    const runAfterPaint = () => {
      const timeoutId = window.setTimeout(() => {
        const pending = deferredInlineEditStartRef.current
        if (!pending || pending.timeoutId !== timeoutId) return
        deferredInlineEditStartRef.current = null

        const startedAt = startWysiwygPerfSpan()
        handleInlineEditStart(clickAction.nodeId, clickAction.caretIndex, clickAction.pageIndex, "responsive-preview")
        finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-start", startedAt, {
          nodeId: clickAction.nodeId,
          pageIndex: clickAction.pageIndex,
          pageCount: editorPageCount,
          source: "canvas-click-deferred",
        })
      }, 0)
      deferredInlineEditStartRef.current = { frameId: null, timeoutId }
    }

    if (typeof window.requestAnimationFrame !== "function") {
      runAfterPaint()
      return
    }

    const frameId = window.requestAnimationFrame(runAfterPaint)
    deferredInlineEditStartRef.current = { frameId, timeoutId: null }
  }, [
    cancelDeferredInlineEditStart,
    editorPageCount,
    handleInlineEditStart,
  ])

  const canStartInlineEditImmediatelyForClick = useCallback((clickAction: PendingClickAction): boolean => {
    if (!isTemplateMode || !WYSIWYG_TEXT_ENGINE_ENABLED) return false
    if (clickAction.selectNodeId && clickAction.selectNodeId !== clickAction.nodeId) return false
    const fragment = findWysiwygTextEngineFragment(paginatedRef.current, clickAction.nodeId, clickAction.pageIndex)
    if (!fragment) return false
    if (fragment.continuesFrom === true || fragment.isContinued === true) return false
    const doc = docRef.current
    if (isParagraphInsideTableCell(doc, clickAction.nodeId, fragment.parentNodeId)) return false
    if (isParagraphInsideFlowStack(doc, clickAction.nodeId, fragment.parentNodeId)) return false
    if (isParagraphInsideRowStack(doc, clickAction.nodeId)) return false
    return isWysiwygTextEngineFragmentEligible({
      doc,
      paginated: paginatedRef.current,
      nodeId: clickAction.nodeId,
      pageIndex: clickAction.pageIndex,
    })
  }, [docRef, isTemplateMode, paginatedRef])

  const startInlineEditImmediatelyFromClick = useCallback((clickAction: PendingClickAction) => {
    cancelDeferredInlineEditStart()
    const startedAt = startWysiwygPerfSpan()
    handleInlineEditStart(clickAction.nodeId, clickAction.caretIndex, clickAction.pageIndex, "responsive-preview")
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-start", startedAt, {
      nodeId: clickAction.nodeId,
      pageIndex: clickAction.pageIndex,
      pageCount: editorPageCount,
      source: "canvas-click-immediate",
    })
  }, [
    cancelDeferredInlineEditStart,
    editorPageCount,
    handleInlineEditStart,
  ])

  const handleInlineEditEnd = useCallback((nodeId?: string, reason: InlineEditEndReason = "keyboard") => {
    if (nodeId) cancelDeferredInlineEditEnd()
    const endStartedAt = startWysiwygPerfSpan()
    let finalized = false
    let source = "legacy"
    const restoreEditorFocus = () => {
      if (reason !== "keyboard") return
      requestAnimationFrame(() => editorRootRef.current?.focus())
    }
    const activeWysiwygNodeId = wysiwygTextSessionStateRef.current.nodeId
    if (WYSIWYG_TEXT_ENGINE_ENABLED && activeWysiwygNodeId && (!nodeId || nodeId === activeWysiwygNodeId)) {
      finalized = finalizeInlineEditBeforeResponsiveAction()
      source = "wysiwyg-text-engine"
      restoreEditorFocus()
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-end", endStartedAt, {
        nodeId: nodeId ?? activeWysiwygNodeId,
        source,
        action: reason,
        active: finalized,
      })
      return
    }
    endInlineEditSession(nodeId, reason)
    finalized = true
    restoreEditorFocus()
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-end", endStartedAt, {
      nodeId,
      source,
      action: reason,
      active: finalized,
    })
  }, [
    cancelDeferredInlineEditEnd,
    editorRootRef,
    endInlineEditSession,
    finalizeInlineEditBeforeResponsiveAction,
    wysiwygTextSessionStateRef,
  ])

  const shouldDeferBoundarySafeInlineEditEnd = useCallback((nodeId: string): boolean => {
    const override = editorStructuralIslandStore.getState().optimisticStructuralIslandOverride
    if (!override || override.nodeId !== nodeId || override.mode !== "boundary-safe") return false
    const settledFragment = findWysiwygTextEngineFragment(
      displayPaginated,
      nodeId,
      inlineEditPageIndex ?? override.fragment.pageIndex,
    )
    return !settledFragment
  }, [displayPaginated, inlineEditPageIndex])

  const deferBoundarySafeInlineEditEnd = useCallback((nodeId: string, reason: InlineEditEndReason, source: string): boolean => {
    if (!shouldDeferBoundarySafeInlineEditEnd(nodeId)) return false
    pendingBoundarySafeInlineEditEndRef.current = { frameId: null, timeoutId: null, nodeId, reason }
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-blur-handoff",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId,
      source,
      action: "boundary-safe-wait-for-settled-fragment",
      active: true,
    })
    return true
  }, [pendingBoundarySafeInlineEditEndRef, shouldDeferBoundarySafeInlineEditEnd])

  const handleFlowdocDraftIslandEndEdit = useCallback((nodeId: string, reason: InlineEditEndReason = "keyboard") => {
    if (reason === "blur" && deferBoundarySafeInlineEditEnd(nodeId, reason, "island-end-callback")) return
    handleInlineEditEnd(nodeId, reason)
  }, [deferBoundarySafeInlineEditEnd, handleInlineEditEnd])

  const scheduleInlineEditEndAfterPaint = useCallback((nodeId: string, reason: InlineEditEndReason, source: string) => {
    cancelDeferredInlineEditEnd()
    const scheduledAt = startWysiwygPerfSpan()
    const runAfterPaint = () => {
      const timeoutId = window.setTimeout(() => {
        const pending = deferredInlineEditEndRef.current
        if (!pending || pending.timeoutId !== timeoutId) return
        deferredInlineEditEndRef.current = null
        const stillActive = inlineEditNodeIdRef.current === nodeId &&
          wysiwygTextSessionStateRef.current.nodeId === nodeId
        finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-island-blur-handoff", scheduledAt, {
          nodeId,
          source,
          action: stillActive ? "shell-deferred-end" : "shell-deferred-end-skipped",
          active: stillActive,
        })
        if (!stillActive) return
        if (deferBoundarySafeInlineEditEnd(nodeId, reason, source)) return
        handleInlineEditEnd(nodeId, reason)
      }, 0)
      deferredInlineEditEndRef.current = { frameId: null, timeoutId, nodeId, reason }
    }

    if (typeof window.requestAnimationFrame !== "function") {
      runAfterPaint()
      return
    }

    const frameId = window.requestAnimationFrame(runAfterPaint)
    deferredInlineEditEndRef.current = { frameId, timeoutId: null, nodeId, reason }
  }, [
    cancelDeferredInlineEditEnd,
    deferBoundarySafeInlineEditEnd,
    handleInlineEditEnd,
    inlineEditNodeIdRef,
    wysiwygTextSessionStateRef,
  ])

  return {
    canStartInlineEditImmediatelyForClick,
    cancelDeferredInlineEditStart,
    finalizeInlineEditBeforeAction,
    finalizeInlineEditBeforeActionRef,
    finalizeInlineEditBeforeResponsiveAction,
    handleFlowdocDraftIslandEndEdit,
    handleInlineEditEnd,
    handleInlineEditStart,
    scheduleInlineEditEndAfterPaint,
    scheduleInlineEditStartAfterSelectionPaint,
    startInlineEditImmediatelyFromClick,
  }
}
