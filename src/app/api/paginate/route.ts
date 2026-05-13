import { NextRequest, NextResponse } from "next/server"
import { paginateDocument } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { assertDocument, DocumentAssertionError } from "@/document"
import { assertPaginatedDocument } from "@/pagination"
import { DEFAULT_FONT_KEY } from "@/font-registry"
import type { TextMeasurer } from "@/layout"
import { loadRuntimeFontSync, runtimeFontFallbackHeaders } from "../runtimeFont"

// ─── Font + Measurer Cache ────────────────────────────────────────────────────

let measurer: TextMeasurer | null = null
let fontFallback = false

function getMeasurer(): TextMeasurer {
  if (measurer) return measurer
  const buf = loadRuntimeFontSync(DEFAULT_FONT_KEY)
  fontFallback = buf === null
  measurer = createFontkitMeasurer(buf)
  return measurer
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

  return NextResponse.json(paginated, { headers: runtimeFontFallbackHeaders(fontFallback) })
}
