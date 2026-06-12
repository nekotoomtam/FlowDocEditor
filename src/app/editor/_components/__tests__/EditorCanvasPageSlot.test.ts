import { describe, it, expect, vi } from "vitest"
import {
  arePageFragmentsPaintEqual,
  arePageFragmentsStructurallyEqual,
  arePageViewPropsEqual,
  buildEditorCanvasPageSlotAttributionEvent,
  type PageViewProps,
} from "../EditorCanvas"
import type { PageFragment, PaginatedPage } from "@/pagination/types"

const PAGE_BOX = { x: 0, y: 0, width: 100, height: 200 }
const TEST_DOC = { document: { id: "doc-1" } }

function createPaintComparablePage(textColor: string): PaginatedPage {
  return {
    index: 0,
    width: 100,
    height: 200,
    contentBox: PAGE_BOX,
    headerZoneBox: null,
    footerZoneBox: null,
    fragments: [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        renderProps: {
          fontSize: 12,
          fontFamily: "Arial",
          lineHeight: 1.2,
          textColor,
          textDecoration: "none",
          strikethrough: false,
          align: "left",
        },
      } as unknown as PageFragment,
    ],
    headerFragments: [],
    footerFragments: [],
  } as unknown as PaginatedPage
}

function createPageViewProps(
  page: PaginatedPage,
  renderInvalidationPageAffected: boolean | null,
  overrides: Partial<PageViewProps> = {},
): PageViewProps {
  return {
    page,
    doc: TEST_DOC,
    pageScopedEditAffected: false,
    renderInvalidationPageAffected,
    ...overrides,
  } as unknown as PageViewProps
}

describe("arePageFragmentsStructurallyEqual", () => {
  it("returns true for structurally identical fragments with same text version", () => {
    const a: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        nodeTextVersion: 1234,
      },
    ]
    const b: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        nodeTextVersion: 1234,
      },
    ]

    expect(arePageFragmentsStructurallyEqual(a, b)).toBe(true)
  })

  it("returns false for structurally identical fragments with DIFFERENT text version", () => {
    const a: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        nodeTextVersion: 1234,
      },
    ]
    const b: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        nodeTextVersion: 5678, // Changed text version
      },
    ]

    expect(arePageFragmentsStructurallyEqual(a, b)).toBe(false)
  })

  it("keeps structural equality independent from visual paint metadata", () => {
    const a: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        renderProps: {
          fontSize: 12,
          fontFamily: "Arial",
          lineHeight: 1.2,
          textColor: "111111",
          textDecoration: "none",
          strikethrough: false,
          align: "left",
        },
      } as unknown as PageFragment,
    ]
    const b: PageFragment[] = [
      {
        ...a[0],
        renderProps: {
          ...a[0].renderProps!,
          textColor: "DC2626",
        },
      },
    ]

    expect(arePageFragmentsStructurallyEqual(a, b)).toBe(true)
    expect(arePageFragmentsPaintEqual(a, b)).toBe(false)
  })

  it("detects line run style paint changes without treating them as structural changes", () => {
    const a: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        lines: [
          {
            text: "Alpha",
            x: 0,
            y: 0,
            width: 60,
            height: 12,
            runs: [
              {
                text: "Alpha",
                x: 0,
                width: 60,
                sourceType: "text",
                sourceId: "run-1",
                style: {
                  fontSize: 12,
                  fontFamily: "Arial",
                  textColor: "111111",
                  textDecoration: "none",
                  strikethrough: false,
                },
              },
            ],
          },
        ],
      } as unknown as PageFragment,
    ]
    const b: PageFragment[] = [
      {
        ...a[0],
        lines: [
          {
            ...a[0].lines![0],
            runs: [
              {
                ...a[0].lines![0].runs![0],
                style: {
                  ...a[0].lines![0].runs![0].style,
                  textDecoration: "underline",
                },
              },
            ],
          },
        ],
      },
    ]

    expect(arePageFragmentsStructurallyEqual(a, b)).toBe(true)
    expect(arePageFragmentsPaintEqual(a, b)).toBe(false)
  })

  it("compares paint fields without serializing fragment line payloads", () => {
    const stringifySpy = vi.spyOn(JSON, "stringify")
    const a: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        renderProps: {
          fontSize: 12,
          fontFamilyKey: "sarabun",
          lineHeight: 1.2,
          textColor: "111111",
          textDecoration: "none",
          strikethrough: false,
          align: "left",
          spacingBefore: 0,
          spacingAfter: 0,
          textIndent: 0,
          indentLeft: 0,
          indentRight: 0,
        },
        lines: [
          {
            text: "Alpha",
            x: 0,
            y: 0,
            width: 60,
            height: 12,
            runs: [
              {
                text: "Alpha",
                start: 0,
                end: 5,
                x: 0,
                width: 60,
                sourceType: "text",
                style: {
                  fontSize: 12,
                  fontFamilyKey: "sarabun",
                  textColor: "111111",
                  fontWeight: "normal",
                  fontStyle: "normal",
                  textDecoration: "none",
                  strikethrough: false,
                  fontVariant: "regular",
                  lineHeight: 1.2,
                },
              },
            ],
          },
        ],
      } as unknown as PageFragment,
    ]
    const b: PageFragment[] = [
      {
        ...a[0],
        renderProps: { ...a[0].renderProps! },
        lines: a[0].lines!.map((line) => ({
          ...line,
          runs: line.runs?.map((run) => ({
            ...run,
            style: { ...run.style },
          })),
        })),
      },
    ]

    expect(arePageFragmentsPaintEqual(a, b)).toBe(true)
    expect(stringifySpy).not.toHaveBeenCalled()
    stringifySpy.mockRestore()
  })
})

describe("arePageViewPropsEqual", () => {
  it("uses render invalidation scope to skip paint comparison for unaffected pages", () => {
    const beforePage = createPaintComparablePage("111111")
    const afterPage = createPaintComparablePage("DC2626")

    expect(arePageFragmentsStructurallyEqual(beforePage.fragments, afterPage.fragments)).toBe(true)
    expect(arePageFragmentsPaintEqual(beforePage.fragments, afterPage.fragments)).toBe(false)
    expect(arePageViewPropsEqual(
      createPageViewProps(beforePage, null),
      createPageViewProps(afterPage, false),
    )).toBe(true)
  })

  it("keeps paint comparison for affected and unknown invalidation pages", () => {
    const beforePage = createPaintComparablePage("111111")
    const afterPage = createPaintComparablePage("DC2626")

    expect(arePageViewPropsEqual(
      createPageViewProps(beforePage, null),
      createPageViewProps(afterPage, true),
    )).toBe(false)
    expect(arePageViewPropsEqual(
      createPageViewProps(beforePage, null),
      createPageViewProps(afterPage, null),
    )).toBe(false)
  })
})

describe("buildEditorCanvasPageSlotAttributionEvent", () => {
  it("does not record page slot attribution without an active WYSIWYG scope", () => {
    const page = createPaintComparablePage("111111")

    expect(buildEditorCanvasPageSlotAttributionEvent(
      createPageViewProps(page, null),
      createPageViewProps(page, null),
      true,
      "page-view-props",
      10,
    )).toBeNull()
  })

  it("records whether an active WYSIWYG page slot would render", () => {
    const page = createPaintComparablePage("111111")
    const event = buildEditorCanvasPageSlotAttributionEvent(
      createPageViewProps(page, null, {
        wysiwygTextDraftNodeId: "p1",
        pageScopedEditAffected: false,
      }),
      createPageViewProps(page, null, {
        wysiwygTextDraftNodeId: "p1",
        pageScopedEditAffected: true,
      }),
      false,
      "page-view-props",
      10,
    )

    expect(event).toMatchObject({
      kind: "editor-canvas-page-slot-attribution",
      nodeId: "p1",
      pageIndex: 0,
      fragmentCount: 1,
      componentName: "EditorCanvasPageSlotMemo",
      action: "memo-miss",
      renderReason: "page-view-props",
      pageSlotMemoEqual: false,
      pageSlotWouldRender: true,
      pageScopedEditAffected: true,
      active: true,
      unaffectedPage: false,
    })
  })

  it("records WYSIWYG page slot memo hits separately from renders", () => {
    const page = createPaintComparablePage("111111")
    const event = buildEditorCanvasPageSlotAttributionEvent(
      createPageViewProps(page, null, {
        wysiwygTextDraftNodeId: "p1",
        pageScopedEditAffected: false,
      }),
      createPageViewProps(page, null, {
        wysiwygTextDraftNodeId: "p1",
        pageScopedEditAffected: false,
      }),
      true,
      "scoped-edit-unaffected",
      10,
    )

    expect(event).toMatchObject({
      kind: "editor-canvas-page-slot-attribution",
      action: "memo-hit",
      renderReason: "scoped-edit-unaffected",
      pageSlotMemoEqual: true,
      pageSlotWouldRender: false,
      pageScopedEditAffected: false,
      active: false,
      unaffectedPage: true,
    })
  })
})
