import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { LineCapStyle } from "pdf-lib"
import { PdfRenderer, resolveParagraphBoxDrawingPrimitives, resolvePdfBorderLineOptions } from "../pdf"
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

function makePara(id: string, text: string, overrides: Partial<ParagraphNode["props"]> = {}): ParagraphNode {
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
      ...overrides,
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

async function readDocxXml(buffer: Uint8Array, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file(path)
  if (!file) throw new Error(`Missing DOCX XML path: ${path}`)
  return file.async("string")
}

function countText(xml: string, text: string): number {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return xml.match(new RegExp(escaped, "g"))?.length ?? 0
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

  it("renders document with multi-page flow-row without throwing", async () => {
    const p1 = makePara("p1", Array.from({ length: 120 }, (_, i) => `Line ${i + 1}`).join("\n"))
    const p2 = makePara("p2", "Short sibling")
    const fs1: LayoutNode = { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] }
    const fs2: LayoutNode = { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] }
    const result = await pdf.render(paginate(makeDoc(["fr1"], { fr1: row, fs1, fs2, p1, p2 })))
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
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

  it("renders boxed paragraph without throwing", async () => {
    const p = makePara("p1", "Boxed", {
      box: {
        fill: "F8FAFC",
        padding: { top: pt(3), right: pt(4), bottom: pt(5), left: pt(6) },
        border: {
          top: { style: "solid", width: pt(1), color: "111111" },
          right: { style: "dashed", width: pt(1), color: "222222" },
          bottom: { style: "dotted", width: pt(1), color: "333333" },
          left: { style: "solid", width: pt(1), color: "444444" },
        },
      },
    })
    const result = await pdf.render(paginate(makeDoc(["p1"], { p1: p })))
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("maps paragraph box border styles to PDF line drawing options", () => {
    expect(resolvePdfBorderLineOptions({ style: "solid", width: 2, color: "111111" })).toEqual({})
    expect(resolvePdfBorderLineOptions({ style: "dashed", width: 2, color: "222222" })).toEqual({
      dashArray: [6, 4],
      lineCap: LineCapStyle.Butt,
    })
    expect(resolvePdfBorderLineOptions({ style: "dotted", width: 2, color: "333333" })).toEqual({
      dashArray: [0, 4.4],
      lineCap: LineCapStyle.Round,
    })
  })

  it("resolves paragraph box drawing primitives without including outside spacing", () => {
    const p = makePara("p1", "Boxed", {
      spacingBefore: pt(3),
      spacingAfter: pt(4),
      box: {
        fill: "F8FAFC",
        padding: { top: pt(2), right: pt(2), bottom: pt(2), left: pt(2) },
        border: {
          top: { style: "solid", width: pt(1), color: "111111" },
          right: { style: "solid", width: pt(1), color: "222222" },
          bottom: { style: "solid", width: pt(1), color: "333333" },
          left: { style: "solid", width: pt(1), color: "444444" },
        },
      },
    })
    const page = paginate(makeDoc(["p1"], { p1: p })).sections[0].pages[0]
    const fragment = page.fragments.find((f) => f.nodeId === "p1")!
    const primitives = resolveParagraphBoxDrawingPrimitives(fragment, page.height)

    expect(primitives?.fill).toMatchObject({
      x: fragment.x,
      width: fragment.width,
      height: fragment.height - 3 - 4,
      color: "F8FAFC",
    })
    expect(primitives?.fill?.y).toBeCloseTo(page.height - fragment.y - fragment.height + 4)
    expect(primitives?.borders.map((line) => line.side).sort()).toEqual(["bottom", "left", "right", "top"])
  })

  it("resolves split paragraph box borders as sliced logical box edges", () => {
    const p = makePara("p1", Array.from({ length: 70 }, () => "A").join("\n"), {
      box: {
        fill: "F8FAFC",
        padding: { top: pt(3), right: pt(0), bottom: pt(4), left: pt(0) },
        border: {
          top: { style: "solid", width: pt(1), color: "111111" },
          right: { style: "solid", width: pt(1), color: "222222" },
          bottom: { style: "solid", width: pt(1), color: "333333" },
          left: { style: "solid", width: pt(1), color: "444444" },
        },
      },
    })
    const pages = paginate(makeDoc(["p1"], { p1: p })).sections[0].pages
    const fragments = pages.flatMap((page) => page.fragments.map((fragment) => ({ page, fragment }))).filter((entry) => entry.fragment.nodeId === "p1")

    expect(fragments.length).toBeGreaterThanOrEqual(2)
    const firstSides = resolveParagraphBoxDrawingPrimitives(fragments[0].fragment, fragments[0].page.height)?.borders.map((line) => line.side).sort()
    const last = fragments[fragments.length - 1]
    const lastSides = resolveParagraphBoxDrawingPrimitives(last.fragment, last.page.height)?.borders.map((line) => line.side).sort()

    expect(firstSides).toEqual(["left", "right", "top"])
    expect(lastSides).toEqual(["bottom", "left", "right"])
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

  it("paginated input contains flow-row, flow-stack, and paragraph fragment kinds", () => {
    const p1 = makePara("p1", Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join("\n"))
    const p2 = makePara("p2", "Short")
    const fs1: LayoutNode = { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] }
    const fs2: LayoutNode = { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] }
    const paginated = paginate(makeDoc(["fr1"], { fr1: row, fs1, fs2, p1, p2 }))
    const allFrags = paginated.sections[0].pages.flatMap((pg) => pg.fragments)
    const kinds = new Set(allFrags.map((f) => f.nodeType))
    expect(kinds.has("flow-row")).toBe(true)
    expect(kinds.has("flow-stack")).toBe(true)
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

  it("renders document with flow-row without throwing", async () => {
    const p1 = makePara("p1", Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join("\n"))
    const p2 = makePara("p2", "Short")
    const fs1: LayoutNode = { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] }
    const fs2: LayoutNode = { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] }
    const result = await docx.render(paginate(makeDoc(["fr1"], { fr1: row, fs1, fs2, p1, p2 })))
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
  })

  it("renders long flow-row marker lines once in DOCX output", async () => {
    const leftLines = Array.from({ length: 90 }, (_, i) => `FLOWDOC_LEFT_MARKER_${i}`)
    const rightLines = Array.from({ length: 90 }, (_, i) => `FLOWDOC_RIGHT_MARKER_${i}`)
    const p1 = makePara("p1", leftLines.join("\n"))
    const p2 = makePara("p2", rightLines.join("\n"))
    const fs1: LayoutNode = { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] }
    const fs2: LayoutNode = { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] }
    const paginated = paginate(makeDoc(["fr1"], { fr1: row, fs1, fs2, p1, p2 }))
    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    for (const marker of [leftLines[0], leftLines[45], leftLines[89], rightLines[0], rightLines[45], rightLines[89]]) {
      expect(countText(xml, marker)).toBe(1)
    }
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

  it("emits paragraph box shading, borders, and border spacing", async () => {
    const p = makePara("p1", "Boxed", {
      box: {
        fill: "F8FAFC",
        padding: { top: pt(3), right: pt(4), bottom: pt(5), left: pt(6) },
        border: {
          top: { style: "solid", width: pt(1), color: "111111" },
          right: { style: "dashed", width: pt(1), color: "222222" },
          bottom: { style: "dotted", width: pt(1), color: "333333" },
          left: { style: "solid", width: pt(1), color: "444444" },
        },
      },
    })
    const result = await docx.render(paginate(makeDoc(["p1"], { p1: p })))
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(xml).toContain('w:fill="F8FAFC"')
    expect(xml).toContain("<w:pBdr>")
    expect(xml).toContain('w:color="111111"')
    expect(xml).toContain('w:color="222222"')
    expect(xml).toContain('w:color="333333"')
    expect(xml).toContain('w:color="444444"')
    expect(xml).toContain('w:val="dashed"')
    expect(xml).toContain('w:val="dotted"')
    expect(xml).toContain('w:space="6"')
  })
})
