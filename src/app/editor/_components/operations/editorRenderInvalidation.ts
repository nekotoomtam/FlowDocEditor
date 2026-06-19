import type { PaginatedDocument } from "@/pagination"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

export type EditorRenderInvalidationLane =
  | "no-render"
  | "selection-only"
  | "visual-only"
  | "node-layout"
  | "block-layout"
  | "table-layout"
  | "from-index-structure"
  | "document-layout"

export type EditorRenderInvalidationPageScope =
  | "none"
  | "affected-node-pages"
  | "from-first-affected-page"
  | "document"
  | "unknown"

export type EditorRenderActionOwnership = {
  coreOperation: "authored-document-mutation"
  editorOperation: "runtime-orchestration"
  pagination: "paginated-document-layout-truth"
  render: "paginated-output-display"
  history: "editor-history"
  previewSettle: "optimistic-preview-reconciliation"
}

export const EDITOR_RENDER_ACTION_OWNERSHIP: EditorRenderActionOwnership = {
  coreOperation: "authored-document-mutation",
  editorOperation: "runtime-orchestration",
  pagination: "paginated-document-layout-truth",
  render: "paginated-output-display",
  history: "editor-history",
  previewSettle: "optimistic-preview-reconciliation",
}

export type EditorRenderInvalidationPlan = {
  lane: EditorRenderInvalidationLane
  pageScope: EditorRenderInvalidationPageScope
  affectedNodeIds: string[]
  affectedPageIndexes: number[] | null
  invalidatesPagination: boolean
  mayUseVisualFastLane: boolean
  requiresPreviewSettle: boolean
  requiresHistoryEntry: boolean
  ownership: EditorRenderActionOwnership
  reason: string
}

export type ResolveEditorRenderInvalidationInput = {
  operation: EditorOperationEnvelope
  paginated?: PaginatedDocument | null
}

function uniqueSorted(values: Iterable<number>): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

function allPageIndexes(paginated: PaginatedDocument | null | undefined): number[] | null {
  if (!paginated) return null
  return uniqueSorted(paginated.sections.flatMap((section) => section.pages.map((page) => page.index)))
}

function pageIndexesForNodeIds(
  paginated: PaginatedDocument | null | undefined,
  nodeIds: readonly string[],
): number[] | null {
  if (!paginated) return null
  if (nodeIds.length === 0) return null
  const targets = new Set(nodeIds)
  const indexes: number[] = []
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const fragments = [...page.fragments, ...page.headerFragments, ...page.footerFragments]
      if (fragments.some((fragment) => targets.has(fragment.nodeId) || (fragment.parentNodeId != null && targets.has(fragment.parentNodeId)))) {
        indexes.push(page.index)
      }
    }
  }
  return uniqueSorted(indexes)
}

function pageIndexesFromFirstAffectedPage(
  paginated: PaginatedDocument | null | undefined,
  affectedPageIndexes: readonly number[] | null,
): number[] | null {
  if (!paginated || affectedPageIndexes == null || affectedPageIndexes.length === 0) return allPageIndexes(paginated)
  const first = Math.min(...affectedPageIndexes)
  return uniqueSorted(
    paginated.sections.flatMap((section) => section.pages.map((page) => page.index).filter((index) => index >= first)),
  )
}

function laneForOperation(operation: EditorOperationEnvelope): EditorRenderInvalidationLane {
  const { layoutScope, uiImpact } = operation.scope
  if (layoutScope === "none") {
    if (uiImpact === "selection") return "selection-only"
    if (uiImpact === "visual") return "visual-only"
    return "no-render"
  }
  if (layoutScope === "node") return "node-layout"
  if (layoutScope === "block") return "block-layout"
  if (layoutScope === "table") return "table-layout"
  if (layoutScope === "from-index") return "from-index-structure"
  return "document-layout"
}

function pageScopeForLane(lane: EditorRenderInvalidationLane): EditorRenderInvalidationPageScope {
  switch (lane) {
    case "no-render":
    case "selection-only":
      return "none"
    case "visual-only":
    case "node-layout":
    case "block-layout":
    case "table-layout":
      return "affected-node-pages"
    case "from-index-structure":
      return "from-first-affected-page"
    case "document-layout":
      return "document"
  }
}

function invalidatesPagination(lane: EditorRenderInvalidationLane): boolean {
  return lane === "node-layout" ||
    lane === "block-layout" ||
    lane === "table-layout" ||
    lane === "from-index-structure" ||
    lane === "document-layout"
}

export function resolveEditorRenderInvalidation(
  input: ResolveEditorRenderInvalidationInput,
): EditorRenderInvalidationPlan {
  const { operation, paginated } = input
  const lane = laneForOperation(operation)
  const pageScope = pageScopeForLane(lane)
  const affectedNodeIds = [...operation.scope.nodeIds]
  const affectedNodePages = pageIndexesForNodeIds(paginated, affectedNodeIds)
  const affectedPageIndexes = lane === "document-layout"
    ? allPageIndexes(paginated)
    : lane === "from-index-structure"
    ? pageIndexesFromFirstAffectedPage(paginated, affectedNodePages)
    : pageScope === "none"
    ? []
    : affectedNodePages

  return {
    lane,
    pageScope: affectedPageIndexes == null && pageScope !== "none" ? "unknown" : pageScope,
    affectedNodeIds,
    affectedPageIndexes,
    invalidatesPagination: invalidatesPagination(lane),
    mayUseVisualFastLane: lane === "visual-only",
    requiresPreviewSettle: lane === "selection-only" || lane === "no-render" ? false : operation.scope.needsPreviewSettle,
    requiresHistoryEntry: operation.scope.needsHistory,
    ownership: EDITOR_RENDER_ACTION_OWNERSHIP,
    reason: `${operation.kind}:${lane}`,
  }
}
