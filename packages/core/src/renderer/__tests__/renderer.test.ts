import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { inflateSync } from "node:zlib"
import JSZip from "jszip"
import { LineCapStyle, PDFArray, PDFDict, PDFDocument as PdfLibDocument, PDFName, PDFNumber } from "pdf-lib"
import { PdfRenderer, resolveFragmentBoxDrawingPrimitives, resolveParagraphBoxDrawingPrimitives, resolvePdfBorderLineOptions, resolvePdfListMarkerDrawingPrimitive } from "../pdf"
import { DocxRenderer } from "../docx"
import { paginateDocument, resolvePaginatedLinePdfBaselineY, type PageFragment } from "../../pagination"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { ptToTwips } from "../shared"
import type { FontProvider } from "../shared"
import { pt } from "../../schema"
import type { DividerNode, DocumentNode, FlowTableCellNode, FlowTableNode, FlowTableRowNode, LayoutNode, ListStyleDefinition, PageBreakNode, ParagraphNode, SpacerNode } from "../../schema"

// ─── Document Helpers ─────────────────────────────────────────────────────────

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

const SARABUN_REGULAR_FONT_PATH = fileURLToPath(new URL("../../../../../public/fonts/Sarabun/Sarabun-Regular.ttf", import.meta.url))

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

function makeDivider(id: string, props: Partial<DividerNode["props"]> = {}): DividerNode {
  return {
    id,
    type: "divider",
    props: {
      color: "334155",
      thickness: pt(2),
      marginBefore: pt(3),
      marginAfter: pt(5),
      style: "dotted",
      ...props,
    },
  }
}

function makePageBreak(id: string): PageBreakNode {
  return { id, type: "page-break", props: {} }
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

const TOR_LIST_STYLE: ListStyleDefinition = {
  id: "tor-clause",
  levels: [
    { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), bodyIndent: pt(18) },
    { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, markerIndent: pt(18), bodyIndent: pt(36) },
  ],
}

function withListDefinitions(doc: DocumentNode): DocumentNode {
  return {
    ...doc,
    document: {
      ...doc.document,
      listStyles: { "tor-clause": TOR_LIST_STYLE },
      listInstances: { "tor-main": { id: "tor-main", styleId: "tor-clause" } },
    },
  }
}

function makeHeaderFooterFlowHeavyRendererDoc(mode: "body" | "full" = "body"): DocumentNode {
  const headerMarker = "HF_RENDER_HEAVY_HEADER"
  const footerMarker = "HF_RENDER_HEAVY_FOOTER"
  const headerParagraphs = [
    makePara("hf-render-h-p1", `${headerMarker} A\nCompany`, { fontSize: pt(8), lineHeight: 1.05, spacingAfter: pt(0) }),
    makePara("hf-render-h-p2", "Document\nDOC-2026-0001", { fontSize: pt(8), lineHeight: 1.05, spacingAfter: pt(0) }),
    makePara("hf-render-h-p3", "Cycle\n10-13 May", { fontSize: pt(8), lineHeight: 1.05, spacingAfter: pt(0) }),
    makePara("hf-render-h-p4", "Page\n{{page}}", { fontSize: pt(8), lineHeight: 1.05, spacingAfter: pt(0) }),
  ]
  const footerParagraphs = [
    makePara("hf-render-f-p1", `${footerMarker} Prepared by FlowDoc`, { fontSize: pt(8), lineHeight: 1.05, spacingAfter: pt(0) }),
    makePara("hf-render-f-p2", "Confidential", { align: "right", fontSize: pt(8), lineHeight: 1.05, spacingAfter: pt(0) }),
  ]
  const headerStackIds = ["hf-render-h-s1", "hf-render-h-s2", "hf-render-h-s3", "hf-render-h-s4"]
  const footerStackIds = ["hf-render-f-s1", "hf-render-f-s2"]
  const nodes: Record<string, LayoutNode> = {
    "hf-render-header-root": { id: "hf-render-header-root", type: "stack", props: { gap: 2 }, childIds: ["hf-render-header-row"] },
    "hf-render-footer-root": { id: "hf-render-footer-root", type: "stack", props: { gap: 2 }, childIds: ["hf-render-footer-row"] },
    "hf-render-header-row": { id: "hf-render-header-row", type: "flow-row", props: { gap: 6, minHeight: 28 }, childIds: headerStackIds },
    "hf-render-footer-row": { id: "hf-render-footer-row", type: "flow-row", props: { gap: 8, minHeight: 20 }, childIds: footerStackIds },
  }
  headerStackIds.forEach((id, index) => {
    nodes[id] = {
      id,
      type: "flow-stack",
      props: { widthShare: [28, 26, 26, 20][index], minHeight: 24 },
      childIds: index === 2 ? [] : [headerParagraphs[index].id],
    }
  })
  footerStackIds.forEach((id, index) => {
    nodes[id] = {
      id,
      type: "flow-stack",
      props: { widthShare: index === 0 ? 55 : 45, minHeight: 18 },
      childIds: [footerParagraphs[index].id],
    }
  })
  for (const paragraph of [...headerParagraphs, ...footerParagraphs]) nodes[paragraph.id] = paragraph

  const bodyParagraphs = Array.from({ length: 60 }, (_unused, index) =>
    makePara(`hf-render-body-p${index + 1}`, `Renderer heavy body paragraph ${index + 1} keeps repeated header footer flow rows active. `.repeat(3), {
      fontSize: pt(10),
      lineHeight: 1.2,
      spacingAfter: pt(7),
    }),
  )
  for (const paragraph of bodyParagraphs) nodes[paragraph.id] = paragraph

  const doc = makeDoc(bodyParagraphs.map((paragraph) => paragraph.id), nodes)
  const section = doc.document.sections[0]
  section.headerRootId = "hf-render-header-root"
  section.footerRootId = "hf-render-footer-root"
  section.page = {
    ...section.page,
    headerReserved: 46,
    footerReserved: 34,
    headerFooterHorizontalMode: mode,
  }
  return doc
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

function pdfNumberValue(value: unknown): number | null {
  return value instanceof PDFNumber ? value.asNumber() : null
}

async function collectPdfFontWidths(buffer: Uint8Array): Promise<Map<number, number>> {
  const pdf = await PdfLibDocument.load(buffer)
  const widthsByCid = new Map<number, number>()

  for (const page of pdf.getPages()) {
    const resources = page.node.Resources()
    if (!resources) continue
    const fonts = resources.lookup(PDFName.of("Font"))
    if (!(fonts instanceof PDFDict)) continue

    for (const key of fonts.keys()) {
      const font = fonts.lookup(key)
      if (!(font instanceof PDFDict)) continue
      const descendants = font.lookup(PDFName.of("DescendantFonts"))
      if (!(descendants instanceof PDFArray) || descendants.size() === 0) continue
      const descendant = descendants.lookup(0)
      if (!(descendant instanceof PDFDict)) continue
      const widths = descendant.lookup(PDFName.of("W"))
      if (!(widths instanceof PDFArray)) continue

      for (let index = 0; index < widths.size();) {
        const start = pdfNumberValue(widths.lookup(index))
        const second = widths.lookup(index + 1)
        if (start === null || !second) break

        if (second instanceof PDFArray) {
          for (let offset = 0; offset < second.size(); offset += 1) {
            const width = pdfNumberValue(second.lookup(offset))
            if (width !== null) widthsByCid.set(start + offset, width)
          }
          index += 2
          continue
        }

        const end = pdfNumberValue(second)
        const width = pdfNumberValue(widths.lookup(index + 2))
        if (end === null || width === null) break
        for (let cid = start; cid <= end; cid += 1) widthsByCid.set(cid, width)
        index += 3
      }
    }
  }

  return widthsByCid
}

async function readDocxXmlParts(buffer: Uint8Array, pathPattern: RegExp): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer)
  const paths = Object.keys(zip.files)
    .filter((path) => pathPattern.test(path))
    .sort()
  if (paths.length === 0) throw new Error(`Missing DOCX XML part matching: ${pathPattern}`)
  return Promise.all(paths.map((path) => zip.file(path)!.async("string")))
}

function countText(xml: string, text: string): number {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return xml.match(new RegExp(escaped, "g"))?.length ?? 0
}

function collectInflatedPdfStreams(buffer: Uint8Array): string[] {
  const bytes = Buffer.from(buffer)
  const streamMarker = Buffer.from("stream")
  const endStreamMarker = Buffer.from("endstream")
  const streams: string[] = []
  let offset = 0

  while (offset < bytes.length) {
    const streamIndex = bytes.indexOf(streamMarker, offset)
    if (streamIndex < 0) break
    let start = streamIndex + streamMarker.length
    if (bytes[start] === 13 && bytes[start + 1] === 10) start += 2
    else if (bytes[start] === 10) start += 1

    const end = bytes.indexOf(endStreamMarker, start)
    if (end < 0) break
    let contents = bytes.subarray(start, end)
    if (contents[contents.length - 1] === 10) contents = contents.subarray(0, contents.length - 1)
    if (contents[contents.length - 1] === 13) contents = contents.subarray(0, contents.length - 1)

    try {
      streams.push(inflateSync(contents).toString("latin1"))
    } catch {
      streams.push(contents.toString("latin1"))
    }
    offset = end + endStreamMarker.length
  }

  return streams
}

function expectedDocxMinimumRowHeightCount(rows: PageFragment[]): number {
  const seenFullRows = new Set<string>()
  let count = 0
  for (const row of rows) {
    if (row.continuesFrom === true || row.isContinued === true) continue
    if (seenFullRows.has(row.nodeId)) continue
    seenFullRows.add(row.nodeId)
    count += 1
  }
  return count
}

function docxParagraphsContaining(xml: string, marker: string): string[] {
  return [...xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => match[0])
    .filter((paragraphXml) => paragraphXml.includes(marker))
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function docxTextRuns(paragraphXml: string): Array<{ text: string; propertiesXml: string }> {
  return [...paragraphXml.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)]
    .map((match) => {
      const runXml = match[0]
      const propertiesXml = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? ""
      const text = [...runXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((textMatch) => decodeXmlText(textMatch[1]))
        .join("")
      return { text, propertiesXml }
    })
    .filter((run) => run.text.length > 0)
}

function findDocxTextRun(paragraphXml: string, text: string): { text: string; propertiesXml: string } {
  const run = docxTextRuns(paragraphXml).find((candidate) => candidate.text.includes(text))
  if (!run) throw new Error(`Missing DOCX text run: ${text}`)
  return run
}

function makeLines(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}`).join("\n")
}

function makeFlowTableRowspanContinuationDoc(): DocumentNode {
  const before = makeSpacer("ft-rowspan-before", 650)
  const rowHeight = 40
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
  const topRow = makeFlowTableRow("ft-rowspan-top-row", [spanCell.id, topThirdCell.id, topFourthCell.id], { height: pt(rowHeight) })
  const middleRow = makeFlowTableRow("ft-rowspan-middle-row", [middleThirdCell.id, middleFourthCell.id], { height: pt(rowHeight) })
  const bottomRow = makeFlowTableRow("ft-rowspan-bottom-row", [bottomThirdCell.id, bottomFourthCell.id], { height: pt(rowHeight) })
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
    [before.id]: before as unknown as LayoutNode,
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

  it("requests the matching font variant for paragraph-level bold and italic text", async () => {
    const requests: Array<{ key: string; variant: string | undefined }> = []
    const renderer = new PdfRenderer({
      async getFont(key, variant) {
        requests.push({ key, variant })
        return null
      },
    })
      const p = makePara("p1", "Styled PDF text", {
        fontFamilyKey: "sarabun",
        textColor: "DC2626",
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: "underline",
        strikethrough: true,
      })

    const result = await renderer.render(paginate(makeDoc(["p1"], { p1: p })))

    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
    expect(requests).toContainEqual({ key: "sarabun", variant: "boldItalic" })
  })

  it("resolves PDF list marker drawing geometry from generated marker metadata", () => {
    const p = makePara("p1", "PDF list body", {
      fontFamilyKey: "sarabun",
      fontSize: pt(14),
      fontWeight: "bold",
      textColor: "2563EB",
      list: { instanceId: "tor-main", level: 1, itemId: "pdf-list-item" },
    })
    const paginated = paginate(withListDefinitions(makeDoc(["p1"], { p1: p })))
    const page = paginated.sections[0].pages[0]
    const fragment = page.fragments.find((candidate) => candidate.nodeId === "p1")!
    const firstLine = fragment.lines![0]

    expect(resolvePdfListMarkerDrawingPrimitive(fragment, page.height)).toEqual({
      text: "1.1",
      x: fragment.listMarker!.markerX,
      y: resolvePaginatedLinePdfBaselineY(firstLine, page.height),
      fontFamilyKey: "sarabun",
      fontVariant: "bold",
      fontSize: 14,
      color: "2563EB",
    })
  })

  it("draws generated list markers as separate PDF text operations", async () => {
    const p = makePara("p1", "PDF_LIST_BODY", {
      list: { instanceId: "tor-main", level: 0, itemId: "pdf-list-item" },
    })
    const result = await pdf.render(paginate(withListDefinitions(makeDoc(["p1"], { p1: p }))))
    const contentStreams = collectInflatedPdfStreams(result.buffer).join("\n")

    expect(contentStreams.match(/\bBT\b/g)?.length ?? 0).toBe(2)
  })

  it("keeps shaped Thai tone-mark glyphs zero-width in embedded PDF fonts", async () => {
    const sarabunRegular = readFileSync(SARABUN_REGULAR_FONT_PATH)
    const renderer = new PdfRenderer({
      async getFont(key) {
        return key === "sarabun" ? sarabunRegular : null
      },
    })
    const p = makePara("p1", "วันที่ ความเชื่อมั่น หุ้น", {
      fontFamilyKey: "sarabun",
      fontSize: pt(12),
      lineHeight: 1.5,
    })

    const result = await renderer.render(paginate(makeDoc(["p1"], { p1: p })))
    const widths = await collectPdfFontWidths(result.buffer)

    expect(widths.get(733)).toBe(0)
    expect(widths.get(735)).toBe(0)
    expect(widths.get(736)).toBe(0)
    expect(widths.get(738)).toBe(0)
  })

  it("requests PDF fonts per rich text run", async () => {
    const requests: Array<{ key: string; variant: string | undefined }> = []
    const renderer = new PdfRenderer({
      async getFont(key, variant) {
        requests.push({ key, variant })
        return null
      },
    })
    const p = makePara("p1", "", { fontFamilyKey: "sarabun" })
    p.children = [
      { id: "p1-bold", type: "text", text: "Bold ", style: { fontWeight: "bold", textColor: "DC2626" } },
      { id: "p1-noto", type: "text", text: "Noto", style: { fontFamilyKey: "notoSansThai", fontStyle: "italic" } },
    ]

    const result = await renderer.render(paginate(makeDoc(["p1"], { p1: p })))

    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
    expect(requests).toContainEqual({ key: "sarabun", variant: "bold" })
    expect(requests).toContainEqual({ key: "notoSansThai", variant: "italic" })
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

  it("draws divider fragments and respects page-break pagination", async () => {
    const p1 = makePara("p1", "Before divider")
    const divider = makeDivider("d1")
    const pageBreak = makePageBreak("pb1")
    const p2 = makePara("p2", "After page break")
    const paginated = paginate(makeDoc(["p1", "d1", "pb1", "p2"], { p1, d1: divider, pb1: pageBreak, p2 }))
    const result = await pdf.render(paginated)
    const renderedPdf = await PdfLibDocument.load(result.buffer)
    const streams = collectInflatedPdfStreams(result.buffer).join("\n")

    expect(paginated.sections[0].pages).toHaveLength(2)
    expect(renderedPdf.getPageCount()).toBe(2)
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(streams).not.toContain("PAGE BREAK")
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

  it("renders repeated header/footer flow rows without throwing", async () => {
    const doc = makeHeaderFooterFlowHeavyRendererDoc()
    const paginated = paginate(doc)
    const pages = paginated.sections[0].pages

    expect(pages.length).toBeGreaterThanOrEqual(3)
    expect(pages.every((page) =>
      page.headerFragments.some((fragment) => fragment.nodeId === "hf-render-header-row" && fragment.nodeType === "flow-row"),
    )).toBe(true)
    expect(pages.every((page) =>
      page.footerFragments.some((fragment) => fragment.nodeId === "hf-render-footer-row" && fragment.nodeType === "flow-row"),
    )).toBe(true)
    expect(pages[0].headerZoneBox).toEqual({
      x: pages[0].contentBox.x,
      y: pages[0].contentBox.y - 46,
      width: pages[0].contentBox.width,
      height: 46,
    })
    expect(pages[0].footerZoneBox).toEqual({
      x: pages[0].contentBox.x,
      y: pages[0].contentBox.y + pages[0].contentBox.height,
      width: pages[0].contentBox.width,
      height: 34,
    })

    const result = await pdf.render(paginated)
    const exportedPdf = await PdfLibDocument.load(result.buffer)
    const contentStreams = collectInflatedPdfStreams(result.buffer).join("\n")

    expect(result.buffer.length).toBeGreaterThan(0)
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
    expect(exportedPdf.getPageCount()).toBe(pages.length)
    expect(contentStreams.match(/\bre\s+W\s+n\b/g)?.length ?? 0).toBeGreaterThanOrEqual(pages.length * 2)
  })

  it("does not draw header fragments when the reserved clip height is zero", async () => {
    const header = makePara("zero-clip-header-p", "ZERO_CLIP_HEADER", { spacingAfter: pt(0) })
    const headerRoot: LayoutNode = { id: "zero-clip-header-root", type: "stack", props: {}, childIds: [header.id] }
    const doc = makeDoc([], {
      [headerRoot.id]: headerRoot,
      [header.id]: header,
    })
    doc.document.sections[0].headerRootId = headerRoot.id
    doc.document.sections[0].page = {
      ...doc.document.sections[0].page,
      headerReserved: 0,
    }
    const paginated = paginate(doc)
    const firstPage = paginated.sections[0].pages[0]

    expect(firstPage.headerFragments.length).toBeGreaterThan(0)
    expect(firstPage.headerZoneBox?.height).toBe(0)

    const result = await pdf.render(paginated)
    const contentStreams = collectInflatedPdfStreams(result.buffer).join("\n")

    expect(contentStreams.match(/\bBT\b/g)?.length ?? 0).toBe(0)
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

  it("resolves split flow-table cell borders with visual page-slice bottom caps", () => {
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

    expect(first?.borders.map((line) => line.side).sort()).toEqual(["bottom", "left", "right", "top"])
    expect(middle?.borders.map((line) => line.side).sort()).toEqual(["bottom", "left", "right"])
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

  it("DOCX renderer merges split paragraph fragments into one editable paragraph", async () => {
    const longText = makeLines("DOCX_LOGICAL_", 90)
    const p = makePara("p-docx-logical", longText)
    const paginated = paginate(makeDoc(["p-docx-logical"], { "p-docx-logical": p }))
    const paraFrags = paginated.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "p-docx-logical")
    )
    expect(paraFrags.length).toBeGreaterThanOrEqual(2)

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    const paragraphs = docxParagraphsContaining(xml, "DOCX_LOGICAL_")

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]).toContain("DOCX_LOGICAL_001")
    expect(paragraphs[0]).toContain("DOCX_LOGICAL_090")
  })

  it("DOCX renderer reconstructs soft-wrapped Thai text without injected line spaces", async () => {
    const thaiText = "ก".repeat(180)
    const p = makePara("p-docx-thai", thaiText)
    const paginated = paginate(makeDoc(["p-docx-thai"], { "p-docx-thai": p }))
    const paragraphFragment = paginated.sections[0].pages[0].fragments.find((fragment) => fragment.nodeId === "p-docx-thai")!
    expect(paragraphFragment.lines!.length).toBeGreaterThan(1)

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(xml).toContain(thaiText)
    expect(xml).not.toContain("ก ก")
  })

  it("DOCX renderer preserves authored hard newlines when source document is provided", async () => {
    const sourceText = "DOCX_SOURCE_ALPHA\nDOCX_SOURCE_BETA\nDOCX_SOURCE_GAMMA"
    const p = makePara("p-docx-source-breaks", sourceText)
    const doc = makeDoc(["p-docx-source-breaks"], { "p-docx-source-breaks": p })
    const paginated = paginate(doc)

    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    const paragraphs = docxParagraphsContaining(xml, "DOCX_SOURCE_ALPHA")

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]).toContain("DOCX_SOURCE_BETA")
    expect(paragraphs[0]).toContain("DOCX_SOURCE_GAMMA")
    expect(countText(paragraphs[0], "<w:br")).toBe(2)
  })

  it("DOCX renderer preserves source rich text runs in one editable paragraph across pages", async () => {
    const p = makePara("p-docx-rich-multi-page", "", { fontFamilyKey: "sarabun" })
    p.children = [
      { id: "p-docx-rich-multi-base", type: "text", text: makeLines("DOCX_MULTI_BASE_", 40) },
      {
        id: "p-docx-rich-multi-bold",
        type: "text",
        text: makeLines("DOCX_MULTI_BOLD_", 40),
        style: { fontWeight: "bold", textColor: "DC2626" },
      },
      {
        id: "p-docx-rich-multi-noto",
        type: "text",
        text: makeLines("DOCX_MULTI_NOTO_", 30),
        style: {
          fontFamilyKey: "notoSansThai",
          fontSize: pt(16),
          fontStyle: "italic",
          textDecoration: "underline",
          strikethrough: true,
          textColor: "2563EB",
        },
      },
    ]
    const doc = makeDoc([p.id], { [p.id]: p })
    const paginated = paginate(doc)
    const paragraphFragments = paginated.sections[0].pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === p.id),
    )

    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    const paragraphs = docxParagraphsContaining(xml, "DOCX_MULTI_BASE_001")

    expect(paragraphFragments.length).toBeGreaterThanOrEqual(2)
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]).toContain("DOCX_MULTI_BASE_040")
    expect(paragraphs[0]).toContain("DOCX_MULTI_BOLD_040")
    expect(paragraphs[0]).toContain("DOCX_MULTI_NOTO_030")

    const baseRun = findDocxTextRun(paragraphs[0], "DOCX_MULTI_BASE_040")
    const boldRun = findDocxTextRun(paragraphs[0], "DOCX_MULTI_BOLD_040")
    const notoRun = findDocxTextRun(paragraphs[0], "DOCX_MULTI_NOTO_030")

    expect(baseRun.propertiesXml).toContain('w:ascii="Sarabun"')
    expect(baseRun.propertiesXml).not.toContain("<w:b/>")
    expect(baseRun.propertiesXml).not.toContain("<w:i/>")
    expect(baseRun.propertiesXml).not.toContain("<w:u")

    expect(boldRun.propertiesXml).toContain('w:ascii="Sarabun"')
    expect(boldRun.propertiesXml).toContain("<w:b/>")
    expect(boldRun.propertiesXml).toContain('w:color w:val="DC2626"')
    expect(boldRun.propertiesXml).not.toContain("<w:i/>")

    expect(notoRun.propertiesXml).toContain('w:ascii="Noto Sans Thai"')
    expect(notoRun.propertiesXml).toContain("<w:i/>")
    expect(notoRun.propertiesXml).toContain("<w:strike/>")
    expect(notoRun.propertiesXml).toContain('w:sz w:val="32"')
    expect(notoRun.propertiesXml).toContain('w:color w:val="2563EB"')
    expect(notoRun.propertiesXml).toContain("<w:u")
    expect(notoRun.propertiesXml).toContain('w:color="2563EB"')
    expect(notoRun.propertiesXml).not.toContain("<w:b/>")
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

  it("exports generated list markers without mutating paragraph text", async () => {
    const p = makePara("p1", "DOCX_LIST_BODY", {
      list: { instanceId: "tor-main", level: 0, itemId: "docx-list-item" },
    })
    const result = await docx.render(paginate(withListDefinitions(makeDoc(["p1"], { p1: p }))))
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    const paragraphs = docxParagraphsContaining(xml, "DOCX_LIST_BODY")
    const runs = docxTextRuns(paragraphs[0])

    expect(runs[0].text).toBe("1.")
    expect(runs.some((run) => run.text.includes("DOCX_LIST_BODY"))).toBe(true)
    expect(paragraphs[0]).toContain('w:left="360"')
    expect(paragraphs[0]).toContain('w:hanging="360"')
    expect(paragraphs[0]).toContain("<w:tab/>")
  })

  it("emits divider borders and hard page breaks in DOCX", async () => {
    const p1 = makePara("p1", "Before divider")
    const divider = makeDivider("d1", { style: "dashed", color: "334155" })
    const pageBreak = makePageBreak("pb1")
    const p2 = makePara("p2", "After page break")
    const result = await docx.render(paginate(makeDoc(["p1", "d1", "pb1", "p2"], { p1, d1: divider, pb1: pageBreak, p2 })))
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(xml).toContain('w:val="dashed"')
    expect(xml).toContain('w:color="334155"')
    expect(xml).toContain('w:type="page"')
    expect(xml.indexOf("Before divider")).toBeLessThan(xml.indexOf("After page break"))
  })

  it("keeps DOCX fonts name-only when no font provider is supplied", async () => {
    const p = makePara("p1", "Name-only Sarabun")
    const result = await docx.render(paginate(makeDoc(["p1"], { p1: p })))
    const zip = await JSZip.loadAsync(result.buffer)
    const documentXml = await readDocxXml(result.buffer, "word/document.xml")
    const fontTableXml = await readDocxXml(result.buffer, "word/fontTable.xml")
    const fontRelsXml = await readDocxXml(result.buffer, "word/_rels/fontTable.xml.rels")

    expect(documentXml).toContain('w:ascii="Sarabun"')
    expect(fontTableXml).not.toContain("w:embedRegular")
    expect(fontRelsXml).not.toContain("/relationships/font")
    expect(zip.file("word/fonts/Sarabun.odttf")).toBeNull()
  })

  it("embeds regular DOCX font files when a font provider is supplied", async () => {
    const fakeFont = Uint8Array.from({ length: 64 }, (_, index) => index)
    const fontProvider: FontProvider = {
      async getFont(key) {
        return key === "sarabun" || key === "notoSansThai" ? fakeFont : null
      },
    }
    const sarabun = makePara("p-sarabun", "Sarabun paragraph", { fontFamilyKey: "sarabun" })
    const noto = makePara("p-noto", "Noto paragraph", { fontFamilyKey: "notoSansThai" })
    const result = await new DocxRenderer({ fontProvider }).render(paginate(makeDoc(["p-sarabun", "p-noto"], { "p-sarabun": sarabun, "p-noto": noto })))
    const zip = await JSZip.loadAsync(result.buffer)
    const fontTableXml = await readDocxXml(result.buffer, "word/fontTable.xml")
    const fontRelsXml = await readDocxXml(result.buffer, "word/_rels/fontTable.xml.rels")

    expect(zip.file("word/fonts/Sarabun.odttf")).not.toBeNull()
    expect(zip.file("word/fonts/Noto Sans Thai.odttf")).not.toBeNull()
    expect(fontTableXml).toContain('w:name="Sarabun"')
    expect(fontTableXml).toContain('w:name="Noto Sans Thai"')
    expect(fontTableXml).toContain("w:embedRegular")
    expect(fontRelsXml).toContain('Target="fonts/Sarabun.odttf"')
    expect(fontRelsXml).toContain('Target="fonts/Noto Sans Thai.odttf"')
  })

  it("embeds requested DOCX font variant files when a font provider is supplied", async () => {
    const requests: Array<{ key: string; variant: string | undefined }> = []
    const fontProvider: FontProvider = {
      async getFont(key, variant) {
        requests.push({ key, variant })
        if (key !== "sarabun") return null
        const offset = variant === "bold" ? 1 : variant === "italic" ? 2 : variant === "boldItalic" ? 3 : 0
        return Uint8Array.from({ length: 64 }, (_, index) => (index + offset) % 256)
      },
    }
    const regular = makePara("p-regular", "Regular Sarabun", { fontFamilyKey: "sarabun" })
    const bold = makePara("p-bold", "Bold Sarabun", { fontFamilyKey: "sarabun", fontWeight: "bold" })
    const italic = makePara("p-italic", "Italic Sarabun", { fontFamilyKey: "sarabun", fontStyle: "italic" })
    const boldItalic = makePara("p-bold-italic", "Bold italic Sarabun", {
      fontFamilyKey: "sarabun",
      fontWeight: "bold",
      fontStyle: "italic",
    })

    const result = await new DocxRenderer({ fontProvider }).render(paginate(makeDoc(
      ["p-regular", "p-bold", "p-italic", "p-bold-italic"],
      { "p-regular": regular, "p-bold": bold, "p-italic": italic, "p-bold-italic": boldItalic },
    )))
    const zip = await JSZip.loadAsync(result.buffer)
    const fontTableXml = await readDocxXml(result.buffer, "word/fontTable.xml")
    const fontRelsXml = await readDocxXml(result.buffer, "word/_rels/fontTable.xml.rels")

    expect(requests).toEqual([
      { key: "sarabun", variant: "regular" },
      { key: "sarabun", variant: "bold" },
      { key: "sarabun", variant: "italic" },
      { key: "sarabun", variant: "boldItalic" },
    ])
    expect(zip.file("word/fonts/Sarabun.odttf")).not.toBeNull()
    expect(zip.file("word/fonts/Sarabun Bold.odttf")).not.toBeNull()
    expect(zip.file("word/fonts/Sarabun Italic.odttf")).not.toBeNull()
    expect(zip.file("word/fonts/Sarabun BoldItalic.odttf")).not.toBeNull()
    expect(fontTableXml).toContain("w:embedRegular")
    expect(fontTableXml).toContain("w:embedBold")
    expect(fontTableXml).toContain("w:embedItalic")
    expect(fontTableXml).toContain("w:embedBoldItalic")
    expect(fontRelsXml).toContain('Target="fonts/Sarabun BoldItalic.odttf"')
  })

  it("serializes paragraph-level text style run properties", async () => {
    const p = makePara("p1", "Styled text", {
      textColor: "DC2626",
      fontWeight: "bold",
      fontStyle: "italic",
      textDecoration: "underline",
      strikethrough: true,
    })
    const result = await docx.render(paginate(makeDoc(["p1"], { p1: p })))
    const documentXml = await readDocxXml(result.buffer, "word/document.xml")

    expect(documentXml).toContain("<w:b/>")
    expect(documentXml).toContain("<w:i/>")
    expect(documentXml).toContain("<w:strike/>")
    expect(documentXml).toContain('w:color w:val="DC2626"')
    expect(documentXml).toContain("<w:u")
    expect(documentXml).toContain('w:val="single"')
    expect(documentXml).toContain('w:color="DC2626"')
  })

  it("serializes source rich text runs with per-run DOCX properties", async () => {
    const p = makePara("p-docx-rich-source", "", { fontFamilyKey: "sarabun" })
    p.children = [
      { id: "p-docx-rich-base", type: "text", text: "DOCX_RUN_BASE " },
      { id: "p-docx-rich-bold", type: "text", text: "DOCX_RUN_BOLD ", style: { fontWeight: "bold", textColor: "DC2626" } },
      {
        id: "p-docx-rich-noto",
        type: "text",
        text: "DOCX_RUN_NOTO",
        style: {
          fontFamilyKey: "notoSansThai",
          fontSize: pt(16),
          fontStyle: "italic",
          textDecoration: "underline",
          strikethrough: true,
          textColor: "2563EB",
        },
      },
    ]
    const doc = makeDoc(["p-docx-rich-source"], { "p-docx-rich-source": p })

    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginate(doc))
    const documentXml = await readDocxXml(result.buffer, "word/document.xml")
    const paragraphs = docxParagraphsContaining(documentXml, "DOCX_RUN_BASE")

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]).toContain("DOCX_RUN_BOLD")
    expect(paragraphs[0]).toContain("DOCX_RUN_NOTO")
    expect(paragraphs[0]).toContain('w:ascii="Sarabun"')
    expect(paragraphs[0]).toContain('w:ascii="Noto Sans Thai"')
    expect(paragraphs[0]).toContain("<w:b/>")
    expect(paragraphs[0]).toContain("<w:i/>")
    expect(paragraphs[0]).toContain("<w:strike/>")
    expect(paragraphs[0]).toContain('w:sz w:val="32"')
    expect(paragraphs[0]).toContain('w:color w:val="DC2626"')
    expect(paragraphs[0]).toContain('w:color w:val="2563EB"')
    expect(paragraphs[0]).toContain("<w:u")
    expect(paragraphs[0]).toContain('w:color="2563EB"')

    const baseRun = findDocxTextRun(paragraphs[0], "DOCX_RUN_BASE")
    const boldRun = findDocxTextRun(paragraphs[0], "DOCX_RUN_BOLD")
    const notoRun = findDocxTextRun(paragraphs[0], "DOCX_RUN_NOTO")

    expect(baseRun.propertiesXml).toContain('w:ascii="Sarabun"')
    expect(baseRun.propertiesXml).not.toContain("<w:b/>")
    expect(baseRun.propertiesXml).not.toContain("<w:i/>")
    expect(baseRun.propertiesXml).not.toContain("<w:strike/>")
    expect(baseRun.propertiesXml).not.toContain("<w:u")

    expect(boldRun.propertiesXml).toContain('w:ascii="Sarabun"')
    expect(boldRun.propertiesXml).toContain("<w:b/>")
    expect(boldRun.propertiesXml).toContain('w:color w:val="DC2626"')
    expect(boldRun.propertiesXml).not.toContain('w:ascii="Noto Sans Thai"')
    expect(boldRun.propertiesXml).not.toContain("<w:i/>")

    expect(notoRun.propertiesXml).toContain('w:ascii="Noto Sans Thai"')
    expect(notoRun.propertiesXml).toContain("<w:i/>")
    expect(notoRun.propertiesXml).toContain("<w:strike/>")
    expect(notoRun.propertiesXml).toContain('w:sz w:val="32"')
    expect(notoRun.propertiesXml).toContain('w:color w:val="2563EB"')
    expect(notoRun.propertiesXml).toContain("<w:u")
    expect(notoRun.propertiesXml).toContain('w:color="2563EB"')
    expect(notoRun.propertiesXml).not.toContain("<w:b/>")
  })

  it("serializes paginated rich text runs without a source document", async () => {
    const p = makePara("p-docx-rich-paginated", "", { fontFamilyKey: "sarabun" })
    p.children = [
      { id: "p-docx-rich-paginated-base", type: "text", text: "DOCX_PAG_BASE " },
      { id: "p-docx-rich-paginated-bold", type: "text", text: "DOCX_PAG_BOLD ", style: { fontWeight: "bold", textColor: "DC2626" } },
      {
        id: "p-docx-rich-paginated-marked",
        type: "text",
        text: "DOCX_PAG_MARKED",
        style: {
          fontSize: pt(16),
          fontStyle: "italic",
          textDecoration: "underline",
          strikethrough: true,
          textColor: "2563EB",
        },
      },
    ]
    const doc = makeDoc(["p-docx-rich-paginated"], { "p-docx-rich-paginated": p })

    const result = await docx.render(paginate(doc))
    const documentXml = await readDocxXml(result.buffer, "word/document.xml")
    const paragraphs = docxParagraphsContaining(documentXml, "DOCX_PAG_BASE")

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]).toContain("DOCX_PAG_BOLD")
    expect(paragraphs[0]).toContain("DOCX_PAG_MARKED")
    expect(paragraphs[0]).toContain("<w:b/>")
    expect(paragraphs[0]).toContain("<w:i/>")
    expect(paragraphs[0]).toContain("<w:strike/>")
    expect(paragraphs[0]).toContain('w:sz w:val="32"')
    expect(paragraphs[0]).toContain('w:color w:val="DC2626"')
    expect(paragraphs[0]).toContain('w:color w:val="2563EB"')
    expect(paragraphs[0]).toContain("<w:u")
    expect(paragraphs[0]).toContain('w:color="2563EB"')
  })

  it("serializes source rich text runs inside DOCX headers and footers", async () => {
    const body = makePara("docx-rich-zone-body", "Zone body")
    const header = makePara("docx-rich-header", "", { fontFamilyKey: "sarabun", spacingAfter: pt(0) })
    const footer = makePara("docx-rich-footer", "", { fontFamilyKey: "sarabun", spacingAfter: pt(0) })
    header.children = [
      { id: "docx-rich-header-base", type: "text", text: "DOCX_HEADER_BASE " },
      { id: "docx-rich-header-bold", type: "text", text: "DOCX_HEADER_BOLD", style: { fontWeight: "bold", textColor: "DC2626" } },
    ]
    footer.children = [
      { id: "docx-rich-footer-base", type: "text", text: "DOCX_FOOTER_BASE " },
      {
        id: "docx-rich-footer-noto",
        type: "text",
        text: "DOCX_FOOTER_NOTO",
        style: {
          fontFamilyKey: "notoSansThai",
          fontSize: pt(16),
          fontStyle: "italic",
          textDecoration: "underline",
          strikethrough: true,
          textColor: "2563EB",
        },
      },
    ]
    const doc = makeDoc([body.id], { [body.id]: body, [header.id]: header, [footer.id]: footer })
    doc.document.sections[0].headerRootId = header.id
    doc.document.sections[0].footerRootId = footer.id

    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginate(doc))
    const headerXml = (await readDocxXmlParts(result.buffer, /^word\/header\d+\.xml$/)).join("\n")
    const footerXml = (await readDocxXmlParts(result.buffer, /^word\/footer\d+\.xml$/)).join("\n")
    const headerParagraphs = docxParagraphsContaining(headerXml, "DOCX_HEADER_BASE")
    const footerParagraphs = docxParagraphsContaining(footerXml, "DOCX_FOOTER_BASE")

    expect(headerParagraphs).toHaveLength(1)
    expect(footerParagraphs).toHaveLength(1)
    expect(countText(headerXml, "DOCX_HEADER_BOLD")).toBe(1)
    expect(countText(footerXml, "DOCX_FOOTER_NOTO")).toBe(1)

    const headerBaseRun = findDocxTextRun(headerParagraphs[0], "DOCX_HEADER_BASE")
    const headerBoldRun = findDocxTextRun(headerParagraphs[0], "DOCX_HEADER_BOLD")
    const footerBaseRun = findDocxTextRun(footerParagraphs[0], "DOCX_FOOTER_BASE")
    const footerNotoRun = findDocxTextRun(footerParagraphs[0], "DOCX_FOOTER_NOTO")

    expect(headerBaseRun.propertiesXml).toContain('w:ascii="Sarabun"')
    expect(headerBaseRun.propertiesXml).not.toContain("<w:b/>")
    expect(headerBoldRun.propertiesXml).toContain("<w:b/>")
    expect(headerBoldRun.propertiesXml).toContain('w:color w:val="DC2626"')

    expect(footerBaseRun.propertiesXml).toContain('w:ascii="Sarabun"')
    expect(footerBaseRun.propertiesXml).not.toContain("<w:i/>")
    expect(footerBaseRun.propertiesXml).not.toContain("<w:u")
    expect(footerNotoRun.propertiesXml).toContain('w:ascii="Noto Sans Thai"')
    expect(footerNotoRun.propertiesXml).toContain("<w:i/>")
    expect(footerNotoRun.propertiesXml).toContain("<w:strike/>")
    expect(footerNotoRun.propertiesXml).toContain('w:sz w:val="32"')
    expect(footerNotoRun.propertiesXml).toContain('w:color w:val="2563EB"')
    expect(footerNotoRun.propertiesXml).toContain("<w:u")
    expect(footerNotoRun.propertiesXml).toContain('w:color="2563EB"')
  })

  it("projects header/footer flow rows into DOCX header and footer parts", async () => {
    const doc = makeHeaderFooterFlowHeavyRendererDoc()
    const paginated = paginate(doc)
    const firstPage = paginated.sections[0].pages[0]

    expect(firstPage.headerFragments.some((fragment) => fragment.nodeId === "hf-render-header-row" && fragment.nodeType === "flow-row")).toBe(true)
    expect(firstPage.footerFragments.some((fragment) => fragment.nodeId === "hf-render-footer-row" && fragment.nodeType === "flow-row")).toBe(true)

    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginated)
    const documentXml = await readDocxXml(result.buffer, "word/document.xml")
    const headerXml = (await readDocxXmlParts(result.buffer, /^word\/header\d+\.xml$/)).join("\n")
    const footerXml = (await readDocxXmlParts(result.buffer, /^word\/footer\d+\.xml$/)).join("\n")

    expect(headerXml).toContain("HF_RENDER_HEAVY_HEADER")
    expect(headerXml).toContain("Document")
    expect(headerXml).toContain("Page")
    expect(headerXml).toContain("w:tblLayout")
    expect(footerXml).toContain("HF_RENDER_HEAVY_FOOTER")
    expect(footerXml).toContain("Confidential")
    expect(footerXml).toContain("w:tblLayout")
    expect(documentXml).not.toContain("HF_RENDER_HEAVY_HEADER")
    expect(documentXml).not.toContain("HF_RENDER_HEAVY_FOOTER")
  })

  it("embeds requested DOCX font variant files from rich text runs", async () => {
    const requests: Array<{ key: string; variant: string | undefined }> = []
    const fakeFont = Uint8Array.from({ length: 64 }, (_, index) => index)
    const fontProvider: FontProvider = {
      async getFont(key, variant) {
        requests.push({ key, variant })
        return fakeFont
      },
    }
    const p = makePara("p-docx-rich-fonts", "", { fontFamilyKey: "sarabun" })
    p.children = [
      { id: "p-docx-rich-font-bold", type: "text", text: "Bold ", style: { fontWeight: "bold" } },
      { id: "p-docx-rich-font-italic", type: "text", text: "Italic ", style: { fontStyle: "italic" } },
      { id: "p-docx-rich-font-noto", type: "text", text: "Noto", style: { fontFamilyKey: "notoSansThai", fontWeight: "bold" } },
    ]

    const result = await new DocxRenderer({ fontProvider }).render(paginate(makeDoc(["p-docx-rich-fonts"], { "p-docx-rich-fonts": p })))
    const zip = await JSZip.loadAsync(result.buffer)
    const fontTableXml = await readDocxXml(result.buffer, "word/fontTable.xml")

    expect(requests).toEqual([
      { key: "sarabun", variant: "regular" },
      { key: "sarabun", variant: "bold" },
      { key: "sarabun", variant: "italic" },
      { key: "notoSansThai", variant: "regular" },
      { key: "notoSansThai", variant: "bold" },
    ])
    expect(zip.file("word/fonts/Sarabun Bold.odttf")).not.toBeNull()
    expect(zip.file("word/fonts/Sarabun Italic.odttf")).not.toBeNull()
    expect(zip.file("word/fonts/Noto Sans Thai Bold.odttf")).not.toBeNull()
    expect(fontTableXml).toContain("w:embedBold")
    expect(fontTableXml).toContain("w:embedItalic")
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
    expect(xml).toContain(`w:trHeight w:val="${ptToTwips(rowFragment.height)}" w:hRule="atLeast"`)
    expect(xml).not.toContain("w:cantSplit")
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
    const rowFragments = paginated.sections[0].pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === "fr1" && fragment.nodeType === "flow-row"),
    )
    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(rowFragments.length).toBeGreaterThan(1)
    expect(rowFragments.some((fragment) => fragment.isContinued || fragment.continuesFrom)).toBe(true)
    expect(countText(xml, "w:cantSplit")).toBe(0)
    expect(countText(xml, 'w:hRule="exact"')).toBe(0)
    expect(countText(xml, 'w:hRule="atLeast"')).toBe(rowFragments.length)
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
    expect(xml).toContain(`w:trHeight w:val="${ptToTwips(rowFragment.height)}" w:hRule="atLeast"`)
    expect(xml).not.toContain("w:cantSplit")
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

  it("serializes source rich text runs inside DOCX flow-table cells", async () => {
    const p = makePara("ft-rich-cell-p", "", { fontFamilyKey: "sarabun" })
    p.children = [
      { id: "ft-rich-cell-base", type: "text", text: "DOCX_CELL_BASE " },
      { id: "ft-rich-cell-bold", type: "text", text: "DOCX_CELL_BOLD ", style: { fontWeight: "bold", textColor: "DC2626" } },
      {
        id: "ft-rich-cell-noto",
        type: "text",
        text: "DOCX_CELL_NOTO",
        style: {
          fontFamilyKey: "notoSansThai",
          fontSize: pt(16),
          fontStyle: "italic",
          textDecoration: "underline",
          strikethrough: true,
          textColor: "2563EB",
        },
      },
    ]
    const cell = makeFlowTableCell("ft-rich-cell", [p.id])
    const row = makeFlowTableRow("ft-rich-row", [cell.id], { height: pt(30) })
    const table: FlowTableNode = {
      id: "ft-rich-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(180) }],
      rowIds: [row.id],
      nodes: { [row.id]: row, [cell.id]: cell, [p.id]: p },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginate(doc))
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    const paragraphs = docxParagraphsContaining(xml, "DOCX_CELL_BASE")

    expect(paragraphs).toHaveLength(1)
    expect(countText(xml, "DOCX_CELL_BASE")).toBe(1)
    expect(countText(xml, "DOCX_CELL_BOLD")).toBe(1)
    expect(countText(xml, "DOCX_CELL_NOTO")).toBe(1)

    const baseRun = findDocxTextRun(paragraphs[0], "DOCX_CELL_BASE")
    const boldRun = findDocxTextRun(paragraphs[0], "DOCX_CELL_BOLD")
    const notoRun = findDocxTextRun(paragraphs[0], "DOCX_CELL_NOTO")

    expect(baseRun.propertiesXml).toContain('w:ascii="Sarabun"')
    expect(baseRun.propertiesXml).not.toContain("<w:b/>")
    expect(baseRun.propertiesXml).not.toContain("<w:i/>")
    expect(baseRun.propertiesXml).not.toContain("<w:u")

    expect(boldRun.propertiesXml).toContain('w:ascii="Sarabun"')
    expect(boldRun.propertiesXml).toContain("<w:b/>")
    expect(boldRun.propertiesXml).toContain('w:color w:val="DC2626"')
    expect(boldRun.propertiesXml).not.toContain('w:ascii="Noto Sans Thai"')

    expect(notoRun.propertiesXml).toContain('w:ascii="Noto Sans Thai"')
    expect(notoRun.propertiesXml).toContain("<w:i/>")
    expect(notoRun.propertiesXml).toContain("<w:strike/>")
    expect(notoRun.propertiesXml).toContain('w:sz w:val="32"')
    expect(notoRun.propertiesXml).toContain('w:color w:val="2563EB"')
    expect(notoRun.propertiesXml).toContain("<w:u")
    expect(notoRun.propertiesXml).toContain('w:color="2563EB"')
    expect(notoRun.propertiesXml).not.toContain("<w:b/>")
  })

  it("emits DOCX flow-table alignment and block margins from source table props", async () => {
    const c1 = makeFlowTableCell("ft-layout-c1", [])
    const r1 = makeFlowTableRow("ft-layout-r1", [c1.id], { height: pt(24) })
    const table: FlowTableNode = {
      id: "ft-layout",
      type: "flow-table",
      props: { align: "center", marginTop: pt(12), marginBottom: pt(8) },
      columns: [{ width: pt(160) }],
      rowIds: [r1.id],
      nodes: { [r1.id]: r1, [c1.id]: c1 },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })
    const paginated = paginate(doc)

    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(xml).toContain('w:jc w:val="center"')
    expect(xml).toContain(`w:spacing w:after="${ptToTwips(12)}"`)
    expect(xml).toContain(`w:spacing w:after="${ptToTwips(8)}"`)
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
    expect(countText(xml, "w:cantSplit")).toBe(0)
    expect(countText(xml, 'w:hRule="exact"')).toBe(0)
    expect(countText(xml, 'w:hRule="atLeast"')).toBe(2)
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
    const flowTableRows = pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeType === "flow-table-row"),
    )

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(pages.length).toBeGreaterThan(1)
    expect(headerParagraphs).toHaveLength(pages.length)
    expect(countText(xml, 'w:tblLayout w:type="fixed"')).toBe(1)
    expect(countText(xml, `w:gridCol w:w="${ptToTwips(90)}"`)).toBe(1)
    expect(countText(xml, `w:gridCol w:w="${ptToTwips(130)}"`)).toBe(1)
    expect(countText(xml, "HDRLEFT")).toBe(1)
    expect(countText(xml, "HDRRIGHT")).toBe(1)
    expect(countText(xml, "w:tblHeader")).toBe(1)
    expect(countText(xml, "SHORTBODY")).toBe(1)
    expect(countText(xml, "w:cantSplit")).toBe(0)
    expect(countText(xml, 'w:hRule="exact"')).toBe(0)
    expect(countText(xml, 'w:hRule="atLeast"')).toBe(expectedDocxMinimumRowHeightCount(flowTableRows))
    for (const marker of [bodyLines[0], bodyLines[45], bodyLines[89], bodyLines[129]]) {
      expect(countText(xml, marker)).toBe(1)
    }
  })

  it("does not duplicate source text for split flow-table cell paragraphs in DOCX output", async () => {
    const bodyLines = Array.from({ length: 130 }, (_, i) => `DOCX_SPLIT_SOURCE_${String(i).padStart(3, "0")}`)
    const body = makePara("ft-source-split-body-p", bodyLines.join("\n"))
    const bodyCell = makeFlowTableCell("ft-source-split-body-cell", [body.id])
    const bodyRow = makeFlowTableRow("ft-source-split-body-row", [bodyCell.id])
    const table: FlowTableNode = {
      id: "ft-source-split",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(220) }],
      rowIds: [bodyRow.id],
      nodes: {
        [bodyRow.id]: bodyRow,
        [bodyCell.id]: bodyCell,
        [body.id]: body,
      },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })
    const paginated = paginate(doc)
    const paragraphFragments = paginated.sections[0].pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === body.id && fragment.nodeType === "paragraph"),
    )

    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(paragraphFragments.length).toBeGreaterThan(1)
    expect(paragraphFragments.some((fragment) => fragment.isContinued || fragment.continuesFrom)).toBe(true)
    for (const marker of [bodyLines[0], bodyLines[45], bodyLines[89], bodyLines[129]]) {
      expect(countText(xml, marker)).toBe(1)
    }
  })

  it("emits split flow-table DOCX cell bottom borders for each visual page slice", async () => {
    const bodyLines = Array.from({ length: 130 }, (_, i) => `DOCX_BORDER_SLICE_${String(i).padStart(3, "0")}`)
    const body = makePara("ft-border-slice-body-p", bodyLines.join("\n"))
    const bodyCell = makeFlowTableCell("ft-border-slice-body-cell", [body.id], {
      box: {
        padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
        border: {
          bottom: { style: "solid", width: pt(1), color: "AA00CC" },
        },
      },
    })
    const bodyRow = makeFlowTableRow("ft-border-slice-body-row", [bodyCell.id])
    const table: FlowTableNode = {
      id: "ft-border-slice",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(220) }],
      rowIds: [bodyRow.id],
      nodes: {
        [bodyRow.id]: bodyRow,
        [bodyCell.id]: bodyCell,
        [body.id]: body,
      },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })
    const paginated = paginate(doc)
    const cellFragments = paginated.sections[0].pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === bodyCell.id && fragment.nodeType === "flow-table-cell"),
    )

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(cellFragments.length).toBeGreaterThan(1)
    expect(countText(xml, 'w:color="AA00CC"')).toBe(cellFragments.length)
  })

  it("keeps split flow-table DOCX rows in page order before vertical position", async () => {
    const before = makeSpacer("ft-order-before", 420)
    const bodyLines = Array.from({ length: 80 }, (_, i) => `DOCX_ORDER_${String(i).padStart(3, "0")}`)
    const body = makePara("ft-order-body-p", bodyLines.join("\n"))
    const bodyCell = makeFlowTableCell("ft-order-body-cell", [body.id])
    const bodyRow = makeFlowTableRow("ft-order-body-row", [bodyCell.id])
    const table: FlowTableNode = {
      id: "ft-order-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(220) }],
      rowIds: [bodyRow.id],
      nodes: {
        [bodyRow.id]: bodyRow,
        [bodyCell.id]: bodyCell,
        [body.id]: body,
      },
    }
    const doc = makeDoc([before.id, table.id], {
      [before.id]: before as unknown as LayoutNode,
      [table.id]: table as unknown as LayoutNode,
    })
    const paginated = paginate(doc)
    const rowFragments = paginated.sections[0].pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === bodyRow.id && fragment.nodeType === "flow-table-row"),
    )

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    const firstLineIndex = xml.indexOf(bodyLines[0])
    const lastLineIndex = xml.indexOf(bodyLines[bodyLines.length - 1])

    expect(rowFragments.length).toBeGreaterThan(1)
    expect(rowFragments[0].pageIndex).toBeLessThan(rowFragments[rowFragments.length - 1].pageIndex)
    expect(rowFragments[0].y).toBeGreaterThan(rowFragments[rowFragments.length - 1].y)
    expect(firstLineIndex).toBeGreaterThanOrEqual(0)
    expect(lastLineIndex).toBeGreaterThanOrEqual(0)
    expect(firstLineIndex).toBeLessThan(lastLineIndex)
    expect(countText(xml, 'w:hRule="atLeast"')).toBe(expectedDocxMinimumRowHeightCount(rowFragments))
  })

  it("does not mark DOCX flow-table headers as repeating when header repeat is disabled", async () => {
    const bodyLines = Array.from({ length: 130 }, (_, i) => `NR${String(i).padStart(3, "0")}`)
    const header = makePara("ft-no-repeat-header-p", "NO_REPEAT_HEADER")
    const body = makePara("ft-no-repeat-body-p", bodyLines.join("\n"))
    const headerCell = makeFlowTableCell("ft-no-repeat-header-cell", [header.id])
    const bodyCell = makeFlowTableCell("ft-no-repeat-body-cell", [body.id])
    const headerRow = makeFlowTableRow("ft-no-repeat-header-row", [headerCell.id], { height: pt(24) })
    const bodyRow = makeFlowTableRow("ft-no-repeat-body-row", [bodyCell.id])
    const table: FlowTableNode = {
      id: "ft-no-repeat",
      type: "flow-table",
      props: { headerRowCount: 1, repeatHeaderRows: false },
      columns: [{ width: pt(220) }],
      rowIds: [headerRow.id, bodyRow.id],
      nodes: {
        [headerRow.id]: headerRow,
        [bodyRow.id]: bodyRow,
        [headerCell.id]: headerCell,
        [bodyCell.id]: bodyCell,
        [header.id]: header,
        [body.id]: body,
      },
    }
    const paginated = paginate(makeDoc([table.id], { [table.id]: table as unknown as LayoutNode }))
    const pages = paginated.sections[0].pages
    const headerParagraphs = pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === header.id && fragment.nodeType === "paragraph"),
    )

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(pages.length).toBeGreaterThan(1)
    expect(headerParagraphs).toHaveLength(1)
    expect(countText(xml, "NO_REPEAT_HEADER")).toBe(1)
    expect(countText(xml, "w:tblHeader")).toBe(0)
  })

  it("renders split flow-table rowspan continuations in DOCX output", async () => {
    const paginated = paginate(makeFlowTableRowspanContinuationDoc())
    const pages = paginated.sections[0].pages
    const spanningCellFragments = pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === "ft-rowspan-span-cell" && fragment.nodeType === "flow-table-cell"),
    )
    const flowTableRows = pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeType === "flow-table-row"),
    )
    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(pages.length).toBeGreaterThan(1)
    expect(spanningCellFragments.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(countText(xml, 'w:tblLayout w:type="fixed"')).toBe(1)
    expect(countText(xml, 'w:gridSpan w:val="2"')).toBeGreaterThanOrEqual(2)
    expect(xml).toContain("<w:vMerge")
    expect(countText(xml, "w:cantSplit")).toBe(0)
    expect(countText(xml, 'w:hRule="exact"')).toBe(0)
    expect(countText(xml, 'w:hRule="atLeast"')).toBe(expectedDocxMinimumRowHeightCount(flowTableRows))
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
