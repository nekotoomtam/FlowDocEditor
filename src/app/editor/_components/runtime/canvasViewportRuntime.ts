import type { PageFragment, PaginatedPage } from "@/pagination"
import type {
  BoundarySafeSuppressionDecision,
  BoundarySafeSuppressionInput,
  CanvasViewportAffectedPage,
  CanvasViewportMetrics,
  CanvasViewportRenderScope,
  CanvasViewportRenderScopeInput,
  CanvasViewportStructuralIslandInput,
  PageAffectDecision,
  PageScopedEditDecisionInput,
} from "./canvasViewportTypes"

export type {
  BoundarySafeSuppressionDecision,
  BoundarySafeSuppressionInput,
  CanvasViewportAffectedPage,
  CanvasViewportAffectedPageReason,
  CanvasViewportDraftVisualPreviewInput,
  CanvasViewportEditKind,
  CanvasViewportMetrics,
  CanvasViewportRenderScope,
  CanvasViewportRenderScopeInput,
  CanvasViewportStructuralIslandInput,
  CanvasViewportTextPointerFragmentTargetInput,
  PageAffectDecision,
  PageScopedEditDecisionInput,
} from "./canvasViewportTypes"

const DEFAULT_BOUNDARY_SAFE_PAGE_BREAK_SUPPRESSION_FALLBACK_RANGE_PT = 96
const DEFAULT_PAGE_BREAK_MARKER_HEIGHT_PT = 18

function pageFragments(page: PaginatedPage): PageFragment[] {
  return [
    ...page.fragments,
    ...(page.headerFragments ?? []),
    ...(page.footerFragments ?? []),
  ]
}

export function pageHasNodeFragment(page: PaginatedPage, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false
  return pageFragments(page).some((fragment) =>
    fragment.nodeId === nodeId &&
    fragment.nodeType === "paragraph"
  )
}

export function pageHasAnyNodeFragment(page: PaginatedPage, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false
  return pageFragments(page).some((fragment) => fragment.nodeId === nodeId)
}

export function shouldSuppressBoundarySafePageBreak(
  input: BoundarySafeSuppressionInput,
): BoundarySafeSuppressionDecision {
  if (!input.active) return { suppress: false, reason: "inactive" }
  if (input.fragmentNodeType !== "page-break") return { suppress: false, reason: "not-page-break" }
  if (input.activePageIndex == null) return { suppress: false, reason: "missing-active-page" }
  if (input.fragmentPageIndex !== input.activePageIndex) return { suppress: false, reason: "different-page" }

  const suppressedPageBreakNodeId = input.suppressedPageBreakNodeId ?? null
  if (suppressedPageBreakNodeId) {
    return input.fragmentNodeId === suppressedPageBreakNodeId
      ? { suppress: true, reason: "suppressed-page-break-node" }
      : { suppress: false, reason: "unrelated-page-break-node" }
  }

  if (input.activeFragmentY == null) return { suppress: false, reason: "missing-active-fragment-y" }
  const fallbackRangePt = input.fallbackRangePt ?? DEFAULT_BOUNDARY_SAFE_PAGE_BREAK_SUPPRESSION_FALLBACK_RANGE_PT
  const markerHeight = input.pageBreakMarkerHeight ?? DEFAULT_PAGE_BREAK_MARKER_HEIGHT_PT
  const activeHeight = input.activeFragmentHeight ?? 0
  const fallbackBottomY = input.activeFragmentY + Math.max(
    activeHeight + markerHeight * 2,
    fallbackRangePt,
  )
  if (input.fragmentY == null) return { suppress: false, reason: "missing-fragment-y" }
  if (input.fragmentY < input.activeFragmentY) return { suppress: false, reason: "before-active-fragment" }
  if (input.fragmentY > fallbackBottomY) return { suppress: false, reason: "outside-fallback-range" }
  return { suppress: true, reason: "same-page-after-active-fragment" }
}

export function shouldSuppressStalePageBreakForActiveEdit(input: {
  fragment: PageFragment
  activeInlineEditIsPlainNativeParagraph: boolean
  activeInlineEditDisplayFragment: Pick<PageFragment, "pageIndex" | "y"> | null
  activeOutOfCanvasStructuralIsland?: CanvasViewportStructuralIslandInput | null
  fallbackRangePt?: number
  pageBreakMarkerHeight?: number
}): BoundarySafeSuppressionDecision {
  const { fragment } = input
  if (fragment.nodeType !== "page-break") return { suppress: false, reason: "not-page-break" }

  if (
    input.activeInlineEditIsPlainNativeParagraph &&
    input.activeInlineEditDisplayFragment != null &&
    fragment.pageIndex === input.activeInlineEditDisplayFragment.pageIndex &&
    fragment.y >= input.activeInlineEditDisplayFragment.y
  ) {
    return { suppress: true, reason: "active-native-inline-edit" }
  }

  const activeIsland = input.activeOutOfCanvasStructuralIsland
  if (!activeIsland?.active || activeIsland.mode !== "boundary-safe") {
    return { suppress: false, reason: "no-active-boundary-safe-island" }
  }

  return shouldSuppressBoundarySafePageBreak({
    active: true,
    activeNodeId: activeIsland.nodeId,
    activePageIndex: activeIsland.pageIndex,
    activeFragmentY: activeIsland.fragment?.y ?? null,
    activeFragmentHeight: activeIsland.fragment?.height ?? null,
    suppressedPageBreakNodeId: activeIsland.suppressedPageBreakNodeId,
    fragmentNodeId: fragment.nodeId,
    fragmentNodeType: fragment.nodeType,
    fragmentPageIndex: fragment.pageIndex,
    fragmentY: fragment.y,
    fallbackRangePt: input.fallbackRangePt,
    pageBreakMarkerHeight: input.pageBreakMarkerHeight,
  })
}

export function getBoundarySafeSuppressedPageBreakDecision(
  page: PaginatedPage,
  activeIsland: CanvasViewportStructuralIslandInput | null | undefined,
): PageAffectDecision {
  if (!activeIsland?.active) return { affectsPage: false, reasons: [] }
  if (page.index === activeIsland.pageIndex) {
    return { affectsPage: true, reasons: ["active-structural-island"] }
  }
  const suppressedPageBreakNodeId = activeIsland.suppressedPageBreakNodeId ?? null
  if (pageHasAnyNodeFragment(page, suppressedPageBreakNodeId)) {
    return { affectsPage: true, reasons: ["suppressed-page-break"] }
  }
  return { affectsPage: false, reasons: [] }
}

export function getStructuralIslandAffectedPageDecision(
  page: PaginatedPage,
  activeIsland: CanvasViewportStructuralIslandInput | null | undefined,
): PageAffectDecision {
  if (!activeIsland?.active) return { affectsPage: false, reasons: [] }
  if (page.index === activeIsland.pageIndex) {
    return { affectsPage: true, reasons: ["active-structural-island"] }
  }
  if (activeIsland.mode !== "boundary-safe") return { affectsPage: false, reasons: [] }
  const suppressedPageBreakNodeId = activeIsland.suppressedPageBreakNodeId ?? null
  if (pageHasAnyNodeFragment(page, suppressedPageBreakNodeId)) {
    return { affectsPage: true, reasons: ["suppressed-page-break"] }
  }
  return { affectsPage: false, reasons: [] }
}

export function getPageScopedEditDecision(
  page: PaginatedPage,
  input: PageScopedEditDecisionInput,
): PageAffectDecision {
  const reasons: string[] = []
  if (pageHasAnyNodeFragment(page, input.selectedNodeId)) reasons.push("selection")
  if (pageHasAnyNodeFragment(page, input.selectionAnchorNodeId)) reasons.push("selection")
  if (pageHasNodeFragment(page, input.inlineEditNodeId)) reasons.push("active-inline-edit")
  if (pageHasNodeFragment(page, input.wysiwygTextDraftNodeId)) reasons.push("active-inline-edit")
  for (const nodeId of input.suppressedCanvasTextNodeIds ?? []) {
    if (pageHasNodeFragment(page, nodeId)) reasons.push("active-structural-island")
  }
  if (input.inlineEditPageIndex === page.index && input.inlineEditNodeId !== null && input.inlineEditNodeId !== undefined) {
    reasons.push("active-inline-edit")
  }
  const structuralDecision = getBoundarySafeSuppressedPageBreakDecision(page, input.activeOutOfCanvasStructuralIsland)
  reasons.push(...structuralDecision.reasons)
  if (input.wysiwygDraftVisualPreview?.fragmentsByPageIndex?.has(page.index)) reasons.push("page-settle")
  if (input.wysiwygDraftVisualPreview?.caretPageIndex === page.index) reasons.push("page-settle")
  if (input.wysiwygTableCellDraftVisualChromeByPageIndex?.has(page.index)) reasons.push("page-settle")
  if (input.wysiwygTextPointerFragments?.some((target) => target.fragment.pageIndex === page.index)) {
    reasons.push("hover")
  }
  return reasons.length > 0
    ? { affectsPage: true, reasons: [...new Set(reasons)] }
    : { affectsPage: false, reasons: [] }
}

export function pageViewScopedEditPropsAffectPage(
  page: PaginatedPage,
  input: PageScopedEditDecisionInput,
): boolean {
  return getPageScopedEditDecision(page, input).affectsPage
}

export function pageViewStructuralTransitionAffectsPage(
  page: PaginatedPage,
  input: PageScopedEditDecisionInput,
): boolean {
  if (!input.activeOutOfCanvasStructuralIsland?.active) return false
  return pageViewScopedEditPropsAffectPage(page, input)
}

export function getCanvasViewportAffectedPages(
  pages: PaginatedPage[],
  input: PageScopedEditDecisionInput,
): CanvasViewportAffectedPage[] {
  return pages.flatMap((page) => {
    const decision = getPageScopedEditDecision(page, input)
    if (!decision.affectsPage) return []
    return decision.reasons.map((reason) => ({
      pageIndex: page.index,
      reason: reason as CanvasViewportAffectedPage["reason"],
    }))
  })
}

export function getCanvasViewportStructuralRenderScope(
  input: CanvasViewportRenderScopeInput,
): CanvasViewportRenderScope | null {
  const activeIsland = input.activeOutOfCanvasStructuralIsland
  if (!activeIsland?.active || !activeIsland.nodeId || activeIsland.pageIndex == null || !activeIsland.mode) {
    return null
  }
  const affectedPageIndexes: number[] = []
  let suppressedPageBreakCount = 0
  for (const page of input.pages) {
    const decision = getStructuralIslandAffectedPageDecision(page, activeIsland)
    if (decision.affectsPage) affectedPageIndexes.push(page.index)
    if (decision.reasons.includes("suppressed-page-break")) suppressedPageBreakCount += 1
  }
  return {
    nodeId: activeIsland.nodeId,
    pageIndex: activeIsland.pageIndex,
    affectedPageIndexes,
    affectedPageCount: affectedPageIndexes.length,
    totalPageCount: input.pages.length,
    mode: activeIsland.mode,
    suppressedPageBreakCount,
    unrelatedPageBreakSuppressedCount: 0,
  }
}

export function createCanvasViewportMetrics(scope: CanvasViewportRenderScope | null): CanvasViewportMetrics {
  return {
    canvasViewportAffectedPageCount: scope?.affectedPageCount ?? 0,
    canvasViewportAffectedPages: scope?.affectedPageIndexes ?? [],
    canvasViewportSuppressedPageBreakCount: scope?.suppressedPageBreakCount ?? 0,
    canvasViewportUnrelatedPageBreakSuppressedCount: scope?.unrelatedPageBreakSuppressedCount ?? 0,
  }
}
