import { describe, expect, it } from "vitest"
import type { TextMeasurer } from "@/layout"
import type { PageFragment, PaginatedDocument, PaginatedLine } from "@/pagination"
import {
  findWysiwygPageIndexForOffset,
  findWysiwygPageIndexInFragmentRanges,
  getWysiwygParagraphFragmentRanges,
  getWysiwygCaretCandidatesForLine,
  getWysiwygFragmentTextRange,
  resolveCaretOffsetFromPointInFragment,
  resolveCaretPositionInFragment,
  resolveCollapsedCaretOverlayInFragment,
  resolveParagraphCollapsedCaretOverlay,
  resolveParagraphCaretPosition,
  resolveParagraphSelectionOverlayRects,
  resolveSelectionOverlayRectsInFragment,
  resolveVerticalCaretNavigationInFragments,
} from "../wysiwygCaretMapping"

function makeLine(overrides: Partial<PaginatedLine> = {}): PaginatedLine {
  return {
    text: "Hello",
    x: 10,
    y: 20,
    width: 50,
    height: 12,
    segments: [{
      kind: "word",
      text: "Hello",
      start: 0,
      end: 5,
      x: 0,
      width: 50,
      breakableAfter: false,
    }],
    ...overrides,
  }
}

function makeFragment(overrides: Partial<PageFragment> = {}): PageFragment {
  return {
    nodeId: "p1",
    nodeType: "paragraph",
    pageIndex: 0,
    fragmentIndex: 0,
    x: 0,
    y: 0,
    width: 200,
    height: 40,
    renderProps: {
      fontSize: 10,
      fontFamilyKey: "default",
      align: "left",
      lineHeight: 12,
      spacingBefore: 0,
      spacingAfter: 0,
      textIndent: 0,
      indentLeft: 0,
      indentRight: 0,
    },
    lines: [makeLine()],
    ...overrides,
  }
}

function makeDoc(fragments: PageFragment[]): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [{
      sectionId: "s1",
      pages: fragments.map((fragment) => ({
        index: fragment.pageIndex,
        width: 595,
        height: 842,
        contentBox: { x: 57, y: 57, width: 481, height: 728 },
        fragments: [fragment],
        headerFragments: [],
        footerFragments: [],
      })),
    }],
  }
}

const fixedWidthMeasurer: TextMeasurer = {
  measureText(text) {
    return { width: text.length * 10 }
  },
  measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
    return fontSize * lineHeightRatio
  },
}

const variableWidthMeasurer: TextMeasurer = {
  measureText(text) {
    let width = 0
    for (const char of Array.from(text)) {
      if (char === "W") width += 30
      else if (char === "i") width += 5
      else if (char === "ก") width += 12
      else if (char === "้") width += 0
      else width += 10
    }
    return { width }
  },
  measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
    return fontSize * lineHeightRatio
  },
}

describe("WYSIWYG caret mapping contract", () => {
  it("builds caret candidates from grapheme boundaries, not raw segment boundaries", () => {
    const line = makeLine({
      text: "Aก้B",
      width: 40,
      segments: [{
        kind: "word",
        text: "Aก้B",
        start: 0,
        end: 4,
        x: 0,
        width: 40,
        breakableAfter: false,
      }],
    })
    const fragment = makeFragment({ lines: [line] })

    const candidates = getWysiwygCaretCandidatesForLine(fragment, line, 0, { textMeasurer: fixedWidthMeasurer })

    expect(candidates.map((candidate) => candidate.offset)).toEqual([0, 1, 3, 4])
    expect(candidates.some((candidate) => candidate.offset === 2)).toBe(false)
  })

  it("builds caret candidates between repeated Thai sara am characters", () => {
    const line = makeLine({
      text: "กำำ",
      width: 30,
      segments: [{
        kind: "word",
        text: "กำำ",
        start: 0,
        end: 3,
        x: 0,
        width: 30,
        breakableAfter: false,
      }],
    })
    const fragment = makeFragment({ lines: [line] })

    const candidates = getWysiwygCaretCandidatesForLine(fragment, line, 0, { textMeasurer: fixedWidthMeasurer })

    expect(candidates.map((candidate) => candidate.offset)).toEqual([0, 2, 3])
  })

  it("maps paragraph offsets to page-local caret positions with measured prefix widths", () => {
    const fragment = makeFragment({
      lines: [makeLine({
        text: "abcd",
        width: 40,
        segments: [{
          kind: "word",
          text: "abcd",
          start: 10,
          end: 14,
          x: 2,
          width: 40,
          breakableAfter: false,
        }],
      })],
    })

    const position = resolveCaretPositionInFragment(fragment, 12, { textMeasurer: fixedWidthMeasurer })

    expect(position).toMatchObject({
      offset: 12,
      pageIndex: 0,
      fragmentIndex: 0,
      lineIndex: 0,
      x: 32,
      y: 20,
      height: 12,
    })
  })

  it("snaps point-to-offset mapping to the nearest grapheme-safe caret candidate", () => {
    const line = makeLine({
      text: "Aก้B",
      width: 40,
      segments: [{
        kind: "word",
        text: "Aก้B",
        start: 0,
        end: 4,
        x: 0,
        width: 40,
        breakableAfter: false,
      }],
    })
    const fragment = makeFragment({ lines: [line] })

    const result = resolveCaretOffsetFromPointInFragment(fragment, { x: 37, y: 24 })

    expect(result?.offset).toBe(3)
  })

  it("maps point-to-offset by nearest measured candidate instead of segment ratio", () => {
    const line = makeLine({
      text: "Wiii",
      width: 45,
      segments: [{
        kind: "word",
        text: "Wiii",
        start: 0,
        end: 4,
        x: 0,
        width: 45,
        breakableAfter: false,
      }],
    })
    const fragment = makeFragment({ lines: [line] })

    const result = resolveCaretOffsetFromPointInFragment(
      fragment,
      { x: 42, y: 24 },
      { textMeasurer: variableWidthMeasurer },
    )

    expect(result).toMatchObject({
      offset: 1,
      x: 40,
      source: "segment-candidate",
    })
  })

  it("moves the caret vertically by rendered line geometry", () => {
    const fragment = makeFragment({
      lines: [
        makeLine({
          text: "Alpha",
          x: 0,
          y: 0,
          width: 50,
          segments: [{ kind: "word", text: "Alpha", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
        }),
        makeLine({
          text: "BetaBeta",
          x: 0,
          y: 12,
          width: 80,
          segments: [{ kind: "word", text: "BetaBeta", start: 5, end: 13, x: 0, width: 80, breakableAfter: false }],
        }),
      ],
    })

    const down = resolveVerticalCaretNavigationInFragments([fragment], 3, "down", {
      textMeasurer: fixedWidthMeasurer,
    })
    const up = resolveVerticalCaretNavigationInFragments([fragment], down?.offset ?? 0, "up", {
      preferredX: down?.preferredX,
      lineAffinity: down?.lineAffinity,
      textMeasurer: fixedWidthMeasurer,
    })

    expect(down).toMatchObject({ offset: 8, lineIndex: 1, preferredX: 30 })
    expect(up).toMatchObject({ offset: 3, lineIndex: 0, preferredX: 30 })
  })

  it("preserves the vertical x target across a shorter middle line", () => {
    const fragment = makeFragment({
      lines: [
        makeLine({
          text: "abcdefghij",
          x: 0,
          y: 0,
          width: 100,
          segments: [{ kind: "word", text: "abcdefghij", start: 0, end: 10, x: 0, width: 100, breakableAfter: false }],
        }),
        makeLine({
          text: "xy",
          x: 0,
          y: 12,
          width: 20,
          segments: [{ kind: "word", text: "xy", start: 10, end: 12, x: 0, width: 20, breakableAfter: false }],
        }),
        makeLine({
          text: "klmnopqrst",
          x: 0,
          y: 24,
          width: 100,
          segments: [{ kind: "word", text: "klmnopqrst", start: 12, end: 22, x: 0, width: 100, breakableAfter: false }],
        }),
      ],
    })

    const firstDown = resolveVerticalCaretNavigationInFragments([fragment], 8, "down", {
      textMeasurer: fixedWidthMeasurer,
    })
    const secondDown = resolveVerticalCaretNavigationInFragments([fragment], firstDown?.offset ?? 0, "down", {
      preferredX: firstDown?.preferredX,
      lineAffinity: firstDown?.lineAffinity,
      textMeasurer: fixedWidthMeasurer,
    })

    expect(firstDown).toMatchObject({ offset: 12, lineIndex: 1, preferredX: 80 })
    expect(secondDown).toMatchObject({ offset: 20, lineIndex: 2, preferredX: 80 })
  })

  it("moves vertically across paragraph continuation fragments", () => {
    const first = makeFragment({
      pageIndex: 0,
      fragmentIndex: 0,
      lines: [makeLine({
        text: "First",
        x: 0,
        y: 20,
        width: 50,
        segments: [{ kind: "word", text: "First", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
      })],
    })
    const second = makeFragment({
      pageIndex: 1,
      fragmentIndex: 1,
      lines: [makeLine({
        text: "Second",
        x: 0,
        y: 30,
        width: 60,
        segments: [{ kind: "word", text: "Second", start: 5, end: 11, x: 0, width: 60, breakableAfter: false }],
      })],
    })

    const down = resolveVerticalCaretNavigationInFragments([second, first], 3, "down", {
      textMeasurer: fixedWidthMeasurer,
    })

    expect(down).toMatchObject({ offset: 8, pageIndex: 1, fragmentIndex: 1, lineIndex: 0 })
  })

  it("keeps point-to-offset mapping outside emoji ZWJ grapheme internals", () => {
    const emoji = "👩‍💻"
    const text = `A${emoji}B`
    const line = makeLine({
      text,
      width: 40,
      segments: [{
        kind: "word",
        text,
        start: 0,
        end: text.length,
        x: 0,
        width: 40,
        breakableAfter: false,
      }],
    })
    const fragment = makeFragment({ lines: [line] })
    const candidates = getWysiwygCaretCandidatesForLine(fragment, line, 0, { textMeasurer: fixedWidthMeasurer })
    const result = resolveCaretOffsetFromPointInFragment(
      fragment,
      { x: 24, y: 24 },
      { textMeasurer: fixedWidthMeasurer },
    )

    expect(candidates.map((candidate) => candidate.offset)).toEqual([0, 1, 1 + emoji.length, text.length])
    expect(result?.offset).toBe(1)
  })

  it("selects the continuation fragment when an offset lands on a split boundary", () => {
    const first = makeFragment({
      pageIndex: 0,
      fragmentIndex: 0,
      lines: [makeLine({
        text: "Hello",
        x: 10,
        y: 20,
        width: 50,
        segments: [{
          kind: "word",
          text: "Hello",
          start: 0,
          end: 5,
          x: 0,
          width: 50,
          breakableAfter: false,
        }],
      })],
    })
    const second = makeFragment({
      pageIndex: 1,
      fragmentIndex: 1,
      lines: [makeLine({
        text: "world",
        x: 30,
        y: 40,
        width: 50,
        segments: [{
          kind: "word",
          text: "world",
          start: 5,
          end: 10,
          x: 0,
          width: 50,
          breakableAfter: false,
        }],
      })],
    })

    const position = resolveParagraphCaretPosition(makeDoc([first, second]), "p1", 5)

    expect(position).toMatchObject({
      offset: 5,
      pageIndex: 1,
      fragmentIndex: 1,
      x: 30,
      y: 40,
    })
  })

  it("exposes paragraph fragment ranges as the shared page-index contract", () => {
    const first = makeFragment({
      pageIndex: 0,
      fragmentIndex: 0,
      lines: [makeLine({
        text: "Hello",
        segments: [{
          kind: "word",
          text: "Hello",
          start: 0,
          end: 5,
          x: 0,
          width: 50,
          breakableAfter: false,
        }],
      })],
    })
    const second = makeFragment({
      pageIndex: 1,
      fragmentIndex: 1,
      lines: [makeLine({
        text: "world",
        segments: [{
          kind: "word",
          text: "world",
          start: 5,
          end: 10,
          x: 0,
          width: 50,
          breakableAfter: false,
        }],
      })],
    })
    const paginated = makeDoc([first, second])
    const ranges = getWysiwygParagraphFragmentRanges(paginated, "p1")

    expect(ranges).toEqual([
      { pageIndex: 0, fragmentIndex: 0, start: 0, end: 5 },
      { pageIndex: 1, fragmentIndex: 1, start: 5, end: 10 },
    ])
    expect(findWysiwygPageIndexInFragmentRanges(ranges, 4)).toBe(0)
    expect(findWysiwygPageIndexInFragmentRanges(ranges, 5)).toBe(1)
    expect(findWysiwygPageIndexInFragmentRanges(ranges, 5, {
      preferPreviousPageAtFragmentEnd: true,
    })).toBe(0)
    expect(findWysiwygPageIndexForOffset(paginated, "p1", null)).toBeNull()
  })

  it("returns null when line segment geometry is unavailable", () => {
    const fragment = makeFragment({
      lines: [{ text: "Hello", x: 10, y: 20, width: 50, height: 12 }],
    })

    expect(resolveCaretPositionInFragment(fragment, 2)).toBeNull()
    expect(resolveCaretOffsetFromPointInFragment(fragment, { x: 15, y: 21 })).toBeNull()
  })

  it("maps the caret onto an empty line created by Enter", () => {
    const fragment = makeFragment({
      lines: [
        makeLine({
          text: "Hello",
          x: 0,
          y: 0,
          width: 50,
          height: 12,
          segments: [{
            kind: "word",
            text: "Hello",
            start: 0,
            end: 5,
            x: 0,
            width: 50,
            breakableAfter: false,
          }],
        }),
        { text: "", x: 0, y: 12, width: 0, height: 12 },
      ],
    })

    expect(resolveCaretPositionInFragment(fragment, 6)).toMatchObject({
      offset: 6,
      lineIndex: 1,
      x: 0,
      y: 12,
      source: "segment-ratio",
    })
    expect(resolveCaretOffsetFromPointInFragment(fragment, { x: 4, y: 14 })).toMatchObject({
      offset: 6,
      lineIndex: 1,
    })
  })

  it("keeps the caret at the end of text before an Enter-created empty line", () => {
    const fragment = makeFragment({
      lines: [
        makeLine({
          text: "Hello",
          x: 0,
          y: 0,
          width: 50,
          height: 12,
          segments: [{
            kind: "word",
            text: "Hello",
            start: 0,
            end: 5,
            x: 0,
            width: 50,
            breakableAfter: false,
          }],
        }),
        { text: "", x: 0, y: 12, width: 0, height: 12 },
      ],
    })

    expect(resolveCaretPositionInFragment(fragment, 5)).toMatchObject({
      offset: 5,
      lineIndex: 0,
      x: 50,
      y: 0,
      source: "segment-candidate",
    })
    expect(resolveCaretOffsetFromPointInFragment(fragment, { x: 49, y: 2 })).toMatchObject({
      offset: 5,
      lineIndex: 0,
    })
  })

  it("maps a leading empty continuation line from the following text offset", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lineStart: 1,
      lineEnd: 3,
      lines: [
        { text: "", x: 0, y: 0, width: 0, height: 12 },
        makeLine({
          text: "Next",
          x: 0,
          y: 12,
          width: 40,
          height: 12,
          segments: [{
            kind: "word",
            text: "Next",
            start: 7,
            end: 11,
            x: 0,
            width: 40,
            breakableAfter: false,
          }],
        }),
      ],
    })

    expect(getWysiwygFragmentTextRange(fragment)).toEqual({ start: 6, end: 11 })
    expect(resolveCaretPositionInFragment(fragment, 6)).toMatchObject({
      offset: 6,
      lineIndex: 0,
      y: 0,
      source: "segment-ratio",
    })
    expect(resolveCaretOffsetFromPointInFragment(fragment, { x: 4, y: 2 })).toMatchObject({
      offset: 6,
      lineIndex: 0,
    })
  })

  it("resolves collapsed caret overlay geometry without touching editor rendering", () => {
    const fragment = makeFragment({
      lines: [makeLine({
        text: "abcd",
        width: 40,
        height: 14,
        segments: [{
          kind: "word",
          text: "abcd",
          start: 0,
          end: 4,
          x: 0,
          width: 40,
          breakableAfter: false,
        }],
      })],
    })

    const overlay = resolveCollapsedCaretOverlayInFragment(fragment, 2, { textMeasurer: fixedWidthMeasurer })

    expect(overlay).toEqual({
      offset: 2,
      pageIndex: 0,
      fragmentIndex: 0,
      x1: 30,
      y1: 20,
      x2: 30,
      y2: 34,
    })
  })

  it("resolves collapsed caret overlay across split paragraph fragments", () => {
    const first = makeFragment({
      pageIndex: 0,
      fragmentIndex: 0,
      lines: [makeLine({
        text: "Hello",
        x: 10,
        y: 20,
        width: 50,
        segments: [{
          kind: "word",
          text: "Hello",
          start: 0,
          end: 5,
          x: 0,
          width: 50,
          breakableAfter: false,
        }],
      })],
    })
    const second = makeFragment({
      pageIndex: 1,
      fragmentIndex: 1,
      lines: [makeLine({
        text: "world",
        x: 30,
        y: 40,
        width: 50,
        height: 16,
        segments: [{
          kind: "word",
          text: "world",
          start: 5,
          end: 10,
          x: 0,
          width: 50,
          breakableAfter: false,
        }],
      })],
    })

    const overlay = resolveParagraphCollapsedCaretOverlay(makeDoc([first, second]), "p1", 5)

    expect(overlay).toMatchObject({
      offset: 5,
      pageIndex: 1,
      fragmentIndex: 1,
      x1: 30,
      y1: 40,
      x2: 30,
      y2: 56,
    })
  })

  it("resolves single-line selection overlay geometry", () => {
    const fragment = makeFragment({
      lines: [makeLine({
        text: "abcd",
        width: 40,
        segments: [{
          kind: "word",
          text: "abcd",
          start: 0,
          end: 4,
          x: 0,
          width: 40,
          breakableAfter: false,
        }],
      })],
    })

    const rects = resolveSelectionOverlayRectsInFragment(fragment, 1, 3, { textMeasurer: fixedWidthMeasurer })

    expect(rects).toEqual([{
      pageIndex: 0,
      fragmentIndex: 0,
      lineIndex: 0,
      startOffset: 1,
      endOffset: 3,
      x: 20,
      y: 20,
      width: 20,
      height: 12,
    }])
  })

  it("resolves multi-line selection overlay geometry inside one fragment", () => {
    const fragment = makeFragment({
      lines: [
        makeLine({
          text: "abcd",
          y: 20,
          width: 40,
          segments: [{
            kind: "word",
            text: "abcd",
            start: 0,
            end: 4,
            x: 0,
            width: 40,
            breakableAfter: false,
          }],
        }),
        makeLine({
          text: "efgh",
          y: 34,
          width: 40,
          segments: [{
            kind: "word",
            text: "efgh",
            start: 4,
            end: 8,
            x: 0,
            width: 40,
            breakableAfter: false,
          }],
        }),
      ],
    })

    const rects = resolveSelectionOverlayRectsInFragment(fragment, 2, 6, { textMeasurer: fixedWidthMeasurer })

    expect(rects).toEqual([
      {
        pageIndex: 0,
        fragmentIndex: 0,
        lineIndex: 0,
        startOffset: 2,
        endOffset: 4,
        x: 30,
        y: 20,
        width: 20,
        height: 12,
      },
      {
        pageIndex: 0,
        fragmentIndex: 0,
        lineIndex: 1,
        startOffset: 4,
        endOffset: 6,
        x: 10,
        y: 34,
        width: 20,
        height: 12,
      },
    ])
  })

  it("resolves selection overlay geometry across split paragraph fragments", () => {
    const first = makeFragment({
      pageIndex: 0,
      fragmentIndex: 0,
      lines: [makeLine({
        text: "abcd",
        x: 10,
        y: 20,
        width: 40,
        segments: [{
          kind: "word",
          text: "abcd",
          start: 0,
          end: 4,
          x: 0,
          width: 40,
          breakableAfter: false,
        }],
      })],
    })
    const second = makeFragment({
      pageIndex: 1,
      fragmentIndex: 1,
      lines: [makeLine({
        text: "efgh",
        x: 30,
        y: 40,
        width: 40,
        segments: [{
          kind: "word",
          text: "efgh",
          start: 4,
          end: 8,
          x: 0,
          width: 40,
          breakableAfter: false,
        }],
      })],
    })

    const rects = resolveParagraphSelectionOverlayRects(makeDoc([first, second]), "p1", 2, 6, { textMeasurer: fixedWidthMeasurer })

    expect(rects).toEqual([
      {
        pageIndex: 0,
        fragmentIndex: 0,
        lineIndex: 0,
        startOffset: 2,
        endOffset: 4,
        x: 30,
        y: 20,
        width: 20,
        height: 12,
      },
      {
        pageIndex: 1,
        fragmentIndex: 1,
        lineIndex: 0,
        startOffset: 4,
        endOffset: 6,
        x: 30,
        y: 40,
        width: 20,
        height: 12,
      },
    ])
  })
})
