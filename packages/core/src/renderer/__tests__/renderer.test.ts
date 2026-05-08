import { describe, it, expect } from "vitest"
import { PdfRenderer } from "../pdf"
import { DocxRenderer } from "../docx"
import { paginateDocument } from "../../pagination"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode, SpacerNode } from "../../schema"

// ─── Document Helpers ─────────────────────────────────────────────────────────

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
      spacingAfter: pt(4),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function makeSpacer(id: string, height = 20): SpacerNode {
  return { id, type: "spacer", props: { height } }
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

// ─── PDF smoke tests ──────────────────────────────────────────────────────────

describe("PdfRenderer smoke tests", () => {
  const pdf = new PdfRenderer()  // no FontProvider → Helvetica fallback

  it("renders a single paragraph without throwing", async () => {
    const p = makePara("p1", "Hello world")
    const result = await pdf.render(paginate(makeDoc(["p1"], { p1: p })))
    expect(result.mimeType).toBe("application/pdf")
    expect(result.extension).toBe("pdf")
    expect(result.buffer.length).toBeGreaterThan(0)
    // PDF starts with %PDF header
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("renders multi-paragraph document without throwing", async () => {
    const p1 = makePara("p1", "First paragraph")
    const p2 = makePara("p2", "Second paragraph")
    const p3 = makePara("p3", "Third paragraph")
    const result = await pdf.render(paginate(makeDoc(["p1", "p2", "p3"], { p1, p2, p3 })))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("renders document with spacer without throwing", async () => {
    const p1 = makePara("p1", "Before spacer")
    const s1 = makeSpacer("s1", 40)
    const p2 = makePara("p2", "After spacer")
    const result = await pdf.render(paginate(makeDoc(["p1", "s1", "p2"], { p1, s1, p2 })))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("renders document with row and two columns without throwing", async () => {
    const p1 = makePara("p1", "Left column")
    const p2 = makePara("p2", "Right column")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st1", "st2"] }
    const result = await pdf.render(paginate(makeDoc(["r1"], { r1: row, st1, st2, p1, p2 })))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("renders multi-page document without throwing", async () => {
    // 60 paragraphs → overflows to multiple pages
    const nodes: Record<string, LayoutNode> = {}
    const ids: string[] = []
    for (let i = 0; i < 60; i++) {
      const id = `p${i}`
      nodes[id] = makePara(id, `Paragraph ${i + 1}`)
      ids.push(id)
    }
    const result = await pdf.render(paginate(makeDoc(ids, nodes)))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("renders empty paragraph without throwing", async () => {
    const p = makePara("p1", "")
    const result = await pdf.render(paginate(makeDoc(["p1"], { p1: p })))
    expect(result.buffer.length).toBeGreaterThan(0)
  })
})

// ─── Renderer input contract — fragment coverage ─────────────────────────────
// These tests assert on the paginated document structure BEFORE it reaches the
// renderer. If pagination drops or merges fragment types, these tests catch it
// before the renderer ever runs.

describe("renderer input contract — fragment coverage", () => {
  const pdf = new PdfRenderer()
  const docx = new DocxRenderer()

  it("paginated input contains row, stack, and paragraph fragment kinds", () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st1", "st2"] }
    const paginated = paginate(makeDoc(["r1"], { r1: row, st1, st2, p1, p2 }))
    const allFrags = paginated.sections[0].pages.flatMap((pg) => pg.fragments)
    const kinds = new Set(allFrags.map((f) => f.nodeType))
    expect(kinds.has("row")).toBe(true)
    expect(kinds.has("stack")).toBe(true)
    expect(kinds.has("paragraph")).toBe(true)
  })

  it("paginated input contains split fragments for a paragraph that spans 2 pages", () => {
    // 80 hard-newline lines → overflows one A4 page (≈58 lines per page)
    const longText = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join("\n")
    const p = makePara("p-long", longText)
    const paginated = paginate(makeDoc(["p-long"], { "p-long": p }))
    const paraFrags = paginated.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "p-long")
    )
    expect(paraFrags.length).toBeGreaterThanOrEqual(2)
    const pageIndices = paraFrags.map((f) => f.pageIndex)
    expect(new Set(pageIndices).size).toBeGreaterThanOrEqual(2)
  })

  it("split paragraph fragments are ordered by page in renderer input", () => {
    const longText = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join("\n")
    const p = makePara("p-long", longText)
    const paginated = paginate(makeDoc(["p-long"], { "p-long": p }))
    const paraFrags = paginated.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "p-long")
    )
    for (let i = 1; i < paraFrags.length; i++) {
      expect(paraFrags[i].pageIndex).toBeGreaterThanOrEqual(paraFrags[i - 1].pageIndex)
    }
  })

  it("PDF renderer handles split paragraph fragments without throwing", async () => {
    const longText = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join("\n")
    const p = makePara("p-long", longText)
    const paginated = paginate(makeDoc(["p-long"], { "p-long": p }))
    const paraFrags = paginated.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "p-long")
    )
    expect(paraFrags.length).toBeGreaterThanOrEqual(2)
    const result = await pdf.render(paginated)
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("DOCX renderer handles split paragraph fragments without throwing", async () => {
    const longText = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join("\n")
    const p = makePara("p-long", longText)
    const paginated = paginate(makeDoc(["p-long"], { "p-long": p }))
    const paraFrags = paginated.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "p-long")
    )
    expect(paraFrags.length).toBeGreaterThanOrEqual(2)
    const result = await docx.render(paginated)
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
  })
})

// ─── DOCX smoke tests ─────────────────────────────────────────────────────────

describe("DocxRenderer smoke tests", () => {
  const docx = new DocxRenderer()

  it("renders a single paragraph without throwing", async () => {
    const p = makePara("p1", "Hello world")
    const result = await docx.render(paginate(makeDoc(["p1"], { p1: p })))
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(result.extension).toBe("docx")
    expect(result.buffer.length).toBeGreaterThan(0)
    // DOCX is a ZIP — starts with PK magic bytes (0x50 0x4B)
    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
  })

  it("renders multi-paragraph document without throwing", async () => {
    const p1 = makePara("p1", "First")
    const p2 = makePara("p2", "Second")
    const result = await docx.render(paginate(makeDoc(["p1", "p2"], { p1, p2 })))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("renders document with row and two columns without throwing", async () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st1", "st2"] }
    const result = await docx.render(paginate(makeDoc(["r1"], { r1: row, st1, st2, p1, p2 })))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("renders multi-page document without throwing", async () => {
    const nodes: Record<string, LayoutNode> = {}
    const ids: string[] = []
    for (let i = 0; i < 60; i++) {
      const id = `p${i}`
      nodes[id] = makePara(id, `Paragraph ${i + 1}`)
      ids.push(id)
    }
    const result = await docx.render(paginate(makeDoc(ids, nodes)))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("renders empty paragraph without throwing", async () => {
    const p = makePara("p1", "")
    const result = await docx.render(paginate(makeDoc(["p1"], { p1: p })))
    expect(result.buffer.length).toBeGreaterThan(0)
  })
})
