import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Page Metrics ─────────────────────────────────────────────────────────────
// A4 + 72pt margins
const CX = 72
const CW = 451
const CY = 72
const FS = 10
const LH = FS * 1.2  // = 12

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      fontSize: pt(FS),
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

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
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
          "body": { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function getFragments(doc: DocumentNode) {
  const result = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
  return result.sections[0].pages.flatMap((p) => p.fragments)
}

function getPages(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker).sections[0].pages
}

function makeRow(rowId: string, stacks: { id: string; widthShare: number; childIds: string[] }[], minHeight?: number) {
  const nodes: Record<string, LayoutNode> = {}
  for (const s of stacks) {
    nodes[s.id] = { id: s.id, type: "stack", props: { widthShare: s.widthShare, minHeight: 0 }, childIds: s.childIds }
  }
  nodes[rowId] = { id: rowId, type: "row", props: { ...(minHeight != null ? { minHeight } : {}) }, childIds: stacks.map((s) => s.id) }
  return nodes
}

// ─── Row min-height semantics ─────────────────────────────────────────────────

describe("row — min-height semantics", () => {
  it("row height equals minHeight when minHeight > natural content height", () => {
    const p = makePara("p1", "A")  // 1 line = LH = 12pt
    const nodes = {
      ...makeRow("r1", [{ id: "st1", widthShare: 100, childIds: ["p1"] }], 50),
      p1: p,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const rowFrag = frags.find((f) => f.nodeId === "r1")!
    expect(rowFrag.height).toBe(50)
  })

  it("row height equals natural content height when it exceeds minHeight", () => {
    // 6 hard lines × 12 = 72pt, minHeight=20
    const p = makePara("p1", "A\nB\nC\nD\nE\nF")
    const nodes = {
      ...makeRow("r1", [{ id: "st1", widthShare: 100, childIds: ["p1"] }], 20),
      p1: p,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const rowFrag = frags.find((f) => f.nodeId === "r1")!
    expect(rowFrag.height).toBe(6 * LH)
  })

  it("row height equals tallest stack when stacks have different content", () => {
    // st1: 1 line (12pt), st2: 3 lines (36pt), no minHeight
    const p1 = makePara("p1", "A")
    const p2 = makePara("p2", "A\nB\nC")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 50, childIds: ["p1"] },
        { id: "st2", widthShare: 50, childIds: ["p2"] },
      ]),
      p1, p2,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const rowFrag = frags.find((f) => f.nodeId === "r1")!
    expect(rowFrag.height).toBe(3 * LH)
  })

  it("all stack fragments in a row share the same height as the row", () => {
    const p1 = makePara("p1", "Short")
    const p2 = makePara("p2", "A\nB\nC\nD\nE")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 50, childIds: ["p1"] },
        { id: "st2", widthShare: 50, childIds: ["p2"] },
      ]),
      p1, p2,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const rowFrag = frags.find((f) => f.nodeId === "r1")!
    const st1Frag = frags.find((f) => f.nodeId === "st1")!
    const st2Frag = frags.find((f) => f.nodeId === "st2")!
    expect(st1Frag.height).toBe(rowFrag.height)
    expect(st2Frag.height).toBe(rowFrag.height)
  })
})

// ─── Stack width share distribution ──────────────────────────────────────────

describe("row — stack width distribution", () => {
  it("two equal-share stacks sum to content box width", () => {
    const p1 = makePara("p1", "L")
    const p2 = makePara("p2", "R")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 50, childIds: ["p1"] },
        { id: "st2", widthShare: 50, childIds: ["p2"] },
      ]),
      p1, p2,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const st1 = frags.find((f) => f.nodeId === "st1")!
    const st2 = frags.find((f) => f.nodeId === "st2")!
    expect(st1.width + st2.width).toBeCloseTo(CW, 0)
  })

  it("three equal-share stacks sum to content box width", () => {
    const p1 = makePara("p1", "A")
    const p2 = makePara("p2", "B")
    const p3 = makePara("p3", "C")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 33.33, childIds: ["p1"] },
        { id: "st2", widthShare: 33.33, childIds: ["p2"] },
        { id: "st3", widthShare: 33.34, childIds: ["p3"] },
      ]),
      p1, p2, p3,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const widths = ["st1", "st2", "st3"].map((id) => frags.find((f) => f.nodeId === id)!.width)
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(CW, 0)
  })

  it("unequal-share stacks are proportional to their widthShare", () => {
    // st1=25, st2=75 → st2 should be 3× wider than st1
    const p1 = makePara("p1", "A")
    const p2 = makePara("p2", "B")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 25, childIds: ["p1"] },
        { id: "st2", widthShare: 75, childIds: ["p2"] },
      ]),
      p1, p2,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const st1 = frags.find((f) => f.nodeId === "st1")!
    const st2 = frags.find((f) => f.nodeId === "st2")!
    expect(st2.width / st1.width).toBeCloseTo(3, 1)
  })

  it("stack x positions are contiguous (no gap, no overlap)", () => {
    const p1 = makePara("p1", "A")
    const p2 = makePara("p2", "B")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 50, childIds: ["p1"] },
        { id: "st2", widthShare: 50, childIds: ["p2"] },
      ]),
      p1, p2,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const st1 = frags.find((f) => f.nodeId === "st1")!
    const st2 = frags.find((f) => f.nodeId === "st2")!
    expect(st1.x).toBe(CX)
    expect(st2.x).toBeCloseTo(st1.x + st1.width, 0)
  })
})

// ─── Row page-break behavior ──────────────────────────────────────────────────

describe("row — page-break behavior", () => {
  it("row moves to next page when it does not fit at current cursor", () => {
    // filler paragraph takes most of page 1, then row doesn't fit
    const fillerText = Array.from({ length: 55 }, () => "A").join("\n")  // 55 × 12 = 660pt
    const filler = makePara("filler", fillerText)
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 50, childIds: ["p1"] },
        { id: "st2", widthShare: 50, childIds: ["p2"] },
      ], 50),  // row height = 50, won't fit after 660pt filler (660+50=710 > 698)
      filler, p1, p2,
    }
    const pages = getPages(makeDoc(["filler", "r1"], nodes))
    const rowPage = pages.findIndex((pg) => pg.fragments.some((f) => f.nodeId === "r1"))
    expect(rowPage).toBeGreaterThan(0)
  })

  it("very tall row at page top stays on that page without crash", () => {
    // row taller than content height stays at contentTop (documented overflow)
    const p1 = makePara("p1", Array.from({ length: 70 }, () => "A").join("\n"))
    const nodes = {
      ...makeRow("r1", [{ id: "st1", widthShare: 100, childIds: ["p1"] }]),
      p1,
    }
    const frags = getFragments(makeDoc(["r1"], nodes))
    const rowFrag = frags.find((f) => f.nodeId === "r1")!
    expect(rowFrag).toBeDefined()
    expect(rowFrag.y).toBe(CY)  // placed at content top
  })

  it("row moves as a whole unit — both stacks land on the same page", () => {
    const fillerText = Array.from({ length: 55 }, () => "A").join("\n")
    const filler = makePara("filler", fillerText)
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 50, childIds: ["p1"] },
        { id: "st2", widthShare: 50, childIds: ["p2"] },
      ], 50),
      filler, p1, p2,
    }
    const pages = getPages(makeDoc(["filler", "r1"], nodes))
    const st1Page = pages.findIndex((pg) => pg.fragments.some((f) => f.nodeId === "st1"))
    const st2Page = pages.findIndex((pg) => pg.fragments.some((f) => f.nodeId === "st2"))
    expect(st1Page).toBe(st2Page)  // both stacks on same page
  })

  it("assertPaginatedDocument passes for valid row/stack documents", () => {
    const p1 = makePara("p1", "A")
    const p2 = makePara("p2", "B")
    const nodes = {
      ...makeRow("r1", [
        { id: "st1", widthShare: 50, childIds: ["p1"] },
        { id: "st2", widthShare: 50, childIds: ["p2"] },
      ]),
      p1, p2,
    }
    const result = paginateDocument(makeDoc(["r1"], nodes), defaultTextMeasurer, defaultWordBreaker)
    expect(() => assertPaginatedDocument(result)).not.toThrow()
  })
})
