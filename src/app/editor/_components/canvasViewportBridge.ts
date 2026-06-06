import type { PaginatedPage, PageFragment } from "@/pagination"
import {
  createCanvasViewportMetrics,
  getBoundarySafeSuppressedPageBreakDecision,
  getCanvasViewportStructuralRenderScope,
  getStructuralIslandAffectedPageDecision,
  pageHasAnyNodeFragment,
  pageHasNodeFragment,
  pageViewScopedEditPropsAffectPage,
  pageViewStructuralTransitionAffectsPage,
  shouldSuppressStalePageBreakForActiveEdit,
} from "./runtime/canvasViewportRuntime"
import type {
  CanvasViewportMetrics,
  CanvasViewportRenderScope,
  CanvasViewportStructuralIslandInput,
  PageScopedEditDecisionInput,
} from "./runtime/canvasViewportRuntime"

export interface CanvasViewportBridgeStructuralIsland {
  nodeId: string
  mode: "same-page" | "boundary-safe"
  fragment: PageFragment
  pageIndex: number
  suppressedPageBreakNodeId?: string | null
}

export type CanvasViewportBridgePageScopedEditInput =
  Omit<PageScopedEditDecisionInput, "activeOutOfCanvasStructuralIsland"> & {
    activeOutOfCanvasStructuralIsland?: CanvasViewportBridgeStructuralIsland | null
  }

export interface LazyPageFrameDecisionInput {
  lazyEnabled: boolean
  pageKey: string
  visiblePageKeys: ReadonlySet<string>
  forcedPageKeys: ReadonlySet<string>
}

export interface CanvasViewportRenderScopeBridgeInput {
  pages: PaginatedPage[]
  activeOutOfCanvasStructuralIsland?: CanvasViewportBridgeStructuralIsland | null
}

export interface ActiveWysiwygIslandStalePageBreakSuppressionInput {
  fragment: PageFragment
  activeInlineEditIsPlainNativeParagraph: boolean
  activeInlineEditDisplayFragment: Pick<PageFragment, "pageIndex" | "y"> | null
  activeOutOfCanvasStructuralIsland?: CanvasViewportBridgeStructuralIsland | null
  fallbackRangePt?: number
  pageBreakMarkerHeight?: number
}

export function toCanvasViewportStructuralIslandInput(
  activeIsland: CanvasViewportBridgeStructuralIsland | null | undefined,
): CanvasViewportStructuralIslandInput | null {
  if (!activeIsland) return null
  return {
    active: true,
    nodeId: activeIsland.nodeId,
    mode: activeIsland.mode,
    pageIndex: activeIsland.pageIndex,
    fragment: activeIsland.fragment,
    suppressedPageBreakNodeId: activeIsland.suppressedPageBreakNodeId ?? null,
  }
}

export function canvasViewportPageHasNodeFragmentBridge(
  page: PaginatedPage,
  nodeId: string | null | undefined,
): boolean {
  return pageHasNodeFragment(page, nodeId)
}

export function canvasViewportPageHasAnyNodeFragmentBridge(
  page: PaginatedPage,
  nodeId: string | null | undefined,
): boolean {
  return pageHasAnyNodeFragment(page, nodeId)
}

export function pageHasSuppressedBoundarySafePageBreakBridge(
  page: PaginatedPage,
  activeIsland: CanvasViewportBridgeStructuralIsland | null | undefined,
): boolean {
  return getBoundarySafeSuppressedPageBreakDecision(
    page,
    toCanvasViewportStructuralIslandInput(activeIsland),
  ).affectsPage
}

export function pageIsAffectedByStructuralIslandBridge(
  page: PaginatedPage,
  activeIsland: CanvasViewportBridgeStructuralIsland | null | undefined,
): boolean {
  return getStructuralIslandAffectedPageDecision(
    page,
    toCanvasViewportStructuralIslandInput(activeIsland),
  ).affectsPage
}

export function shouldSuppressStalePageBreakForActiveWysiwygIslandBridge(
  input: ActiveWysiwygIslandStalePageBreakSuppressionInput,
): boolean {
  return shouldSuppressStalePageBreakForActiveEdit({
    fragment: input.fragment,
    activeInlineEditIsPlainNativeParagraph: input.activeInlineEditIsPlainNativeParagraph,
    activeInlineEditDisplayFragment: input.activeInlineEditDisplayFragment,
    activeOutOfCanvasStructuralIsland: toCanvasViewportStructuralIslandInput(input.activeOutOfCanvasStructuralIsland),
    fallbackRangePt: input.fallbackRangePt,
    pageBreakMarkerHeight: input.pageBreakMarkerHeight,
  }).suppress
}

export function pageViewScopedEditPropsAffectPageBridge(
  page: PaginatedPage,
  props: CanvasViewportBridgePageScopedEditInput,
): boolean {
  return pageViewScopedEditPropsAffectPage(page, {
    ...props,
    activeOutOfCanvasStructuralIsland: toCanvasViewportStructuralIslandInput(props.activeOutOfCanvasStructuralIsland),
  })
}

export function pageViewStructuralTransitionAffectsPageBridge(
  page: PaginatedPage,
  props: CanvasViewportBridgePageScopedEditInput,
): boolean {
  return pageViewStructuralTransitionAffectsPage(page, {
    ...props,
    activeOutOfCanvasStructuralIsland: toCanvasViewportStructuralIslandInput(props.activeOutOfCanvasStructuralIsland),
  })
}

export function shouldRenderLazyPageFrameBridge(input: LazyPageFrameDecisionInput): boolean {
  if (!input.lazyEnabled) return true
  return input.visiblePageKeys.has(input.pageKey) || input.forcedPageKeys.has(input.pageKey)
}

export function getCanvasViewportStructuralRenderScopeBridge(
  input: CanvasViewportRenderScopeBridgeInput,
): CanvasViewportRenderScope | null {
  return getCanvasViewportStructuralRenderScope({
    pages: input.pages,
    activeOutOfCanvasStructuralIsland: toCanvasViewportStructuralIslandInput(input.activeOutOfCanvasStructuralIsland),
  })
}

export function createCanvasViewportMetricsBridge(
  scope: CanvasViewportRenderScope | null,
): CanvasViewportMetrics {
  return createCanvasViewportMetrics(scope)
}

export function createCanvasViewportRenderScopePerfFields(
  scope: CanvasViewportRenderScope | null,
  totalPageCount: number,
) {
  return {
    affectedPageCount: scope?.affectedPageCount ?? 0,
    totalPageCount: scope?.totalPageCount ?? totalPageCount,
    pageIndexes: scope?.affectedPageIndexes.join(",") ?? "",
    canvasViewportAffectedPageCount: scope?.affectedPageCount ?? 0,
    canvasViewportAffectedPages: scope?.affectedPageIndexes.join(",") ?? "",
    canvasViewportSuppressedPageBreakCount: scope?.suppressedPageBreakCount ?? 0,
    canvasViewportUnrelatedPageBreakSuppressedCount: scope?.unrelatedPageBreakSuppressedCount ?? 0,
  }
}
