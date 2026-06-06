import { describe, expect, it } from "vitest"
import type { PageFragment, PaginatedPage } from "@/pagination"
import {
  canvasViewportPageHasAnyNodeFragmentBridge,
  canvasViewportPageHasNodeFragmentBridge,
  createCanvasViewportMetricsBridge,
  createCanvasViewportRenderScopePerfFields,
  getCanvasViewportStructuralRenderScopeBridge,
  pageHasSuppressedBoundarySafePageBreakBridge,
  pageIsAffectedByStructuralIslandBridge,
  pageViewScopedEditPropsAffectPageBridge,
  pageViewStructuralTransitionAffectsPageBridge,
  shouldRenderLazyPageFrameBridge,
  shouldSuppressStalePageBreakForActiveWysiwygIslandBridge,
  toCanvasViewportStructuralIslandInput,
  type CanvasViewportBridgeStructuralIsland,
} from "../canvasViewportBridge"

function fragment(nodeId: string, nodeType: string, pageIndex: number, y: number): PageFragment {
  return {
    nodeId,
    nodeType,
    pageIndex,
    y,
    x: 0,
    width: 100,
    height: nodeType === "page-break" ? 18 : 24,
    lines: [],
  } as unknown as PageFragment
}

function page(index: number, fragments: PageFragment[]): PaginatedPage {
  return {
    index,
    width: 612,
    height: 792,
    contentBox: { x: 72, y: 72, width: 468, height: 648 },
    fragments,
    headerFragments: [],
    footerFragments: [],
  }
}

function island(overrides: Partial<CanvasViewportBridgeStructuralIsland> = {}): CanvasViewportBridgeStructuralIsland {
  return {
    nodeId: "p2",
    mode: "boundary-safe",
    pageIndex: 0,
    fragment: fragment("p2", "paragraph", 0, 96),
    suppressedPageBreakNodeId: "break1",
    ...overrides,
  }
}

describe("canvas viewport bridge", () => {
  it("adapts structural island props to the runtime input shape", () => {
    expect(toCanvasViewportStructuralIslandInput(island())).toMatchObject({
      active: true,
      nodeId: "p2",
      mode: "boundary-safe",
      pageIndex: 0,
      suppressedPageBreakNodeId: "break1",
      fragment: { y: 96, height: 24 },
    })
    expect(toCanvasViewportStructuralIslandInput(null)).toBeNull()
  })

  it("routes page scoped and structural decisions through CanvasViewportRuntime", () => {
    const activePage = page(0, [fragment("p2", "paragraph", 0, 96)])
    const suppressedPage = page(1, [fragment("break1", "page-break", 1, 96)])
    const unrelatedPage = page(2, [fragment("break2", "page-break", 2, 96)])
    const activeIsland = island()

    expect(canvasViewportPageHasNodeFragmentBridge(activePage, "p2")).toBe(true)
    expect(canvasViewportPageHasAnyNodeFragmentBridge(suppressedPage, "break1")).toBe(true)
    expect(pageHasSuppressedBoundarySafePageBreakBridge(suppressedPage, activeIsland)).toBe(true)
    expect(pageIsAffectedByStructuralIslandBridge(activePage, activeIsland)).toBe(true)
    expect(pageViewStructuralTransitionAffectsPageBridge(activePage, {
      activeOutOfCanvasStructuralIsland: activeIsland,
    })).toBe(true)
    expect(pageViewStructuralTransitionAffectsPageBridge(suppressedPage, {
      activeOutOfCanvasStructuralIsland: activeIsland,
    })).toBe(true)
    expect(pageViewStructuralTransitionAffectsPageBridge(unrelatedPage, {
      activeOutOfCanvasStructuralIsland: activeIsland,
    })).toBe(false)
    expect(pageViewScopedEditPropsAffectPageBridge(activePage, {
      inlineEditNodeId: "p2",
      inlineEditPageIndex: 0,
    })).toBe(true)
    expect(shouldSuppressStalePageBreakForActiveWysiwygIslandBridge({
      fragment: fragment("break1", "page-break", 0, 128),
      activeInlineEditIsPlainNativeParagraph: false,
      activeInlineEditDisplayFragment: null,
      activeOutOfCanvasStructuralIsland: activeIsland,
      fallbackRangePt: 96,
      pageBreakMarkerHeight: 18,
    })).toBe(true)
    expect(shouldSuppressStalePageBreakForActiveWysiwygIslandBridge({
      fragment: fragment("break1", "page-break", 1, 128),
      activeInlineEditIsPlainNativeParagraph: false,
      activeInlineEditDisplayFragment: null,
      activeOutOfCanvasStructuralIsland: activeIsland,
      fallbackRangePt: 96,
      pageBreakMarkerHeight: 18,
    })).toBe(false)
  })

  it("keeps lazy page rendering and structural render metrics payloads stable", () => {
    expect(shouldRenderLazyPageFrameBridge({
      lazyEnabled: false,
      pageKey: "2",
      visiblePageKeys: new Set(),
      forcedPageKeys: new Set(),
    })).toBe(true)
    expect(shouldRenderLazyPageFrameBridge({
      lazyEnabled: true,
      pageKey: "2",
      visiblePageKeys: new Set(["1"]),
      forcedPageKeys: new Set(["2"]),
    })).toBe(true)
    expect(shouldRenderLazyPageFrameBridge({
      lazyEnabled: true,
      pageKey: "2",
      visiblePageKeys: new Set(["1"]),
      forcedPageKeys: new Set(),
    })).toBe(false)

    const scope = getCanvasViewportStructuralRenderScopeBridge({
      pages: [
        page(0, [fragment("p2", "paragraph", 0, 96)]),
        page(1, [fragment("break1", "page-break", 1, 96)]),
      ],
      activeOutOfCanvasStructuralIsland: island(),
    })

    expect(scope?.affectedPageIndexes).toEqual([0, 1])
    expect(createCanvasViewportMetricsBridge(scope)).toEqual({
      canvasViewportAffectedPageCount: 2,
      canvasViewportAffectedPages: [0, 1],
      canvasViewportSuppressedPageBreakCount: 1,
      canvasViewportUnrelatedPageBreakSuppressedCount: 0,
    })
    expect(createCanvasViewportRenderScopePerfFields(scope, 2)).toMatchObject({
      affectedPageCount: 2,
      pageIndexes: "0,1",
      canvasViewportAffectedPageCount: 2,
      canvasViewportAffectedPages: "0,1",
    })
  })
})
