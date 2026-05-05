import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { paginateDocument } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { assertDocument, DocumentAssertionError } from "@/document"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "@/font-registry"
import type { TextMeasurer } from "@/layout"

// ─── Font + Measurer Cache ────────────────────────────────────────────────────

let measurer: TextMeasurer | null = null

function getMeasurer(): TextMeasurer {
  if (measurer) return measurer
  const fontPath = path.join(process.cwd(), "public", "fonts", resolveFontFileName(DEFAULT_FONT_KEY))
  try {
    const buf = new Uint8Array(fs.readFileSync(fontPath))
    measurer = createFontkitMeasurer(buf)
    return measurer
  } catch {
    measurer = createFontkitMeasurer(null)
    return measurer
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const doc = await req.json()
  try {
    assertDocument(doc)
  } catch (error) {
    if (error instanceof DocumentAssertionError) {
      return NextResponse.json({ error: "Invalid document", errors: error.errors }, { status: 400 })
    }
    throw error
  }

  const paginated = paginateDocument(doc, getMeasurer(), thaiWordBreaker)
  return NextResponse.json(paginated)
}
