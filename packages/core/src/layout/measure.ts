import type { ParagraphNode, SpacerNode } from "../schema"
import type { LineSegment, MeasuredLine, MeasuredParagraph, MeasuredSpacer, TextMeasurer, WordBreaker } from "./types"
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

type SourceLineSegment = Omit<LineSegment, "x" | "breakableAfter">
type FieldRange = { start: number; end: number }

function getSegmentKind(
  text: string,
  start: number,
  end: number,
  fieldRanges: FieldRange[],
  pageNumberRanges: FieldRange[] = [],
): LineSegment["kind"] {
  if (pageNumberRanges.some((range) => start >= range.start && end <= range.end)) return "pageNumber"
  if (fieldRanges.some((range) => start >= range.start && end <= range.end)) return "field"
  return /^\s+$/.test(text) ? "space" : "word"
}

const THAI_SARA_AM = "\u0E33"

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
  const boundaries = [0]
  let cursor = 0
  for (const grapheme of splitTextGraphemes(text)) {
    cursor += grapheme.length
    boundaries.push(cursor)
  }
  return boundaries
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
): number {
  return measurer.measureText(text, fontFamilyKey, fontSize).width
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

  const containsThai = /[\u0E00-\u0E7F]/.test(segment.text)
  const repeatedRun = hasRepeatedGraphemeRun(graphemes, 4)
  const nearFullLine = segment.width >= availableWidth * 0.75

  return containsThai || repeatedRun || nearFullLine
}

function splitSourceSegmentToGraphemes(
  segment: SourceLineSegment,
  measurer: TextMeasurer,
  fontFamilyKey: string,
  fontSize: number,
): SourceLineSegment[] {
  const graphemeSegments: SourceLineSegment[] = []
  let graphemeStart = segment.start

  for (const grapheme of splitTextGraphemes(segment.text)) {
    const graphemeEnd = graphemeStart + grapheme.length
    graphemeSegments.push({
      text: grapheme,
      start: graphemeStart,
      end: graphemeEnd,
      width: measureSegmentWidth(grapheme, measurer, fontFamilyKey, fontSize),
      kind: "grapheme",
    })
    graphemeStart = graphemeEnd
  }

  return graphemeSegments
}

function createSourceSegments(
  text: string,
  availableWidth: number,
  measurer: TextMeasurer,
  fontFamilyKey: string,
  fontSize: number,
  wordBreaker: WordBreaker,
  fieldRanges: FieldRange[] = [],
  offsetBase: number = 0,
  pageNumberRanges: FieldRange[] = [],
): SourceLineSegment[] {
  const segments = wordBreaker.segment(text)
  const sourceSegments: SourceLineSegment[] = []
  let cursor = 0

  for (const segment of segments) {
    if (segment.length === 0) continue

    const start = cursor
    const end = cursor + segment.length
    cursor = end
    const width = measureSegmentWidth(segment, measurer, fontFamilyKey, fontSize)
    const kind = getSegmentKind(segment, start, end, fieldRanges, pageNumberRanges)

    if (kind === "word" && width > availableWidth) {
      sourceSegments.push(...splitSourceSegmentToGraphemes(
        { text: segment, start: start + offsetBase, end: end + offsetBase, width, kind },
        measurer,
        fontFamilyKey,
        fontSize,
      ))
      continue
    }

    sourceSegments.push({ text: segment, start: start + offsetBase, end: end + offsetBase, width, kind })
  }

  return sourceSegments
}

function buildLine(segments: SourceLineSegment[], fontSize: number): MeasuredLine | null {
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
    height: fontSize,
    segments: lineSegments,
  }
}

function wrapLines(
  text: string,
  availableWidth: number,
  measurer: TextMeasurer,
  fontFamilyKey: string,
  fontSize: number,
  wordBreaker: WordBreaker,
  fieldRanges: FieldRange[] = [],
  offsetBase: number = 0,
  pageNumberRanges: FieldRange[] = [],
): MeasuredLine[] {
  if (text.length === 0) {
    return [{ text: "", width: 0, height: fontSize }]
  }

  const segments = createSourceSegments(text, availableWidth, measurer, fontFamilyKey, fontSize, wordBreaker, fieldRanges, offsetBase, pageNumberRanges)
  const lines: MeasuredLine[] = []
  let currentLine: SourceLineSegment[] = []
  let currentWidth = 0

  const pushCurrentLine = () => {
    const line = buildLine(currentLine, fontSize)
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
      const splitSegments = splitSourceSegmentToGraphemes(segment, measurer, fontFamilyKey, fontSize)
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

function buildParagraphFullText(node: ParagraphNode): {
  fullText: string
  fieldRanges: FieldRange[]
  pageNumberRanges: FieldRange[]
} {
  let fullText = ""
  const fieldRanges: FieldRange[] = []
  const pageNumberRanges: FieldRange[] = []
  for (const child of node.children) {
    if (child.type === "text") { fullText += child.text; continue }
    if (child.type === "pageNumber") {
      const start = fullText.length
      fullText += "00"
      pageNumberRanges.push({ start, end: fullText.length })
      continue
    }
    const start = fullText.length
    fullText += child.label ?? `{${child.key}}`
    fieldRanges.push({ start, end: fullText.length })
  }
  return { fullText, fieldRanges, pageNumberRanges }
}

function measureHardLines(
  fullText: string,
  availableWidth: number,
  measurer: TextMeasurer,
  fontFamilyKey: string,
  fontSize: number,
  wordBreaker: WordBreaker,
  fieldRanges: FieldRange[],
  pageNumberRanges: FieldRange[],
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
    const lineFieldRanges = fieldRanges
      .filter((r) => r.end > globalOffset && r.start < lineEnd)
      .map((r) => ({ start: r.start - globalOffset, end: r.end - globalOffset }))
    const linePageNumberRanges = pageNumberRanges
      .filter((r) => r.end > globalOffset && r.start < lineEnd)
      .map((r) => ({ start: r.start - globalOffset, end: r.end - globalOffset }))
    const wrapped = wrapLines(hardLine, availableWidth, measurer, fontFamilyKey, fontSize, wordBreaker, lineFieldRanges, globalOffset, linePageNumberRanges)
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

  const { fullText, fieldRanges, pageNumberRanges } = buildParagraphFullText(node)
  const rawLines = measureHardLines(fullText, availableWidth, measurer, fontFamilyKey, fontSize, wordBreaker, fieldRanges, pageNumberRanges)
  const lines: MeasuredLine[] = rawLines.map((line) => ({ ...line, height: lineHeight }))
  const contentHeight = lines.reduce((sum, line) => sum + line.height, 0)
  const totalHeight = spacingBefore + contentHeight + spacingAfter

  return { nodeId: node.id, lines, lineHeight, spacingBefore, spacingAfter, width: availableWidth, totalHeight }
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
  const { fullText, fieldRanges, pageNumberRanges } = buildParagraphFullText(node)
  const rawLines = measureHardLines(fullText, availableWidth, measurer, fontFamilyKey, fontSize, wordBreaker, fieldRanges, pageNumberRanges, fromOffset)
  const tailLines = rawLines.map((line) => ({ ...line, height: lineHeight }))
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
