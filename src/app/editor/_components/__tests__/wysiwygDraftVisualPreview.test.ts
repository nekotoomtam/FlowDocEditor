import { describe, expect, it } from "vitest"
import type { TextMeasurer } from "@/layout"
import type { PageFragment, PaginatedLine, PaginatedPage } from "@/pagination"
import {
  resolveWysiwygDraftVisualCaretPageIndex,
  shiftWysiwygDraftPreviewDownstreamFragments,
  splitWysiwygDraftVisualFragments,
} from "../wysiwygDraftVisualPreview"

function page(index: number): PaginatedPage {
  return {
    index,
    width: 200,
    height: 140,
    contentBox: { x: 10, y: 20, width: 180, height: 80 },
    fragments: [],
    headerFragments: [],
    footerFragments: [],
  }
}

function line(text: string, y: number, start: number, end: number): PaginatedLine {
  return {
    text,
    x: 10,
    y,
    width: Math.max(1, text.length * 8),
    height: 10,
    segments: text
      ? [{ kind: "word", text, start, end, x: 0, width: Math.max(1, text.length * 8), breakableAfter: false }]
      : [],
  }
}

function fragment(overrides: Partial<PageFragment> = {}): PageFragment {
  return {
    nodeId: "p1",
    nodeType: "paragraph",
    pageIndex: 0,
    x: 10,
    y: 70,
    width: 160,
    height: 30,
    lineStart: 0,
    lineEnd: 3,
    fragmentIndex: 0,
    continuesFrom: false,
    isContinued: false,
    lines: [
      line("one", 70, 0, 3),
      line("two", 80, 4, 7),
      line("three", 90, 8, 13),
    ],
    ...overrides,
  }
}

const fixedMeasurer: TextMeasurer = {
  measureText: (text) => ({ width: text.length * 8 }),
  measureLineHeight: (_fontFamilyKey, fontSize, lineHeightRatio) => fontSize * lineHeightRatio,
}

describe("wysiwygDraftVisualPreview", () => {
  it("applies widow prevention when moving overflowing draft lines to the next page during live preview", () => {
    const draftLines = [
      line("one", 70, 0, 3),
      line("two", 80, 4, 7),
      line("three", 90, 8, 13),
      line("four", 100, 14, 18),
    ]

    const fragments = splitWysiwygDraftVisualFragments({
      sourceFragment: fragment(),
      draftLines,
      draftHeight: 40,
      pages: [page(0), page(1)],
    })

    expect(fragments).toHaveLength(2)
    expect(fragments[0]).toMatchObject({
      pageIndex: 0,
      lineStart: 0,
      lineEnd: 2,
      height: 20,
      continuesFrom: false,
      isContinued: true,
    })
    expect(fragments[0].lines?.map((candidate) => candidate.text)).toEqual(["one", "two"])
    expect(fragments[1]).toMatchObject({
      pageIndex: 1,
      y: 20,
      lineStart: 2,
      lineEnd: 4,
      height: 20,
      continuesFrom: true,
      isContinued: false,
    })
    expect(fragments[1].lines?.map((candidate) => [candidate.text, candidate.y])).toEqual([["three", 20], ["four", 30]])
  })

  it("can preserve source-page boundary lines for table-cell live preview", () => {
    const draftLines = [
      line("one", 70, 0, 3),
      line("two", 80, 4, 7),
      line("three", 90, 8, 13),
      line("four", 100, 14, 18),
    ]

    const fragments = splitWysiwygDraftVisualFragments({
      sourceFragment: fragment(),
      draftLines,
      draftHeight: 40,
      pages: [page(0), page(1)],
      preserveBoundarySingleLines: true,
    })

    expect(fragments).toHaveLength(2)
    expect(fragments[0].lines?.map((candidate) => candidate.text)).toEqual(["one", "two", "three"])
    expect(fragments[0]).toMatchObject({
      pageIndex: 0,
      lineEnd: 3,
      isContinued: true,
    })
    expect(fragments[1].lines?.map((candidate) => candidate.text)).toEqual(["four"])
  })

  it("keeps a same-page draft as one fragment with the measured draft height", () => {
    const fragments = splitWysiwygDraftVisualFragments({
      sourceFragment: fragment(),
      draftLines: [
        line("one", 70, 0, 3),
        line("two", 80, 4, 7),
      ],
      draftHeight: 26,
      pages: [page(0), page(1)],
    })

    expect(fragments).toHaveLength(1)
    expect(fragments[0]).toMatchObject({
      pageIndex: 0,
      lineStart: 0,
      lineEnd: 2,
      height: 26,
      continuesFrom: false,
      isContinued: false,
    })
  })

  it("resolves caret ownership to the overflow visual fragment", () => {
    const fragments = splitWysiwygDraftVisualFragments({
      sourceFragment: fragment(),
      draftLines: [
        line("one", 70, 0, 3),
        line("two", 80, 4, 7),
        line("three", 90, 8, 13),
        line("four", 100, 14, 18),
      ],
      draftHeight: 40,
      pages: [page(0), page(1)],
    })

    expect(resolveWysiwygDraftVisualCaretPageIndex({
      fragments,
      caretOffset: 18,
      textMeasurer: fixedMeasurer,
    })).toBe(1)
  })

  it("can keep a boundary caret on the source visual fragment", () => {
    const fragments = splitWysiwygDraftVisualFragments({
      sourceFragment: fragment(),
      draftLines: [
        line("one", 70, 0, 3),
        line("two", 80, 4, 7),
        line("three", 90, 8, 13),
        line("four", 100, 14, 18),
      ],
      draftHeight: 40,
      pages: [page(0), page(1)],
      preserveBoundarySingleLines: true,
    })

    expect(resolveWysiwygDraftVisualCaretPageIndex({
      fragments,
      caretOffset: 13,
      textMeasurer: fixedMeasurer,
      preferPreviousPageAtFragmentEnd: true,
    })).toBe(0)
  })

  it("shifts downstream page fragments when inserting a live continuation preview", () => {
    const downstream = fragment({
      nodeId: "p2",
      y: 20,
      lineStart: 0,
      lineEnd: 1,
      lines: [line("downstream", 20, 0, 10)],
    })
    const draftContinuation = fragment({
      pageIndex: 1,
      y: 20,
      height: 20,
      fragmentIndex: 1,
      lineStart: 3,
      lineEnd: 5,
      continuesFrom: true,
      isContinued: false,
      lines: [
        line("four", 20, 14, 18),
        line("five", 30, 19, 23),
      ],
    })

    const shifted = shiftWysiwygDraftPreviewDownstreamFragments({
      fragments: [downstream],
      draftFragment: draftContinuation,
    })

    expect(shifted[0].y).toBe(40)
    expect(shifted[0].lines?.[0].y).toBe(40)
  })

  it("can include visual chrome in the downstream preview shift", () => {
    const downstream = fragment({
      nodeId: "p2",
      y: 20,
      lines: [line("downstream", 20, 0, 10)],
    })
    const draftContinuation = fragment({
      pageIndex: 1,
      y: 20,
      height: 20,
      continuesFrom: true,
      lines: [line("four", 20, 14, 18)],
    })

    const shifted = shiftWysiwygDraftPreviewDownstreamFragments({
      fragments: [downstream],
      draftFragment: draftContinuation,
      extraShiftY: 6,
    })

    expect(shifted[0].y).toBe(46)
    expect(shifted[0].lines?.[0].y).toBe(46)
  })
})
