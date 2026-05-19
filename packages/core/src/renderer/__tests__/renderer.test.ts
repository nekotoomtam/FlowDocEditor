import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { LineCapStyle } from "pdf-lib"
import { PdfRenderer, resolveFragmentBoxDrawingPrimitives, resolveParagraphBoxDrawingPrimitives, resolvePdfBorderLineOptions } from "../pdf"
import { DocxRenderer } from "../docx"
import { paginateDocument, type PageFragment } from "../../pagination"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { ptToTwips } from "../shared"
import { pt } from "../../schema"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, FlowTableRowNode, LayoutNode, ParagraphNode, SpacerNode } from "../../schema"

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

function makeFlowTableCell(id: string, childIds: string[], props: FlowTableCellNode["props"] = {}): FlowTableCellNode {
  return { id, type: "flow-table-cell", props, childIds }
}

function makeFlowTableRow(id: string, cellIds: string[], props: FlowTableRowNode["props"] = {}): FlowTableRowNode {
  return { id, type: "flow-table-row", props, cellIds }
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

function makeLines(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}`).join("\n")
}

function makeFlowTableRowspanContinuationDoc(): DocumentNode {
  const before = makeSpacer("before-flow-table-rowspan", 650)
  const spanText = makePara("ft-rowspan-span-p", makeLines("S", 7), { spacingAfter: pt(0) })
  const topThird = makePara("ft-rowspan-top-third-p", "TOP3", { spacingAfter: pt(0) })
  const topFourth = makePara("ft-rowspan-top-fourth-p", "TOP4", { spacingAfter: pt(0) })
  const middleThird = makePara("ft-rowspan-middle-third-p", "MID3", { spacingAfter: pt(0) })
  const middleFourth = makePara("ft-rowspan-middle-fourth-p", "MID4", { spacingAfter: pt(0) })
  const bottomThird = makePara("ft-rowspan-bottom-third-p", "BOT3", { spacingAfter: pt(0) })
  const bottomFourth = makePara("ft-rowspan-bottom-fourth-p", "BOT4", { spacingAfter: pt(0) })
  const spanCell = makeFlowTableCell("ft-rowspan-span-cell", [spanText.id], {
    colspan: 2,
    rowspan: 3,
    box: {
      fill: "FFF7CC",
      border: {
        top: { style: "solid", width: pt(1), color: "1F2937" },
        right: { style: "solid", width: pt(1), color: "1F2937" },
        bottom: { style: "solid", width: pt(1), color: "1F2937" },
        left: { style: "solid", width: pt(1), color: "1F2937" },
      },
    },
  })
  const topThirdCell = makeFlowTableCell("ft-rowspan-top-third-cell", [topThird.id])
  const topFourthCell = makeFlowTableCell("ft-rowspan-top-fourth-cell", [topFourth.id])
  const middleThirdCell = makeFlowTableCell("ft-rowspan-middle-third-cell", [middleThird.id])
  const middleFourthCell = makeFlowTableCell("ft-rowspan-middle-fourth-cell", [middleFourth.id])
  const bottomThirdCell = makeFlowTableCell("ft-rowspan-bottom-third-cell", [bottomThird.id])
  const bottomFourthCell = makeFlowTableCell("ft-rowspan-bottom-fourth-cell", [bottomFourth.id])
  const topRow = makeFlowTableRow("ft-rowspan-top-row", [spanCell.id, topThirdCell.id, topFourthCell.id], { height: pt(40) })
  const middleRow = makeFlowTableRow("ft-rowspan-middle-row", [middleThirdCell.id, middleFourthCell.id], { height: pt(40) })
  const bottomRow = makeFlowTableRow("ft-rowspan-bottom-row", [bottomThirdCell.id, bottomFourthCell.id], { height: pt(40) })
  const table: FlowTableNode = {
    id: "ft-rowspan-render",
    type: "flow-table",
    props: {},
    columns: [{ width: pt(50) }, { width: pt(70) }, { width: pt(60) }, { width: pt(80) }],
    rowIds: [topRow.id, middleRow.id, bottomRow.id],
    nodes: {
      [topRow.id]: topRow,
      [middleRow.id]: middleRow,
      [bottomRow.id]: bottomRow,
      [spanCell.id]: spanCell,
      [topThirdCell.id]: topThirdCell,
      [topFourthCell.id]: topFourthCell,
      [middleThirdCell.id]: middleThirdCell,
      [middleFourthCell.id]: middleFourthCell,
      [bottomThirdCell.id]: bottomThirdCell,
      [bottomFourthCell.id]: bottomFourthCell,
      [spanText.id]: spanText,
      [topThird.id]: topThird,
      [topFourth.id]: topFourth,
      [middleThird.id]: middleThird,
      [middleFourth.id]: middleFourth,
      [bottomThird.id]: bottomThird,
      [bottomFourth.id]: bottomFourth,
    },
  }

  return makeDoc([before.id, table.id], {
    [before.id]: before,
    [table.id]: table as unknown as LayoutNode,
  })
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

  it("renders a flow-table cell box without throwing", async () => {
    const cell = {
      id: "ftc1",
      type: "flow-table-cell",
      props: {
        box: {
          fill: "E0F2FE",
          border: { top: { style: "solid", width: pt(1), color: "111111" } },
        },
      },
      childIds: [],
    }
    const row = {
      id: "ftr1",
      type: "flow-table-row",
      props: { height: pt(36) },
      cellIds: [cell.id],
    }
    const table = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(120) }],
      rowIds: [row.id],
      nodes: { [row.id]: row, [cell.id]: cell },
    } as unknown as LayoutNode
    const result = await pdf.render(paginate(makeDoc(["ft1"], { ft1: table })))

    expect(result.buffer.length).toBeGreaterThan(0)
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("renders split flow-table rowspan continuations without throwing", async () => {
    const paginated = paginate(makeFlowTableRowspanContinuationDoc())
    const result = await pdf.render(paginated)

    expect(paginated.sections[0].pages.length).toBeGreaterThan(1)
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

  it("resolves flow-stack box drawing primitives from fragment metadata", () => {
    const p = makePara("p1", "Stack boxed")
    const fs1: LayoutNode = {
      id: "fs1",
      type: "flow-stack",
      props: {
        widthShare: 100,
        box: {
          fill: "E0F2FE",
          padding: { top: pt(2), right: pt(2), bottom: pt(2), left: pt(2) },
          border: { left: { style: "dashed", width: pt(1), color: "111111" } },
        },
      },
      childIds: ["p1"],
    }
    const row: LayoutNode = { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] }
    const page = paginate(makeDoc(["fr1"], { fr1: row, fs1, p1: p })).sections[0].pages[0]
    const stack = page.fragments.find((fragment) => fragment.nodeId === "fs1" && fragment.nodeType === "flow-stack")!
    const primitives = resolveFragmentBoxDrawingPrimitives(stack, page.height)

    expect(primitives?.fill).toMatchObject({
      x: stack.x,
      width: stack.width,
      height: stack.height,
      color: "E0F2FE",
    })
    expect(primitives?.borders.map((line) => line.side)).toEqual(["left"])
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

  it("resolves flow-table cell box drawing primitives from fragment metadata", () => {
    const fragment: PageFragment = {
      nodeId: "flow-cell",
      nodeType: "flow-table-cell",
      pageIndex: 0,
      x: 72,
      y: 90,
      width: 120,
      height: 48,
      boxRenderProps: {
        fill: "E0F2FE",
        padding: { top: 4, right: 6, bottom: 8, left: 10 },
        border: {
          top: { style: "solid", width: 2, color: "DC2626" },
          right: { style: "solid", width: 2, color: "16A34A" },
          bottom: { style: "solid", width: 2, color: "2563EB" },
          left: { style: "solid", width: 2, color: "111827" },
        },
      },
    }

    const primitives = resolveFragmentBoxDrawingPrimitives(fragment, 400)

    expect(primitives?.fill).toMatchObject({
      x: 72,
      y: 262,
      width: 120,
      height: 48,
      color: "E0F2FE",
    })
    expect(primitives?.borders.map((line) => line.side).sort()).toEqual(["bottom", "left", "right", "top"])
  })

  it("resolves split flow-table cell borders as sliced logical box edges", () => {
    const baseFragment: PageFragment = {
      nodeId: "flow-cell",
      nodeType: "flow-table-cell",
      pageIndex: 0,
      x: 72,
      y: 90,
      width: 120,
      height: 48,
      boxRenderProps: {
        fill: "E0F2FE",
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        border: {
          top: { style: "solid", width: 2, color: "DC2626" },
          right: { style: "solid", width: 2, color: "16A34A" },
          bottom: { style: "solid", width: 2, color: "2563EB" },
          left: { style: "solid", width: 2, color: "111827" },
        },
      },
    }
    const first = resolveFragmentBoxDrawingPrimitives({ ...baseFragment, isContinued: true }, 400)
    const middle = resolveFragmentBoxDrawingPrimitives({ ...baseFragment, continuesFrom: true, isContinued: true }, 400)
    const last = resolveFragmentBoxDrawingPrimitives({ ...baseFragment, continuesFrom: true }, 400)

    expect(first?.borders.map((line) => line.side).sort()).toEqual(["left", "right", "top"])
    expect(middle?.borders.map((line) => line.side).sort()).toEqual(["left", "right"])
    expect(last?.borders.map((line) => line.side).sort()).toEqual(["bottom", "left", "right"])
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

  it("emits flow-row as a fixed DOCX layout table using paginated geometry", async () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const fs1: LayoutNode = { id: "fs1", type: "flow-stack", props: { widthShare: 25 }, childIds: ["p1"] }
    const fs2: LayoutNode = { id: "fs2", type: "flow-stack", props: { widthShare: 75 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "fr1", type: "flow-row", props: { gap: 12, minHeight: 96 }, childIds: ["fs1", "fs2"] }
    const paginated = paginate(makeDoc(["fr1"], { fr1: row, fs1, fs2, p1, p2 }))
    const page = paginated.sections[0].pages[0]
    const rowFragment = page.fragments.find((fragment) => fragment.nodeId === "fr1" && fragment.nodeType === "flow-row")!
    const stackFragments = page.fragments.filter((fragment) => fragment.parentNodeId === "fr1" && fragment.nodeType === "flow-stack")

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(xml).toContain('w:tblLayout w:type="fixed"')
    expect(xml).toContain(`w:tblW w:type="dxa" w:w="${ptToTwips(rowFragment.width)}"`)
    expect(xml).toContain(`w:trHeight w:val="${ptToTwips(rowFragment.height)}" w:hRule="exact"`)
    expect(xml).toContain("w:cantSplit")
    for (const stack of stackFragments) {
      const width = ptToTwips(stack.width)
      expect(xml).toContain(`w:gridCol w:w="${width}"`)
      expect(xml).toContain(`w:tcW w:type="dxa" w:w="${width}"`)
    }
    const gapWidth = ptToTwips(stackFragments[1].x - (stackFragments[0].x + stackFragments[0].width))
    expect(xml).toContain(`w:gridCol w:w="${gapWidth}"`)
    expect(xml).toContain(`w:tcW w:type="dxa" w:w="${gapWidth}"`)
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

  it("emits flow-table as a fixed DOCX table using paginated geometry", async () => {
    const p1 = makePara("ft-p1", "FLOW_TABLE_LEFT")
    const p2 = makePara("ft-p2", "FLOW_TABLE_RIGHT")
    const c1 = makeFlowTableCell("ft-c1", [p1.id], {
      box: {
        fill: "E0F2FE",
        padding: { top: pt(3), right: pt(4), bottom: pt(5), left: pt(6) },
        border: {
          top: { style: "solid", width: pt(1), color: "111111" },
          left: { style: "dashed", width: pt(1), color: "222222" },
        },
      },
    })
    const c2 = makeFlowTableCell("ft-c2", [p2.id])
    const r1 = makeFlowTableRow("ft-r1", [c1.id, c2.id], { height: pt(36) })
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(120) }],
      rowIds: [r1.id],
      nodes: { [r1.id]: r1, [c1.id]: c1, [c2.id]: c2, [p1.id]: p1, [p2.id]: p2 },
    }
    const paginated = paginate(makeDoc([table.id], { [table.id]: table as unknown as LayoutNode }))
    const page = paginated.sections[0].pages[0]
    const tableFragment = page.fragments.find((fragment) => fragment.nodeId === table.id && fragment.nodeType === "flow-table")!
    const rowFragment = page.fragments.find((fragment) => fragment.nodeId === r1.id && fragment.nodeType === "flow-table-row")!
    const cellFragments = page.fragments.filter((fragment) => fragment.parentNodeId === r1.id && fragment.nodeType === "flow-table-cell")

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(xml).toContain('w:tblLayout w:type="fixed"')
    expect(xml).toContain(`w:tblW w:type="dxa" w:w="${ptToTwips(tableFragment.width)}"`)
    expect(xml).toContain(`w:trHeight w:val="${ptToTwips(rowFragment.height)}" w:hRule="exact"`)
    expect(xml).toContain("w:cantSplit")
    for (const cell of cellFragments) {
      const width = ptToTwips(cell.width)
      expect(xml).toContain(`w:gridCol w:w="${width}"`)
      expect(xml).toContain(`w:tcW w:type="dxa" w:w="${width}"`)
    }
    expect(xml).toContain('w:fill="E0F2FE"')
    expect(xml).toContain("<w:tcMar>")
    expect(xml).toContain('w:color="111111"')
    expect(xml).toContain('w:color="222222"')
    expect(xml).toContain('w:val="dashed"')
    expect(countText(xml, "FLOW_TABLE_LEFT")).toBe(1)
    expect(countText(xml, "FLOW_TABLE_RIGHT")).toBe(1)
  })

  it("emits flow-table span metadata as DOCX gridSpan and vMerge", async () => {
    const p1 = makePara("ft-span-p1", "SPAN_CELL")
    const p2 = makePara("ft-span-p2", "TOP_CELL")
    const p3 = makePara("ft-span-p3", "BOTTOM_CELL")
    const c1 = makeFlowTableCell("ft-span-c1", [p1.id], { colspan: 2, rowspan: 2 })
    const c2 = makeFlowTableCell("ft-span-c2", [p2.id])
    const c3 = makeFlowTableCell("ft-span-c3", [p3.id])
    const r1 = makeFlowTableRow("ft-span-r1", [c1.id, c2.id], { height: pt(30) })
    const r2 = makeFlowTableRow("ft-span-r2", [c3.id], { height: pt(30) })
    const table: FlowTableNode = {
      id: "ft-span",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(60) }, { width: pt(70) }, { width: pt(80) }],
      rowIds: [r1.id, r2.id],
      nodes: {
        [r1.id]: r1,
        [r2.id]: r2,
        [c1.id]: c1,
        [c2.id]: c2,
        [c3.id]: c3,
        [p1.id]: p1,
        [p2.id]: p2,
        [p3.id]: p3,
      },
    }

    const result = await docx.render(paginate(makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })))
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(xml).toContain(`w:gridCol w:w="${ptToTwips(60)}"`)
    expect(xml).toContain(`w:gridCol w:w="${ptToTwips(70)}"`)
    expect(xml).toContain(`w:gridCol w:w="${ptToTwips(80)}"`)
    expect(xml).toContain('w:gridSpan w:val="2"')
    expect(xml).toContain("<w:vMerge")
    expect(xml).toContain('w:val="restart"')
    expect(countText(xml, "SPAN_CELL")).toBe(1)
    expect(countText(xml, "TOP_CELL")).toBe(1)
    expect(countText(xml, "BOTTOM_CELL")).toBe(1)
  })

  it("renders split flow-table slices and repeated headers in DOCX output", async () => {
    const bodyLines = Array.from({ length: 130 }, (_, i) => `B${String(i).padStart(3, "0")}`)
    const headerLeft = makePara("ft-header-left-p", "HDRLEFT")
    const headerRight = makePara("ft-header-right-p", "HDRRIGHT")
    const body = makePara("ft-body-p", bodyLines.join("\n"))
    const shortBody = makePara("ft-short-body-p", "SHORTBODY")
    const headerLeftCell = makeFlowTableCell("ft-header-left-cell", [headerLeft.id])
    const headerRightCell = makeFlowTableCell("ft-header-right-cell", [headerRight.id])
    const bodyCell = makeFlowTableCell("ft-body-cell", [body.id])
    const shortBodyCell = makeFlowTableCell("ft-short-body-cell", [shortBody.id])
    const headerRow = makeFlowTableRow("ft-header-row", [headerLeftCell.id, headerRightCell.id], { height: pt(24) })
    const bodyRow = makeFlowTableRow("ft-body-row", [bodyCell.id, shortBodyCell.id])
    const table: FlowTableNode = {
      id: "ft-split",
      type: "flow-table",
      props: { headerRowCount: 1 },
      columns: [{ width: pt(90) }, { width: pt(130) }],
      rowIds: [headerRow.id, bodyRow.id],
      nodes: {
        [headerRow.id]: headerRow,
        [bodyRow.id]: bodyRow,
        [headerLeftCell.id]: headerLeftCell,
        [headerRightCell.id]: headerRightCell,
        [bodyCell.id]: bodyCell,
        [shortBodyCell.id]: shortBodyCell,
        [headerLeft.id]: headerLeft,
        [headerRight.id]: headerRight,
        [body.id]: body,
        [shortBody.id]: shortBody,
      },
    }
    const paginated = paginate(makeDoc([table.id], { [table.id]: table as unknown as LayoutNode }))
    const pages = paginated.sections[0].pages
    const headerParagraphs = pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === headerLeft.id && fragment.nodeType === "paragraph"),
    )

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(pages.length).toBeGreaterThan(1)
    expect(headerParagraphs).toHaveLength(pages.length)
    expect(countText(xml, 'w:tblLayout w:type="fixed"')).toBe(pages.length)
    expect(countText(xml, `w:gridCol w:w="${ptToTwips(90)}"`)).toBe(pages.length)
    expect(countText(xml, `w:gridCol w:w="${ptToTwips(130)}"`)).toBe(pages.length)
    expect(countText(xml, "HDRLEFT")).toBe(pages.length)
    expect(countText(xml, "HDRRIGHT")).toBe(pages.length)
    expect(countText(xml, "SHORTBODY")).toBe(1)
    for (const marker of [bodyLines[0], bodyLines[45], bodyLines[89], bodyLines[129]]) {
      expect(countText(xml, marker)).toBe(1)
    }
  })

  it("renders split flow-table rowspan continuations in DOCX output", async () => {
    const paginated = paginate(makeFlowTableRowspanContinuationDoc())
    const pages = paginated.sections[0].pages
    const spanningCellFragments = pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === "ft-rowspan-span-cell" && fragment.nodeType === "flow-table-cell"),
    )
    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(pages.length).toBeGreaterThan(1)
    expect(spanningCellFragments.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(countText(xml, 'w:tblLayout w:type="fixed"')).toBe(pages.length)
    expect(countText(xml, 'w:gridSpan w:val="2"')).toBe(2)
    expect(xml).toContain("<w:vMerge")
    for (const marker of ["S001", "S004", "S007", "TOP3", "MID3", "BOT4"]) {
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

  it("emits flow-stack box as DOCX table cell shading, borders, and margins", async () => {
    const p = makePara("p1", "Stack boxed")
    const fs1: LayoutNode = {
      id: "fs1",
      type: "flow-stack",
      props: {
        widthShare: 100,
        box: {
          fill: "E0F2FE",
          padding: { top: pt(3), right: pt(4), bottom: pt(5), left: pt(6) },
          border: {
            top: { style: "solid", width: pt(1), color: "111111" },
            left: { style: "dashed", width: pt(1), color: "222222" },
          },
        },
      },
      childIds: ["p1"],
    }
    const row: LayoutNode = { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] }
    const result = await docx.render(paginate(makeDoc(["fr1"], { fr1: row, fs1, p1: p })))
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(xml).toContain('w:fill="E0F2FE"')
    expect(xml).toContain("<w:tcMar>")
    expect(xml).toContain('w:w="120"')
    expect(xml).toContain('w:color="111111"')
    expect(xml).toContain('w:color="222222"')
    expect(xml).toContain('w:val="dashed"')
  })
})
