import type { TextMeasurer } from "@/layout"
import type { PaginatedDocument, PageFragment } from "@/pagination"
import type { DocumentNode, ParagraphNode } from "@/schema"
import {
  createParagraphNode,
  splitParagraphAtIndex,
  mergeParagraphWithPrevious,
} from "@/document"
import type { OptimisticLayoutSnapshot } from "../layoutReconciliation"
import {
  createOptimisticMergeRefocusPaginated,
  createOptimisticSplitRefocusPaginated,
} from "../optimisticStructuralRefocus"
import {
  isParagraphInsideFlowStack,
  isParagraphInsideRowStack,
  isParagraphInsideTableCell,
  findWysiwygTextEngineFragment,
} from "../wysiwygTextEligibility"
import {
  resolveStructuralParagraphEligibility,
  resolveStructuralResultParagraph,
  resolveStructuralSourceDocument,
  summarizeStructuralOptimisticPaginatedForPerf,
} from "../structuralEdit/structuralEditPreparationPlans"
import {
  findImmediatePageBreakSiblingAfterNode,
} from "../shell/editorDocumentLookup"
import type { EditorPageNavigationIndex } from "../shell/editorCanvasNavigation"
import type { EditorOperationEnvelope } from "./editorOperationTypes"
import { createEditorOperationFromAction } from "./editorOperationFromAction"
import {
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import {
  finishWysiwygPerfSpan,
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
} from "../wysiwygPerformance"

export interface ParagraphSplitOperationPlan {
  status: "success" | "failed" | "ineligible";
  reason?: string;
  sourceNodeId: string;
  newNodeId?: string;

  // Plan specifics
  sourceFragment?: PageFragment;
  newParagraph?: ParagraphNode;
  newText?: string;
  optimisticLayout?: { doc: DocumentNode; paginated: PaginatedDocument };
  optimisticFragment?: PageFragment;
  mode?: "same-page" | "boundary-safe";
  overflowedPage?: boolean;
  suppressedPageBreakNodeId?: string | null;
  pageKey?: string;
  optimisticSummary?: ReturnType<typeof summarizeStructuralOptimisticPaginatedForPerf>;

  // The actual operation envelope to be dispatched
  operation?: EditorOperationEnvelope;

  // Timing data for perf spans
  perf?: {
    startedAt: number;
  };
}

export interface ParagraphSplitOperationPlanContext {
  doc: DocumentNode;
  displayPaginated: PaginatedDocument | null;
  nodeId: string;
  splitIndex: number;
  text?: string;
  history?: any;
  newNodeId?: string;
  wysiwygTextSessionStateNodeId: string | null;
  inlineEditPageIndex: number | null;
  editorPageNavigation: EditorPageNavigationIndex;
  editorTextMeasurer: TextMeasurer | null;
}

export function createParagraphSplitOperationPlan(ctx: ParagraphSplitOperationPlanContext): ParagraphSplitOperationPlan {
  if (!WYSIWYG_TEXT_ENGINE_ENABLED) return { status: "ineligible", reason: "disabled", sourceNodeId: ctx.nodeId }
  if (ctx.wysiwygTextSessionStateNodeId !== ctx.nodeId) return { status: "ineligible", reason: "inactive-session", sourceNodeId: ctx.nodeId }

  const doc = ctx.doc
  if (!resolveStructuralParagraphEligibility({ doc, nodeId: ctx.nodeId }).eligible) {
    return { status: "ineligible", reason: "ineligible-node", sourceNodeId: ctx.nodeId }
  }

  if (!ctx.displayPaginated) {
    return { status: "ineligible", reason: "no-paginated-doc", sourceNodeId: ctx.nodeId }
  }

  if (!ctx.editorTextMeasurer) {
    return { status: "ineligible", reason: "no-text-measurer", sourceNodeId: ctx.nodeId }
  }

  const activeFragment = findWysiwygTextEngineFragment(ctx.displayPaginated, ctx.nodeId, ctx.inlineEditPageIndex)
    ?? findWysiwygTextEngineFragment(ctx.displayPaginated, ctx.nodeId, null)

  if (
    !activeFragment ||
    activeFragment.nodeType !== "paragraph" ||
    activeFragment.continuesFrom ||
    activeFragment.isContinued ||
    activeFragment.listMarker
  ) {
    return { status: "ineligible", reason: "fragment-ineligible", sourceNodeId: ctx.nodeId }
  }

  const pageKey = ctx.editorPageNavigation.pageKeyByPageIndex.get(activeFragment.pageIndex) ?? null
  if (!pageKey) return { status: "ineligible", reason: "missing-page-key", sourceNodeId: ctx.nodeId }

  const startedAt = startWysiwygPerfSpan()
  const newNodeId = ctx.newNodeId ?? createParagraphNode("").id
  const sourceNodeId = ctx.nodeId

  recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
    kind: "structural-refocus-used-full-pagination-before-island",
    startedAt,
    durationMs: 0,
    nodeId: sourceNodeId,
    pageIndex: activeFragment.pageIndex,
    source: "optimistic-prepared",
    action: "prepared",
    active: true,
    usedFullPaginationBeforeIsland: false,
  })

  // Start logic equivalent to startOptimisticSplitRefocusBeforeDispatch
  const sourceStartedAt = startWysiwygPerfSpan()
  const source = resolveStructuralSourceDocument({
    doc,
    nodeId: sourceNodeId,
    text: ctx.text,
  })

  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", sourceStartedAt, {
    nodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
    source: source.textSupplied ? (source.textChanged ? "draft-text-replaced" : "draft-text-unchanged") : "doc-current",
    action: "draft-text-resolve",
    operation: "split",
    active: source.textResolved,
  })

  recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
    kind: "flowdoc-structural-attribution",
    startedAt: sourceStartedAt,
    durationMs: source.currentTextResolveMs,
    nodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
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
      nodeId: sourceNodeId,
      sourceNodeId: sourceNodeId,
      operation: "split",
      source: "draft-text-replaced",
      action: "replace-draft-text",
      active: true,
    })
  }

  const sourceDoc = source.doc
  const splitStartedAt = startWysiwygPerfSpan()
  const result = splitParagraphAtIndex(sourceDoc, sourceNodeId, ctx.splitIndex, {
    newNodeId,
  })

  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", splitStartedAt, {
    nodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
    action: "split-operation",
    operation: "split",
    active: result.newNodeId === newNodeId,
  })

  if (result.newNodeId !== newNodeId) {
    return { status: "failed", reason: "split-mismatch", sourceNodeId, newNodeId }
  }

  const paragraphResolveStartedAt = startWysiwygPerfSpan()
  const resultParagraph = resolveStructuralResultParagraph({
    doc: result.doc,
    nodeId: newNodeId,
  })

  if (!resultParagraph.resolved) {
    return { status: "failed", reason: "unresolved-paragraph", sourceNodeId, newNodeId }
  }

  const newText = resultParagraph.text
  const newParagraph = resultParagraph.paragraph

  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", paragraphResolveStartedAt, {
    nodeId: newNodeId,
    previousNodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
    action: "paragraph-resolve",
    operation: "split",
    textLength: newText.length,
    active: true,
  })

  const optimisticStartedAt = startWysiwygPerfSpan()
  const optimistic = createOptimisticSplitRefocusPaginated({
    doc: result.doc,
    paginated: ctx.displayPaginated,
    sourceNodeId,
    newNodeId,
    sourceFragment: activeFragment,
    textMeasurer: ctx.editorTextMeasurer,
  })

  const optimisticSummary = summarizeStructuralOptimisticPaginatedForPerf(optimistic?.paginated ?? null)

  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", optimisticStartedAt, {
    nodeId: newNodeId,
    previousNodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
    pageIndex: activeFragment.pageIndex,
    action: "optimistic-pagination",
    operation: "split",
    active: optimistic !== null,
    overflowedPage: optimistic?.overflowedPage,
    optimisticMode: optimistic?.mode,
    boundarySafeMode: optimistic?.mode === "boundary-safe",
    affectedPageIndex: optimistic?.newFragment.pageIndex ?? activeFragment.pageIndex,
    optimisticFragmentCount: optimisticSummary?.fragmentCount,
    ...(optimisticSummary ?? {}),
  })

  if (!optimistic) {
    return { status: "failed", reason: "optimistic-layout-failed", sourceNodeId, newNodeId }
  }

  const newPageKey = ctx.editorPageNavigation.pageKeyByPageIndex.get(optimistic.newFragment.pageIndex) ?? null
  if (!newPageKey) {
    return { status: "failed", reason: "missing-new-page-key", sourceNodeId, newNodeId }
  }

  const suppressedPageBreakNodeId = optimistic.mode === "boundary-safe"
    ? findImmediatePageBreakSiblingAfterNode(result.doc, newNodeId)
    : null

  const operation = createEditorOperationFromAction({
    type: "SPLIT_PARAGRAPH",
    nodeId: sourceNodeId,
    splitIndex: ctx.splitIndex,
    text: ctx.text,
    history: ctx.history,
    newNodeId,
    precomputed: {
      doc: result.doc,
      newNodeId,
    },
    precomputedDocValidation: "shell-optimistic-structural",
    paginated: optimistic.paginated,
  })

  return {
    status: "success",
    sourceNodeId,
    newNodeId,
    sourceFragment: activeFragment,
    newParagraph,
    newText,
    optimisticLayout: { doc: result.doc, paginated: optimistic.paginated },
    optimisticFragment: optimistic.newFragment,
    mode: optimistic.mode,
    overflowedPage: optimistic.overflowedPage,
    suppressedPageBreakNodeId,
    pageKey: newPageKey,
    optimisticSummary: optimisticSummary ?? undefined,
    operation,
    perf: { startedAt }
  }
}

export type ParagraphMergeOperationPlan = {
  status: "ineligible" | "failed";
  reason?: string;
  sourceNodeId: string;
  previousNodeId?: string;
} | {
  status: "success";
  sourceNodeId: string;
  previousNodeId: string;
  sourceFragment: PageFragment;
  previousFragment: PageFragment;
  mergedFragment: PageFragment;
  previousParagraph: ParagraphNode;
  mergedText: string;
  optimisticLayout: OptimisticLayoutSnapshot;
  mode: "same-page" | "boundary-safe";
  overflowedPage: boolean;
  pageKey: string;
  optimisticSummary?: ReturnType<typeof summarizeStructuralOptimisticPaginatedForPerf>;
  operation: EditorOperationEnvelope;
  perf: {
    startedAt: number;
  };
}

export interface ParagraphMergeOperationPlanContext {
  doc: DocumentNode;
  displayPaginated: PaginatedDocument | null;
  nodeId: string;
  text?: string;
  history?: any;
  wysiwygTextSessionStateNodeId: string | null;
  inlineEditPageIndex: number | null;
  editorPageNavigation: EditorPageNavigationIndex;
  editorTextMeasurer: TextMeasurer | null;
  optimisticStructuralIslandOverride?: {
    nodeId: string;
    fragment: PageFragment;
  } | null;
}

export function createParagraphMergeOperationPlan(ctx: ParagraphMergeOperationPlanContext): ParagraphMergeOperationPlan {
  const sourceNodeId = ctx.nodeId;
  if (!WYSIWYG_TEXT_ENGINE_ENABLED) return { status: "ineligible", reason: "disabled", sourceNodeId }
  if (ctx.wysiwygTextSessionStateNodeId !== ctx.nodeId) return { status: "ineligible", reason: "inactive-session", sourceNodeId }

  const doc = ctx.doc

  const startedAt = startWysiwygPerfSpan()
  const sourceStartedAt = startWysiwygPerfSpan()
  const source = resolveStructuralSourceDocument({
    doc,
    nodeId: sourceNodeId,
    text: ctx.text,
  })

  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", sourceStartedAt, {
    nodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
    source: source.textSupplied ? (source.textChanged ? "draft-text-replaced" : "draft-text-unchanged") : "doc-current",
    action: "draft-text-resolve",
    operation: "merge",
    active: source.textResolved,
  })

  recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
    kind: "flowdoc-structural-attribution",
    startedAt: sourceStartedAt,
    durationMs: source.currentTextResolveMs,
    nodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
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
      nodeId: sourceNodeId,
      sourceNodeId: sourceNodeId,
      operation: "merge",
      source: "draft-text-replaced",
      action: "replace-draft-text",
      active: true,
    })
  }

  const sourceDoc = source.doc
  if (!resolveStructuralParagraphEligibility({ doc: sourceDoc, nodeId: sourceNodeId }).eligible) {
    return { status: "ineligible", reason: "ineligible-node", sourceNodeId }
  }

  if (!ctx.editorTextMeasurer) {
    return { status: "ineligible", reason: "no-text-measurer", sourceNodeId }
  }

  const mergeStartedAt = startWysiwygPerfSpan()
  const result = mergeParagraphWithPrevious(sourceDoc, sourceNodeId)

  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", mergeStartedAt, {
    nodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
    action: "merge-operation",
    operation: "merge",
    active: result !== null,
    previousNodeId: result?.prevNodeId,
  })

  if (!result) return { status: "failed", reason: "merge-failed", sourceNodeId }

  const previousNodeId = result.prevNodeId;
  if (isParagraphInsideTableCell(sourceDoc, previousNodeId)) return { status: "failed", reason: "inside-table", sourceNodeId, previousNodeId }
  if (isParagraphInsideFlowStack(sourceDoc, previousNodeId)) return { status: "failed", reason: "inside-flow-stack", sourceNodeId, previousNodeId }
  if (isParagraphInsideRowStack(sourceDoc, previousNodeId)) return { status: "failed", reason: "inside-row-stack", sourceNodeId, previousNodeId }

  const paragraphResolveStartedAt = startWysiwygPerfSpan()
  const resultParagraph = resolveStructuralResultParagraph({
    doc: result.doc,
    nodeId: previousNodeId,
  })

  if (!resultParagraph.resolved) {
    return { status: "failed", reason: "unresolved-paragraph", sourceNodeId, previousNodeId }
  }

  const previousParagraph = resultParagraph.paragraph
  const mergedText = resultParagraph.text

  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", paragraphResolveStartedAt, {
    nodeId: previousNodeId,
    previousNodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
    action: "paragraph-resolve",
    operation: "merge",
    textLength: mergedText.length,
    active: true,
  })

  const islandOnlyCurrentFragment = ctx.optimisticStructuralIslandOverride?.nodeId === sourceNodeId &&
    ctx.optimisticStructuralIslandOverride.fragment.nodeType === "paragraph"
    ? ctx.optimisticStructuralIslandOverride.fragment
    : null

  const displayPaginated = ctx.displayPaginated
  if (!displayPaginated) return { status: "failed", reason: "no-paginated-doc", sourceNodeId, previousNodeId }

  const currentFragment = findWysiwygTextEngineFragment(displayPaginated, sourceNodeId, ctx.inlineEditPageIndex)
    ?? findWysiwygTextEngineFragment(displayPaginated, sourceNodeId, null)
    ?? islandOnlyCurrentFragment

  if (
    !currentFragment ||
    currentFragment.nodeType !== "paragraph" ||
    currentFragment.continuesFrom ||
    currentFragment.isContinued ||
    currentFragment.listMarker
  ) {
    return { status: "failed", reason: "fragment-ineligible", sourceNodeId, previousNodeId }
  }

  const previousFragment = findWysiwygTextEngineFragment(displayPaginated, previousNodeId, currentFragment.pageIndex)

  if (
    !previousFragment ||
    previousFragment.nodeType !== "paragraph" ||
    previousFragment.continuesFrom ||
    previousFragment.isContinued ||
    previousFragment.listMarker
  ) {
    return { status: "failed", reason: "previous-fragment-ineligible", sourceNodeId, previousNodeId }
  }

  const optimisticStartedAt = startWysiwygPerfSpan()
  const optimistic = createOptimisticMergeRefocusPaginated({
    doc: result.doc,
    paginated: displayPaginated,
    previousNodeId,
    currentNodeId: sourceNodeId,
    previousFragment,
    currentFragment,
    textMeasurer: ctx.editorTextMeasurer,
  })

  const optimisticSummary = summarizeStructuralOptimisticPaginatedForPerf(optimistic?.paginated ?? null)

  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", optimisticStartedAt, {
    nodeId: previousNodeId,
    previousNodeId: sourceNodeId,
    sourceNodeId: sourceNodeId,
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

  if (!optimistic) {
    return { status: "failed", reason: "optimistic-layout-failed", sourceNodeId, previousNodeId }
  }

  const pageKey = ctx.editorPageNavigation.pageKeyByPageIndex.get(optimistic.mergedFragment.pageIndex) ?? null
  if (!pageKey) {
    return { status: "failed", reason: "missing-new-page-key", sourceNodeId, previousNodeId }
  }

  const operation = createEditorOperationFromAction({
    type: "MERGE_PARAGRAPH",
    nodeId: sourceNodeId,
    text: ctx.text,
    history: ctx.history,
    precomputed: {
      doc: result.doc,
      prevNodeId: previousNodeId,
      caretIndex: result.caretIndex,
    },
    precomputedDocValidation: "shell-optimistic-structural",
    paginated: optimistic.paginated,
  })

  return {
    status: "success",
    sourceNodeId,
    previousNodeId,
    sourceFragment: currentFragment,
    previousFragment,
    mergedFragment: optimistic.mergedFragment,
    previousParagraph,
    mergedText,
    optimisticLayout: { doc: result.doc, paginated: optimistic.paginated },
    mode: optimistic.mode,
    overflowedPage: optimistic.overflowedPage,
    pageKey,
    optimisticSummary: optimisticSummary ?? undefined,
    operation,
    perf: { startedAt }
  }
}
