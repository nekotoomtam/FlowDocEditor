import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { paginateDocument } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { PdfRenderer, DocxRenderer } from "@/renderer"
import { assertDocument, DocumentAssertionError } from "@/document"
import { assertPaginatedDocument } from "@/pagination"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "@/font-registry"
import type { FontProvider } from "@/renderer"

// ─── Font Loader ───────────────────────────────────────────────────────────────

const fontCache = new Map<string, Uint8Array | null>()

function loadFontSync(key: string): Uint8Array | null {
  if (fontCache.has(key)) return fontCache.get(key)!
  const fontPath = path.join(process.cwd(), "public", "fonts", resolveFontFileName(key))
  try {
    const buf = new Uint8Array(fs.readFileSync(fontPath))
    fontCache.set(key, buf)
    return buf
  } catch (err) {
    console.error(
      `[FlowDoc] /api/export: font "${key}" not found at "${fontPath}" — export will use Helvetica fallback. ` +
      `Thai text may render incorrectly. Error: ${err}`,
    )
    fontCache.set(key, null)
    return null
  }
}

// Measurer cache — keyed to "default" font
let cachedMeasurer: ReturnType<typeof createFontkitMeasurer> | null = null

function getMeasurer() {
  if (cachedMeasurer) return cachedMeasurer
  const buf = loadFontSync(DEFAULT_FONT_KEY)
  cachedMeasurer = createFontkitMeasurer(buf ?? null)
  return cachedMeasurer
}

// ─── Font Provider (for PDF/DOCX renderer) ────────────────────────────────────

const fontProvider: FontProvider = {
  async getFont(key: string): Promise<Uint8Array | null> {
    return loadFontSync(key)
  },
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { doc, format } = await req.json() as { doc: unknown; format: unknown }

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

  const usingFallback = loadFontSync(DEFAULT_FONT_KEY) === null
  const paginated = paginateDocument(doc, getMeasurer(), thaiWordBreaker)

  try {
    assertPaginatedDocument(paginated)
  } catch (err) {
    console.error("[FlowDoc] /api/export: layout assertion failed:", err)
    return NextResponse.json({ error: "Layout assertion failed", detail: String(err) }, { status: 500 })
  }

  const renderer = format === "pdf" ? new PdfRenderer(fontProvider) : new DocxRenderer()
  const result = await renderer.render(paginated)

  return new NextResponse(Buffer.from(result.buffer), {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="document.${result.extension}"`,
      ...(usingFallback ? { "X-FlowDoc-Font": "fallback" } : {}),
    },
  })
}
