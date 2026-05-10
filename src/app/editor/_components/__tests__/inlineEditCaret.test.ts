import { describe, expect, it } from "vitest"
import {
  findInlineEditPageIndexForCaret,
  findInlineEditPageIndexInRanges,
  getInlineEditFragmentRanges,
} from "../inlineEditCaret"
import type { PaginatedDocument, PageFragment, PaginatedLine } from "@/pagination"

function line(start: number, end: number): PaginatedLine {
  const text = "x".repeat(Math.max(0, end - start))
  return {
    text,
    x: 0,
    y: 0,
    width: end - start,
    height: 12,
    segments: [{ kind: "word", text, start, end, x: 0, width: end - start, breakableAfter: false }],
  }
}

function fragment(overrides: Partial<PageFragment>): PageFragment {
  return {
    nodeId: "p1",
    nodeType: "paragraph",
    pageIndex: 0,
    x: 0,
    y: 0,
    width: 200,
    height: 24,
    lines: [],
    ...overrides,
  }
}

function doc(fragments: PageFragment[]): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [{
      sectionId: "s1",
      pages: fragments.map((pageFragment) => ({
        index: pageFragment.pageIndex,
        width: 595,
        height: 842,
        contentBox: { x: 57, y: 57, width: 481, height: 728 },
        fragments: [pageFragment],
        headerFragments: [],
        footerFragments: [],
      })),
    }],
  }
}

describe("findInlineEditPageIndexForCaret", () => {
  it("keeps the caret on the first page when it is inside the first fragment", () => {
    const paginated = doc([
      fragment({ pageIndex: 0, fragmentIndex: 0, lines: [line(0, 10)] }),
      fragment({ pageIndex: 1, fragmentIndex: 1, lines: [line(10, 20)] }),
    ])

    expect(findInlineEditPageIndexForCaret(paginated, "p1", 5)).toBe(0)
  })

  it("moves the caret to the continuation page when the index crosses the split boundary", () => {
    const paginated = doc([
      fragment({ pageIndex: 0, fragmentIndex: 0, lines: [line(0, 10)] }),
      fragment({ pageIndex: 1, fragmentIndex: 1, lines: [line(10, 20)] }),
    ])

    expect(findInlineEditPageIndexForCaret(paginated, "p1", 15)).toBe(1)
  })

  it("treats an exact split boundary as belonging to the continuation fragment", () => {
    const paginated = doc([
      fragment({ pageIndex: 0, fragmentIndex: 0, lines: [line(0, 10)] }),
      fragment({ pageIndex: 1, fragmentIndex: 1, lines: [line(10, 20)] }),
    ])

    expect(findInlineEditPageIndexForCaret(paginated, "p1", 10)).toBe(1)
  })

  it("moves back when the caret returns before the continuation boundary", () => {
    const paginated = doc([
      fragment({ pageIndex: 0, fragmentIndex: 0, lines: [line(0, 10)] }),
      fragment({ pageIndex: 1, fragmentIndex: 1, lines: [line(10, 20)] }),
    ])

    expect(findInlineEditPageIndexForCaret(paginated, "p1", 9)).toBe(0)
  })

  it("returns null when segment offsets are unavailable", () => {
    const paginated = doc([
      fragment({ pageIndex: 0, lines: [{ text: "hello", x: 0, y: 0, width: 50, height: 12 }] }),
    ])

    expect(findInlineEditPageIndexForCaret(paginated, "p1", 3)).toBeNull()
  })

  it("can reuse precomputed fragment ranges across caret moves", () => {
    const paginated = doc([
      fragment({ pageIndex: 0, fragmentIndex: 0, lines: [line(0, 10)] }),
      fragment({ pageIndex: 1, fragmentIndex: 1, lines: [line(10, 20)] }),
    ])
    const ranges = getInlineEditFragmentRanges(paginated, "p1")

    expect(ranges).toEqual([
      { pageIndex: 0, fragmentIndex: 0, start: 0, end: 10 },
      { pageIndex: 1, fragmentIndex: 1, start: 10, end: 20 },
    ])
    expect(findInlineEditPageIndexInRanges(ranges, 5)).toBe(0)
    expect(findInlineEditPageIndexInRanges(ranges, 15)).toBe(1)
  })
})
