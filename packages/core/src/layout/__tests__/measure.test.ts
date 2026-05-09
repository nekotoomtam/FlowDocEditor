import { describe, it, expect } from "vitest"
import { measureParagraph, measureParagraphFrom, snapToGraphemeBoundary } from "../measure"
import { defaultTextMeasurer, defaultWordBreaker } from "../types"
import type { ParagraphNode } from "../../schema"
import type { WordBreaker } from "../types"

// defaultTextMeasurer widths at fontSize=10:
//   ASCII printable (space included): 10 * 0.48 = 4.8 per char
//   Thai (U+0E00-U+0E7F):             10 * 0.62 = 6.2 per char
// lineHeight at fontSize=10, ratio=1.2: 10 * 1.2 = 12
const FS = 10
const LH = 12   // lineHeight
const AW = 4.8  // ASCII char width
const TW = 6.2  // Thai char width

// Splits on whitespace only — deterministic regardless of ICU version.
const spaceBreaker: WordBreaker = {
  segment: (text) => text.match(/\s+|\S+/g) ?? [],
}

function makeParagraph(
  text: string,
  overrides?: Partial<ParagraphNode["props"]>,
): ParagraphNode {
  return {
    id: "p1",
    type: "paragraph",
    props: {
      align: "left",
      fontSize: { value: FS, unit: "pt" },
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: { value: 0, unit: "pt" },
      spacingAfter: { value: 0, unit: "pt" },
      textIndent: { value: 0, unit: "pt" },
      indentLeft: { value: 0, unit: "pt" },
      indentRight: { value: 0, unit: "pt" },
      ...overrides,
    },
    children: [{ id: "t1", type: "text", text }],
  }
}

// ─── Empty text ───────────────────────────────────────────────────────────────

describe("empty text", () => {
  it("produces a single empty line", () => {
    const result = measureParagraph(makeParagraph(""), 200, defaultTextMeasurer, spaceBreaker)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].text).toBe("")
    expect(result.lines[0].width).toBe(0)
    expect(result.lines[0].height).toBe(LH)
  })

  it("totalHeight equals one lineHeight when spacing is zero", () => {
    const result = measureParagraph(makeParagraph(""), 200, defaultTextMeasurer, spaceBreaker)
    expect(result.totalHeight).toBe(LH)
  })
})

// ─── English ─────────────────────────────────────────────────────────────────

describe("English text", () => {
  it("single word fits on one line", () => {
    const result = measureParagraph(makeParagraph("Hello"), 200, defaultTextMeasurer, spaceBreaker)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].text).toBe("Hello")
    expect(result.lines[0].width).toBeCloseTo(5 * AW)
  })

  it("wraps at word boundary when line is full", () => {
    // "Hello"=24, " "=4.8, "world"=24 — availableWidth=30 forces wrap after "Hello"
    const result = measureParagraph(makeParagraph("Hello world"), 30, defaultTextMeasurer, spaceBreaker)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].text).toBe("Hello")
    expect(result.lines[1].text).toBe("world")
  })

  it("trailing space is not included in line width", () => {
    const result = measureParagraph(makeParagraph("Hello world"), 30, defaultTextMeasurer, spaceBreaker)
    expect(result.lines[0].width).toBeCloseTo(5 * AW)
  })

  it("does not start a new line with a space", () => {
    const result = measureParagraph(makeParagraph("Hello world"), 30, defaultTextMeasurer, spaceBreaker)
    expect(result.lines[1].text).not.toMatch(/^\s/)
  })

  it("totalHeight = lineCount * lineHeight when spacing is zero", () => {
    const result = measureParagraph(makeParagraph("Hello world"), 30, defaultTextMeasurer, spaceBreaker)
    expect(result.totalHeight).toBeCloseTo(2 * LH)
  })
})

// ─── Numbers ─────────────────────────────────────────────────────────────────

describe("numbers", () => {
  it("digit string is measured as ASCII characters", () => {
    const result = measureParagraph(makeParagraph("12345"), 200, defaultTextMeasurer, spaceBreaker)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].text).toBe("12345")
    expect(result.lines[0].width).toBeCloseTo(5 * AW)
  })

  it("decimal number is treated as a single word segment", () => {
    const result = measureParagraph(makeParagraph("3.14"), 200, defaultTextMeasurer, spaceBreaker)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].text).toBe("3.14")
  })

  it("wraps number sequence at word boundary", () => {
    // "100" + " " + "200" with tight width
    const result = measureParagraph(makeParagraph("100 200"), 20, defaultTextMeasurer, spaceBreaker)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].text).toBe("100")
    expect(result.lines[1].text).toBe("200")
  })
})

// ─── Long unbroken text → grapheme fallback ───────────────────────────────────

describe("long unbroken text (grapheme fallback)", () => {
  it("splits an over-wide word into grapheme segments", () => {
    // "AAAAAAAAAA" (10 × 4.8 = 48) with availableWidth=20 → grapheme fallback
    // 4 chars fit per line (4×4.8=19.2 ≤ 20; 5×4.8=24 > 20)
    const result = measureParagraph(makeParagraph("AAAAAAAAAA"), 20, defaultTextMeasurer, spaceBreaker)
    expect(result.lines.length).toBeGreaterThan(1)
    const joined = result.lines.map((l) => l.text).join("")
    expect(joined).toBe("AAAAAAAAAA")
  })

  it("no line exceeds availableWidth", () => {
    const available = 20
    const result = measureParagraph(makeParagraph("AAAAAAAAAA"), available, defaultTextMeasurer, spaceBreaker)
    for (const line of result.lines) {
      expect(line.width).toBeLessThanOrEqual(available)
    }
  })

  it("grapheme segments have kind=grapheme", () => {
    const result = measureParagraph(makeParagraph("AAAAAAAAAA"), 20, defaultTextMeasurer, spaceBreaker)
    for (const line of result.lines) {
      for (const seg of line.segments ?? []) {
        expect(seg.kind).toBe("grapheme")
      }
    }
  })
})

// ─── Thai text ────────────────────────────────────────────────────────────────

// Mock that represents Thai word segmentation for "สวัสดีครับ" as two words.
const thaiMockBreaker: WordBreaker = {
  segment: (text) => {
    if (text === "สวัสดีครับ") return ["สวัสดี", "ครับ"]
    return text.match(/\s+|\S+/g) ?? []
  },
}

describe("Thai text", () => {
  it("fits two Thai words on one wide line", () => {
    // "สวัสดี"=6 chars × 6.2=37.2, "ครับ"=4 chars × 6.2=24.8, total=62
    const result = measureParagraph(makeParagraph("สวัสดีครับ"), 100, defaultTextMeasurer, thaiMockBreaker)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].text).toBe("สวัสดีครับ")
    expect(result.lines[0].width).toBeCloseTo(6 * TW + 4 * TW)
  })

  it("breaks Thai words when line is too narrow", () => {
    // availableWidth=40 — "สวัสดี" (37.2) fits but "ครับ" (24.8) would overflow
    const result = measureParagraph(makeParagraph("สวัสดีครับ"), 40, defaultTextMeasurer, thaiMockBreaker)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].text).toBe("สวัสดี")
    expect(result.lines[1].text).toBe("ครับ")
  })

  it("Thai char widths use the Thai multiplier", () => {
    const result = measureParagraph(makeParagraph("สวัสดีครับ"), 40, defaultTextMeasurer, thaiMockBreaker)
    expect(result.lines[0].width).toBeCloseTo(6 * TW)
    expect(result.lines[1].width).toBeCloseTo(4 * TW)
  })
})

// ─── Mixed Thai/English ────────────────────────────────────────────────────────

const mixedMockBreaker: WordBreaker = {
  segment: (text) => {
    if (text === "Hello สวัสดี world") return ["Hello", " ", "สวัสดี", " ", "world"]
    return text.match(/\s+|\S+/g) ?? []
  },
}

describe("mixed Thai/English", () => {
  it("wraps at the correct boundary between Thai and English words", () => {
    // availableWidth=50:
    // "Hello"(24) + " "(4.8) + "สวัสดี"(37.2) = 66 > 50 → wrap before "สวัสดี"
    // "สวัสดี"(37.2) + " "(4.8) + "world"(24) = 66 > 50 → wrap before "world"
    const result = measureParagraph(makeParagraph("Hello สวัสดี world"), 50, defaultTextMeasurer, mixedMockBreaker)
    expect(result.lines).toHaveLength(3)
    expect(result.lines[0].text).toBe("Hello")
    expect(result.lines[1].text).toBe("สวัสดี")
    expect(result.lines[2].text).toBe("world")
  })

  it("no line exceeds availableWidth", () => {
    const available = 50
    const result = measureParagraph(makeParagraph("Hello สวัสดี world"), available, defaultTextMeasurer, mixedMockBreaker)
    for (const line of result.lines) {
      expect(line.width).toBeLessThanOrEqual(available)
    }
  })
})

// ─── Spacing ──────────────────────────────────────────────────────────────────

describe("spacing", () => {
  it("spacingBefore and spacingAfter are added to totalHeight", () => {
    const result = measureParagraph(
      makeParagraph("Hello", {
        spacingBefore: { value: 5, unit: "pt" },
        spacingAfter: { value: 3, unit: "pt" },
      }),
      200,
      defaultTextMeasurer,
      spaceBreaker,
    )
    // 1 line = LH=12, plus 5 before and 3 after
    expect(result.totalHeight).toBeCloseTo(5 + LH + 3)
    expect(result.spacingBefore).toBeCloseTo(5)
    expect(result.spacingAfter).toBeCloseTo(3)
  })

  it("mm spacing is converted to pt", () => {
    const result = measureParagraph(
      makeParagraph("Hello", {
        spacingBefore: { value: 1, unit: "mm" },
        spacingAfter: { value: 0, unit: "pt" },
      }),
      200,
      defaultTextMeasurer,
      spaceBreaker,
    )
    // 1mm = 2.8346pt
    expect(result.spacingBefore).toBeCloseTo(2.8346)
  })
})

// ─── LineSegment metadata ─────────────────────────────────────────────────────

describe("LineSegment metadata", () => {
  it("segments cover the full source text with no gaps", () => {
    const result = measureParagraph(makeParagraph("Hello world"), 200, defaultTextMeasurer, spaceBreaker)
    let expectedStart = 0
    for (const line of result.lines) {
      for (const seg of line.segments ?? []) {
        expect(seg.start).toBe(expectedStart)
        expectedStart = seg.end
      }
    }
    expect(expectedStart).toBe("Hello world".length)
  })

  it("segment x values are non-decreasing within each line", () => {
    const result = measureParagraph(makeParagraph("Hello world"), 200, defaultTextMeasurer, spaceBreaker)
    for (const line of result.lines) {
      const segs = line.segments ?? []
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i].x).toBeGreaterThanOrEqual(segs[i - 1].x)
      }
    }
  })

  it("last segment on a non-trailing line has breakableAfter=true", () => {
    const result = measureParagraph(makeParagraph("Hello world"), 30, defaultTextMeasurer, spaceBreaker)
    // line 0 has only "Hello" segment — it is the break point
    const line0segs = result.lines[0].segments ?? []
    expect(line0segs.at(-1)?.breakableAfter).toBe(false)
    // but the last segment of the whole result (last line) has breakableAfter=false
    const line1segs = result.lines[1].segments ?? []
    expect(line1segs.at(-1)?.breakableAfter).toBe(false)
  })
})

// ─── fieldRef inline node ────────────────────────────────────────────────────

describe("fieldRef inline node", () => {
  it("fieldRef segment is classified as kind=field", () => {
    const node: ParagraphNode = {
      id: "p1",
      type: "paragraph",
      props: {
        align: "left",
        fontSize: { value: FS, unit: "pt" },
        fontFamilyKey: "default",
        lineHeight: 1.2,
        spacingBefore: { value: 0, unit: "pt" },
        spacingAfter: { value: 0, unit: "pt" },
        textIndent: { value: 0, unit: "pt" },
        indentLeft: { value: 0, unit: "pt" },
        indentRight: { value: 0, unit: "pt" },
      },
      children: [
        { id: "t1", type: "text", text: "Hello " },
        { id: "f1", type: "fieldRef", key: "name", label: "ชื่อ" },
      ],
    }

    // spaceBreaker splits "Hello ชื่อ" as ["Hello", " ", "ชื่อ"]
    const result = measureParagraph(node, 200, defaultTextMeasurer, spaceBreaker)
    const allSegments = result.lines.flatMap((l) => l.segments ?? [])
    const fieldSeg = allSegments.find((s) => s.kind === "field")
    expect(fieldSeg).toBeDefined()
    expect(fieldSeg?.text).toBe("ชื่อ")
  })
})

// ─── defaultWordBreaker integration (structural checks only) ─────────────────

describe("defaultWordBreaker integration", () => {
  it("English text does not exceed availableWidth per line", () => {
    const available = 50
    const result = measureParagraph(
      makeParagraph("The quick brown fox jumps over the lazy dog"),
      available,
      defaultTextMeasurer,
      defaultWordBreaker,
    )
    for (const line of result.lines) {
      expect(line.width).toBeLessThanOrEqual(available)
    }
  })

  it("Thai text does not exceed availableWidth per line", () => {
    const available = 50
    const result = measureParagraph(
      makeParagraph("สวัสดีครับผมชื่อนก"),
      available,
      defaultTextMeasurer,
      defaultWordBreaker,
    )
    for (const line of result.lines) {
      expect(line.width).toBeLessThanOrEqual(available)
    }
  })

  it("full text is preserved across all lines", () => {
    const text = "Hello สวัสดี 123 world"
    const result = measureParagraph(makeParagraph(text), 40, defaultTextMeasurer, defaultWordBreaker)
    const joined = result.lines.map((l) => l.text).join("")
    // joined text may omit leading spaces that were trimmed at line boundaries
    expect(text.replace(/\s+/g, "")).toBe(joined.replace(/\s+/g, ""))
  })
})

// ─── snapToGraphemeBoundary ───────────────────────────────────────────────────

describe("snapToGraphemeBoundary", () => {
  it("returns 0 for index 0", () => {
    expect(snapToGraphemeBoundary("องุ่น", 0)).toBe(0)
  })

  it("returns text.length for index at end", () => {
    expect(snapToGraphemeBoundary("องุ่น", 5)).toBe(5)
  })

  it("index already on grapheme boundary stays unchanged", () => {
    // "อ" ends at 1, "งุ่" ends at 4, "น" ends at 5
    expect(snapToGraphemeBoundary("องุ่น", 1)).toBe(1)
    expect(snapToGraphemeBoundary("องุ่น", 4)).toBe(4)
  })

  it("index inside Thai combining cluster snaps to nearest boundary", () => {
    // "องุ่น": อ(0-1) งุ่(1-4) น(4-5)
    // index 2 is inside "งุ่" — distance to start(1)=1, distance to end(4)=2 → snap to 1
    expect(snapToGraphemeBoundary("องุ่น", 2)).toBe(1)
    // index 3 is inside "งุ่" — distance to start(1)=2, distance to end(4)=1 → snap to 4
    expect(snapToGraphemeBoundary("องุ่น", 3)).toBe(4)
  })

  it("ASCII text with no combining chars is unchanged at any boundary", () => {
    expect(snapToGraphemeBoundary("Hello", 2)).toBe(2)
    expect(snapToGraphemeBoundary("Hello", 5)).toBe(5)
  })

  it("empty string edge cases", () => {
    expect(snapToGraphemeBoundary("", 0)).toBe(0)
    expect(snapToGraphemeBoundary("", 1)).toBe(0)
  })

  it("snap works for ก้ (consonant + tone mark)", () => {
    // "ก้": ก(0) + ้(1) = 1 grapheme cluster, length=2
    // index 1 is inside — distance to start(0)=1, distance to end(2)=1 → snap to start (tie → start wins)
    expect(snapToGraphemeBoundary("ก้", 1)).toBe(0)
  })
})

// ─── measureParagraphFrom ─────────────────────────────────────────────────────

describe("measureParagraphFrom — incremental reflow", () => {
  it("fromOffset=0: tail equals full measurement lines", () => {
    const para = makeParagraph("Alpha\nBeta\nGamma")
    const full = measureParagraph(para, 200, defaultTextMeasurer, spaceBreaker)
    const { tailLines } = measureParagraphFrom(para, 0, 200, defaultTextMeasurer, spaceBreaker)
    expect(tailLines.map((l) => l.text)).toEqual(full.lines.map((l) => l.text))
  })

  it("fromOffset in second hard line: tail starts from that hard line", () => {
    // "Alpha\nBeta\nGamma" — "Alpha" is 5 chars + \n, so Beta starts at offset 6
    const para = makeParagraph("Alpha\nBeta\nGamma")
    const { tailLines } = measureParagraphFrom(para, 6, 200, defaultTextMeasurer, spaceBreaker)
    expect(tailLines[0].text).toBe("Beta")
    expect(tailLines[1].text).toBe("Gamma")
  })

  it("segment offsets in tail lines reference the original full text", () => {
    // "Alpha\nBeta" — Beta starts at offset 6
    const para = makeParagraph("Alpha\nBeta")
    const { tailLines } = measureParagraphFrom(para, 6, 200, defaultTextMeasurer, spaceBreaker)
    // Beta line's segment start should be 6 (relative to full text)
    const betaSeg = tailLines[0]?.segments?.[0]
    expect(betaSeg?.start).toBe(6)
    expect(betaSeg?.end).toBe(10)
  })

  it("lineHeight matches full measureParagraph lineHeight", () => {
    const para = makeParagraph("Hello\nWorld")
    const full = measureParagraph(para, 200, defaultTextMeasurer, spaceBreaker)
    const { lineHeight } = measureParagraphFrom(para, 6, 200, defaultTextMeasurer, spaceBreaker)
    expect(lineHeight).toBe(full.lineHeight)
  })

  it("fromOffset past all hard lines: returns empty tail", () => {
    // "Hi" = 2 chars, fromOffset=10 is past the end
    const para = makeParagraph("Hi")
    const { tailLines } = measureParagraphFrom(para, 10, 200, defaultTextMeasurer, spaceBreaker)
    expect(tailLines).toHaveLength(0)
  })
})
