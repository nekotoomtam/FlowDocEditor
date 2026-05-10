import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { paginateDocument } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { assertDocument, DocumentAssertionError } from "@/document"
import { assertPaginatedDocument } from "@/pagination"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "@/font-registry"
import type { TextMeasurer } from "@/layout"

// ─── Font + Measurer Cache ────────────────────────────────────────────────────

let measurer: TextMeasurer | null = null
let fontFallback = false

function getMeasurer(): TextMeasurer {
  if (measurer) return measurer
  const fontPath = path.join(process.cwd(), "public", "fonts", resolveFontFileName(DEFAULT_FONT_KEY))
  try {
    const buf = new Uint8Array(fs.readFileSync(fontPath))
    measurer = createFontkitMeasurer(buf)
    return measurer
  } catch (err) {
    console.error(
      `[FlowDoc] /api/paginate: font not found at "${fontPath}" — falling back to Helvetica. ` +
      `Thai text layout will be incorrect. Error: ${err}`,
    )
    fontFallback = true
    measurer = createFontkitMeasurer(null)
    return measurer
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let doc: unknown
  try {
    doc = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    assertDocument(doc)
  } catch (error) {
    if (error instanceof DocumentAssertionError) {
      return NextResponse.json({ error: "Invalid document", errors: error.errors }, { status: 400 })
    }
    throw error
  }

  let paginated
  try {
    paginated = paginateDocument(doc, getMeasurer(), thaiWordBreaker)
  } catch (err) {
    console.error("[FlowDoc] /api/paginate: pagination failed:", err)
    return NextResponse.json({ error: "Pagination failed", detail: String(err) }, { status: 500 })
  }

  try {
    assertPaginatedDocument(paginated)
  } catch (err) {
    console.error("[FlowDoc] /api/paginate: layout assertion failed:", err)
    return NextResponse.json({ error: "Layout assertion failed", detail: String(err) }, { status: 500 })
  }

  const headers: Record<string, string> = {}
  if (fontFallback) headers["X-FlowDoc-Font"] = "fallback"
  return NextResponse.json(paginated, { headers })
}
