import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { PDFDocument as PdfLibDocument } from "pdf-lib"
import { POST as exportPost } from "../export/route"
import { POST as paginatePost } from "../paginate/route"
import { resetRuntimePaginationMeasurerForTests } from "../paginate/paginateRuntime"
import { FLOWDOC_EXPORT_PROFILE_HEADER, parseFlowDocExportProfileHeader } from "../../_lib/exportProfile"
import {
  resetRuntimeFontCacheForTests,
  RUNTIME_FONT_FALLBACK_VALUE,
  RUNTIME_FONT_RESPONSE_HEADER,
} from "../runtimeFont"
import {
  assertPaginatedDocument,
  collectPaginatedLayoutWarnings,
  HEADER_FOOTER_RESERVED_OVERFLOW_WARNING_CODE,
  LAYOUT_WARNINGS_BLOCKED_CODE,
  type PaginatedDocument,
} from "@/pagination"
import { pt, type DocumentNode, type FlowTableCellNode, type FlowTableNode, type FlowTableRowNode, type LayoutNode, type ParagraphNode } from "@/schema"

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
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeDoc(): DocumentNode {
  const intro = makePara("intro", "รายงานทดสอบ export API")
  const details = makePara("details", "API route should validate, paginate, assert layout, and render output.")
  return {
    version: 1,
    document: {
      id: "api-export-contract-doc",
      sections: [{
        id: "api-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["intro", "details"] },
          intro,
          details,
        } satisfies Record<string, LayoutNode>,
      }],
    },
  }
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function rawRequest(url: string, body: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

async function responseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer())
}

async function readDocxXml(buffer: Uint8Array, xmlPath: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file(xmlPath)
  if (!file) throw new Error(`Missing DOCX part: ${xmlPath}`)
  return file.async("string")
}

function countText(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function makeTable(id: string, colWidths: number[], rowDefs: string[][]): FlowTableNode {
  const nodes: FlowTableNode["nodes"] = {}
  const rowIds: string[] = []

  rowDefs.forEach((cells, rowIndex) => {
    const cellIds: string[] = []
    cells.forEach((text, colIndex) => {
      const paragraphId = `${id}-p${rowIndex}-${colIndex}`
      const cellId = `${id}-c${rowIndex}-${colIndex}`
      nodes[paragraphId] = makePara(paragraphId, text)
      nodes[cellId] = { id: cellId, type: "flow-table-cell", props: {}, childIds: [paragraphId] } as FlowTableCellNode
      cellIds.push(cellId)
    })
    const rowId = `${id}-row${rowIndex}`
    nodes[rowId] = { id: rowId, type: "flow-table-row", props: {}, cellIds } as FlowTableRowNode
    rowIds.push(rowId)
  })

  return {
    id,
    type: "flow-table",
    props: { headerRowCount: 1 },
    columns: colWidths.map((width) => ({ width: pt(width) })),
    rowIds,
    nodes,
  }
}

function makeForcedOverflowWarningDoc(): DocumentNode {
  const headerText = Array.from({ length: 55 }, (_, index) => `Header ${index}`).join("\n")
  const bodyText = Array.from({ length: 12 }, (_, index) => `Body ${index}`).join("\n")
  const table = makeTable("warning-table", [451], [
    [headerText],
    [bodyText],
  ])
  const bodyRow = table.nodes["warning-table-row1"]
  const bodyCell = table.nodes["warning-table-c1-0"]
  if (bodyRow?.type === "flow-table-row") bodyRow.props = { ...bodyRow.props, allowBreak: true }
  if (bodyCell?.type === "flow-table-cell") {
    bodyCell.props = {
      ...bodyCell.props,
      box: { ...bodyCell.props.box, padding: { top: pt(24), right: pt(24), bottom: pt(24), left: pt(24) } },
    }
  }

  return {
    version: 1,
    document: {
      id: "api-export-layout-warning-doc",
      sections: [{
        id: "api-warning-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: [table.id] },
          [table.id]: table as unknown as LayoutNode,
        },
      }],
    },
  }
}

function makeHeaderFooterReservedOverflowDoc(): DocumentNode {
  const body = makePara("body-p", "Body content remains exportable while header/footer overflow is advisory.")
  const header = makePara("header-overflow-p", Array.from({ length: 8 }, (_, index) => `Header overflow ${index}`).join("\n"), {
    fontSize: pt(12),
    lineHeight: 1.2,
    spacingAfter: pt(0),
  })
  const footer = makePara("footer-overflow-p", Array.from({ length: 5 }, (_, index) => `Footer overflow ${index}`).join("\n"), {
    fontSize: pt(12),
    lineHeight: 1.2,
    spacingAfter: pt(0),
  })

  return {
    version: 1,
    document: {
      id: "api-export-header-footer-overflow-doc",
      sections: [{
        id: "api-header-footer-overflow-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
          headerReserved: 28,
          footerReserved: 24,
        },
        bodyRootId: "body",
        headerRootId: "header-root",
        footerRootId: "footer-root",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: [body.id] },
          "header-root": { id: "header-root", type: "stack", props: {}, childIds: [header.id] },
          "footer-root": { id: "footer-root", type: "stack", props: {}, childIds: [footer.id] },
          [body.id]: body,
          [header.id]: header,
          [footer.id]: footer,
        } satisfies Record<string, LayoutNode>,
      }],
    },
  }
}

async function withTemporaryCwd<T>(fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd()
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flowdoc-no-runtime-font-"))
  resetRuntimeFontCacheForTests()
  resetRuntimePaginationMeasurerForTests()

  try {
    process.chdir(tempDir)
    return await fn()
  } finally {
    process.chdir(originalCwd)
    resetRuntimeFontCacheForTests()
    resetRuntimePaginationMeasurerForTests()
    rmSync(tempDir, { recursive: true, force: true })
  }
}

describe("API route contract smoke", () => {
  it("/api/paginate validates JSON and returns asserted paginated output", async () => {
    const response = await paginatePost(jsonRequest("http://localhost/api/paginate", makeDoc()) as never)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(response.headers.get(RUNTIME_FONT_RESPONSE_HEADER)).toBeNull()

    const paginated = await response.json() as PaginatedDocument
    expect(() => assertPaginatedDocument(paginated)).not.toThrow()
    expect(paginated.sections).toHaveLength(1)
    expect(paginated.sections[0].pages[0].fragments.some((fragment) => fragment.nodeId === "intro")).toBe(true)
  })

  it("/api/paginate rejects invalid JSON", async () => {
    const response = await paginatePost(rawRequest("http://localhost/api/paginate", "{") as never)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid JSON body" })
  })

  it("/api/paginate exposes font fallback state when the runtime font is missing", async () => {
    await withTemporaryCwd(async () => {
      const response = await paginatePost(jsonRequest("http://localhost/api/paginate", makeDoc()) as never)

      expect(response.status).toBe(200)
      expect(response.headers.get(RUNTIME_FONT_RESPONSE_HEADER)).toBe(RUNTIME_FONT_FALLBACK_VALUE)
      const paginated = await response.json() as PaginatedDocument
      expect(() => assertPaginatedDocument(paginated)).not.toThrow()
    })
  })

  it("/api/export rejects unsupported formats", async () => {
    const response = await exportPost(jsonRequest("http://localhost/api/export", {
      doc: makeDoc(),
      format: "html",
    }) as never)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid export format" })
  })

  it("/api/export renders PDF with expected headers and page count", async () => {
    const response = await exportPost(jsonRequest("http://localhost/api/export", {
      doc: makeDoc(),
      format: "pdf",
    }) as never)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toContain('filename="document.pdf"')
    expect(response.headers.get(RUNTIME_FONT_RESPONSE_HEADER)).toBeNull()
    const profile = parseFlowDocExportProfileHeader(response.headers.get(FLOWDOC_EXPORT_PROFILE_HEADER))
    expect(profile).toMatchObject({
      format: "pdf",
      pageCount: 1,
      pdfPageBatchSize: 20,
    })
    expect(profile?.fragmentCount).toBeGreaterThan(0)
    expect(profile?.paginateMs).toEqual(expect.any(Number))
    expect(profile?.renderMs).toEqual(expect.any(Number))
    expect(profile?.totalMs).toEqual(expect.any(Number))

    const bytes = await responseBytes(response)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF")
    const pdf = await PdfLibDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
  })

  it("/api/export fails closed when the runtime font is missing", async () => {
    await withTemporaryCwd(async () => {
      const response = await exportPost(jsonRequest("http://localhost/api/export", {
        doc: makeDoc(),
        format: "pdf",
      }) as never)

      expect(response.status).toBe(503)
      expect(response.headers.get(RUNTIME_FONT_RESPONSE_HEADER)).toBe(RUNTIME_FONT_FALLBACK_VALUE)
      await expect(response.json()).resolves.toMatchObject({
        error: "Runtime font unavailable",
        code: "FONT_FALLBACK_BLOCKED",
      })
    })
  })

  it("/api/paginate exposes server layout warnings for forced table split overflow", async () => {
    const response = await paginatePost(jsonRequest("http://localhost/api/paginate", makeForcedOverflowWarningDoc()) as never)
    expect(response.status).toBe(200)

    const paginated = await response.json() as PaginatedDocument
    const warnings = collectPaginatedLayoutWarnings(paginated)

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "forced-flow-table-split-overflow",
        message: "flow-table split used forced overflow",
      }),
    ]))
  })

  it.each(["pdf", "docx"] as const)("/api/export blocks %s artifacts when server layout warnings are present", async (format) => {
    const response = await exportPost(jsonRequest("http://localhost/api/export", {
      doc: makeForcedOverflowWarningDoc(),
      format,
    }) as never)

    expect(response.status).toBe(409)
    expect(response.headers.get("content-disposition")).toBeNull()
    await expect(response.json()).resolves.toMatchObject({
      error: "Layout warnings block final export",
      code: LAYOUT_WARNINGS_BLOCKED_CODE,
      warnings: [
        expect.objectContaining({
          code: "forced-flow-table-split-overflow",
          message: "flow-table split used forced overflow",
        }),
      ],
    })
  })

  it.each(["pdf", "docx"] as const)("/api/export allows %s artifacts when only header/footer reserved overflow is present", async (format) => {
    const doc = makeHeaderFooterReservedOverflowDoc()
    const paginateResponse = await paginatePost(jsonRequest("http://localhost/api/paginate", doc) as never)
    const paginated = await paginateResponse.json() as PaginatedDocument
    const warnings = collectPaginatedLayoutWarnings(paginated)

    expect(warnings).toEqual([expect.objectContaining({
      code: HEADER_FOOTER_RESERVED_OVERFLOW_WARNING_CODE,
      message: "header/footer content exceeds reserved height; PDF clips overflow and DOCX may reflow or show extra content",
    })])

    const response = await exportPost(jsonRequest("http://localhost/api/export", {
      doc,
      format,
    }) as never)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toContain(`filename="document.${format}"`)
  })

  it("/api/export renders DOCX with expected headers and editable document XML", async () => {
    const response = await exportPost(jsonRequest("http://localhost/api/export", {
      doc: makeDoc(),
      format: "docx",
    }) as never)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type"))
      .toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(response.headers.get("content-disposition")).toContain('filename="document.docx"')
    expect(response.headers.get(RUNTIME_FONT_RESPONSE_HEADER)).toBeNull()

    const bytes = await responseBytes(response)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)

    const zip = await JSZip.loadAsync(bytes)
    expect(zip.file("word/fonts/Sarabun.odttf")).not.toBeNull()

    const fontTableXml = await readDocxXml(bytes, "word/fontTable.xml")
    expect(fontTableXml).toContain('w:name="Sarabun"')
    expect(fontTableXml).toContain("w:embedRegular")

    const xml = await readDocxXml(bytes, "word/document.xml")
    expect(xml).toContain("API route should validate")
  })

  it("/api/export renders DOCX paragraph styles with matching embedded font variant", async () => {
    const doc = makeDoc()
    const details = doc.document.sections[0].nodes.details
    if (details.type !== "paragraph") throw new Error("details fixture must be a paragraph")
    doc.document.sections[0].nodes.details = {
      ...details,
      props: {
        ...details.props,
        fontFamilyKey: "sarabun",
        textColor: "DC2626",
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: "underline",
        strikethrough: true,
      },
    }

    const response = await exportPost(jsonRequest("http://localhost/api/export", {
      doc,
      format: "docx",
    }) as never)

    expect(response.status).toBe(200)
    const bytes = await responseBytes(response)
    const zip = await JSZip.loadAsync(bytes)
    const fontTableXml = await readDocxXml(bytes, "word/fontTable.xml")
    const documentXml = await readDocxXml(bytes, "word/document.xml")

    expect(zip.file("word/fonts/Sarabun BoldItalic.odttf")).not.toBeNull()
    expect(fontTableXml).toContain("w:embedBoldItalic")
    expect(documentXml).toContain("<w:b/>")
    expect(documentXml).toContain("<w:i/>")
    expect(documentXml).toContain("<w:strike/>")
    expect(documentXml).toContain('w:color w:val="DC2626"')
    expect(documentXml).toContain("<w:u")
    expect(documentXml).toContain('w:val="single"')
  })

  it("/api/export passes source paragraph hard newlines into DOCX output", async () => {
    const doc = makeDoc()
    const details = doc.document.sections[0].nodes.details
    if (details.type !== "paragraph") throw new Error("details fixture must be a paragraph")
    doc.document.sections[0].nodes.details = {
      ...details,
      children: [{ id: "details-hard-break-text", type: "text", text: "API_SOURCE_ALPHA\nAPI_SOURCE_BETA" }],
    }

    const response = await exportPost(jsonRequest("http://localhost/api/export", {
      doc,
      format: "docx",
    }) as never)

    expect(response.status).toBe(200)
    const bytes = await responseBytes(response)
    const xml = await readDocxXml(bytes, "word/document.xml")

    expect(xml).toContain("API_SOURCE_ALPHA")
    expect(xml).toContain("API_SOURCE_BETA")
    expect(countText(xml, "<w:br")).toBe(1)
  })
})
