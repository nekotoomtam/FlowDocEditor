import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"
import { PDFDocument as PdfLibDocument } from "pdf-lib"
import { assertDocument } from "../../document"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "../../font-registry"
import { createFontkitMeasurer } from "../../layout/font-measurer"
import { thaiWordBreaker } from "../../layout/word-breaker"
import { assertPaginatedDocument, paginateDocument } from "../../pagination"
import { pt } from "../../schema"
import { DocxRenderer, PdfRenderer } from "../index"
import type { DocumentNode, DocumentSection, LayoutNode, ParagraphNode, TableCellNode, TableNode, TableRowNode } from "../../schema"
import type { FontProvider } from "../shared"

const testDir = path.dirname(fileURLToPath(import.meta.url))
const FONT_PATH = path.resolve(testDir, "../../../../../public/fonts", resolveFontFileName(DEFAULT_FONT_KEY))

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
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...overrides,
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makePageNumberPara(id: string): ParagraphNode {
  return {
    ...makePara(id, ""),
    children: [
      { id: `${id}-label`, type: "text", text: "หน้า " },
      { id: `${id}-page-number`, type: "pageNumber" },
    ],
  }
}

function makeFooter(rootId: string): { rootId: string; nodes: Record<string, LayoutNode> } {
  const paragraphId = `${rootId}-text`
  return {
    rootId,
    nodes: {
      [rootId]: { id: rootId, type: "stack", props: {}, childIds: [paragraphId] },
      [paragraphId]: makePageNumberPara(paragraphId),
    },
  }
}

function makeSection(
  id: string,
  childIds: string[],
  nodes: Record<string, LayoutNode>,
  opts: { pageNumberStart?: number; footer?: ReturnType<typeof makeFooter> } = {},
): DocumentSection {
  return {
    id,
    type: "section",
    page: opts.pageNumberStart !== undefined ? { ...PAGE, pageNumberStart: opts.pageNumberStart } : PAGE,
    bodyRootId: `body-${id}`,
    footerRootId: opts.footer?.rootId,
    nodes: {
      ...(opts.footer?.nodes ?? {}),
      [`body-${id}`]: { id: `body-${id}`, type: "body", props: {}, childIds },
      ...nodes,
    },
  }
}

function makeTocSection(title: string): DocumentSection {
  return makeSection("toc", ["toc-node"], {
    "toc-node": { id: "toc-node", type: "toc", props: { title } },
  })
}

function makeTable(id: string, colWidths: number[], rowDefs: string[][]): TableNode {
  const nodes: TableNode["nodes"] = {}
  const rowIds: string[] = []

  rowDefs.forEach((cells, rowIndex) => {
    const cellIds: string[] = []
    cells.forEach((text, colIndex) => {
      const paragraphId = `${id}-p${rowIndex}-${colIndex}`
      const cellId = `${id}-c${rowIndex}-${colIndex}`
      nodes[paragraphId] = makePara(paragraphId, text)
      nodes[cellId] = { id: cellId, type: "table-cell", props: {}, childIds: [paragraphId] } as TableCellNode
      cellIds.push(cellId)
    })

    const rowId = `${id}-row${rowIndex}`
    nodes[rowId] = { id: rowId, type: "table-row", props: {}, cellIds } as TableRowNode
    rowIds.push(rowId)
  })

  return {
    id,
    type: "table",
    props: { headerRowCount: 1 },
    columns: colWidths.map((width) => ({ width: pt(width) })),
    rowIds,
    nodes,
  }
}

function makeCustomsDoc(): DocumentNode {
  const footer = makeFooter("customs-footer")
  const table = makeTable("customs-golden-table", [80, 291, 80], [
    ["No.", "Description", "Amount"],
    ...Array.from({ length: 130 }, (_, index) => [
      String(index + 1),
      `รายการสินค้า ${index + 1}`,
      `${(index + 1) * 100}`,
    ]),
  ])

  return {
    version: 1,
    document: {
      id: "customs-export-golden",
      sections: [
        makeSection("customs", ["customs-golden-table"], {
          "customs-golden-table": table as unknown as LayoutNode,
        }, { footer }),
      ],
    },
  }
}

function makeReportDoc(): DocumentNode {
  const bodyFooter = makeFooter("body-footer")
  const coverTitle = makePara("cover-title", "รายงานราชการ", { headingLevel: 1 })
  const bodyHeading = makePara("body-heading-1", "บทที่ 1 บทนำ", {
    headingLevel: 1,
    keepWithNext: true,
    spacingAfter: pt(4),
  })
  const longBody = makePara(
    "body-long-thai",
    Array.from({ length: 125 }, (_, index) => `บรรทัดรายงาน ${index + 1}`).join("\n"),
  )

  return {
    version: 1,
    document: {
      id: "report-export-golden",
      sections: [
        makeSection("cover", ["cover-title"], { "cover-title": coverTitle }),
        makeTocSection("สารบัญ"),
        makeSection("body", ["body-heading-1", "body-long-thai"], {
          "body-heading-1": bodyHeading,
          "body-long-thai": longBody,
        }, { pageNumberStart: 1, footer: bodyFooter }),
      ],
    },
  }
}

function paginateForExport(doc: DocumentNode, fontBuffer: Uint8Array) {
  assertDocument(doc)
  const result = paginateDocument(doc, createFontkitMeasurer(fontBuffer), thaiWordBreaker)
  assertPaginatedDocument(result)
  return result
}

function makeFontProvider(fontBuffer: Uint8Array): FontProvider {
  return {
    async getFont() {
      return fontBuffer
    },
  }
}

function readRuntimeFont(): Uint8Array {
  if (!existsSync(FONT_PATH)) {
    throw new Error(`Missing default runtime font: ${FONT_PATH}`)
  }
  return readFileSync(FONT_PATH)
}

function totalPageCount(doc: ReturnType<typeof paginateForExport>): number {
  return doc.sections.reduce((sum, section) => sum + section.pages.length, 0)
}

async function pdfPageCount(buffer: Uint8Array): Promise<number> {
  const pdf = await PdfLibDocument.load(buffer)
  return pdf.getPageCount()
}

async function readDocxXml(buffer: Uint8Array, xmlPath: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file(xmlPath)
  if (!file) throw new Error(`Missing DOCX part: ${xmlPath}`)
  return file.async("string")
}

function countXmlTag(xml: string, tag: string): number {
  return xml.match(new RegExp(`<${tag}(\\s|>|/)`, "g"))?.length ?? 0
}

describe("product export golden smoke", () => {
  it("requires the default runtime font asset", () => {
    const fontBuffer = readRuntimeFont()
    expect(fontBuffer.byteLength).toBeGreaterThan(0)
  })

  it("product fixture - customs PDF preserves page count and table geometry", async () => {
    const fontBuffer = readRuntimeFont()
    const paginated = paginateForExport(makeCustomsDoc(), fontBuffer)
    const pages = paginated.sections[0].pages
    const headerRows = pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === "customs-golden-table-row0"),
    )
    const bodyRows = pages.flatMap((page) =>
      page.fragments.filter((fragment) =>
        fragment.parentNodeId === "customs-golden-table" &&
        fragment.nodeType === "row" &&
        fragment.nodeId !== "customs-golden-table-row0",
      ),
    )
    const firstPageHeaderCells = pages[0].fragments
      .filter((fragment) => fragment.parentNodeId === "customs-golden-table-row0" && fragment.nodeType === "table-cell")
      .sort((a, b) => a.x - b.x)

    expect(pages).toHaveLength(3)
    expect(headerRows).toHaveLength(3)
    expect(bodyRows).toHaveLength(130)
    expect(firstPageHeaderCells.map((cell) => cell.width)).toEqual([80, 291, 80])
    expect(firstPageHeaderCells[0].x).toBe(pages[0].contentBox.x)
    expect(firstPageHeaderCells[2].x + firstPageHeaderCells[2].width)
      .toBe(pages[0].contentBox.x + pages[0].contentBox.width)

    const result = await new PdfRenderer(makeFontProvider(fontBuffer)).render(paginated)
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
    expect(await pdfPageCount(result.buffer)).toBe(totalPageCount(paginated))
  })

  it("product fixture - report PDF preserves section page counts and Thai render path", async () => {
    const fontBuffer = readRuntimeFont()
    const paginated = paginateForExport(makeReportDoc(), fontBuffer)
    const bodyPages = paginated.sections[2].pages

    expect(paginated.sections.map((section) => section.pages.length)).toEqual([1, 1, 3])
    expect(bodyPages.map((page) =>
      page.footerFragments.find((fragment) => fragment.nodeId === "body-footer-text")?.lines?.[0]?.text,
    )).toEqual(["หน้า 1", "หน้า 2", "หน้า 3"])

    const result = await new PdfRenderer(makeFontProvider(fontBuffer)).render(paginated)
    expect(result.mimeType).toBe("application/pdf")
    expect(await pdfPageCount(result.buffer)).toBe(5)
  })

  it("product fixture - customs DOCX preserves paginated table rows", async () => {
    const fontBuffer = readRuntimeFont()
    const paginated = paginateForExport(makeCustomsDoc(), fontBuffer)
    const expectedRows = paginated.sections[0].pages.flatMap((page) =>
      page.fragments.filter((fragment) =>
        fragment.parentNodeId === "customs-golden-table" &&
        fragment.nodeType === "row",
      ),
    ).length

    const result = await new DocxRenderer().render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
    expect(countXmlTag(xml, "w:tr")).toBe(expectedRows)
  })
})
