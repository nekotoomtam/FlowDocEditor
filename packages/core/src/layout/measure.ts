import type { DividerNode, ParagraphBoxBorderSide, ParagraphBoxStyle, ParagraphNode, SpacerNode, TextRun } from "../schema"
import type { FontVariantKey } from "../font-registry"
import { resolveFontVariantKeyForStyle } from "../font-registry"
import { resolveTextRunStyle } from "../document/richText"
import type {
  LineRun,
  LineSegment,
  MeasuredBoxEdges,
  MeasuredDivider,
  MeasuredLine,
  MeasuredParagraph,
  MeasuredParagraphBorderSide,
  MeasuredParagraphBox,
  MeasuredSpacer,
  TextMeasurer,
  TextRunLayoutStyle,
  WordBreaker,
} from "./types"
import { defaultWordBreaker } from "./types"

/**
 * measure layer — ตอบคำถามว่า "node นี้มีขนาดเท่าไหร่"
 *
 * กฎหลัก:
 * - ไม่รู้จัก page, cursor, หรือ position ใดๆ
 * - ไม่มี side effects
 * - pure function เสมอ
 */

// ─── Unit Conversion ──────────────────────────────────────────────────────────

// layout engine ทำงานใน abstract units
// ตอนนี้ใช้ pt เป็น base แต่ renderer แปลงเองตอน output
export function toAbstractUnit(value: number, unit: "pt" | "mm"): number {
  if (unit === "mm") return value * 2.8346 // 1mm = 2.8346pt
  return value
}

// ─── Paragraph Measurement ────────────────────────────────────────────────────

type SourceLineSegment = Omit<LineSegment, "x" | "breakableAfter"> & {
  sourceType: LineRun["sourceType"]
  style: TextRunLayoutStyle
}
type RichTextRange = {
  start: number
  end: number
  sourceId?: string
  sourceType: LineRun["sourceType"]
  style: TextRunLayoutStyle
}

const ZERO_EDGES: MeasuredBoxEdges = { top: 0, right: 0, bottom: 0, left: 0 }

function edgeSum(edges: MeasuredBoxEdges): number {
  return edges.top + edges.right + edges.bottom + edges.left
}

function borderWidth(side: MeasuredParagraphBorderSide | undefined): number {
  return side?.width ?? 0
}

function resolveParagraphBorderSide(side: ParagraphBoxBorderSide | undefined): MeasuredParagraphBorderSide | undefined {
  if (!side || side.style === "none") return undefined
  const width = toAbstractUnit(side.width.value, side.width.unit)
  if (width <= 0) return undefined
  return { style: side.style, width, color: side.color }
}

export function resolveParagraphBoxStyle(box: ParagraphBoxStyle | undefined, availableWidth: number): MeasuredParagraphBox | undefined {
  if (!box) return undefined

  const padding: MeasuredBoxEdges = box.padding
    ? {
        top: toAbstractUnit(box.padding.top.value, box.padding.top.unit),
        right: toAbstractUnit(box.padding.right.value, box.padding.right.unit),
        bottom: toAbstractUnit(box.padding.bottom.value, box.padding.bottom.unit),
        left: toAbstractUnit(box.padding.left.value, box.padding.left.unit),
      }
    : { ...ZERO_EDGES }
  const border = {
    top: resolveParagraphBorderSide(box.border?.top),
    right: resolveParagraphBorderSide(box.border?.right),
    bottom: resolveParagraphBorderSide(box.border?.bottom),
    left: resolveParagraphBorderSide(box.border?.left),
  }
  const hasBorder = Boolean(border.top || border.right || border.bottom || border.left)
  const hasPadding = edgeSum(padding) > 0
  const hasFill = Boolean(box.fill)
  if (!hasBorder && !hasPadding && !hasFill) return undefined

  const horizontalInset = padding.left + padding.right + borderWidth(border.left) + borderWidth(border.right)
  return {
    fill: box.fill,
    padding,
    border,
    contentWidth: Math.max(0, availableWidth - horizontalInset),
  }
}

function resolveParagraphBox(node: ParagraphNode, availableWidth: number): MeasuredParagraphBox | undefined {
  return resolveParagraphBoxStyle(node.props.box, availableWidth)
}

export function paragraphBoxHorizontalInset(box: MeasuredParagraphBox | undefined): number {
  if (!box) return 0
  return box.padding.left + box.padding.right + borderWidth(box.border.left) + borderWidth(box.border.right)
}

export function paragraphBoxLeftInset(box: MeasuredParagraphBox | undefined): number {
  if (!box) return 0
  return box.padding.left + borderWidth(box.border.left)
}

export function paragraphBoxTopInset(box: MeasuredParagraphBox | undefined): number {
  if (!box) return 0
  return box.padding.top + borderWidth(box.border.top)
}

export function paragraphBoxBottomInset(box: MeasuredParagraphBox | undefined): number {
  if (!box) return 0
  return box.padding.bottom + borderWidth(box.border.bottom)
}

function getSegmentKind(text: string, sourceType: LineRun["sourceType"]): LineSegment["kind"] {
  if (sourceType === "pageNumber") return "pageNumber"
  if (sourceType === "field") return "field"
  return /^\s+$/.test(text) ? "space" : "word"
}

function layoutStyleKey(style: TextRunLayoutStyle | undefined): string {
  if (!style) return ""
  return [
    style.fontSize,
    style.fontFamilyKey,
    style.textColor,
    style.fontWeight,
    style.fontStyle,
    style.textDecoration,
    style.strikethrough,
    style.fontVariant,
    style.lineHeight,
  ].join("|")
}

function areLineRunStylesEqual(a: TextRunLayoutStyle | undefined, b: TextRunLayoutStyle | undefined): boolean {
  return layoutStyleKey(a) === layoutStyleKey(b)
}

function toRunLayoutStyle(
  paragraph: ParagraphNode,
  run: TextRun,
  measurer: TextMeasurer,
): TextRunLayoutStyle {
  const effective = resolveTextRunStyle(paragraph, run)
  const fontSize = toAbstractUnit(effective.fontSize.value, effective.fontSize.unit)
  const fontVariant = resolveFontVariantKeyForStyle(effective.fontWeight, effective.fontStyle)
  return {
    fontSize,
    fontFamilyKey: effective.fontFamilyKey,
    textColor: effective.textColor,
    fontWeight: effective.fontWeight,
    fontStyle: effective.fontStyle,
    textDecoration: effective.textDecoration,
    strikethrough: effective.strikethrough,
    fontVariant,
    lineHeight: measurer.measureLineHeight(effective.fontFamilyKey, fontSize, paragraph.props.lineHeight),
  }
}

function paragraphDefaultRunStyle(paragraph: ParagraphNode, measurer: TextMeasurer): TextRunLayoutStyle {
  return toRunLayoutStyle(paragraph, { id: `${paragraph.id}-default-style`, type: "text", text: "" }, measurer)
}

const THAI_SARA_AM = "\u0E33"
const GRAPHEME_BOUNDARY_CACHE_LIMIT = 2048
const graphemeBoundaryCache = new Map<string, number[]>()

function tailorThaiSaraAmGrapheme(segment: string): string[] {
  const firstSaraAm = segment.indexOf(THAI_SARA_AM)
  if (firstSaraAm < 0) return [segment]
  const secondSaraAm = segment.indexOf(THAI_SARA_AM, firstSaraAm + THAI_SARA_AM.length)
  if (secondSaraAm < 0) return [segment]

  const tailored = [segment.slice(0, firstSaraAm + THAI_SARA_AM.length)]
  let cursor = secondSaraAm
  while (cursor < segment.length) {
    const nextSaraAm = segment.indexOf(THAI_SARA_AM, cursor + THAI_SARA_AM.length)
    const end = nextSaraAm < 0 ? segment.length : nextSaraAm
    tailored.push(segment.slice(cursor, end))
    if (nextSaraAm < 0) break
    cursor = nextSaraAm
  }

  return tailored.filter((part) => part.length > 0)
}

export function splitTextGraphemes(text: string): string[] {
  const Segmenter = Intl.Segmenter
  if (Segmenter) {
    const segmenter = new Segmenter(["th", "en"], { granularity: "grapheme" })
    return Array.from(segmenter.segment(text)).flatMap((part) => tailorThaiSaraAmGrapheme(part.segment))
  }
  return Array.from(text)
}

export function textGraphemeBoundaries(text: string): number[] {
  const cached = graphemeBoundaryCache.get(text)
  if (cached) return cached.slice()

  const boundaries = [0]
  let cursor = 0
  for (const grapheme of splitTextGraphemes(text)) {
    cursor += grapheme.length
    boundaries.push(cursor)
  }
  if (graphemeBoundaryCache.size < GRAPHEME_BOUNDARY_CACHE_LIMIT) {
    graphemeBoundaryCache.set(text, boundaries)
  }
  return boundaries.slice()
}

export function previousTextGraphemeBoundary(
  text: string,
  index: number,
  options: { includeExact?: boolean } = {},
): number {
  const safeIndex = Math.max(0, Math.min(index, text.length))
  if (safeIndex === 0) return 0

  let previous = 0
  for (const boundary of textGraphemeBoundaries(text).slice(1)) {
    if (boundary === safeIndex) return options.includeExact ? boundary : previous
    if (boundary > safeIndex) return previous
    previous = boundary
  }
  return previous
}

export function nextTextGraphemeBoundary(
  text: string,
  index: number,
  options: { includeExact?: boolean } = {},
): number {
  const safeIndex = Math.max(0, Math.min(index, text.length))
  if (safeIndex >= text.length) return text.length
  if (safeIndex === 0 && options.includeExact) return 0

  for (const boundary of textGraphemeBoundaries(text).slice(1)) {
    if (options.includeExact ? boundary >= safeIndex : boundary > safeIndex) return boundary
  }
  return text.length
}

// Snap a UTF-16 index to the nearest grapheme cluster boundary in `text`.
// Prevents caret landing inside a Thai combining sequence like "งุ่".
export function snapToGraphemeBoundary(text: string, index: number): number {
  if (index <= 0) return 0
  if (index >= text.length) return text.length

  let previous = 0
  for (const boundary of textGraphemeBoundaries(text).slice(1)) {
    if (index <= previous) return previous
    if (index < boundary) {
      return (index - previous) <= (boundary - index) ? previous : boundary
    }
    previous = boundary
  }
  return text.length
}

function measureSegmentWidth(
  text: string,
  measurer: TextMeasurer,
  fontFamilyKey: string,
  fontSize: number,
  fontVariant: FontVariantKey,
): number {
  return measurer.measureText(text, fontFamilyKey, fontSize, fontVariant).width
}

function hasRepeatedGraphemeRun(graphemes: string[], minimumRunLength: number): boolean {
  let previous: string | null = null
  let runLength = 0

  for (const grapheme of graphemes) {
    if (grapheme === previous) {
      runLength += 1
    } else {
      previous = grapheme
      runLength = 1
    }
    if (runLength >= minimumRunLength) return true
  }

  return false
}

function shouldSplitWordToFillLine(segment: SourceLineSegment, availableWidth: number, currentWidth: number): boolean {
  if (segment.kind !== "word") return false
  if (currentWidth <= 0 || currentWidth >= availableWidth) return false

  const graphemes = splitTextGraphemes(segment.text)
  if (graphemes.length < 8) return false

  const repeatedRun = hasRepeatedGraphemeRun(graphemes, 4)
  const nearFullLine = segment.width >= availableWidth * 0.75

  return repeatedRun || nearFullLine
}

function splitSourceSegmentToGraphemes(
  segment: SourceLineSegment,
  measurer: TextMeasurer,
): SourceLineSegment[] {
  const graphemeSegments: SourceLineSegment[] = []
  let graphemeStart = segment.start

  for (const grapheme of splitTextGraphemes(segment.text)) {
    const graphemeEnd = graphemeStart + grapheme.length
    graphemeSegments.push({
      text: grapheme,
      start: graphemeStart,
      end: graphemeEnd,
      width: measureSegmentWidth(grapheme, measurer, segment.style.fontFamilyKey, segment.style.fontSize, segment.style.fontVariant),
      kind: "grapheme",
      sourceId: segment.sourceId,
      sourceType: segment.sourceType,
      style: segment.style,
    })
    graphemeStart = graphemeEnd
  }

  return graphemeSegments
}

function createSourceSegments(
  text: string,
  availableWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  richTextRanges: RichTextRange[],
  fallbackStyle: TextRunLayoutStyle,
  offsetBase: number = 0,
): SourceLineSegment[] {
  const segments = wordBreaker.segment(text)
  const sourceSegments: SourceLineSegment[] = []
  let cursor = 0

  const rangeAt = (offset: number): RichTextRange | undefined =>
    richTextRanges.find((range) => offset >= range.start && offset < range.end)

  const nextRangeBoundary = (start: number, end: number): number => {
    const nextStart = richTextRanges
      .filter((range) => range.start > start && range.start < end)
      .map((range) => range.start)
      .sort((a, b) => a - b)[0]
    const current = rangeAt(start)
    const currentEnd = current && current.end > start && current.end < end ? current.end : undefined
    return Math.min(nextStart ?? end, currentEnd ?? end)
  }

  for (const segment of segments) {
    if (segment.length === 0) continue

    const start = cursor
    const end = cursor + segment.length
    cursor = end

    let sliceStart = start
    while (sliceStart < end) {
      const globalStart = sliceStart + offsetBase
      const globalEnd = end + offsetBase
      const range = rangeAt(globalStart)
      const sliceGlobalEnd = nextRangeBoundary(globalStart, globalEnd)
      const sliceEnd = sliceGlobalEnd - offsetBase
      const sliceText = segment.slice(sliceStart - start, sliceEnd - start)
      const style = range?.style ?? fallbackStyle
      const sourceType = range?.sourceType ?? "text"
      const width = measureSegmentWidth(sliceText, measurer, style.fontFamilyKey, style.fontSize, style.fontVariant)
      const kind = getSegmentKind(sliceText, sourceType)
      const sourceSegment: SourceLineSegment = {
        text: sliceText,
        start: globalStart,
        end: sliceGlobalEnd,
        width,
        kind,
        sourceId: range?.sourceId,
        sourceType,
        style,
      }

      if (kind === "word" && width > availableWidth) {
        sourceSegments.push(...splitSourceSegmentToGraphemes(sourceSegment, measurer))
      } else {
        sourceSegments.push(sourceSegment)
      }
      sliceStart = sliceEnd
    }
  }

  return sourceSegments
}

function buildLineRuns(segments: LineSegment[]): LineRun[] | undefined {
  const runs: LineRun[] = []
  for (const segment of segments) {
    if (!segment.style || !segment.sourceType) continue
    const previous = runs.at(-1)
    if (
      previous &&
      previous.sourceId === segment.sourceId &&
      previous.sourceType === segment.sourceType &&
      areLineRunStylesEqual(previous.style, segment.style)
    ) {
      runs[runs.length - 1] = {
        ...previous,
        text: previous.text + segment.text,
        end: segment.end,
        width: (segment.x + segment.width) - previous.x,
      }
      continue
    }
    runs.push({
      text: segment.text,
      start: segment.start,
      end: segment.end,
      x: segment.x,
      width: segment.width,
      sourceId: segment.sourceId,
      sourceType: segment.sourceType,
      style: segment.style,
    })
  }
  return runs.length > 0 ? runs : undefined
}

function buildLine(segments: SourceLineSegment[], fallbackStyle: TextRunLayoutStyle): MeasuredLine | null {
  const trimmedSegments = [...segments]
  while (trimmedSegments.at(-1)?.kind === "space") {
    trimmedSegments.pop()
  }
  if (trimmedSegments.length === 0) return null

  let x = 0
  const lineSegments: LineSegment[] = trimmedSegments.map((segment, index) => {
    const lineSegment: LineSegment = {
      ...segment,
      x,
      breakableAfter: index < trimmedSegments.length - 1 || segment.kind === "space" || segment.kind === "grapheme",
    }
    x += segment.width
    return lineSegment
  })

  return {
    text: lineSegments.map((segment) => segment.text).join(""),
    width: x,
    height: Math.max(...lineSegments.map((segment) => segment.style?.lineHeight ?? fallbackStyle.lineHeight)),
    segments: lineSegments,
    runs: buildLineRuns(lineSegments),
  }
}

function wrapLines(
  text: string,
  availableWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  richTextRanges: RichTextRange[],
  fallbackStyle: TextRunLayoutStyle,
  offsetBase: number = 0,
): MeasuredLine[] {
  if (text.length === 0) {
    return [{ text: "", width: 0, height: fallbackStyle.lineHeight }]
  }

  const segments = createSourceSegments(text, availableWidth, measurer, wordBreaker, richTextRanges, fallbackStyle, offsetBase)
  const lines: MeasuredLine[] = []
  let currentLine: SourceLineSegment[] = []
  let currentWidth = 0

  const pushCurrentLine = () => {
    const line = buildLine(currentLine, fallbackStyle)
    if (line) lines.push(line)
    currentLine = []
    currentWidth = 0
  }

  const appendSegment = (segment: SourceLineSegment) => {
    if (segment.text.length === 0) return
    if (currentLine.length === 0 && segment.kind === "space") return

    const candidateWidth = currentWidth + segment.width

    if (candidateWidth <= availableWidth || currentLine.length === 0) {
      currentLine.push(segment)
      currentWidth = candidateWidth
      return
    }

    if (shouldSplitWordToFillLine(segment, availableWidth, currentWidth)) {
      const splitSegments = splitSourceSegmentToGraphemes(segment, measurer)
      const firstSegmentWidth = splitSegments[0]?.width ?? Number.POSITIVE_INFINITY
      if (currentWidth + firstSegmentWidth <= availableWidth) {
        for (const splitSegment of splitSegments) appendSegment(splitSegment)
        return
      }
    }

    pushCurrentLine()
    if (segment.kind !== "space") {
      currentLine.push(segment)
      currentWidth = segment.width
    }
  }

  for (const segment of segments) appendSegment(segment)

  pushCurrentLine()

  return lines
}

// ─── Paragraph Text Builder ───────────────────────────────────────────────────

function buildParagraphTextModel(node: ParagraphNode, measurer: TextMeasurer): {
  fullText: string
  richTextRanges: RichTextRange[]
  fallbackStyle: TextRunLayoutStyle
} {
  let fullText = ""
  const richTextRanges: RichTextRange[] = []
  const fallbackStyle = paragraphDefaultRunStyle(node, measurer)

  const pushRange = (
    text: string,
    sourceId: string | undefined,
    sourceType: LineRun["sourceType"],
    style: TextRunLayoutStyle,
  ) => {
    if (text.length === 0) return
    const start = fullText.length
    fullText += text
    richTextRanges.push({ start, end: fullText.length, sourceId, sourceType, style })
  }

  for (const child of node.children) {
    if (child.type === "text") {
      pushRange(child.text, child.id, "text", toRunLayoutStyle(node, child, measurer))
      continue
    }
    if (child.type === "pageNumber") {
      pushRange("00", child.id, "pageNumber", fallbackStyle)
      continue
    }
    pushRange(child.label ?? `{${child.key}}`, child.id, "field", fallbackStyle)
  }
  return { fullText, richTextRanges, fallbackStyle }
}

function measureHardLines(
  fullText: string,
  availableWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  richTextRanges: RichTextRange[],
  fallbackStyle: TextRunLayoutStyle,
  fromOffset: number = 0,
): MeasuredLine[] {
  const hardLines = fullText.split("\n")
  const rawLines: MeasuredLine[] = []
  let globalOffset = 0
  for (const hardLine of hardLines) {
    const hardLineEnd = globalOffset + hardLine.length
    // Skip hard lines that end before fromOffset (optimised tail measurement)
    if (hardLineEnd < fromOffset) {
      globalOffset += hardLine.length + 1
      continue
    }
    const lineEnd = hardLineEnd
    const lineRanges = richTextRanges.filter((r) => r.end > globalOffset && r.start < lineEnd)
    const wrapped = wrapLines(hardLine, availableWidth, measurer, wordBreaker, lineRanges, fallbackStyle, globalOffset)
    rawLines.push(...wrapped)
    globalOffset += hardLine.length + 1
  }
  return rawLines
}

export function measureParagraph(
  node: ParagraphNode,
  availableWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
): MeasuredParagraph {
  const fontSize = toAbstractUnit(node.props.fontSize.value, node.props.fontSize.unit)
  const fontFamilyKey = node.props.fontFamilyKey ?? "default"
  const lineHeight = measurer.measureLineHeight(fontFamilyKey, fontSize, node.props.lineHeight)
  const spacingBefore = toAbstractUnit(node.props.spacingBefore.value, node.props.spacingBefore.unit)
  const spacingAfter = toAbstractUnit(node.props.spacingAfter.value, node.props.spacingAfter.unit)
  const box = resolveParagraphBox(node, availableWidth)
  const contentWidth = box?.contentWidth ?? availableWidth

  const { fullText, richTextRanges, fallbackStyle } = buildParagraphTextModel(node, measurer)
  const rawLines = measureHardLines(fullText, contentWidth, measurer, wordBreaker, richTextRanges, fallbackStyle)
  const lines: MeasuredLine[] = rawLines
  const contentHeight = lines.reduce((sum, line) => sum + line.height, 0)
  const totalHeight = spacingBefore + paragraphBoxTopInset(box) + contentHeight + paragraphBoxBottomInset(box) + spacingAfter

  return { nodeId: node.id, lines, lineHeight, spacingBefore, spacingAfter, width: availableWidth, contentWidth, box, totalHeight }
}

// Measures only the lines starting from the hard-line that contains `fromOffset`.
// Returns the tail lines with correct source offsets — caller combines with head lines.
export function measureParagraphFrom(
  node: ParagraphNode,
  fromOffset: number,
  availableWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
): { tailLines: MeasuredLine[]; lineHeight: number } {
  const fontSize = toAbstractUnit(node.props.fontSize.value, node.props.fontSize.unit)
  const fontFamilyKey = node.props.fontFamilyKey ?? "default"
  const lineHeight = measurer.measureLineHeight(fontFamilyKey, fontSize, node.props.lineHeight)
  const box = resolveParagraphBox(node, availableWidth)
  const contentWidth = box?.contentWidth ?? availableWidth
  const { fullText, richTextRanges, fallbackStyle } = buildParagraphTextModel(node, measurer)
  const tailLines = measureHardLines(fullText, contentWidth, measurer, wordBreaker, richTextRanges, fallbackStyle, fromOffset)
  return { tailLines, lineHeight }
}

// ─── Spacer Measurement ───────────────────────────────────────────────────────

export function measureSpacer(node: SpacerNode, availableWidth: number): MeasuredSpacer {
  return {
    nodeId: node.id,
    height: node.props.height,
    width: availableWidth,
  }
}

export function measureDivider(node: DividerNode, availableWidth: number): MeasuredDivider {
  const thickness = toAbstractUnit(node.props.thickness.value, node.props.thickness.unit)
  const marginBefore = toAbstractUnit(node.props.marginBefore.value, node.props.marginBefore.unit)
  const marginAfter = toAbstractUnit(node.props.marginAfter.value, node.props.marginAfter.unit)
  return {
    nodeId: node.id,
    width: availableWidth,
    height: marginBefore + thickness + marginAfter,
    color: node.props.color,
    thickness,
    marginBefore,
    marginAfter,
    style: node.props.style,
  }
}
