import { useCallback, useEffect, useRef, useState } from "react"
import { assertDocument } from "@/document"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { findWysiwygPageIndexInFragmentRanges, getWysiwygParagraphFragmentRanges } from "../wysiwygCaretMapping"
import {
  buildWysiwygTextDraftPreviewDocument,
  countWysiwygTextDraftFragments,
} from "../wysiwygDraftPreview"
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
import {
  isParagraphInsideFlowStack,
  isParagraphInsideTableCell,
} from "../wysiwygTextEligibility"
import {
  resolveWysiwygDraftPaginationSource,
  type WysiwygDraftPaginationLatestSnapshot,
} from "../wysiwygReflow"
import type { WysiwygTextSessionState } from "../useWysiwygTextSession"
import type { WysiwygRichTextDraftSessionState } from "../richTextDraftSession"
import type { EditorAction } from "../editorReducer"
import type { OptimisticLayoutSnapshot } from "../layoutReconciliation"
import {
  createDraftPreviewPaginationApplyPlan,
  createDraftPreviewPaginationSchedulePlan,
  resolveDraftPreviewPaginationClearedGeneration,
  resolveDraftPreviewPaginationDelayMsBridge,
  resolveDraftPreviewPaginationResponsiveNodeId,
  shouldRunDraftPreviewPagination,
  type DraftPreviewPaginationRequest,
} from "../structuralEdit/previewSettleBridge"
import {
  applyDraftPreviewShellMutation,
  createDraftPreviewShellMutationPlan,
  type DraftPreviewShellMutationPlan,
} from "../structuralEdit/previewSettleShellAdapter"
import {
  FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
  WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS,
  WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_MAX_LAG_MS,
  WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_QUIET_MS,
} from "./editorShellConstants"

type MutableCurrentRef<T> = {
  current: T
}

export function useWysiwygDraftPaginationController({
  dispatch,
  docRef,
  inlineEditDraftVersionRef,
  inlineEditPageIndexRef,
  inlineEditVisualLockedRef,
  markInlineEditVisualFresh,
  optimisticLayoutRef,
  paginatePreviewDoc,
  paginatedRef,
  recordPreviewSettleShellMutationPlan,
  requestInlineEditPageFollow,
  richWysiwygDraftSessionStateRef,
  setInlineEditPageIndex,
  wysiwygTextSessionNodeId,
  wysiwygTextSessionStateRef,
}: {
  dispatch: (action: EditorAction) => void
  docRef: MutableCurrentRef<DocumentNode>
  inlineEditDraftVersionRef: MutableCurrentRef<number>
  inlineEditPageIndexRef: MutableCurrentRef<number | null>
  inlineEditVisualLockedRef: MutableCurrentRef<boolean>
  markInlineEditVisualFresh: (version: number) => void
  optimisticLayoutRef: MutableCurrentRef<OptimisticLayoutSnapshot | null>
  paginatePreviewDoc: (nextDoc: DocumentNode) => PaginatedDocument
  paginatedRef: MutableCurrentRef<PaginatedDocument>
  recordPreviewSettleShellMutationPlan: (plan: DraftPreviewShellMutationPlan, detail?: Record<string, unknown>) => void
  requestInlineEditPageFollow: (pageIndex: number) => void
  richWysiwygDraftSessionStateRef: MutableCurrentRef<WysiwygRichTextDraftSessionState>
  setInlineEditPageIndex: (pageIndex: number | null) => void
  wysiwygTextSessionNodeId: string | null
  wysiwygTextSessionStateRef: MutableCurrentRef<WysiwygTextSessionState>
}) {
  const [wysiwygDraftPaginationNodeId, setWysiwygDraftPaginationNodeIdState] = useState<string | null>(null)
  const wysiwygDraftPaginationNodeIdRef = useRef<string | null>(null)
  const wysiwygPlainTextBoundaryDraftPaginationNodeIdRef = useRef<string | null>(null)
  const inlineEditHeightPreviewLastDispatchRef = useRef<{ key: string; height: number } | null>(null)
  const wysiwygDraftPaginationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wysiwygDraftPaginationFrameRef = useRef<number | null>(null)
  const wysiwygDraftPaginationDelayRef = useRef<number | null>(null)
  const wysiwygDraftPaginationGenerationRef = useRef(0)
  const wysiwygDraftPaginationSnapshotRevisionRef = useRef(0)
  const wysiwygLatestDraftPaginationSnapshotRef = useRef<WysiwygDraftPaginationLatestSnapshot | null>(null)
  const wysiwygDraftPaginationRequestRef = useRef<DraftPreviewPaginationRequest | null>(null)

  const setWysiwygDraftPaginationNodeId = useCallback((nodeId: string | null) => {
    const previousNodeId = wysiwygDraftPaginationNodeIdRef.current
    wysiwygDraftPaginationNodeIdRef.current = nodeId
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "draft-pagination-state",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: nodeId ?? previousNodeId ?? undefined,
      previousNodeId,
      active: nodeId !== null,
      source: previousNodeId === nodeId ? "unchanged" : nodeId ? "set-active" : "clear",
    })
    setWysiwygDraftPaginationNodeIdState(nodeId)
  }, [])

  useEffect(() => {
    inlineEditHeightPreviewLastDispatchRef.current = null
    wysiwygPlainTextBoundaryDraftPaginationNodeIdRef.current = null
  }, [wysiwygTextSessionNodeId])

  const clearWysiwygDraftPagination = useCallback(() => {
    if (wysiwygDraftPaginationDebounceRef.current) clearTimeout(wysiwygDraftPaginationDebounceRef.current)
    if (wysiwygDraftPaginationFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(wysiwygDraftPaginationFrameRef.current)
    }
    wysiwygDraftPaginationDebounceRef.current = null
    wysiwygDraftPaginationFrameRef.current = null
    wysiwygDraftPaginationDelayRef.current = null
    wysiwygDraftPaginationRequestRef.current = null
    wysiwygLatestDraftPaginationSnapshotRef.current = null
    wysiwygDraftPaginationGenerationRef.current = resolveDraftPreviewPaginationClearedGeneration(
      wysiwygDraftPaginationGenerationRef.current,
    )
    setWysiwygDraftPaginationNodeId(null)
  }, [setWysiwygDraftPaginationNodeId])

  useEffect(() => () => {
    if (wysiwygDraftPaginationDebounceRef.current) clearTimeout(wysiwygDraftPaginationDebounceRef.current)
    if (wysiwygDraftPaginationFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(wysiwygDraftPaginationFrameRef.current)
    }
    wysiwygDraftPaginationFrameRef.current = null
    wysiwygDraftPaginationDelayRef.current = null
    wysiwygDraftPaginationRequestRef.current = null
    wysiwygLatestDraftPaginationSnapshotRef.current = null
  }, [])

  const scheduleWysiwygDraftPagination = useCallback((nodeId: string, debounceMs = WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS) => {
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now()
    const schedulePlan = createDraftPreviewPaginationSchedulePlan({
      nodeId,
      requestedDelayMs: debounceMs,
      pendingRequest: wysiwygDraftPaginationRequestRef.current,
      latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      session: wysiwygTextSessionStateRef.current,
      nowMs,
      currentGeneration: wysiwygDraftPaginationGenerationRef.current,
      responsiveDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
      quietWindowMs: WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_QUIET_MS,
      maxLagMs: WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_MAX_LAG_MS,
      canUseAnimationFrame: typeof requestAnimationFrame !== "undefined",
    })

    wysiwygDraftPaginationRequestRef.current = schedulePlan.request
    wysiwygDraftPaginationDelayRef.current = schedulePlan.scheduledDelayMs
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "draft-pagination-schedule",
      startedAt: nowMs,
      durationMs: 0,
      nodeId,
      draftVersion: schedulePlan.draftVersion,
      requestedDelayMs: schedulePlan.requestedDelayMs,
      scheduledDelayMs: schedulePlan.scheduledDelayMs,
      firstRequestedAtMs: schedulePlan.firstRequestedAtMs,
      source: schedulePlan.source,
    })

    const runDraftPagination = (generation: number) => {
      const activeRequest = wysiwygDraftPaginationRequestRef.current
      if (!shouldRunDraftPreviewPagination({
        scheduledGeneration: generation,
        currentGeneration: wysiwygDraftPaginationGenerationRef.current,
        hasActiveRequest: activeRequest !== null,
      }) || !activeRequest) return
      const activeScheduledDelayMs = wysiwygDraftPaginationDelayRef.current
      wysiwygDraftPaginationDebounceRef.current = null
      wysiwygDraftPaginationFrameRef.current = null
      wysiwygDraftPaginationDelayRef.current = null
      wysiwygDraftPaginationRequestRef.current = null
      const activeNodeId = activeRequest.nodeId
      const session = wysiwygTextSessionStateRef.current
      const source = resolveWysiwygDraftPaginationSource({
        nodeId: activeNodeId,
        session,
        latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      })
      if (!source) return
      const richDraftActive = WYSIWYG_RICH_TEXT_DRAFT_ENABLED &&
        richWysiwygDraftSessionStateRef.current.nodeId === activeNodeId
      const draftDoc = buildWysiwygTextDraftPreviewDocument({
        doc: docRef.current,
        nodeId: activeNodeId,
        draftText: source.draftText,
        draftParagraph: richDraftActive
          ? richWysiwygDraftSessionStateRef.current.draft?.paragraph ?? null
          : null,
      })
      try {
        assertDocument(draftDoc)
      } catch (error) {
        console.error("WYSIWYG draft pagination produced invalid document:", error)
        return
      }
      const startedAt = startWysiwygPerfSpan()
      const paginated = paginatePreviewDoc(draftDoc)
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "browser-preview-pagination", startedAt, {
        nodeId: activeNodeId,
        draftVersion: source.revision,
        requestedDelayMs: activeRequest.requestedDelayMs,
        scheduledDelayMs: activeScheduledDelayMs ?? undefined,
        source: "wysiwyg-draft",
        richDraft: richDraftActive,
        ...summarizePaginatedForWysiwygPerf(paginated),
      })
      const nextSource = resolveWysiwygDraftPaginationSource({
        nodeId: activeNodeId,
        session: wysiwygTextSessionStateRef.current,
        latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      })
      const applyPlan = createDraftPreviewPaginationApplyPlan({
        nodeId: activeNodeId,
        requestedDelayMs: activeRequest.requestedDelayMs,
        scheduledGeneration: generation,
        currentGeneration: wysiwygDraftPaginationGenerationRef.current,
        sourceRevision: source.revision,
        nextSourceRevision: nextSource?.revision ?? null,
      })
      if (applyPlan.action !== "apply") {
        const shellMutationPlan = createDraftPreviewShellMutationPlan({
          applyPlan,
          nextPageIndex: null,
          previousInlineEditPageIndex: inlineEditPageIndexRef.current,
          isInlineEditVisualLocked: inlineEditVisualLockedRef.current,
          draftPaginationNodeId: null,
          markInlineEditVisualFreshVersion: inlineEditDraftVersionRef.current,
        })
        recordPreviewSettleShellMutationPlan(shellMutationPlan, {
          source: "wysiwyg-draft",
          token: generation,
        })
        applyDraftPreviewShellMutation({
          plan: shellMutationPlan,
          optimisticLayout: { doc: draftDoc, paginated },
          paginated,
          fallbackInlineEditVisualFreshVersion: inlineEditDraftVersionRef.current,
          scheduleDraftPagination: scheduleWysiwygDraftPagination,
          writePaginatedRef: (nextPaginated) => {
            paginatedRef.current = nextPaginated
          },
          writeOptimisticLayout: (layout) => {
            optimisticLayoutRef.current = layout
          },
          relocateInlineEditPage: (pageIndex) => {
            inlineEditPageIndexRef.current = pageIndex
            setInlineEditPageIndex(pageIndex)
          },
          followInlineEditPage: requestInlineEditPageFollow,
          setDraftPaginationNodeId: setWysiwygDraftPaginationNodeId,
          dispatchSetPaginated: (nextPaginated) => dispatch({ type: "SET_PAGINATED", paginated: nextPaginated }),
          markInlineEditVisualFresh,
        })
        return
      }
      const ranges = getWysiwygParagraphFragmentRanges(paginated, activeNodeId)
      const isTableCellParagraph = isParagraphInsideTableCell(draftDoc, activeNodeId)
      const nextPageIndex = source.caretOffset == null
        ? null
        : findWysiwygPageIndexInFragmentRanges(ranges, source.caretOffset, {
          preferPreviousPageAtFragmentEnd: isTableCellParagraph,
        })
      const currentFragmentCount = countWysiwygTextDraftFragments(paginated, activeNodeId)
      const draftPaginationNodeId = resolveDraftPreviewPaginationResponsiveNodeId({
        nodeId: activeNodeId,
        isFlowStackParagraph: isParagraphInsideFlowStack(draftDoc, activeNodeId),
        isTableCellParagraph,
        draftPaginationActive: wysiwygDraftPaginationNodeIdRef.current === activeNodeId,
        currentFragmentCount,
      })
      const shellMutationPlan = createDraftPreviewShellMutationPlan({
        applyPlan,
        nextPageIndex,
        previousInlineEditPageIndex: inlineEditPageIndexRef.current,
        isInlineEditVisualLocked: inlineEditVisualLockedRef.current,
        draftPaginationNodeId,
        markInlineEditVisualFreshVersion: inlineEditDraftVersionRef.current,
      })
      recordPreviewSettleShellMutationPlan(shellMutationPlan, {
        source: "wysiwyg-draft",
        token: generation,
      })
      if (shellMutationPlan.action !== "apply") return
      applyDraftPreviewShellMutation({
        plan: shellMutationPlan,
        optimisticLayout: { doc: draftDoc, paginated },
        paginated,
        fallbackInlineEditVisualFreshVersion: inlineEditDraftVersionRef.current,
        scheduleDraftPagination: scheduleWysiwygDraftPagination,
        writePaginatedRef: (nextPaginated) => {
          paginatedRef.current = nextPaginated
        },
        writeOptimisticLayout: (layout) => {
          optimisticLayoutRef.current = layout
        },
        relocateInlineEditPage: (pageIndex) => {
          inlineEditPageIndexRef.current = pageIndex
          setInlineEditPageIndex(pageIndex)
        },
        followInlineEditPage: requestInlineEditPageFollow,
        setDraftPaginationNodeId: setWysiwygDraftPaginationNodeId,
        dispatchSetPaginated: (nextPaginated) => dispatch({ type: "SET_PAGINATED", paginated: nextPaginated }),
        markInlineEditVisualFresh,
      })
    }

    if (wysiwygDraftPaginationDebounceRef.current) {
      clearTimeout(wysiwygDraftPaginationDebounceRef.current)
      wysiwygDraftPaginationDebounceRef.current = null
    }
    if (wysiwygDraftPaginationFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(wysiwygDraftPaginationFrameRef.current)
      wysiwygDraftPaginationFrameRef.current = null
    }

    const generation = schedulePlan.generation
    wysiwygDraftPaginationGenerationRef.current = generation
    if (schedulePlan.useAnimationFrame) {
      wysiwygDraftPaginationFrameRef.current = requestAnimationFrame(() => runDraftPagination(generation))
      return
    }

    wysiwygDraftPaginationDebounceRef.current = setTimeout(() => runDraftPagination(generation), schedulePlan.scheduledDelayMs)
  }, [
    dispatch,
    docRef,
    inlineEditDraftVersionRef,
    inlineEditPageIndexRef,
    inlineEditVisualLockedRef,
    markInlineEditVisualFresh,
    optimisticLayoutRef,
    paginatePreviewDoc,
    paginatedRef,
    recordPreviewSettleShellMutationPlan,
    requestInlineEditPageFollow,
    richWysiwygDraftSessionStateRef,
    setInlineEditPageIndex,
    setWysiwygDraftPaginationNodeId,
    wysiwygTextSessionStateRef,
  ])

  const scheduleRichTextDraftStylePagination = useCallback((nodeId: string) => {
    wysiwygLatestDraftPaginationSnapshotRef.current = null
    const isFlowStackParagraph = isParagraphInsideFlowStack(docRef.current, nodeId)
    const isTableCellParagraph = isParagraphInsideTableCell(docRef.current, nodeId)
    setWysiwygDraftPaginationNodeId(nodeId)
    scheduleWysiwygDraftPagination(nodeId, resolveDraftPreviewPaginationDelayMsBridge({
      draftPaginationActive: true,
      isFlowStackParagraph,
      isTableCellParagraph,
      defaultDelayMs: WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS,
      flowStackBoundaryDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
    }))
  }, [
    docRef,
    scheduleWysiwygDraftPagination,
    setWysiwygDraftPaginationNodeId,
  ])

  const recordWysiwygDraftPaginationSnapshot = useCallback((input: {
    nodeId: string
    draftText: string
    caretOffset: number | null
  }) => {
    const nextSnapshotRevision = wysiwygDraftPaginationSnapshotRevisionRef.current + 1
    wysiwygDraftPaginationSnapshotRevisionRef.current = nextSnapshotRevision
    wysiwygLatestDraftPaginationSnapshotRef.current = {
      nodeId: input.nodeId,
      draftText: input.draftText,
      caretOffset: input.caretOffset,
      revision: nextSnapshotRevision,
    }
    return nextSnapshotRevision
  }, [])

  return {
    clearWysiwygDraftPagination,
    inlineEditHeightPreviewLastDispatchRef,
    recordWysiwygDraftPaginationSnapshot,
    scheduleRichTextDraftStylePagination,
    scheduleWysiwygDraftPagination,
    setWysiwygDraftPaginationNodeId,
    wysiwygDraftPaginationNodeId,
    wysiwygDraftPaginationNodeIdRef,
    wysiwygLatestDraftPaginationSnapshotRef,
    wysiwygPlainTextBoundaryDraftPaginationNodeIdRef,
  }
}
