import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import { updateNodeProps, updateSectionMargin } from "../../document"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePara(id: string, text: string): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function twoColumnDoc(): DocumentNode {
  const p1 = makePara("p1", "Left column text")
  const p2 = makePara("p2", "Right column text")
  const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 0 }, childIds: ["p1"] }
  const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 0 }, childIds: ["p2"] }
  const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st1", "st2"] }
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
          "body": { id: "body", type: "body", props: {}, childIds: ["r1"] },
          r1: row, st1: st1, st2: st2, p1: p1, p2: p2,
        },
      }],
    },
  }
}

function rowWithMinHeightDoc(minHeight: number): DocumentNode {
  const p = makePara("p1", "A")
  const st: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 100, minHeight: 0 }, childIds: ["p1"] }
  const row: LayoutNode = { id: "r1", type: "row", props: { minHeight }, childIds: ["st1"] }
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
          "body": { id: "body", type: "body", props: {}, childIds: ["r1"] },
          r1: row, st1: st, p1: p,
        },
      }],
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

// ─── Column resize convergence ────────────────────────────────────────────────

describe("column resize — produces valid paginated output", () => {
  it("resize to 30/70 produces no violations", () => {
    const doc = updateNodeProps(updateNodeProps(twoColumnDoc(), "st1", { widthShare: 30 }), "st2", { widthShare: 70 })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("resize to 70/30 produces no violations", () => {
    const doc = updateNodeProps(updateNodeProps(twoColumnDoc(), "st1", { widthShare: 70 }), "st2", { widthShare: 30 })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("near-minimum share (15/85) produces no violations", () => {
    const doc = updateNodeProps(updateNodeProps(twoColumnDoc(), "st1", { widthShare: 15 }), "st2", { widthShare: 85 })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("near-minimum share (85/15) produces no violations", () => {
    const doc = updateNodeProps(updateNodeProps(twoColumnDoc(), "st1", { widthShare: 85 }), "st2", { widthShare: 15 })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("after resize, fragment widths still sum to content box width", () => {
    const doc = updateNodeProps(updateNodeProps(twoColumnDoc(), "st1", { widthShare: 25 }), "st2", { widthShare: 75 })
    const result = paginate(doc)
    const frags = result.sections[0].pages[0].fragments
    const st1 = frags.find((f) => f.nodeId === "st1")!
    const st2 = frags.find((f) => f.nodeId === "st2")!
    // A4 + 72pt margins → contentBox.width = 451
    expect(st1.width + st2.width).toBeCloseTo(451, 0)
  })

  it("shares of 0.01/99.99 (minimum clamp scenario) produce no violations", () => {
    // Simulates the Math.max(0.01, ...) guard in EditorShell
    const doc = updateNodeProps(updateNodeProps(twoColumnDoc(), "st1", { widthShare: 0.01 }), "st2", { widthShare: 99.99 })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })
})

// ─── Row min-height resize convergence ───────────────────────────────────────

describe("row min-height resize — produces valid paginated output", () => {
  it("increasing minHeight produces no violations", () => {
    const doc = rowWithMinHeightDoc(100)
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("minHeight set to natural content height produces no violations", () => {
    const doc = rowWithMinHeightDoc(12)  // 1 line × 12pt
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("minHeight set to 0 falls back to natural content height", () => {
    const doc = rowWithMinHeightDoc(0)
    const result = paginate(doc)
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    const rowFrag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "r1")!
    expect(rowFrag.height).toBeGreaterThan(0)
  })

  it("very large minHeight produces no violations", () => {
    const doc = rowWithMinHeightDoc(500)
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("row height after resize equals max(minHeight, naturalHeight)", () => {
    const naturalDoc = rowWithMinHeightDoc(0)
    const result0 = paginate(naturalDoc)
    const naturalHeight = result0.sections[0].pages[0].fragments.find((f) => f.nodeId === "r1")!.height

    const minHeight = naturalHeight + 50
    const resizedDoc = rowWithMinHeightDoc(minHeight)
    const result = paginate(resizedDoc)
    const rowFrag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "r1")!
    expect(rowFrag.height).toBe(minHeight)
  })
})

// ─── Page margin resize convergence ──────────────────────────────────────────

describe("page margin resize — produces valid paginated output", () => {
  it("standard margin update produces no violations", () => {
    const base = rowWithMinHeightDoc(20)
    const doc = updateSectionMargin(base, 0, { top: 36, right: 36, bottom: 36, left: 36 })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("large margin update produces no violations", () => {
    const base = rowWithMinHeightDoc(20)
    // 90pt margins on A4 → contentBox width = 595 - 180 = 415pt
    const doc = updateSectionMargin(base, 0, { top: 90, right: 90, bottom: 90, left: 90 })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("asymmetric margin update produces no violations", () => {
    const base = rowWithMinHeightDoc(20)
    const doc = updateSectionMargin(base, 0, { top: 36, right: 120, bottom: 72, left: 48 })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  it("after margin resize, fragment x respects new content box left", () => {
    const base = rowWithMinHeightDoc(20)
    const newLeftMargin = 100
    const doc = updateSectionMargin(base, 0, { top: 72, right: 72, bottom: 72, left: newLeftMargin })
    const result = paginate(doc)
    const rowFrag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "r1")!
    expect(rowFrag.x).toBeCloseTo(newLeftMargin, 0)
  })
})
