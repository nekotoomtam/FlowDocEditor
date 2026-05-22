import type { LineRun, LineSegment, MeasuredLine, MeasuredParagraph, MeasuredParagraphBox, TextRunLayoutStyle } from "../../layout"
import { DEFAULT_FONT_KEY } from "../../font-registry"
import {
  paragraphBoxBottomInset,
  paragraphBoxLeftInset,
  paragraphBoxTopInset,
  toAbstractUnit,
} from "../../layout"
import type { ParagraphNode } from "../../schema"
import type { PaginatedLine, ParagraphBoxRenderProps, ParagraphRenderProps } from "../types"

export function buildParagraphBoxRenderProps(box: MeasuredParagraphBox | undefined): ParagraphBoxRenderProps | undefined {
  if (!box) return undefined
  return {
    fill: box.fill,
    padding: { ...box.padding },
    border: {
      top: box.border.top,
      right: box.border.right,
      bottom: box.border.bottom,
      left: box.border.left,
    },
  }
}

export function buildRenderProps(node: ParagraphNode, lineHeight: number, box?: MeasuredParagraphBox): ParagraphRenderProps {
  return {
    fontSize: toAbstractUnit(node.props.fontSize.value, node.props.fontSize.unit),
    fontFamilyKey: node.props.fontFamilyKey ?? DEFAULT_FONT_KEY,
    textColor: node.props.textColor ?? "000000",
    fontWeight: node.props.fontWeight ?? "normal",
    fontStyle: node.props.fontStyle ?? "normal",
    textDecoration: node.props.textDecoration ?? "none",
    strikethrough: node.props.strikethrough ?? false,
    align: node.props.align,
    lineHeight,
    spacingBefore: toAbstractUnit(node.props.spacingBefore.value, node.props.spacingBefore.unit),
    spacingAfter: toAbstractUnit(node.props.spacingAfter.value, node.props.spacingAfter.unit),
    textIndent: toAbstractUnit(node.props.textIndent.value, node.props.textIndent.unit),
    indentLeft: toAbstractUnit(node.props.indentLeft.value, node.props.indentLeft.unit),
    indentRight: toAbstractUnit(node.props.indentRight.value, node.props.indentRight.unit),
    box: buildParagraphBoxRenderProps(box),
  }
}

export function paragraphLineTopOffset(measured: MeasuredParagraph, lineStart: number): number {
  if (lineStart > 0) return 0
  return measured.spacingBefore + paragraphBoxTopInset(measured.box)
}

export function paragraphEndInset(measured: MeasuredParagraph, lineEnd: number): number {
  if (lineEnd < measured.lines.length) return 0
  return paragraphBoxBottomInset(measured.box) + measured.spacingAfter
}

export function paragraphLinesHeight(lines: MeasuredLine[]): number {
  return lines.reduce((sum, line) => sum + line.height, 0)
}

export function paragraphFragmentHeight(measured: MeasuredParagraph, lines: MeasuredLine[], lineStart: number, lineEnd: number): number {
  return paragraphLineTopOffset(measured, lineStart) + paragraphLinesHeight(lines) + paragraphEndInset(measured, lineEnd)
}

export function buildPositionedParagraphLines(
  measured: MeasuredParagraph,
  lines: MeasuredLine[],
  outerX: number,
  outerY: number,
  lineStart: number,
  align: ParagraphRenderProps["align"],
  isLastFragment: boolean = true,
): PaginatedLine[] {
  return buildPaginatedLines(
    lines,
    outerX + paragraphBoxLeftInset(measured.box),
    outerY,
    paragraphLineTopOffset(measured, lineStart),
    align,
    measured.contentWidth,
    isLastFragment,
  )
}

function justifySegments(
  segments: LineSegment[],
  lineWidth: number,
  fragmentWidth: number,
): LineSegment[] {
  const spaceCount = segments.filter((s) => s.kind === "space").length
  if (spaceCount === 0) return segments
  const extra = (fragmentWidth - lineWidth) / spaceCount
  if (extra <= 0.01) return segments
  let cumulativeExtra = 0
  return segments.map((s) => {
    const adjusted = { ...s, x: s.x + cumulativeExtra }
    if (s.kind === "space") {
      cumulativeExtra += extra
      return { ...adjusted, width: s.width + extra }
    }
    return adjusted
  })
}

function styleKey(style: TextRunLayoutStyle | undefined): string {
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

function buildRunsFromSegments(segments: LineSegment[] | undefined): LineRun[] | undefined {
  if (!segments?.length) return undefined
  const runs: LineRun[] = []
  for (const segment of segments) {
    if (!segment.style || !segment.sourceType) continue
    const previous = runs.at(-1)
    if (
      previous &&
      previous.sourceId === segment.sourceId &&
      previous.sourceType === segment.sourceType &&
      styleKey(previous.style) === styleKey(segment.style)
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

export function buildPaginatedLines(
  lines: MeasuredLine[],
  fragmentX: number,
  fragmentY: number,
  spacingBefore: number,
  align: "left" | "center" | "right" | "justify" = "left",
  fragmentWidth: number = 0,
  isLastFragment: boolean = true,
): PaginatedLine[] {
  let lineY = fragmentY + spacingBefore
  return lines.map((line, lineIndex) => {
    const isLastLine = isLastFragment && lineIndex === lines.length - 1
    let x = fragmentX
    let segments = line.segments
    let runs = line.runs
    if (align === "center") x = fragmentX + (fragmentWidth - line.width) / 2
    else if (align === "right") x = fragmentX + fragmentWidth - line.width
    else if (align === "justify" && !isLastLine && segments?.length) {
      segments = justifySegments(segments, line.width, fragmentWidth)
      runs = buildRunsFromSegments(segments)
    }
    const result: PaginatedLine = { text: line.text, x, y: lineY, width: line.width, height: line.height, segments, runs }
    lineY += line.height
    return result
  })
}

export function resolvePageNumbers(lines: PaginatedLine[], pageNumber: number): PaginatedLine[] {
  const pageStr = String(pageNumber)
  return lines.map((line) => {
    if (!line.segments?.some((s) => s.kind === "pageNumber")) return line
    const newSegments = line.segments.map((s) =>
      s.kind === "pageNumber" ? { ...s, text: pageStr } : s,
    )
    const newRuns = line.runs?.map((run) =>
      run.sourceType === "pageNumber" ? { ...run, text: pageStr } : run
    )
    return { ...line, text: newSegments.map((s) => s.text).join(""), segments: newSegments, runs: newRuns }
  })
}
