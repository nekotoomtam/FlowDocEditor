import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { paginateDocument } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import type { TextMeasurer } from "@/layout"

// ─── Font + Measurer Cache ────────────────────────────────────────────────────

const FONT_PATHS = [
  path.join(process.cwd(), "public", "fonts", "leelawad.ttf"),
  "C:\\Windows\\Fonts\\leelawad.ttf",
  "C:\\Windows\\Fonts\\tahoma.ttf",
]

let measurer: TextMeasurer | null = null

function getMeasurer(): TextMeasurer {
  if (measurer) return measurer
  for (const p of FONT_PATHS) {
    try {
      const buf = new Uint8Array(fs.readFileSync(p))
      measurer = createFontkitMeasurer(buf)
      return measurer
    } catch { /* try next */ }
  }
  measurer = createFontkitMeasurer(null)
  return measurer
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const doc = await req.json()
  const paginated = paginateDocument(doc, getMeasurer(), thaiWordBreaker)
  return NextResponse.json(paginated)
}
