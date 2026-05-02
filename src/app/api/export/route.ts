import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { paginateDocument } from "@/pagination"
import { thaiWordBreaker } from "@/layout/word-breaker"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { PdfRenderer, DocxRenderer } from "@/renderer"
import type { FontProvider } from "@/renderer"

// ─── Font Loader ───────────────────────────────────────────────────────────────

const FONT_PATHS = [
  (key: string) => path.join(process.cwd(), "public", "fonts", `${key}.ttf`),
  () => "C:\\Windows\\Fonts\\leelawad.ttf",
  () => "C:\\Windows\\Fonts\\tahoma.ttf",
]

const fontCache = new Map<string, Uint8Array | null>()

function loadFontSync(key: string): Uint8Array | null {
  if (fontCache.has(key)) return fontCache.get(key)!
  for (const resolvePath of FONT_PATHS) {
    try {
      const buf = new Uint8Array(fs.readFileSync(resolvePath(key)))
      fontCache.set(key, buf)
      return buf
    } catch { /* try next */ }
  }
  fontCache.set(key, null)
  return null
}

// Measurer cache — keyed to "default" font
let cachedMeasurer: ReturnType<typeof createFontkitMeasurer> | null = null

function getMeasurer() {
  if (cachedMeasurer) return cachedMeasurer
  const buf = loadFontSync("leelawad") ?? loadFontSync("tahoma")
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
  const { doc, format } = await req.json() as { doc: unknown; format: "pdf" | "docx" }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paginated = paginateDocument(doc as any, getMeasurer(), thaiWordBreaker)
  const renderer = format === "pdf" ? new PdfRenderer(fontProvider) : new DocxRenderer()
  const result = await renderer.render(paginated)

  return new NextResponse(Buffer.from(result.buffer), {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="document.${result.extension}"`,
    },
  })
}
