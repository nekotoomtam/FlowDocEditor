import type { ParagraphNode, SpacerNode } from "../schema"
import type { MeasuredLine, MeasuredParagraph, MeasuredSpacer, TextMeasurer, WordBreaker } from "./types"
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

function wrapLines(
  text: string,
  availableWidth: number,
  measurer: TextMeasurer,
  fontFamilyKey: string,
  fontSize: number,
  wordBreaker: WordBreaker,
): MeasuredLine[] {
  if (text.length === 0) {
    return [{ text: "", width: 0, height: fontSize }]
  }

  const segments = wordBreaker.segment(text)
  const lines: MeasuredLine[] = []
  let currentLine = ""

  for (const segment of segments) {
    if (segment.length === 0) continue

    // Thai segments ต่อกันตรงๆ, Latin segments คั่นด้วย space
    const needsSpace = currentLine.length > 0 && !isThaiChar(currentLine.slice(-1)) && !isThaiChar(segment[0])
    const candidate = currentLine.length === 0 ? segment : needsSpace ? `${currentLine} ${segment}` : `${currentLine}${segment}`
    const { width } = measurer.measureText(candidate, fontFamilyKey, fontSize)

    if (width <= availableWidth || currentLine.length === 0) {
      currentLine = candidate
    } else {
      if (currentLine.length > 0) {
        lines.push({ text: currentLine, width: measurer.measureText(currentLine, fontFamilyKey, fontSize).width, height: fontSize })
      }
      currentLine = segment
    }
  }

  if (currentLine.length > 0) {
    lines.push({ text: currentLine, width: measurer.measureText(currentLine, fontFamilyKey, fontSize).width, height: fontSize })
  }

  return lines
}

function isThaiChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return code >= 0x0E00 && code <= 0x0E7F
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

  // รวม text จาก inline children ทั้งหมด
  const fullText = node.children
    .map((child) => {
      if (child.type === "text") return child.text
      // fieldRef ใช้ label หรือ key แสดงใน layout
      return child.label ?? `{${child.key}}`
    })
    .join("")

  const rawLines = wrapLines(fullText, availableWidth, measurer, fontFamilyKey, fontSize, wordBreaker)

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
