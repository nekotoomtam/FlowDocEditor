import { resolvePaginatedLineBaselineY, type PageFragment, type PaginatedLine, type ParagraphRenderProps } from "@/pagination"
import { resolveFontCssFamily } from "@/font-registry"
import { getWysiwygFragmentTextRange } from "./wysiwygCaretMapping"

export const ISLAND_MIN_HEIGHT_PT = 1
export const ISLAND_CONTINUATION_BOUNDARY_CLEARANCE_PT = 2

function textAnchorForAlign(align: ParagraphRenderProps["align"] | undefined): "start" | "middle" | "end" {
  if (align === "center") return "middle"
  if (align === "right") return "end"
  return "start"
}

function lineX(line: PaginatedLine, align: ParagraphRenderProps["align"] | undefined): number {
  if (align === "center") return line.x + line.width / 2
  if (align === "right") return line.x + line.width
  return line.x
}

function fontWeightForRenderProps(renderProps: ParagraphRenderProps | undefined): number | undefined {
  return renderProps?.fontWeight === "bold" ? 700 : undefined
}

function fontStyleForRenderProps(renderProps: ParagraphRenderProps | undefined): "italic" | undefined {
  return renderProps?.fontStyle === "italic" ? "italic" : undefined
}

function textDecorationForRenderProps(renderProps: ParagraphRenderProps | undefined): string | undefined {
  const decorations: string[] = []
  if (renderProps?.textDecoration === "underline") decorations.push("underline")
  if (renderProps?.strikethrough) decorations.push("line-through")
  return decorations.length > 0 ? decorations.join(" ") : undefined
}

type RenderableLineRun = NonNullable<PaginatedLine["runs"]>[number]

function fontWeightForLineRun(run: RenderableLineRun): number | undefined {
  return run.style.fontWeight === "bold" ? 700 : undefined
}

function fontStyleForLineRun(run: RenderableLineRun): "italic" | undefined {
  return run.style.fontStyle === "italic" ? "italic" : undefined
}

function textDecorationForLineRun(run: RenderableLineRun): string | undefined {
  const decorations: string[] = []
  if (run.style.textDecoration === "underline") decorations.push("underline")
  if (run.style.strikethrough) decorations.push("line-through")
  return decorations.length > 0 ? decorations.join(" ") : undefined
}

function lineRangeAttrs(line: PaginatedLine): { start: number | null; end: number | null } {
  const ranges = [
    ...(line.segments ?? []).map((segment) => ({ start: segment.start, end: segment.end })),
    ...(line.runs ?? []).map((run) => ({ start: run.start, end: run.end })),
  ].filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
  if (ranges.length === 0) return { start: null, end: null }
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  }
}

export function resolveDraftLineRangeAttrs(lines: PaginatedLine[]): Array<{ start: number | null; end: number | null }> {
  const ranges = lines.map(lineRangeAttrs)
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (ranges[lineIndex].start != null && ranges[lineIndex].end != null) continue
    if (lines[lineIndex].text.length > 0) continue

    let previousIndex = -1
    for (let candidateIndex = lineIndex - 1; candidateIndex >= 0; candidateIndex -= 1) {
      if (ranges[candidateIndex].end != null) {
        previousIndex = candidateIndex
        break
      }
    }
    if (previousIndex >= 0) {
      const previousEnd = ranges[previousIndex].end ?? 0
      const offset = previousEnd + (lineIndex - previousIndex)
      ranges[lineIndex] = { start: offset, end: offset }
      continue
    }

    let nextIndex = -1
    for (let candidateIndex = lineIndex + 1; candidateIndex < ranges.length; candidateIndex += 1) {
      if (ranges[candidateIndex].start != null) {
        nextIndex = candidateIndex
        break
      }
    }
    if (nextIndex >= 0) {
      const nextStart = ranges[nextIndex].start ?? 0
      const offset = Math.max(0, nextStart - (nextIndex - lineIndex))
      ranges[lineIndex] = { start: offset, end: offset }
      continue
    }

    ranges[lineIndex] = { start: lineIndex, end: lineIndex }
  }
  return ranges
}

export function renderDraftLine(input: {
  line: PaginatedLine
  index: number
  renderProps: ParagraphRenderProps | undefined
  range?: { start: number | null; end: number | null }
}) {
  const { line, index, renderProps } = input
  const baseY = resolvePaginatedLineBaselineY(line)
  const range = input.range ?? lineRangeAttrs(line)
  if (line.runs?.length) {
    return (
      <g key={index} data-wysiwyg-flowdoc-draft-line="true" data-wysiwyg-draft-line-start={range.start ?? undefined} data-wysiwyg-draft-line-end={range.end ?? undefined}>
        {line.runs
          .filter((run) => run.text.trim() !== "")
          .map((run, runIndex) => (
            <text
              key={runIndex}
              xmlSpace="preserve"
              x={line.x + run.x}
              y={baseY}
              fontSize={run.style.fontSize}
              fontFamily={resolveFontCssFamily(run.style.fontFamilyKey)}
              fontWeight={fontWeightForLineRun(run)}
              fontStyle={fontStyleForLineRun(run)}
              textDecoration={textDecorationForLineRun(run)}
              fill={`#${run.style.textColor}`}
              style={{ whiteSpace: "pre" }}
            >
              {run.text}
            </text>
          ))}
      </g>
    )
  }

  return (
    <text
      key={index}
      data-wysiwyg-flowdoc-draft-line="true"
      data-wysiwyg-draft-line-start={range.start ?? undefined}
      data-wysiwyg-draft-line-end={range.end ?? undefined}
      x={lineX(line, renderProps?.align)}
      y={baseY}
      fontSize={line.fontSize ?? renderProps?.fontSize ?? 8}
      fontFamily={resolveFontCssFamily(renderProps?.fontFamilyKey)}
      fontWeight={fontWeightForRenderProps(renderProps)}
      fontStyle={fontStyleForRenderProps(renderProps)}
      textDecoration={textDecorationForRenderProps(renderProps)}
      textAnchor={textAnchorForAlign(renderProps?.align)}
      fill={`#${renderProps?.textColor ?? "111827"}`}
      xmlSpace="preserve"
      style={{ whiteSpace: "pre" }}
    >
      {line.text}
    </text>
  )
}

export function resolveDraftIslandVisualHeightPt(fragment: PageFragment, draftHeight: number | null): number {
  return Math.max(ISLAND_MIN_HEIGHT_PT, draftHeight ?? fragment.height)
}

export function resolveDraftIslandCoverHeightPt(fragment: PageFragment, draftHeight: number | null): number {
  return Math.max(resolveDraftIslandVisualHeightPt(fragment, draftHeight), fragment.height)
}

export function draftIslandSurfaceKey(fragment: PageFragment): string {
  return [
    fragment.pageIndex,
    fragment.fragmentIndex ?? "x",
    fragment.lineStart ?? "x",
    fragment.lineEnd ?? "x",
    fragment.continuesFrom ? "from" : "source",
    fragment.isContinued ? "continued" : "final",
  ].join(":")
}

export function resolveDraftIslandSurfaceHeightPt(sourceFragment: PageFragment, draftFragment: PageFragment): number {
  if (
    draftFragment.pageIndex === sourceFragment.pageIndex &&
    draftFragment.continuesFrom !== true
  ) {
    return resolveDraftIslandCoverHeightPt(sourceFragment, draftFragment.height)
  }
  return Math.max(ISLAND_MIN_HEIGHT_PT, draftFragment.height)
}

export function resolveDraftIslandSurfaceChromeHeightPt(sourceFragment: PageFragment, draftFragment: PageFragment): number {
  const height = resolveDraftIslandSurfaceHeightPt(sourceFragment, draftFragment)
  if (draftFragment.continuesFrom !== true) return height
  return Math.max(ISLAND_MIN_HEIGHT_PT, height - ISLAND_CONTINUATION_BOUNDARY_CLEARANCE_PT)
}

export function totalDraftIslandLineCount(fragments: PageFragment[]): number {
  return fragments.reduce((sum, fragment) => sum + (fragment.lines?.length ?? 0), 0)
}

export function resolveDraftIslandFragmentForCaret(
  fragments: PageFragment[],
  caretOffset: number | null,
): PageFragment | null {
  if (fragments.length === 0) return null
  if (caretOffset == null) return fragments[0]
  for (const fragment of fragments) {
    const range = getWysiwygFragmentTextRange(fragment)
    if (!range) continue
    if (caretOffset >= range.start && caretOffset <= range.end) return fragment
  }
  return fragments[fragments.length - 1]
}
