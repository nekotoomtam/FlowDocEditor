import { LineCapStyle, PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { PDFFont, PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import type { PaginatedDocument, PaginatedLine, PaginatedPage, PageFragment, ResolvedBorderSide } from "../../pagination"
import { resolveFragmentBoxLayoutPrimitives, resolveParagraphBoxLayoutPrimitives } from "../../pagination"
import { resolveFontVariantCacheKey, resolveFontVariantKeyForStyle } from "../../font-registry"
import type { FontVariantKey } from "../../font-registry"
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

const PDF_TEXT_COLOR = rgb(0, 0, 0)

function flipY(layoutY: number, elementHeight: number, pageHeight: number): number {
  return pageHeight - layoutY - elementHeight
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  return rgb(r, g, b)
}

function resolvePdfUnderlineSpan(line: NonNullable<PageFragment["lines"]>[number]): { x: number; width: number } {
  if (!line.segments?.length) return { x: line.x, width: line.width }
  const start = Math.min(...line.segments.map((segment) => line.x + segment.x))
  const end = Math.max(...line.segments.map((segment) => line.x + segment.x + segment.width))
  return { x: start, width: Math.max(0, end - start) }
}

function drawTextDecorations(
  pdfPage: PDFPage,
  input: {
    x: number
    width: number
    y: number
    fontSize: number
    color: ReturnType<typeof rgb>
    underline?: boolean
    strikethrough?: boolean
  },
): void {
  if (!input.underline && !input.strikethrough) return
  const thickness = Math.max(0.4, input.fontSize * 0.045)
  if (input.strikethrough) {
    const strikeY = input.y + input.fontSize * 0.32
    pdfPage.drawLine({
      start: { x: input.x, y: strikeY },
      end: { x: input.x + input.width, y: strikeY },
      thickness,
      color: input.color,
    })
  }
  if (input.underline) {
    const underlineY = input.y - Math.max(0.6, input.fontSize * 0.08)
    pdfPage.drawLine({
      start: { x: input.x, y: underlineY },
      end: { x: input.x + input.width, y: underlineY },
      thickness,
      color: input.color,
    })
  }
}

// ─── Border Drawing ───────────────────────────────────────────────────────────

export interface PdfRectPrimitive {
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface PdfLinePrimitive {
  side: "top" | "right" | "bottom" | "left"
  border: ResolvedBorderSide
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ParagraphBoxDrawingPrimitives {
  fill?: PdfRectPrimitive
  borders: PdfLinePrimitive[]
}

export function resolvePdfBorderLineOptions(side: ResolvedBorderSide): { dashArray?: number[]; lineCap?: LineCapStyle } {
  if (side.style === "dashed") {
    return {
      dashArray: [Math.max(side.width * 3, 3), Math.max(side.width * 2, 2)],
      lineCap: LineCapStyle.Butt,
    }
  }
  if (side.style === "dotted") {
    return {
      dashArray: [0, Math.max(side.width * 2.2, 2)],
      lineCap: LineCapStyle.Round,
    }
  }
  return {}
}

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
    ...resolvePdfBorderLineOptions(side),
  })
}

export function resolveParagraphBoxDrawingPrimitives(
  fragment: PageFragment,
  pageHeight: number,
): ParagraphBoxDrawingPrimitives | null {
  const layout = resolveParagraphBoxLayoutPrimitives(fragment)
  return resolveBoxDrawingPrimitivesFromLayout(layout, pageHeight)
}

function resolveBoxDrawingPrimitivesFromLayout(
  layout: ReturnType<typeof resolveFragmentBoxLayoutPrimitives>,
  pageHeight: number,
): ParagraphBoxDrawingPrimitives | null {
  if (!layout) return null

  return {
    fill: layout.fill
      ? {
          x: layout.fill.x,
          y: pageHeight - layout.fill.y - layout.fill.height,
          width: layout.fill.width,
          height: layout.fill.height,
          color: layout.fill.color,
        }
      : undefined,
    borders: layout.borders.map((line) => ({
      ...line,
      y1: pageHeight - line.y1,
      y2: pageHeight - line.y2,
    })),
  }
}

export function resolveFragmentBoxDrawingPrimitives(
  fragment: PageFragment,
  pageHeight: number,
): ParagraphBoxDrawingPrimitives | null {
  const layout = resolveFragmentBoxLayoutPrimitives(fragment)
  return resolveBoxDrawingPrimitivesFromLayout(layout, pageHeight)
}

function drawFragmentBox(pdfPage: PDFPage, fragment: PageFragment, pageHeight: number): void {
  const primitives = resolveFragmentBoxDrawingPrimitives(fragment, pageHeight)
  if (!primitives) return
  if (primitives.fill) {
    pdfPage.drawRectangle({
      x: primitives.fill.x,
      y: primitives.fill.y,
      width: primitives.fill.width,
      height: primitives.fill.height,
      color: hexToRgb(primitives.fill.color),
    })
  }
  primitives.borders.forEach((line) => {
    drawBorderSide(pdfPage, line.border, line.x1, line.y1, line.x2, line.y2)
  })
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
      if (fragment.nodeType === "flow-stack") {
        drawFragmentBox(pdfPage, fragment, page.height)
        continue
      }

      if (fragment.nodeType === "flow-table-cell") {
        drawFragmentBox(pdfPage, fragment, page.height)
        continue
      }

      if (fragment.nodeType !== "paragraph" && fragment.nodeType !== "toc") continue
      if (!fragment.lines?.length || !fragment.renderProps) continue
      if (fragment.nodeType === "paragraph") drawFragmentBox(pdfPage, fragment, page.height)

      const fontVariant = resolveFontVariantKeyForStyle(fragment.renderProps.fontWeight, fragment.renderProps.fontStyle)
      const defaultFontSize = fragment.renderProps.fontSize
      const shouldUnderline = fragment.renderProps.textDecoration === "underline"
      const shouldStrike = fragment.renderProps.strikethrough === true
      const textColor = fragment.renderProps.textColor ? hexToRgb(fragment.renderProps.textColor) : PDF_TEXT_COLOR

      const isJustify = fragment.renderProps.align === "justify"
      for (const line of fragment.lines) {
        if (line.text.trim() === "") continue
        const lineY = flipY(line.y, line.height, page.height)
        const fontSize = line.fontSize ?? defaultFontSize
        if (line.runs?.length) {
          await this.drawRichTextRuns(pdfDoc, fontCache, pdfPage, line, lineY)
        } else {
          const font = await this.resolveFont(pdfDoc, fontCache, fragment.renderProps.fontFamilyKey, fontVariant)
          if (isJustify && line.segments?.length) {
            // Draw word segments individually at their adjusted x positions
            for (const seg of line.segments) {
              if (seg.kind === "space" || seg.text.trim() === "") continue
              pdfPage.drawText(seg.text, { x: line.x + seg.x, y: lineY, size: fontSize, font, color: textColor })
            }
          } else {
            pdfPage.drawText(line.text, { x: line.x, y: lineY, size: fontSize, font, color: textColor })
          }
          if (shouldUnderline || shouldStrike) {
            const span = resolvePdfUnderlineSpan(line)
            drawTextDecorations(pdfPage, {
              x: span.x,
              width: span.width,
              y: lineY,
              fontSize,
              color: textColor,
              underline: shouldUnderline,
              strikethrough: shouldStrike,
            })
          }
        }
      }
    }
  }

  private async drawRichTextRuns(
    pdfDoc: PDFDocument,
    fontCache: Map<string, PDFFont>,
    pdfPage: PDFPage,
    line: PaginatedLine,
    lineY: number,
  ): Promise<void> {
    for (const run of line.runs ?? []) {
      if (run.text.trim() === "") continue
      const color = hexToRgb(run.style.textColor)
      const font = await this.resolveFont(pdfDoc, fontCache, run.style.fontFamilyKey, run.style.fontVariant)
      const x = line.x + run.x
      pdfPage.drawText(run.text, {
        x,
        y: lineY,
        size: run.style.fontSize,
        font,
        color,
      })
      drawTextDecorations(pdfPage, {
        x,
        width: run.width,
        y: lineY,
        fontSize: run.style.fontSize,
        color,
        underline: run.style.textDecoration === "underline",
        strikethrough: run.style.strikethrough,
      })
    }
  }

  private async resolveFont(
    pdfDoc: PDFDocument,
    cache: Map<string, PDFFont>,
    key: string,
    variant: FontVariantKey = "regular",
  ): Promise<PDFFont> {
    const cacheKey = resolveFontVariantCacheKey(key, variant)
    if (cache.has(cacheKey)) return cache.get(cacheKey)!
    const buffer = (await this.fontProvider?.getFont(key, variant)) ?? null
    const font = buffer != null
      ? await pdfDoc.embedFont(buffer)
      : await pdfDoc.embedFont(StandardFonts.Helvetica)
    cache.set(cacheKey, font)
    return font
  }
}
