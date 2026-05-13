import { NextRequest, NextResponse } from "next/server"
import { assertPaginatedDocument, collectPaginatedLayoutWarnings, LAYOUT_WARNINGS_BLOCKED_CODE, paginateDocument } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { PdfRenderer, DocxRenderer } from "@/renderer"
import { assertDocument, DocumentAssertionError } from "@/document"
import { DEFAULT_FONT_KEY } from "@/font-registry"
import type { FontProvider } from "@/renderer"
import { loadRuntimeFontSync, runtimeFontFallbackHeaders } from "../runtimeFont"

// Measurer cache — keyed to "default" font
let cachedMeasurer: ReturnType<typeof createFontkitMeasurer> | null = null

function getMeasurer(fontBuffer: Uint8Array) {
  if (cachedMeasurer) return cachedMeasurer
  cachedMeasurer = createFontkitMeasurer(fontBuffer)
  return cachedMeasurer
}

// ─── Font Provider (for PDF/DOCX renderer) ────────────────────────────────────

const fontProvider: FontProvider = {
  async getFont(key: string): Promise<Uint8Array | null> {
    return loadRuntimeFontSync(key)
  },
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { doc?: unknown; format?: unknown }
  try {
    body = await req.json() as { doc?: unknown; format?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { doc, format } = body

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
  try {
    paginated = paginateDocument(doc, getMeasurer(defaultFont), thaiWordBreaker)
  } catch (err) {
    console.error("[FlowDoc] /api/export: pagination failed:", err)
    return NextResponse.json({ error: "Pagination failed", detail: String(err) }, { status: 500 })
  }

  try {
    assertPaginatedDocument(paginated)
  } catch (err) {
    console.error("[FlowDoc] /api/export: layout assertion failed:", err)
    return NextResponse.json({ error: "Layout assertion failed", detail: String(err) }, { status: 500 })
  }

  const layoutWarnings = collectPaginatedLayoutWarnings(paginated)
  if (layoutWarnings.length > 0) {
    return NextResponse.json(
      {
        error: "Layout warnings block final export",
        code: LAYOUT_WARNINGS_BLOCKED_CODE,
        warnings: layoutWarnings,
      },
      { status: 409 },
    )
  }

  const renderer = format === "pdf" ? new PdfRenderer(fontProvider) : new DocxRenderer()
  const result = await renderer.render(paginated)

  return new NextResponse(Buffer.from(result.buffer), {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="document.${result.extension}"`,
    },
  })
}
