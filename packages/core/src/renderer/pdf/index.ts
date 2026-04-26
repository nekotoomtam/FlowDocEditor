import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { PDFFont, PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import type { PaginatedDocument, PaginatedPage, PageFragment, ResolvedBorderSide } from "../../pagination"
import type { RenderResult, Renderer, FontProvider } from "../shared"

/**
 * PDF Renderer
 *
 * แปลง PaginatedDocument → .pdf buffer ด้วย pdf-lib
 *
 * Unit conversion:
 * - layout ทำงานใน abstract pt
 * - PDF ใช้ pt เป็น native unit → ไม่ต้องแปลง
 * - PDF coordinate system: origin bottom-left
 *   → flip Y: pdfY = pageHeight - layoutY - elementHeight
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flipY(layoutY: number, elementHeight: number, pageHeight: number): number {
  return pageHeight - layoutY - elementHeight
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  return rgb(r, g, b)
}

// ─── Border Drawing ───────────────────────────────────────────────────────────

function drawBorderSide(
  pdfPage: PDFPage,
  side: ResolvedBorderSide | undefined,
  x1: number, y1: number,
  x2: number, y2: number,
): void {
  if (!side || side.style === "none" || side.width <= 0) return
  pdfPage.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness: side.width,
    color: hexToRgb(side.color),
  })
}

function drawCellBorders(pdfPage: PDFPage, fragment: PageFragment, pageHeight: number): void {
  if (!fragment.cellRenderProps) return
  const { x, y, width, height } = fragment
  const { border } = fragment.cellRenderProps

  const pdfTop    = pageHeight - y
  const pdfBottom = pageHeight - y - height

  drawBorderSide(pdfPage, border.top,    x,         pdfTop,    x + width, pdfTop)
  drawBorderSide(pdfPage, border.bottom, x,         pdfBottom, x + width, pdfBottom)
  drawBorderSide(pdfPage, border.left,   x,         pdfBottom, x,         pdfTop)
  drawBorderSide(pdfPage, border.right,  x + width, pdfBottom, x + width, pdfTop)
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class PdfRenderer implements Renderer {
  constructor(private readonly fontProvider?: FontProvider) {}

  async render(doc: PaginatedDocument): Promise<RenderResult> {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)
    const fontCache = new Map<string, PDFFont>()

    for (const section of doc.sections) {
      for (const page of section.pages) {
        await this.renderPage(pdfDoc, fontCache, page)
      }
    }

    const buffer = await pdfDoc.save()
    return { buffer, mimeType: "application/pdf", extension: "pdf" }
  }

  private async renderPage(
    pdfDoc: PDFDocument,
    fontCache: Map<string, PDFFont>,
    page: PaginatedPage,
  ): Promise<void> {
    const pdfPage = pdfDoc.addPage([page.width, page.height])

    const allFragments = [
      ...(page.headerFragments ?? []),
      ...page.fragments,
      ...(page.footerFragments ?? []),
    ]

    for (const fragment of allFragments) {
      if (fragment.nodeType === "stack" && fragment.cellRenderProps) {
        drawCellBorders(pdfPage, fragment, page.height)
        continue
      }

      if (fragment.nodeType !== "paragraph") continue
      if (!fragment.lines?.length || !fragment.renderProps) continue

      const font = await this.resolveFont(pdfDoc, fontCache, fragment.renderProps.fontFamilyKey)
      const fontSize = fragment.renderProps.fontSize

      for (const line of fragment.lines) {
        if (line.text.trim() === "") continue
        pdfPage.drawText(line.text, {
          x: line.x,
          y: flipY(line.y, line.height, page.height),
          size: fontSize,
          font,
        })
      }
    }
  }

  private async resolveFont(
    pdfDoc: PDFDocument,
    cache: Map<string, PDFFont>,
    key: string,
  ): Promise<PDFFont> {
    if (cache.has(key)) return cache.get(key)!
    const buffer = (await this.fontProvider?.getFont(key)) ?? null
    const font = buffer != null
      ? await pdfDoc.embedFont(buffer)
      : await pdfDoc.embedFont(StandardFonts.Helvetica)
    cache.set(key, font)
    return font
  }
}
