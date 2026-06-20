import { NextRequest, NextResponse } from "next/server"
import { paginateDocument } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { assertDocument, DocumentAssertionError } from "@/document"
import { assertPaginatedDocument } from "@/pagination"
import { runtimeFontFallbackHeaders } from "../runtimeFont"
import { getRuntimePaginationMeasurer } from "./paginateRuntime"

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
  let fontFallback = false
  try {
    const runtime = getRuntimePaginationMeasurer()
    fontFallback = runtime.fontFallback
    paginated = paginateDocument(doc, runtime.measurer, thaiWordBreaker)
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
