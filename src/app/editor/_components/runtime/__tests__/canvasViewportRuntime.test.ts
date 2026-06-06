import { describe, expect, it } from "vitest"
import type { PageFragment, PaginatedPage } from "@/pagination"
import {
  getCanvasViewportStructuralRenderScope,
  getPageScopedEditDecision,
  pageViewScopedEditPropsAffectPage,
  pageViewStructuralTransitionAffectsPage,
  shouldSuppressBoundarySafePageBreak,
  shouldSuppressStalePageBreakForActiveEdit,
} from "../canvasViewportRuntime"

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

function island(overrides: Partial<Parameters<typeof shouldSuppressStalePageBreakForActiveEdit>[0]["activeOutOfCanvasStructuralIsland"]> = {}) {
  return {
    active: true,
    nodeId: "p2",
    mode: "boundary-safe" as const,
    pageIndex: 0,
    fragment: { y: 96, height: 24 },
    suppressedPageBreakNodeId: "break1",
    ...overrides,
  }
}

describe("CanvasViewportRuntime", () => {
  it("suppresses the targeted boundary-safe page break by node id", () => {
    expect(shouldSuppressBoundarySafePageBreak({
      active: true,
      activePageIndex: 0,
      activeFragmentY: 96,
      activeFragmentHeight: 24,
      suppressedPageBreakNodeId: "break1",
      fragmentNodeId: "break1",
      fragmentNodeType: "page-break",
      fragmentPageIndex: 0,
      fragmentY: 120,
    })).toEqual({ suppress: true, reason: "suppressed-page-break-node" })
  })

  it("does not suppress unrelated page breaks when a node id is available", () => {
    expect(shouldSuppressBoundarySafePageBreak({
      active: true,
      activePageIndex: 0,
      activeFragmentY: 96,
      activeFragmentHeight: 24,
      suppressedPageBreakNodeId: "break1",
      fragmentNodeId: "break2",
      fragmentNodeType: "page-break",
      fragmentPageIndex: 0,
      fragmentY: 120,
    })).toEqual({ suppress: false, reason: "unrelated-page-break-node" })
  })

  it("keeps the y/page fallback narrow when no page-break node id is available", () => {
    expect(shouldSuppressBoundarySafePageBreak({
      active: true,
      activePageIndex: 0,
      activeFragmentY: 100,
      activeFragmentHeight: 20,
      suppressedPageBreakNodeId: null,
      fragmentNodeId: "near",
      fragmentNodeType: "page-break",
      fragmentPageIndex: 0,
      fragmentY: 128,
    }).suppress).toBe(true)
    expect(shouldSuppressBoundarySafePageBreak({
      active: true,
      activePageIndex: 0,
      activeFragmentY: 100,
      activeFragmentHeight: 20,
      suppressedPageBreakNodeId: null,
      fragmentNodeId: "other-page",
      fragmentNodeType: "page-break",
      fragmentPageIndex: 1,
      fragmentY: 128,
    }).suppress).toBe(false)
    expect(shouldSuppressBoundarySafePageBreak({
      active: true,
      activePageIndex: 0,
      activeFragmentY: 100,
      activeFragmentHeight: 20,
      suppressedPageBreakNodeId: null,
      fragmentNodeId: "before",
      fragmentNodeType: "page-break",
      fragmentPageIndex: 0,
      fragmentY: 80,
    }).suppress).toBe(false)
  })

  it("does not suppress while inactive", () => {
    expect(shouldSuppressStalePageBreakForActiveEdit({
      fragment: fragment("break1", "page-break", 0, 120),
      activeInlineEditIsPlainNativeParagraph: false,
      activeInlineEditDisplayFragment: null,
      activeOutOfCanvasStructuralIsland: island({ active: false }),
    }).suppress).toBe(false)
  })

  it("marks only the active island page affected unless a suppressed page break is present", () => {
    const activePage = page(0, [fragment("p2", "paragraph", 0, 96)])
    const otherPage = page(1, [fragment("p3", "paragraph", 1, 96)])
    const input = {
      activeOutOfCanvasStructuralIsland: island({ mode: "same-page", suppressedPageBreakNodeId: null }),
    }

    expect(pageViewStructuralTransitionAffectsPage(activePage, input)).toBe(true)
    expect(pageViewStructuralTransitionAffectsPage(otherPage, input)).toBe(false)
  })

  it("marks the suppressed page-break page affected", () => {
    const activePage = page(0, [fragment("p2", "paragraph", 0, 96)])
    const suppressedPage = page(1, [fragment("break1", "page-break", 1, 96)])
    const scope = getCanvasViewportStructuralRenderScope({
      pages: [activePage, suppressedPage],
      activeOutOfCanvasStructuralIsland: island({ pageIndex: 0, suppressedPageBreakNodeId: "break1" }),
    })

    expect(scope?.affectedPageIndexes).toEqual([0, 1])
    expect(scope?.suppressedPageBreakCount).toBe(1)
  })

  it("keeps same-page structural render scope on the active page", () => {
    const activePage = page(0, [fragment("p2", "paragraph", 0, 96)])
    const suppressedPage = page(1, [fragment("break1", "page-break", 1, 96)])
    const scope = getCanvasViewportStructuralRenderScope({
      pages: [activePage, suppressedPage],
      activeOutOfCanvasStructuralIsland: island({ mode: "same-page", suppressedPageBreakNodeId: "break1" }),
    })

    expect(scope?.affectedPageIndexes).toEqual([0])
    expect(scope?.suppressedPageBreakCount).toBe(0)
  })

  it("scopes edit props to relevant inline, selection, and pointer pages", () => {
    const activePage = page(0, [fragment("p1", "paragraph", 0, 96)])
    const pointerPage = page(1, [fragment("p2", "paragraph", 1, 96)])
    const otherPage = page(2, [fragment("p3", "paragraph", 2, 96)])
    const input = {
      selectedNodeId: null,
      selectionAnchorNodeId: null,
      inlineEditNodeId: "p1",
      inlineEditPageIndex: 0,
      wysiwygTextDraftNodeId: "p1",
      wysiwygDraftVisualPreview: null,
      wysiwygTableCellDraftVisualChromeByPageIndex: new Map<number, PageFragment[]>(),
      wysiwygTextPointerFragments: [{ fragment: fragment("p2", "paragraph", 1, 96) }],
    }

    expect(getPageScopedEditDecision(activePage, input)).toMatchObject({ affectsPage: true })
    expect(getPageScopedEditDecision(pointerPage, input)).toMatchObject({ affectsPage: true })
    expect(getPageScopedEditDecision(otherPage, input)).toEqual({ affectsPage: false, reasons: [] })
  })

  it("supports memo equality decisions through stable affected-page results", () => {
    const activePage = page(0, [fragment("p2", "paragraph", 0, 96)])
    const suppressedPage = page(1, [fragment("break1", "page-break", 1, 96)])
    const unrelatedPage = page(2, [fragment("break2", "page-break", 2, 96)])
    const input = {
      activeOutOfCanvasStructuralIsland: island({ suppressedPageBreakNodeId: "break1" }),
    }

    expect(pageViewScopedEditPropsAffectPage(activePage, input)).toBe(true)
    expect(pageViewScopedEditPropsAffectPage(suppressedPage, input)).toBe(true)
    expect(pageViewScopedEditPropsAffectPage(unrelatedPage, input)).toBe(false)
  })
})
