import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument as PdfLibDocument } from "pdf-lib"
import { assertDocument } from "../../document"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "../../font-registry"
import { USER_REPORT_FIXTURES } from "../../fixtures/userReportFixtures"
import { createFontkitMeasurer } from "../../layout/font-measurer"
import { thaiWordBreaker } from "../../layout/word-breaker"
import { assertPaginatedDocument, paginateDocument } from "../../pagination"
import { PdfRenderer } from "../index"
import type { DocumentNode } from "../../schema"
import type { FontProvider } from "../shared"

const testDir = path.dirname(fileURLToPath(import.meta.url))
const FONT_PATH = path.resolve(testDir, "../../../../../public/fonts", resolveFontFileName(DEFAULT_FONT_KEY))

function readRuntimeFont(): Uint8Array {
  if (!existsSync(FONT_PATH)) {
    throw new Error(`Missing default runtime font: ${FONT_PATH}`)
  }
  return readFileSync(FONT_PATH)
}

function makeFontProvider(fontBuffer: Uint8Array): FontProvider {
  return {
    async getFont() {
      return fontBuffer
    },
  }
}

function paginateForExport(doc: DocumentNode, fontBuffer: Uint8Array) {
  assertDocument(doc)
  const paginated = paginateDocument(doc, createFontkitMeasurer(fontBuffer), thaiWordBreaker)
  assertPaginatedDocument(paginated)
  return paginated
}

function totalPageCount(paginated: ReturnType<typeof paginateForExport>): number {
  return paginated.sections.reduce((sum, section) => sum + section.pages.length, 0)
}

async function pdfPageCount(buffer: Uint8Array): Promise<number> {
  const pdf = await PdfLibDocument.load(buffer)
  return pdf.getPageCount()
}

describe("user-level report fixture PDF export", () => {
  it("requires the default runtime font for user report export gates", () => {
    expect(readRuntimeFont().byteLength).toBeGreaterThan(0)
  })

  it.each(USER_REPORT_FIXTURES)("$key PDF preserves paginated page count", async (fixture) => {
    const fontBuffer = readRuntimeFont()
    const paginated = paginateForExport(fixture.package.document, fontBuffer)

    expect(totalPageCount(paginated)).toBe(fixture.expected.totalPages)

    const result = await new PdfRenderer(makeFontProvider(fontBuffer)).render(paginated)

    expect(result.mimeType).toBe("application/pdf")
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
    expect(await pdfPageCount(result.buffer)).toBe(fixture.expected.totalPages)
  })
})
