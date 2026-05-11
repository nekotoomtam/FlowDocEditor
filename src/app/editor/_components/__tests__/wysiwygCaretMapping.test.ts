import { describe, expect, it } from "vitest"
import type { TextMeasurer } from "@/layout"
import type { PageFragment, PaginatedDocument, PaginatedLine } from "@/pagination"
import {
  getWysiwygCaretCandidatesForLine,
  resolveCaretOffsetFromPointInFragment,
  resolveCaretPositionInFragment,
  resolveCollapsedCaretOverlayInFragment,
  resolveParagraphCollapsedCaretOverlay,
  resolveParagraphCaretPosition,
  resolveParagraphSelectionOverlayRects,
  resolveSelectionOverlayRectsInFragment,
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

  it("returns null when line segment geometry is unavailable", () => {
    const fragment = makeFragment({
      lines: [{ text: "Hello", x: 10, y: 20, width: 50, height: 12 }],
    })

    expect(resolveCaretPositionInFragment(fragment, 2)).toBeNull()
    expect(resolveCaretOffsetFromPointInFragment(fragment, { x: 15, y: 21 })).toBeNull()
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
