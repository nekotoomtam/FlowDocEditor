/**
 * Text flow smoke tests — assert on paginated line content and layout, then
 * confirm PDF and DOCX renderers consume the output without throwing.
 *
 * defaultTextMeasurer widths (fontSize=10):
 *   ASCII: 10 * 0.48 = 4.8 pt/char
 *   LH   : 10 * 1.2  = 12 pt
 * A4 + 72pt margins: contentX=72, contentWidth=451
 */

import { describe, it, expect } from "vitest"
import { PdfRenderer } from "../pdf"
import { DocxRenderer } from "../docx"
import { paginateDocument } from "../../pagination"
import { assertPaginatedDocument } from "../../pagination/assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Constants ────────────────────────────────────────────────────────────────

const FS = 10
const LH = FS * 1.2          // 12pt line height
const AW = FS * 0.48         // 4.8pt per ASCII char
const CONTENT_X = 72
const CONTENT_W = 451        // A4 portrait with 72pt margins

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePara(
  id: string,
  text: string,
  overrides: Partial<ParagraphNode["props"]> = {},
): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(FS),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...overrides,
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function makeDoc(childIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE,
        bodyRootId: "body",
        nodes: {
          "body": { id: "body", type: "body", props: {}, childIds },
          ...nodes,
        },
      }],
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

function getFragLines(doc: DocumentNode, nodeId: string) {
  const result = paginate(doc)
  return result.sections[0].pages
    .flatMap((p) => p.fragments)
    .filter((f) => f.nodeId === nodeId)
    .flatMap((f) => f.lines ?? [])
}

const pdf = new PdfRenderer()
const docx = new DocxRenderer()

// ─── Text content in paginated lines ─────────────────────────────────────────

describe("text flow — line content", () => {
  it("short text fits in one line and text is preserved", () => {
    const p = makePara("p", "Hello World")
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe("Hello World")
  })

  it("hard newlines produce separate lines with correct text", () => {
    const p = makePara("p", "Alpha\nBeta\nGamma")
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    expect(lines).toHaveLength(3)
    expect(lines[0].text).toBe("Alpha")
    expect(lines[1].text).toBe("Beta")
    expect(lines[2].text).toBe("Gamma")
  })

  it("long text wraps to multiple lines when wider than content box", () => {
    // Each ASCII char = 4.8pt, availableWidth = 451pt → fits 93 chars
    // A 120-char string must wrap to at least 2 lines
    const longText = "A".repeat(120)
    const p = makePara("p", longText)
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // All text is preserved across lines
    const allText = lines.map((l) => l.text).join("")
    expect(allText).toBe(longText)
  })

  it("empty paragraph produces one empty line", () => {
    const p = makePara("p", "")
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe("")
  })
})

// ─── Spacing ──────────────────────────────────────────────────────────────────

describe("text flow — spacing", () => {
  it("spacingBefore adds to fragment height", () => {
    const BEFORE = 20
    const p = makePara("p", "X", { spacingBefore: pt(BEFORE) })
    const result = paginate(makeDoc(["p"], { p }))
    const frag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "p")!
    expect(frag.height).toBeCloseTo(BEFORE + LH, 1)
  })

  it("spacingAfter adds to fragment height", () => {
    const AFTER = 16
    const p = makePara("p", "X", { spacingAfter: pt(AFTER) })
    const result = paginate(makeDoc(["p"], { p }))
    const frag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "p")!
    expect(frag.height).toBeCloseTo(LH + AFTER, 1)
  })

  it("spacingBefore shifts first line y by spacingBefore", () => {
    const BEFORE = 24
    const p = makePara("p", "X", { spacingBefore: pt(BEFORE) })
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    // First line starts at contentTop + spacingBefore
    expect(lines[0].y).toBeCloseTo(CONTENT_X + BEFORE, 1)  // contentTop = 72 = CONTENT_X
  })

  it("two paragraphs: second starts after first including spacingAfter", () => {
    const AFTER = 8
    const p1 = makePara("p1", "First", { spacingAfter: pt(AFTER) })
    const p2 = makePara("p2", "Second")
    const result = paginate(makeDoc(["p1", "p2"], { p1, p2 }))
    const page = result.sections[0].pages[0]
    const f1 = page.fragments.find((f) => f.nodeId === "p1")!
    const f2 = page.fragments.find((f) => f.nodeId === "p2")!
    expect(f2.y).toBeCloseTo(f1.y + f1.height, 1)
  })
})

// ─── Alignment ────────────────────────────────────────────────────────────────
// Alignment offset is baked into line.x by buildPaginatedLines so all renderers
// (PDF, DOCX, editor SVG) consume the same visual position without recomputing.

describe("text flow — alignment", () => {
  it("left-aligned: line x equals fragment x (content left edge)", () => {
    const p = makePara("p", "Hi", { align: "left" })
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    expect(lines[0].x).toBeCloseTo(CONTENT_X, 1)
  })

  it("right-aligned: line x is offset from content left edge", () => {
    // "Hi" = 2 chars × 4.8pt = 9.6pt wide
    // right: line.x = contentX + contentWidth - textWidth = 72 + 451 - 9.6 = 513.4
    const p = makePara("p", "Hi", { align: "right" })
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    const textWidth = 2 * AW  // 9.6
    expect(lines[0].x).toBeCloseTo(CONTENT_X + CONTENT_W - textWidth, 1)
  })

  it("center-aligned: line x is at midpoint offset", () => {
    // center: line.x = contentX + (contentWidth - textWidth) / 2
    const p = makePara("p", "Hi", { align: "center" })
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    const textWidth = 2 * AW  // 9.6
    expect(lines[0].x).toBeCloseTo(CONTENT_X + (CONTENT_W - textWidth) / 2, 1)
  })

  it("renderProps still carries alignment setting for renderers that need it", () => {
    const result = paginate(makeDoc(["p"], { p: makePara("p", "Hi", { align: "right" }) }))
    const frag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "p")!
    expect(frag.renderProps?.align).toBe("right")
  })

  it("center and right aligned paragraphs pass assertPaginatedDocument", () => {
    for (const align of ["center", "right"] as const) {
      const doc = makeDoc(["p"], { p: makePara("p", "Aligned text", { align }) })
      expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
    }
  })

  it("justify: non-last lines have segments with extra space distributed between words", () => {
    // Create a paragraph that wraps — first line will be justified, last won't
    // "Word " × 20 = 100 chars × 4.8 = 480pt > 451pt → wraps to 2+ lines
    const p = makePara("p", Array.from({ length: 20 }, () => "Word").join(" "), { align: "justify" })
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    expect(lines.length).toBeGreaterThanOrEqual(2)

    // First (non-last) line: segments should have extra space → last word's right edge = fragmentWidth
    const firstLine = lines[0]
    expect(firstLine.segments).toBeDefined()
    const segs = firstLine.segments!
    const lastSeg = segs[segs.length - 1]
    // Right edge of last segment ≈ CONTENT_W (within 1pt)
    expect(lastSeg.x + lastSeg.width).toBeCloseTo(CONTENT_W, 0)
  })

  it("justify: last line is left-aligned (not stretched)", () => {
    const p = makePara("p", "Word Word Word", { align: "justify" })
    const lines = getFragLines(makeDoc(["p"], { p }), "p")
    // Single line = last line → not justified, stays at left (line.x = contentX)
    expect(lines[0].x).toBeCloseTo(CONTENT_X, 1)
    // Segments should NOT have extra space (no stretch for last line)
    const segs = lines[0].segments ?? []
    const lastSeg = segs.at(-1)
    if (lastSeg) {
      // last word right edge < CONTENT_W (not stretched)
      expect(lastSeg.x + lastSeg.width).toBeLessThan(CONTENT_W - 1)
    }
  })

  it("justify: assertPaginatedDocument passes", () => {
    const p = makePara("p", "Word ".repeat(30).trim(), { align: "justify" })
    expect(() => assertPaginatedDocument(paginate(makeDoc(["p"], { p })))).not.toThrow()
  })
})

// ─── Column layout ────────────────────────────────────────────────────────────

describe("text flow — column layout", () => {
  it("two equal columns: left starts at contentX, right starts at mid-point", () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 20 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 20 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "row", type: "row", props: {}, childIds: ["st1", "st2"] }
    const result = paginate(makeDoc(["row"], { row, st1, st2, p1, p2 }))
    assertPaginatedDocument(result)

    const page = result.sections[0].pages[0]
    const p1Frag = page.fragments.find((f) => f.nodeId === "p1")!
    const p2Frag = page.fragments.find((f) => f.nodeId === "p2")!

    // Left column starts at contentX
    expect(p1Frag.x).toBeCloseTo(CONTENT_X, 1)
    // Right column starts at contentX + half contentWidth
    expect(p2Frag.x).toBeCloseTo(CONTENT_X + CONTENT_W / 2, 1)
    // Both columns same width
    expect(p1Frag.width).toBeCloseTo(CONTENT_W / 2, 1)
    expect(p2Frag.width).toBeCloseTo(CONTENT_W / 2, 1)
  })

  it("line x in left column equals left column fragment x", () => {
    const p1 = makePara("p1", "Left col text")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 20 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 20 }, childIds: [] }
    const row: LayoutNode = { id: "row", type: "row", props: {}, childIds: ["st1", "st2"] }
    const lines = getFragLines(makeDoc(["row"], { row, st1, st2, p1 }), "p1")
    expect(lines[0].x).toBeCloseTo(CONTENT_X, 1)
  })
})

// ─── Renderer smoke — text flow documents ────────────────────────────────────

describe("text flow — renderer smoke", () => {
  it("PDF: spacing + alignment document renders without throwing", async () => {
    const p = makePara("p", "Spaced centered text", {
      align: "center",
      spacingBefore: pt(12),
      spacingAfter: pt(8),
    })
    const result = await pdf.render(paginate(makeDoc(["p"], { p })))
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("PDF: wrapped long text renders without throwing", async () => {
    const p = makePara("p", "Word ".repeat(100).trim())
    const result = await pdf.render(paginate(makeDoc(["p"], { p })))
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("PDF: two-column layout renders without throwing", async () => {
    const p1 = makePara("p1", "Left column content")
    const p2 = makePara("p2", "Right column content")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 20 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 20 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "row", type: "row", props: {}, childIds: ["st1", "st2"] }
    const result = await pdf.render(paginate(makeDoc(["row"], { row, st1, st2, p1, p2 })))
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("PDF: hard newlines render without throwing", async () => {
    const p = makePara("p", "Line one\nLine two\nLine three")
    const result = await pdf.render(paginate(makeDoc(["p"], { p })))
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("DOCX: spacing + alignment document renders without throwing", async () => {
    const p = makePara("p", "Spaced right aligned", {
      align: "right",
      spacingBefore: pt(12),
      spacingAfter: pt(8),
    })
    const result = await docx.render(paginate(makeDoc(["p"], { p })))
    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
  })

  it("DOCX: wrapped long text renders without throwing", async () => {
    const p = makePara("p", "Word ".repeat(100).trim())
    const result = await docx.render(paginate(makeDoc(["p"], { p })))
    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
  })

  it("DOCX: two-column layout renders without throwing", async () => {
    const p1 = makePara("p1", "Left column")
    const p2 = makePara("p2", "Right column")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 20 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 20 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "row", type: "row", props: {}, childIds: ["st1", "st2"] }
    const result = await docx.render(paginate(makeDoc(["row"], { row, st1, st2, p1, p2 })))
    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
  })
})
