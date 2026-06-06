import type { PageFragment, PaginatedPage } from "@/pagination"

export type CanvasViewportEditKind =
  | "none"
  | "inline-edit"
  | "out-of-canvas-structural-island"
  | "boundary-safe-structural-island"

export type CanvasViewportAffectedPageReason =
  | "active-inline-edit"
  | "active-structural-island"
  | "suppressed-page-break"
  | "selection"
  | "hover"
  | "page-settle"
  | "unknown"

export interface CanvasViewportAffectedPage {
  pageIndex: number
  reason: CanvasViewportAffectedPageReason
}

export interface CanvasViewportStructuralIslandInput {
  active: boolean
  nodeId?: string | null
  mode?: "same-page" | "boundary-safe" | null
  pageIndex?: number | null
  fragment?: Pick<PageFragment, "y" | "height"> | null
  suppressedPageBreakNodeId?: string | null
}

export interface BoundarySafeSuppressionInput {
  active: boolean
  activeNodeId?: string | null
  activePageIndex?: number | null
  activeFragmentY?: number | null
  activeFragmentHeight?: number | null
  suppressedPageBreakNodeId?: string | null
  fragmentNodeId: string
  fragmentNodeType: string
  fragmentPageIndex: number
  fragmentY?: number | null
  fallbackRangePt?: number
  pageBreakMarkerHeight?: number
}

export type BoundarySafeSuppressionDecision =
  | { suppress: true; reason: string }
  | { suppress: false; reason: string }

export type PageAffectDecision =
  | { affectsPage: true; reasons: string[] }
  | { affectsPage: false; reasons: string[] }

export interface CanvasViewportDraftVisualPreviewInput {
  fragmentsByPageIndex?: Pick<Map<number, unknown>, "has"> | null
  caretPageIndex?: number | null
}

export interface CanvasViewportTextPointerFragmentTargetInput {
  fragment: Pick<PageFragment, "pageIndex">
}

export interface PageScopedEditDecisionInput {
  selectedNodeId?: string | null
  selectionAnchorNodeId?: string | null
  inlineEditNodeId?: string | null
  inlineEditPageIndex?: number | null
  wysiwygTextDraftNodeId?: string | null
  wysiwygDraftVisualPreview?: CanvasViewportDraftVisualPreviewInput | null
  suppressedCanvasTextNodeIds?: ReadonlySet<string>
  activeOutOfCanvasStructuralIsland?: CanvasViewportStructuralIslandInput | null
  wysiwygTableCellDraftVisualChromeByPageIndex?: Pick<Map<number, unknown>, "has">
  wysiwygTextPointerFragments?: CanvasViewportTextPointerFragmentTargetInput[]
}

export interface CanvasViewportRenderScopeInput {
  pages: PaginatedPage[]
  activeOutOfCanvasStructuralIsland?: CanvasViewportStructuralIslandInput | null
}

export interface CanvasViewportRenderScope {
  nodeId: string
  pageIndex: number
  affectedPageIndexes: number[]
  affectedPageCount: number
  totalPageCount: number
  mode: "same-page" | "boundary-safe"
  suppressedPageBreakCount: number
  unrelatedPageBreakSuppressedCount: number
}

export interface CanvasViewportMetrics {
  canvasViewportAffectedPageCount: number
  canvasViewportAffectedPages: number[]
  canvasViewportSuppressedPageBreakCount: number
  canvasViewportUnrelatedPageBreakSuppressedCount: number
}
