import { describe, it, expect } from "vitest"
import { checkPaginatedDocument, assertPaginatedDocument } from "../assertPaginated"
import { paginateDocument } from "../index"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { PaginatedDocument } from "../types"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "sec",
        type: "section",
        page: {
          size: "A4" as const,
          orientation: "portrait" as const,
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          "body": { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function paginate(doc: DocumentNode): PaginatedDocument {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

// Helper to build a minimal PaginatedDocument manually for violation injection
function minimalDoc(fragments: Partial<{
  nodeId: string; nodeType: string; x: number; y: number; width: number; height: number
}>[]): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [{
      sectionId: "sec",
      pages: [{
        index: 0,
        width: 595,
        height: 842,
        contentBox: { x: 72, y: 72, width: 451, height: 698 },
        fragments: fragments.map((f) => ({
          nodeId: f.nodeId ?? "n1",
          nodeType: f.nodeType ?? "paragraph",
          x: f.x ?? 72,
          y: f.y ?? 72,
          width: f.width ?? 451,
          height: f.height ?? 12,
        })),
        headerFragments: [],
        footerFragments: [],
      }],
    }],
  } as unknown as PaginatedDocument
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("checkPaginatedDocument — happy path", () => {
  it("returns no violations for a valid single paragraph", () => {
    const p = makePara("p1", "Hello")
    const result = paginate(makeDoc(["p1"], { p1: p }))
    expect(checkPaginatedDocument(result)).toHaveLength(0)
  })

  it("returns no violations for a multi-paragraph document", () => {
    const nodes: Record<string, LayoutNode> = {}
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      nodes[`p${i}`] = makePara(`p${i}`, `Paragraph ${i}`)
      ids.push(`p${i}`)
    }
    expect(checkPaginatedDocument(paginate(makeDoc(ids, nodes)))).toHaveLength(0)
  })

  it("returns no violations for a multi-page document", () => {
    const nodes: Record<string, LayoutNode> = {}
    const ids: string[] = []
    for (let i = 0; i < 60; i++) {
      nodes[`p${i}`] = makePara(`p${i}`, `Line ${i}`)
      ids.push(`p${i}`)
    }
    expect(checkPaginatedDocument(paginate(makeDoc(ids, nodes)))).toHaveLength(0)
  })

  it("returns no violations for row with two columns", () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st1", "st2"] }
    expect(checkPaginatedDocument(paginate(makeDoc(["r1"], { r1: row, st1, st2, p1, p2 })))).toHaveLength(0)
  })
})

// ─── negative-height rule ─────────────────────────────────────────────────────

describe("checkPaginatedDocument — negative-height", () => {
  it("reports violation when fragment has negative height", () => {
    const doc = minimalDoc([{ nodeId: "p1", height: -5 }])
    const violations = checkPaginatedDocument(doc)
    expect(violations.some((v) => v.rule === "negative-height" && v.nodeId === "p1")).toBe(true)
  })

  it("does not report violation for zero height", () => {
    const doc = minimalDoc([{ nodeId: "p1", height: 0 }])
    const violations = checkPaginatedDocument(doc)
    expect(violations.filter((v) => v.rule === "negative-height")).toHaveLength(0)
  })
})

// ─── outside-content-box rule ─────────────────────────────────────────────────

describe("checkPaginatedDocument — outside-content-box", () => {
  it("reports violation when fragment x is left of content box", () => {
    const doc = minimalDoc([{ nodeId: "p1", x: 10, width: 451 }])
    const violations = checkPaginatedDocument(doc)
    expect(violations.some((v) => v.rule === "outside-content-box" && v.nodeId === "p1")).toBe(true)
  })

  it("reports violation when fragment extends beyond right edge of content box", () => {
    const doc = minimalDoc([{ nodeId: "p1", x: 72, width: 600 }])  // 72+600=672 > 72+451=523
    const violations = checkPaginatedDocument(doc)
    expect(violations.some((v) => v.rule === "outside-content-box" && v.nodeId === "p1")).toBe(true)
  })

  it("does not report violation for fragment exactly at content box edges", () => {
    const doc = minimalDoc([{ nodeId: "p1", x: 72, width: 451 }])
    const violations = checkPaginatedDocument(doc)
    expect(violations.filter((v) => v.rule === "outside-content-box")).toHaveLength(0)
  })

  it("allows epsilon tolerance for floating-point rounding", () => {
    const doc = minimalDoc([{ nodeId: "p1", x: 71.8, width: 451 }])  // within 0.5pt epsilon
    const violations = checkPaginatedDocument(doc)
    expect(violations.filter((v) => v.rule === "outside-content-box")).toHaveLength(0)
  })
})

// ─── wrong-y-order rule ───────────────────────────────────────────────────────

describe("checkPaginatedDocument — wrong-y-order", () => {
  it("reports violation when a fragment has lower Y than the previous fragment", () => {
    const doc = minimalDoc([
      { nodeId: "p1", y: 200, height: 12 },
      { nodeId: "p2", y: 100, height: 12 },  // Y went backwards
    ])
    const violations = checkPaginatedDocument(doc)
    expect(violations.some((v) => v.rule === "wrong-y-order" && v.nodeId === "p2")).toBe(true)
  })

  it("does not report violation for fragments at same Y (side-by-side stacks)", () => {
    const doc = minimalDoc([
      { nodeId: "st1", y: 72, height: 24 },
      { nodeId: "st2", y: 72, height: 24 },  // same Y is valid for side-by-side
    ])
    const violations = checkPaginatedDocument(doc)
    expect(violations.filter((v) => v.rule === "wrong-y-order")).toHaveLength(0)
  })

  it("does not report violation for strictly increasing Y", () => {
    const doc = minimalDoc([
      { nodeId: "p1", y: 72, height: 12 },
      { nodeId: "p2", y: 84, height: 12 },
      { nodeId: "p3", y: 96, height: 12 },
    ])
    expect(checkPaginatedDocument(doc).filter((v) => v.rule === "wrong-y-order")).toHaveLength(0)
  })
})

// ─── split-fragment-order rule ────────────────────────────────────────────────

describe("checkPaginatedDocument — split-fragment-order", () => {
  it("does not report violation when split fragments appear in page order", () => {
    const twoPageDoc: PaginatedDocument = {
      tocEntries: [],
      sections: [{
        sectionId: "sec",
        pages: [
          {
            index: 0,
            width: 595, height: 842,
            contentBox: { x: 72, y: 72, width: 451, height: 698 },
            fragments: [{ nodeId: "p1", nodeType: "paragraph", x: 72, y: 72, width: 451, height: 12 }],
            headerFragments: [], footerFragments: [],
          },
          {
            index: 1,
            width: 595, height: 842,
            contentBox: { x: 72, y: 72, width: 451, height: 698 },
            fragments: [{ nodeId: "p1", nodeType: "paragraph", x: 72, y: 72, width: 451, height: 12 }],
            headerFragments: [], footerFragments: [],
          },
        ],
      }],
    } as unknown as PaginatedDocument
    expect(checkPaginatedDocument(twoPageDoc).filter((v) => v.rule === "split-fragment-order")).toHaveLength(0)
  })
})

// ─── assertPaginatedDocument ──────────────────────────────────────────────────

describe("assertPaginatedDocument", () => {
  it("does not throw for a valid document", () => {
    const p = makePara("p1", "Hello")
    expect(() => assertPaginatedDocument(paginate(makeDoc(["p1"], { p1: p })))).not.toThrow()
  })

  it("throws with violation details for an invalid document", () => {
    const doc = minimalDoc([{ nodeId: "bad", height: -1 }])
    expect(() => assertPaginatedDocument(doc)).toThrow("negative-height")
  })

  it("includes all violations in the thrown message", () => {
    const doc = minimalDoc([
      { nodeId: "bad1", height: -1 },
      { nodeId: "bad2", x: 0, width: 800 },  // x too left + x+width too right = 2 violations
    ])
    // bad1=1 violation, bad2=2 violations → 3 total
    expect(() => assertPaginatedDocument(doc)).toThrow("3 violation")
  })
})
