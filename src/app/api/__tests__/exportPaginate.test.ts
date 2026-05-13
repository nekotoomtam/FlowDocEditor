import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { PDFDocument as PdfLibDocument } from "pdf-lib"
import { POST as exportPost } from "../export/route"
import { POST as paginatePost } from "../paginate/route"
import {
  resetRuntimeFontCacheForTests,
  RUNTIME_FONT_FALLBACK_VALUE,
  RUNTIME_FONT_RESPONSE_HEADER,
} from "../runtimeFont"
import {
  assertPaginatedDocument,
  collectPaginatedLayoutWarnings,
  LAYOUT_WARNINGS_BLOCKED_CODE,
  type PaginatedDocument,
} from "@/pagination"
import { pt, type DocumentNode, type LayoutNode, type ParagraphNode, type TableCellNode, type TableNode, type TableRowNode } from "@/schema"

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

function makeForcedOverflowWarningDoc(): DocumentNode {
  const headerText = Array.from({ length: 55 }, (_, index) => `Header ${index}`).join("\n")
  const bodyText = Array.from({ length: 12 }, (_, index) => `Body ${index}`).join("\n")
  const table = makeTable("warning-table", [451], [
    [headerText],
    [bodyText],
  ])
  const bodyRow = table.nodes["warning-table-row1"]
  const bodyCell = table.nodes["warning-table-c1-0"]
  if (bodyRow?.type === "table-row") bodyRow.props = { ...bodyRow.props, allowBreak: true }
  if (bodyCell?.type === "table-cell") bodyCell.props = { ...bodyCell.props, padding: pt(24) }

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

async function withTemporaryCwd<T>(fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd()
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flowdoc-no-runtime-font-"))
  resetRuntimeFontCacheForTests()

  try {
    process.chdir(tempDir)
    return await fn()
  } finally {
    process.chdir(originalCwd)
    resetRuntimeFontCacheForTests()
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
        code: "forced-table-split-overflow",
        message: "table split used forced overflow",
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
          code: "forced-table-split-overflow",
          message: "table split used forced overflow",
        }),
      ],
    })
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

    const xml = await readDocxXml(bytes, "word/document.xml")
    expect(xml).toContain("API route should validate")
  })
})
