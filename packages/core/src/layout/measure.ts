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

function getSegmentKind(text: string, start: number, end: number, fieldRanges: FieldRange[]): LineSegment["kind"] {
  if (fieldRanges.some((range) => start >= range.start && end <= range.end)) return "field"
  return /^\s+$/.test(text) ? "space" : "word"
}

function getGraphemes(text: string): string[] {
  const Segmenter = Intl.Segmenter
  if (Segmenter) {
    const segmenter = new Segmenter(["th", "en"], { granularity: "grapheme" })
    return Array.from(segmenter.segment(text)).map((part) => part.segment)
  }
  return Array.from(text)
}

function measureSegmentWidth(
  text: string,
  measurer: TextMeasurer,
  fontFamilyKey: string,
  fontSize: number,
): number {
  return measurer.measureText(text, fontFamilyKey, fontSize).width
}

function createSourceSegments(
  text: string,
  availableWidth: number,
  measurer: TextMeasurer,
  fontFamilyKey: string,
  fontSize: number,
  wordBreaker: WordBreaker,
  fieldRanges: FieldRange[] = [],
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
    const kind = getSegmentKind(segment, start, end, fieldRanges)

    if (kind === "word" && width > availableWidth) {
      let graphemeStart = start
      for (const grapheme of getGraphemes(segment)) {
        const graphemeEnd = graphemeStart + grapheme.length
        sourceSegments.push({
          text: grapheme,
          start: graphemeStart,
          end: graphemeEnd,
          width: measureSegmentWidth(grapheme, measurer, fontFamilyKey, fontSize),
          kind: "grapheme",
        })
        graphemeStart = graphemeEnd
      }
      continue
    }

    sourceSegments.push({ text: segment, start, end, width, kind })
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
): MeasuredLine[] {
  if (text.length === 0) {
    return [{ text: "", width: 0, height: fontSize }]
  }

  const segments = createSourceSegments(text, availableWidth, measurer, fontFamilyKey, fontSize, wordBreaker, fieldRanges)
  const lines: MeasuredLine[] = []
  let currentLine: SourceLineSegment[] = []
  let currentWidth = 0

  const pushCurrentLine = () => {
    const line = buildLine(currentLine, fontSize)
    if (line) lines.push(line)
    currentLine = []
    currentWidth = 0
  }

  for (const segment of segments) {
    if (segment.text.length === 0) continue
    if (currentLine.length === 0 && segment.kind === "space") continue

    const candidateWidth = currentWidth + segment.width

    if (candidateWidth <= availableWidth || currentLine.length === 0) {
      currentLine.push(segment)
      currentWidth = candidateWidth
    } else {
      pushCurrentLine()
      if (segment.kind !== "space") {
        currentLine.push(segment)
        currentWidth = segment.width
      }
    }
  }

  pushCurrentLine()

  return lines
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

  // รวม text จาก inline children ทั้งหมด พร้อมจำช่วง fieldRef ใน text ที่ใช้แสดงผล
  let fullText = ""
  const fieldRanges: FieldRange[] = []
  for (const child of node.children) {
    if (child.type === "text") {
      fullText += child.text
      continue
    }

    const start = fullText.length
    fullText += child.label ?? `{${child.key}}`
    fieldRanges.push({ start, end: fullText.length })
  }

  const rawLines = wrapLines(fullText, availableWidth, measurer, fontFamilyKey, fontSize, wordBreaker, fieldRanges)

  // map rawLines ให้ใช้ lineHeight จริง
  const lines: MeasuredLine[] = rawLines.map((line) => ({
    ...line,
    height: lineHeight,
  }))

  const contentHeight = lines.reduce((sum, line) => sum + line.height, 0)
  const totalHeight = spacingBefore + contentHeight + spacingAfter

  return {
    nodeId: node.id,
    lines,
    lineHeight,
    spacingBefore,
    spacingAfter,
    width: availableWidth,
    totalHeight,
  }
}

// ─── Spacer Measurement ───────────────────────────────────────────────────────

export function measureSpacer(node: SpacerNode, availableWidth: number): MeasuredSpacer {
  return {
    nodeId: node.id,
    height: node.props.height,
    width: availableWidth,
  }
}
