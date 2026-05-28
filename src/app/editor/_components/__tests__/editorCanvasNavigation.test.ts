import { describe, expect, it } from "vitest"
import type { PaginatedDocument, PageFragment } from "@/pagination"
import {
  buildEditorPageNavigationIndex,
  collectEditorPageNavItems,
  findFirstPageIndexForNode,
  findFirstPageIndexForNodeInIndex,
  findNearestPageIndexInItems,
} from "../shell/editorCanvasNavigation"

function fragment(partial: Partial<PageFragment> & Pick<PageFragment, "nodeId" | "nodeType">): PageFragment {
  return {
    pageIndex: partial.pageIndex ?? 0,
    x: partial.x ?? 20,
    y: partial.y ?? 40,
    width: partial.width ?? 120,
    height: partial.height ?? 16,
    lines: partial.lines ?? [],
    ...partial,
  }
}

function makePaginated(): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [
      {
        sectionId: "s1",
        pages: [
          {
            index: 0,
            width: 200,
            height: 300,
            contentBox: { x: 10, y: 20, width: 180, height: 250 },
            headerFragments: [
              fragment({ nodeId: "header", nodeType: "paragraph", y: 8, lines: [{ text: "H", x: 0, y: 0, width: 10, height: 10 }] }),
            ],
            fragments: [
              fragment({
                nodeId: "intro",
                nodeType: "paragraph",
                y: 40,
                lines: [
                  { text: "A", x: 0, y: 0, width: 10, height: 10 },
                  { text: "B", x: 0, y: 12, width: 10, height: 10 },
                ],
              }),
              fragment({ nodeId: "table", nodeType: "flow-table", y: 80, height: 60 }),
            ],
            footerFragments: [
              fragment({ nodeId: "footer", nodeType: "paragraph", y: 280 }),
            ],
          },
          {
            index: 1,
            width: 200,
            height: 300,
            contentBox: { x: 10, y: 20, width: 180, height: 250 },
            headerFragments: [],
            fragments: [
              fragment({ nodeId: "intro", nodeType: "paragraph", pageIndex: 1, y: 40 }),
              fragment({ nodeId: "continued", nodeType: "paragraph", pageIndex: 1, y: 64 }),
            ],
            footerFragments: [],
          },
        ],
      },
    ],
  }
}

describe("editor canvas navigation", () => {
  it("collects page navigation items with content boxes and thumbnail fragments", () => {
    const items = collectEditorPageNavItems(makePaginated())

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      key: "0-0",
      pageIndex: 0,
      sectionIndex: 0,
      pageArrayIndex: 0,
      width: 200,
      height: 300,
      contentBox: { x: 10, y: 20, width: 180, height: 250 },
    })
    expect(items[0].thumbnailFragments.map((item) => item.zone)).toEqual([
      "header",
      "body",
      "body",
      "footer",
    ])
    expect(items[0].thumbnailFragments.find((item) => item.nodeType === "paragraph" && item.zone === "body")?.lineCount)
      .toBe(2)
  })

  it("finds the first page that contains a selected node", () => {
    const paginated = makePaginated()

    expect(findFirstPageIndexForNode(paginated, "intro")).toBe(0)
    expect(findFirstPageIndexForNode(paginated, "continued")).toBe(1)
    expect(findFirstPageIndexForNode(paginated, "missing")).toBeNull()
    expect(findFirstPageIndexForNode(paginated, null)).toBeNull()
  })

  it("builds a reusable navigation index for page and node lookups", () => {
    const index = buildEditorPageNavigationIndex(makePaginated())

    expect(index.pageItems).toHaveLength(2)
    expect(index.pageKeyByPageIndex.get(0)).toBe("0-0")
    expect(index.pageKeyByPageIndex.get(1)).toBe("0-1")
    expect(findFirstPageIndexForNodeInIndex(index, "header")).toBe(0)
    expect(findFirstPageIndexForNodeInIndex(index, "intro")).toBe(0)
    expect(findFirstPageIndexForNodeInIndex(index, "continued")).toBe(1)
    expect(findFirstPageIndexForNodeInIndex(index, "missing")).toBeNull()
    expect(index.pageKeysByNodeId.get("intro")).toEqual(["0-0", "0-1"])
  })

  it("falls back to the nearest page index instead of the first page", () => {
    const items = [
      { pageIndex: 0 },
      { pageIndex: 10 },
      { pageIndex: 20 },
    ]

    expect(findNearestPageIndexInItems(items, 18)).toBe(20)
    expect(findNearestPageIndexInItems(items, 11)).toBe(10)
    expect(findNearestPageIndexInItems(items, 100)).toBe(20)
    expect(findNearestPageIndexInItems([], 100)).toBeNull()
  })
})
