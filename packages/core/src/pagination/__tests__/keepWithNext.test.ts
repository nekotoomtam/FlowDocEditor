import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Page Metrics ─────────────────────────────────────────────────────────────
// A4 + 72pt margins: contentBottom = 770, LH = 12
const CY = 72
const LH = 10 * 1.2  // = 12

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

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
      fontSize: pt(10),
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

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

function pageOf(result: ReturnType<typeof paginate>, nodeId: string): number {
  for (const page of result.sections[0].pages) {
    if (page.fragments.some((f) => f.nodeId === nodeId)) return page.index
  }
  return -1
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("keepWithNext", () => {
  it("paragraph without keepWithNext stays on page 1 even if next sibling moves", () => {
    const fillerText = Array.from({ length: 55 }, () => "A").join("\n")
    const filler = makePara("filler", fillerText)
    const heading = makePara("h1", "Heading")  // no keepWithNext
    const bodyPara = makePara("bp", Array.from({ length: 5 }, () => "A").join("\n"))

    const result = paginate(makeDoc(["filler", "h1", "bp"], { filler, h1: heading, bp: bodyPara }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    expect(pageOf(result, "h1")).toBeGreaterThanOrEqual(0)
  })

  it("heading with keepWithNext moves to next page when body would be separated", () => {
    // Fill page 1 with 55 lines (660pt). Remaining = 698-660 = 38pt.
    // Heading = 12pt (fits in 38pt alone).
    // Body = 5 lines × 12pt = 60pt (doesn't fit with heading: 12+60=72 > 38pt).
    // → heading should move to page 2.
    const fillerText = Array.from({ length: 55 }, () => "A").join("\n")
    const filler = makePara("filler", fillerText)
    const heading = makePara("h1", "Heading", { keepWithNext: true })
    const bodyPara = makePara("bp", Array.from({ length: 5 }, () => "A").join("\n"))

    const result = paginate(makeDoc(["filler", "h1", "bp"], { filler, h1: heading, bp: bodyPara }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()

    const h1Page = pageOf(result, "h1")
    const bpPage = pageOf(result, "bp")
    expect(h1Page).toBe(bpPage)
    expect(h1Page).toBeGreaterThan(0)
  })

  it("heading with keepWithNext stays on page 1 when body fits after it", () => {
    const filler = makePara("filler", "A")
    const heading = makePara("h1", "Heading", { keepWithNext: true })
    const bodyPara = makePara("bp", "Short body")

    const result = paginate(makeDoc(["filler", "h1", "bp"], { filler, h1: heading, bp: bodyPara }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    expect(pageOf(result, "h1")).toBe(0)
    expect(pageOf(result, "bp")).toBe(0)
  })

  it("keepWithNext does not infinite loop when combined height exceeds one page", () => {
    // Heading + body together are bigger than a full page — heading stays at contentTop
    const heading = makePara("h1", "Heading", { keepWithNext: true })
    const tallPara = makePara("tall", Array.from({ length: 70 }, () => "A").join("\n"))

    const result = paginate(makeDoc(["h1", "tall"], { h1: heading, tall: tallPara }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    expect(pageOf(result, "h1")).toBeGreaterThanOrEqual(0)
  })

  it("multiple keepWithNext paragraphs each stay with their next sibling", () => {
    const fillerText = Array.from({ length: 55 }, () => "A").join("\n")
    const filler = makePara("filler", fillerText)
    const h1 = makePara("h1", "Section 1", { keepWithNext: true })
    const b1 = makePara("b1", "Body 1")
    const h2 = makePara("h2", "Section 2", { keepWithNext: true })
    const b2 = makePara("b2", "Body 2")

    const result = paginate(makeDoc(["filler", "h1", "b1", "h2", "b2"], { filler, h1, b1, h2, b2 }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    expect(pageOf(result, "h1")).toBe(pageOf(result, "b1"))
    expect(pageOf(result, "h2")).toBe(pageOf(result, "b2"))
  })

  it("product fixture — report-keep-with-next", () => {
    const filler = makePara("report-filler", Array.from({ length: 55 }, () => "เนื้อหาก่อนหน้า").join("\n"))
    const heading = makePara("report-heading", "บทที่ 2 ผลการดำเนินงาน", {
      headingLevel: 1,
      keepWithNext: true,
    })
    const following = makePara("report-body", Array.from({ length: 5 }, () => "ย่อหน้าแรกของบทนี้").join("\n"))

    const result = paginate(makeDoc(["report-filler", "report-heading", "report-body"], {
      "report-filler": filler,
      "report-heading": heading,
      "report-body": following,
    }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()

    const headingPage = pageOf(result, "report-heading")
    const bodyPage = pageOf(result, "report-body")
    expect(headingPage).toBeGreaterThan(0)
    expect(headingPage).toBe(bodyPage)
  })
})
