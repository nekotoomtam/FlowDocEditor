import type { TextMeasurer } from "@/layout"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { isTextRunOnlyParagraph } from "@/document"
import type { OptimisticLayoutSnapshot } from "../layoutReconciliation"
import { createOptimisticSplitRefocusPaginated } from "../optimisticStructuralRefocus"
import type {
  OptimisticStructuralIslandOverride,
  OptimisticStructuralRefocusPaint,
  PendingOptimisticMergeRefocus,
  PendingOptimisticSplitRefocus,
} from "../shell/editorShellTypes"
import type { StructuralPreviewSettleSnapshot } from "../structuralEdit/previewSettleBridge"
import { findImmediatePageBreakSiblingAfterNode, getParagraphFromDoc } from "../shell/editorDocumentLookup"
import {
  WYSIWYG_PERF_TRACE_ENABLED,
} from "../wysiwygInlineEditConfig"
import {
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
} from "../wysiwygPerformance"
import {
  isParagraphInsideTableCell,
  isWysiwygTextEngineFragmentEligible,
} from "../wysiwygTextEligibility"
import type { EditorAction } from "../editorReducer"

export interface PostCommitOptimisticSplitRefocusInput {
  nodeId: string
  caretIndex: number | null
  pending: PendingOptimisticSplitRefocus | null
}

export interface PostCommitOptimisticSplitRefocusContext {
  doc: DocumentNode
  paginated: PaginatedDocument
  textMeasurer: TextMeasurer
  pageKeyByPageIndex: ReadonlyMap<number, string>
  setPendingOptimisticSplitRefocus: (pending: PendingOptimisticSplitRefocus | null) => void
  setPaginatedRef: (paginated: PaginatedDocument) => void
  setOptimisticLayoutRef: (layout: OptimisticLayoutSnapshot | null) => void
  setOptimisticStructuralSettleRef: (settle: (PendingOptimisticSplitRefocus & StructuralPreviewSettleSnapshot) | null) => void
  setSuppressNextLayoutLoadingOverlayRef: (suppress: boolean) => void
  dispatchEditorAction: (action: EditorAction) => void
  startInlineEditAfterOptimisticStructuralChange: (
    nodeId: string,
    caretIndex: number | null,
    beforePaginated: PaginatedDocument,
    nextPageIndex?: number | null,
  ) => boolean
  clearWysiwygDraftPagination: () => void
  endWysiwygTextSession: () => void
  startWysiwygTextSession: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => unknown
  setOptimisticStructuralIslandOverride: (value: OptimisticStructuralIslandOverride | null) => void
  setOptimisticStructuralRefocusPaint: (value: OptimisticStructuralRefocusPaint | null) => void
}

export interface PostCommitOptimisticMergeRefocusInput {
  nodeId: string
  caretIndex: number | null
  pending: PendingOptimisticMergeRefocus | null
}

export interface PostCommitOptimisticMergeRefocusContext {
  setPendingOptimisticMergeRefocus: (pending: PendingOptimisticMergeRefocus | null) => void
  moveWysiwygTextCaret: (caretIndex: number | null) => void
}

export function executePostCommitOptimisticMergeRefocus(
  input: PostCommitOptimisticMergeRefocusInput,
  context: PostCommitOptimisticMergeRefocusContext,
): boolean {
  const pending = input.pending
  if (!pending) return false
  if (pending.prestarted && pending.previousNodeId === input.nodeId) {
    context.setPendingOptimisticMergeRefocus(null)
    context.moveWysiwygTextCaret(input.caretIndex)
    return true
  }
  context.setPendingOptimisticMergeRefocus(null)
  return false
}

export function executePostCommitOptimisticSplitRefocus(
  input: PostCommitOptimisticSplitRefocusInput,
  context: PostCommitOptimisticSplitRefocusContext,
): boolean {
  const pending = input.pending
  if (!pending) return false
  if (pending.prestarted && pending.newNodeId === input.nodeId) {
    context.setPendingOptimisticSplitRefocus(null)
    return true
  }
  context.setPendingOptimisticSplitRefocus(null)

  const startedAt = pending.startedAt
  const optimistic = createOptimisticSplitRefocusPaginated({
    doc: context.doc,
    paginated: context.paginated,
    sourceNodeId: pending.sourceNodeId,
    newNodeId: input.nodeId,
    sourceFragment: pending.sourceFragment,
    textMeasurer: context.textMeasurer,
  })
  if (!optimistic) {
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: input.nodeId,
      previousNodeId: pending.sourceNodeId,
      pageIndex: pending.sourceFragment.pageIndex,
      source: "optimistic-unavailable-fallback",
      action: "fallback",
      active: false,
      usedFullPaginationBeforeIsland: true,
    })
    return false
  }

  context.setPaginatedRef(optimistic.paginated)
  context.setOptimisticLayoutRef({ doc: context.doc, paginated: optimistic.paginated })
  context.setOptimisticStructuralSettleRef({ ...pending, newNodeId: input.nodeId })
  context.setSuppressNextLayoutLoadingOverlayRef(true)

  const pageKey = context.pageKeyByPageIndex.get(optimistic.newFragment.pageIndex) ?? null
  if (!pageKey) return false

  context.dispatchEditorAction({ type: "SET_PAGINATED", paginated: optimistic.paginated })
  const sessionStarted = context.startInlineEditAfterOptimisticStructuralChange(
    input.nodeId,
    input.caretIndex,
    optimistic.paginated,
    optimistic.newFragment.pageIndex,
  )
  if (!sessionStarted) {
    context.clearWysiwygDraftPagination()
    context.endWysiwygTextSession()
    return false
  }

  const fragmentEligible = optimistic.mode === "boundary-safe" || isWysiwygTextEngineFragmentEligible({
    doc: context.doc,
    paginated: optimistic.paginated,
    nodeId: input.nodeId,
    pageIndex: optimistic.newFragment.pageIndex,
  })
  if (!fragmentEligible) {
    context.clearWysiwygDraftPagination()
    context.endWysiwygTextSession()
    return false
  }

  context.startWysiwygTextSession(input.nodeId, input.caretIndex, optimistic.newFragment.pageIndex)
  const newParagraph = getParagraphFromDoc(context.doc, input.nodeId)
  if (newParagraph && isTextRunOnlyParagraph(newParagraph)) {
    const suppressedPageBreakNodeId = optimistic.mode === "boundary-safe"
      ? findImmediatePageBreakSiblingAfterNode(context.doc, input.nodeId)
      : null
    context.setOptimisticStructuralIslandOverride({
      nodeId: input.nodeId,
      paragraph: newParagraph,
      fragment: optimistic.newFragment,
      pageKey,
      pages: optimistic.paginated.sections.flatMap((section) => section.pages),
      isTableCellParagraph: isParagraphInsideTableCell(context.doc, input.nodeId, optimistic.newFragment.parentNodeId),
      mode: optimistic.mode,
      suppressedPageBreakNodeId,
    })
  }
  context.setOptimisticStructuralRefocusPaint({ nodeId: input.nodeId, startedAt })
  recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
    kind: "structural-refocus-used-full-pagination-before-island",
    startedAt,
    durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
    nodeId: input.nodeId,
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
}
