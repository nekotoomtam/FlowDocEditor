import { LineCapStyle, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb } from "pdf-lib"
import type { PDFFont, PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import type { PaginatedDocument, PaginatedLine, PaginatedPage, PageFragment, PageZoneBox, ResolvedBorderSide } from "../../pagination"
import { resolveFragmentBoxLayoutPrimitives, resolvePaginatedLinePdfBaselineY, resolveParagraphBoxLayoutPrimitives } from "../../pagination"
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
// Marks that can shape to zero-advance glyphs; pdf-lib can omit those widths.
const PDF_ZERO_ADVANCE_WIDTH_TEXT_PATTERN = /[\u0300-\u036F\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/

type FontkitGlyph = {
  advanceWidth: number
}

type FontkitFontForPdfWidths = {
  numGlyphs: number
  getGlyph(id: number): FontkitGlyph | null | undefined
}

type PdfFontCacheEntry = {
  font: PDFFont
  zeroAdvanceGlyphIds: number[]
}

function flipY(layoutY: number, elementHeight: number, pageHeight: number): number {
  return pageHeight - layoutY - elementHeight
}

function isDrawablePdfClipBox(clipBox: PageZoneBox | undefined): clipBox is PageZoneBox {
  return !!clipBox && clipBox.width > 0 && clipBox.height > 0
}

function pushPdfClipBox(pdfPage: PDFPage, clipBox: PageZoneBox, pageHeight: number): void {
  pdfPage.pushOperators(
    pushGraphicsState(),
    rectangle(clipBox.x, flipY(clipBox.y, clipBox.height, pageHeight), clipBox.width, clipBox.height),
    clip(),
    endPath(),
  )
}

function popPdfClipBox(pdfPage: PDFPage): void {
  pdfPage.pushOperators(popGraphicsState())
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

function createFontkitFontForPdfWidths(fontBuffer: Uint8Array): FontkitFontForPdfWidths | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BufferCtor = (globalThis as any).Buffer
    const bufferLike = BufferCtor ? BufferCtor.from(fontBuffer) : fontBuffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (fontkit as any).create(bufferLike) as FontkitFontForPdfWidths
  } catch {
    return null
  }
}

function collectZeroAdvanceGlyphIds(fontBuffer: Uint8Array): number[] {
  const font = createFontkitFontForPdfWidths(fontBuffer)
  if (!font) return []

  const ids: number[] = []
  for (let id = 0; id < font.numGlyphs; id += 1) {
    const glyph = font.getGlyph(id)
    if (glyph?.advanceWidth === 0) ids.push(id)
  }
  return ids
}

function shouldPatchPdfZeroAdvanceGlyphWidthsForText(text: string): boolean {
  return PDF_ZERO_ADVANCE_WIDTH_TEXT_PATTERN.test(text)
}

function registerZeroAdvanceGlyphIds(
  zeroAdvanceGlyphIdsByFontName: Map<string, Set<number>>,
  fontName: string,
  zeroAdvanceGlyphIds: number[],
): void {
  if (zeroAdvanceGlyphIds.length === 0) return
  const existing = zeroAdvanceGlyphIdsByFontName.get(fontName) ?? new Set<number>()
  zeroAdvanceGlyphIds.forEach((glyphId) => existing.add(glyphId))
  zeroAdvanceGlyphIdsByFontName.set(fontName, existing)
}

function pdfNumberValue(value: unknown): number | null {
  return value instanceof PDFNumber ? value.asNumber() : null
}

function collectExplicitPdfWidths(widths: PDFArray): Map<number, number> {
  const byCid = new Map<number, number>()

  for (let index = 0; index < widths.size();) {
    const start = pdfNumberValue(widths.lookup(index))
    const second = widths.lookup(index + 1)
    if (start === null || !second) break

    if (second instanceof PDFArray) {
      for (let offset = 0; offset < second.size(); offset += 1) {
        const width = pdfNumberValue(second.lookup(offset))
        if (width !== null) byCid.set(start + offset, width)
      }
      index += 2
      continue
    }

    const end = pdfNumberValue(second)
    const width = pdfNumberValue(widths.lookup(index + 2))
    if (end === null || width === null) break
    for (let cid = start; cid <= end; cid += 1) byCid.set(cid, width)
    index += 3
  }

  return byCid
}

function zeroAdvanceGlyphIdsForBaseFont(
  baseFontName: string,
  zeroAdvanceGlyphIdsByFontName: Map<string, Set<number>>,
): Set<number> | null {
  for (const [fontName, ids] of zeroAdvanceGlyphIdsByFontName) {
    if (baseFontName === fontName || baseFontName.startsWith(`${fontName}-`)) return ids
  }
  return null
}

async function patchPdfZeroAdvanceGlyphWidths(
  buffer: Uint8Array,
  zeroAdvanceGlyphIdsByFontName: Map<string, Set<number>>,
): Promise<Uint8Array> {
  if (zeroAdvanceGlyphIdsByFontName.size === 0) return buffer

  const pdfDoc = await PDFDocument.load(buffer)
  let changed = false

  for (const page of pdfDoc.getPages()) {
    const resources = page.node.Resources()
    if (!resources) continue
    const fonts = resources.lookup(PDFName.of("Font"))
    if (!(fonts instanceof PDFDict)) continue

    for (const key of fonts.keys()) {
      const font = fonts.lookup(key)
      if (!(font instanceof PDFDict)) continue

      const baseFont = font.lookup(PDFName.of("BaseFont"))
      const baseFontName = baseFont instanceof PDFName ? baseFont.decodeText() : ""
      const zeroAdvanceGlyphIds = zeroAdvanceGlyphIdsForBaseFont(baseFontName, zeroAdvanceGlyphIdsByFontName)
      if (!zeroAdvanceGlyphIds || zeroAdvanceGlyphIds.size === 0) continue

      const descendants = font.lookup(PDFName.of("DescendantFonts"))
      if (!(descendants instanceof PDFArray) || descendants.size() === 0) continue
      const descendant = descendants.lookup(0)
      if (!(descendant instanceof PDFDict)) continue

      const widths = descendant.lookup(PDFName.of("W"))
      if (!(widths instanceof PDFArray)) continue

      const explicitWidths = collectExplicitPdfWidths(widths)
      for (const glyphId of zeroAdvanceGlyphIds) {
        if (explicitWidths.has(glyphId)) continue
        const zeroWidth = PDFArray.withContext(pdfDoc.context)
        zeroWidth.push(PDFNumber.of(0))
        widths.push(PDFNumber.of(glyphId))
        widths.push(zeroWidth)
        explicitWidths.set(glyphId, 0)
        changed = true
      }
    }
  }

  return changed ? pdfDoc.save() : buffer
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

function drawDivider(pdfPage: PDFPage, fragment: PageFragment, pageHeight: number): void {
  const props = fragment.dividerRenderProps
  if (!props || props.thickness <= 0) return
  const y = pageHeight - (fragment.y + props.marginBefore + props.thickness / 2)
  pdfPage.drawLine({
    start: { x: fragment.x, y },
    end: { x: fragment.x + fragment.width, y },
    thickness: props.thickness,
    color: hexToRgb(props.color),
    ...resolvePdfBorderLineOptions({
      style: props.style,
      width: props.thickness,
      color: props.color,
    }),
  })
}

export interface PdfListMarkerDrawingPrimitive {
  text: string
  x: number
  y: number
  fontFamilyKey: string
  fontVariant: FontVariantKey
  fontSize: number
  color: string
}

export function resolvePdfListMarkerDrawingPrimitive(
  fragment: PageFragment,
  pageHeight: number,
): PdfListMarkerDrawingPrimitive | null {
  if (fragment.nodeType !== "paragraph" || !fragment.listMarker || !fragment.renderProps) return null
  const firstLine = fragment.lines?.[0]
  if (!firstLine || fragment.listMarker.text.trim() === "") return null

  return {
    text: fragment.listMarker.text,
    x: fragment.listMarker.markerX,
    y: resolvePaginatedLinePdfBaselineY(firstLine, pageHeight),
    fontFamilyKey: fragment.renderProps.fontFamilyKey,
    fontVariant: resolveFontVariantKeyForStyle(fragment.renderProps.fontWeight, fragment.renderProps.fontStyle),
    fontSize: firstLine.fontSize ?? fragment.renderProps.fontSize,
    color: fragment.renderProps.textColor ?? "000000",
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class PdfRenderer implements Renderer {
  constructor(private readonly fontProvider?: FontProvider) {}

  async render(doc: PaginatedDocument): Promise<RenderResult> {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)
    const fontCache = new Map<string, PdfFontCacheEntry>()
    const zeroAdvanceGlyphIdsByFontName = new Map<string, Set<number>>()

    for (const section of doc.sections) {
      for (const page of section.pages) {
        await this.renderPage(pdfDoc, fontCache, zeroAdvanceGlyphIdsByFontName, page)
      }
    }

    const buffer = await pdfDoc.save()
    const patchedBuffer = await patchPdfZeroAdvanceGlyphWidths(buffer, zeroAdvanceGlyphIdsByFontName)
    return { buffer: patchedBuffer, mimeType: "application/pdf", extension: "pdf" }
  }

  private async renderPage(
    pdfDoc: PDFDocument,
    fontCache: Map<string, PdfFontCacheEntry>,
    zeroAdvanceGlyphIdsByFontName: Map<string, Set<number>>,
    page: PaginatedPage,
  ): Promise<void> {
    const pdfPage = pdfDoc.addPage([page.width, page.height])

    await this.renderFragments(pdfDoc, fontCache, zeroAdvanceGlyphIdsByFontName, pdfPage, page, page.headerFragments ?? [], page.headerZoneBox)
    await this.renderFragments(pdfDoc, fontCache, zeroAdvanceGlyphIdsByFontName, pdfPage, page, page.fragments)
    await this.renderFragments(pdfDoc, fontCache, zeroAdvanceGlyphIdsByFontName, pdfPage, page, page.footerFragments ?? [], page.footerZoneBox)
  }

  private async renderFragments(
    pdfDoc: PDFDocument,
    fontCache: Map<string, PdfFontCacheEntry>,
    zeroAdvanceGlyphIdsByFontName: Map<string, Set<number>>,
    pdfPage: PDFPage,
    page: PaginatedPage,
    fragments: PageFragment[],
    clipBox?: PageZoneBox,
  ): Promise<void> {
    if (fragments.length > 0 && clipBox && (clipBox.width <= 0 || clipBox.height <= 0)) return
    const shouldClip = fragments.length > 0 && isDrawablePdfClipBox(clipBox)
    if (shouldClip) pushPdfClipBox(pdfPage, clipBox, page.height)

    try {
      for (const fragment of fragments) {
        if (fragment.nodeType === "flow-stack") {
          drawFragmentBox(pdfPage, fragment, page.height)
          continue
        }

        if (fragment.nodeType === "flow-table-cell") {
          drawFragmentBox(pdfPage, fragment, page.height)
          continue
        }

        if (fragment.nodeType === "divider") {
          drawDivider(pdfPage, fragment, page.height)
          continue
        }

        if (fragment.nodeType !== "paragraph" && fragment.nodeType !== "toc") continue
        if (!fragment.lines?.length || !fragment.renderProps) continue
        if (fragment.nodeType === "paragraph") {
          drawFragmentBox(pdfPage, fragment, page.height)
          await this.drawListMarker(pdfDoc, fontCache, zeroAdvanceGlyphIdsByFontName, pdfPage, fragment, page.height)
        }

        const fontVariant = resolveFontVariantKeyForStyle(fragment.renderProps.fontWeight, fragment.renderProps.fontStyle)
        const defaultFontSize = fragment.renderProps.fontSize
        const shouldUnderline = fragment.renderProps.textDecoration === "underline"
        const shouldStrike = fragment.renderProps.strikethrough === true
        const textColor = fragment.renderProps.textColor ? hexToRgb(fragment.renderProps.textColor) : PDF_TEXT_COLOR

        const isJustify = fragment.renderProps.align === "justify"
        for (const line of fragment.lines) {
          if (line.text.trim() === "") continue
          const lineY = resolvePaginatedLinePdfBaselineY(line, page.height)
          const fontSize = line.fontSize ?? defaultFontSize
          if (line.runs?.length) {
            await this.drawRichTextRuns(pdfDoc, fontCache, zeroAdvanceGlyphIdsByFontName, pdfPage, line, lineY)
          } else {
            const font = await this.resolveFont(
              pdfDoc,
              fontCache,
              zeroAdvanceGlyphIdsByFontName,
              fragment.renderProps.fontFamilyKey,
              fontVariant,
              shouldPatchPdfZeroAdvanceGlyphWidthsForText(line.text),
            )
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
    } finally {
      if (shouldClip) popPdfClipBox(pdfPage)
    }
  }

  private async drawListMarker(
    pdfDoc: PDFDocument,
    fontCache: Map<string, PdfFontCacheEntry>,
    zeroAdvanceGlyphIdsByFontName: Map<string, Set<number>>,
    pdfPage: PDFPage,
    fragment: PageFragment,
    pageHeight: number,
  ): Promise<void> {
    const marker = resolvePdfListMarkerDrawingPrimitive(fragment, pageHeight)
    if (!marker) return

    const font = await this.resolveFont(
      pdfDoc,
      fontCache,
      zeroAdvanceGlyphIdsByFontName,
      marker.fontFamilyKey,
      marker.fontVariant,
      shouldPatchPdfZeroAdvanceGlyphWidthsForText(marker.text),
    )
    pdfPage.drawText(marker.text, {
      x: marker.x,
      y: marker.y,
      size: marker.fontSize,
      font,
      color: hexToRgb(marker.color),
    })
  }

  private async drawRichTextRuns(
    pdfDoc: PDFDocument,
    fontCache: Map<string, PdfFontCacheEntry>,
    zeroAdvanceGlyphIdsByFontName: Map<string, Set<number>>,
    pdfPage: PDFPage,
    line: PaginatedLine,
    lineY: number,
  ): Promise<void> {
    for (const run of line.runs ?? []) {
      if (run.text.trim() === "") continue
      const color = hexToRgb(run.style.textColor)
      const font = await this.resolveFont(
        pdfDoc,
        fontCache,
        zeroAdvanceGlyphIdsByFontName,
        run.style.fontFamilyKey,
        run.style.fontVariant,
        shouldPatchPdfZeroAdvanceGlyphWidthsForText(run.text),
      )
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
    cache: Map<string, PdfFontCacheEntry>,
    zeroAdvanceGlyphIdsByFontName: Map<string, Set<number>>,
    key: string,
    variant: FontVariantKey = "regular",
    trackZeroAdvanceGlyphs = false,
  ): Promise<PDFFont> {
    const cacheKey = resolveFontVariantCacheKey(key, variant)
    const cached = cache.get(cacheKey)
    if (cached) {
      if (trackZeroAdvanceGlyphs) {
        registerZeroAdvanceGlyphIds(zeroAdvanceGlyphIdsByFontName, cached.font.name, cached.zeroAdvanceGlyphIds)
      }
      return cached.font
    }
    const buffer = (await this.fontProvider?.getFont(key, variant)) ?? null
    const font = buffer != null
      ? await pdfDoc.embedFont(buffer)
      : await pdfDoc.embedFont(StandardFonts.Helvetica)
    const zeroAdvanceGlyphIds = buffer != null ? collectZeroAdvanceGlyphIds(buffer) : []
    if (trackZeroAdvanceGlyphs) {
      registerZeroAdvanceGlyphIds(zeroAdvanceGlyphIdsByFontName, font.name, zeroAdvanceGlyphIds)
    }
    cache.set(cacheKey, { font, zeroAdvanceGlyphIds })
    return font
  }
}
