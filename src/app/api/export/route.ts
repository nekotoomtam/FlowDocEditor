import { NextRequest, NextResponse } from "next/server"
import { assertPaginatedDocument, collectPaginatedLayoutWarnings, filterBlockingLayoutWarnings, LAYOUT_WARNINGS_BLOCKED_CODE, paginateDocument, paginateDocumentWithProfile, type PaginationProfile } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { DEFAULT_PDF_RENDER_PAGE_BATCH_SIZE, PdfRenderer, DocxRenderer } from "@/renderer"
import { assertDocument, DocumentAssertionError } from "@/document"
import { DEFAULT_FONT_KEY } from "@/font-registry"
import type { FontVariantKey } from "@/font-registry"
import type { FontProvider } from "@/renderer"
import {
  FLOWDOC_EXPORT_PROFILE_HEADER,
  serializeFlowDocExportProfile,
  type FlowDocExportProfile,
} from "../../_lib/exportProfile"
import { loadRuntimeFontMapSync, loadRuntimeFontSync, runtimeFontFallbackHeaders } from "../runtimeFont"

// Measurer cache — preloads the runtime font catalog for keyed paragraph metrics.
let cachedMeasurer: ReturnType<typeof createFontkitMeasurer> | null = null
const PDF_EXPORT_PAGE_BATCH_SIZE = DEFAULT_PDF_RENDER_PAGE_BATCH_SIZE

function getMeasurer(fontBuffer: Uint8Array) {
  if (cachedMeasurer) return cachedMeasurer
  cachedMeasurer = createFontkitMeasurer(fontBuffer, loadRuntimeFontMapSync())
  return cachedMeasurer
}

// ─── Font Provider (for PDF/DOCX renderer) ────────────────────────────────────

const fontProvider: FontProvider = {
  async getFont(key: string, variant: FontVariantKey = "regular"): Promise<Uint8Array | null> {
    return loadRuntimeFontSync(key, variant)
  },
}

function countPaginatedPages(paginated: Awaited<ReturnType<typeof paginateDocument>>): number {
  return paginated.sections.reduce((sum, section) => sum + section.pages.length, 0)
}

function countPaginatedFragments(paginated: Awaited<ReturnType<typeof paginateDocument>>): number {
  return paginated.sections.reduce((sectionSum, section) => (
    sectionSum + section.pages.reduce((pageSum, page) => (
      pageSum + page.headerFragments.length + page.fragments.length + page.footerFragments.length
    ), 0)
  ), 0)
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const exportStartedAt = Date.now()
  let body: { doc?: unknown; format?: unknown; profilePagination?: unknown }
  try {
    body = await req.json() as { doc?: unknown; format?: unknown; profilePagination?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { doc, format } = body
  const profilePagination = body.profilePagination === true || body.profilePagination === 1 || body.profilePagination === "1"

  if (format !== "pdf" && format !== "docx") {
    return NextResponse.json({ error: "Invalid export format" }, { status: 400 })
  }

  try {
    assertDocument(doc)
  } catch (error) {
    if (error instanceof DocumentAssertionError) {
      return NextResponse.json({ error: "Invalid document", errors: error.errors }, { status: 400 })
    }
    throw error
  }

  const defaultFont = loadRuntimeFontSync(DEFAULT_FONT_KEY)
  if (defaultFont === null) {
    return NextResponse.json(
      {
        error: "Runtime font unavailable",
        code: "FONT_FALLBACK_BLOCKED",
      },
      { status: 503, headers: runtimeFontFallbackHeaders(true) },
    )
  }

  let paginated
  let paginateMs = 0
  let paginationProfile: PaginationProfile | undefined
  try {
    const paginateStartedAt = Date.now()
    if (profilePagination) {
      const result = paginateDocumentWithProfile(doc, getMeasurer(defaultFont), thaiWordBreaker, undefined, {
        paginationProfileSource: format === "pdf" ? "export-pdf" : "export-docx",
      })
      paginated = result.paginated
      paginationProfile = result.paginationProfile
    } else {
      paginated = paginateDocument(doc, getMeasurer(defaultFont), thaiWordBreaker)
    }
    paginateMs = Date.now() - paginateStartedAt
  } catch (err) {
    console.error("[FlowDoc] /api/export: pagination failed:", err)
    return NextResponse.json({ error: "Pagination failed", detail: String(err) }, { status: 500 })
  }

  let assertMs = 0
  try {
    const assertStartedAt = Date.now()
    assertPaginatedDocument(paginated)
    assertMs = Date.now() - assertStartedAt
  } catch (err) {
    console.error("[FlowDoc] /api/export: layout assertion failed:", err)
    return NextResponse.json({ error: "Layout assertion failed", detail: String(err) }, { status: 500 })
  }

  const layoutWarnings = collectPaginatedLayoutWarnings(paginated)
  const blockingLayoutWarnings = filterBlockingLayoutWarnings(layoutWarnings)
  if (blockingLayoutWarnings.length > 0) {
    return NextResponse.json(
      {
        error: "Layout warnings block final export",
        code: LAYOUT_WARNINGS_BLOCKED_CODE,
        warnings: blockingLayoutWarnings,
      },
      { status: 409 },
    )
  }

  const pageCount = countPaginatedPages(paginated)
  const fragmentCount = countPaginatedFragments(paginated)
  let pdfFinalizingStartedAt: number | null = null
  const renderer = format === "pdf"
    ? new PdfRenderer({
        fontProvider,
        pageBatchSize: PDF_EXPORT_PAGE_BATCH_SIZE,
        onProgress: (progress) => {
          if (progress.phase === "finalizing") pdfFinalizingStartedAt = Date.now()
        },
      })
    : new DocxRenderer({ sourceDocument: doc, fontProvider })
  const renderStartedAt = Date.now()
  const result = await renderer.render(paginated)
  const renderMs = Date.now() - renderStartedAt
  const pdfFinalizeMs = pdfFinalizingStartedAt === null
    ? undefined
    : Date.now() - pdfFinalizingStartedAt
  const pdfPageRenderMs = pdfFinalizeMs === undefined
    ? undefined
    : renderMs - pdfFinalizeMs
  const exportProfile: FlowDocExportProfile = {
    format,
    pageCount,
    fragmentCount,
    paginateMs,
    assertMs,
    renderMs,
    totalMs: Date.now() - exportStartedAt,
  }
  if (paginationProfile) exportProfile.paginationProfile = paginationProfile
  if (pdfPageRenderMs !== undefined) exportProfile.pdfPageRenderMs = pdfPageRenderMs
  if (pdfFinalizeMs !== undefined) exportProfile.pdfFinalizeMs = pdfFinalizeMs
  if (format === "pdf") exportProfile.pdfPageBatchSize = PDF_EXPORT_PAGE_BATCH_SIZE
  console.info("[FlowDoc] /api/export profile:", exportProfile)

  return new NextResponse(Buffer.from(result.buffer), {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="document.${result.extension}"`,
      [FLOWDOC_EXPORT_PROFILE_HEADER]: serializeFlowDocExportProfile(exportProfile),
    },
  })
}
