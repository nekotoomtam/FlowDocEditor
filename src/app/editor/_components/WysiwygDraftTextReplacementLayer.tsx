import { resolveFontCssFamily } from "@/font-registry"
import {
  resolvePaginatedLineBaselineY,
  type PageFragment,
  type PaginatedLine,
  type ParagraphRenderProps,
} from "@/pagination"

type WysiwygDraftTextReplacementCaretVisualMode = "idle" | "typing"

const INLINE_EDIT_TEXT_COLOR = "#1e40af"
const WYSIWYG_CARET_BLINK_DURATION = "1.05s"
const SVG_TEXT_PRESERVE_WHITESPACE_STYLE = {
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "pre",
} as const

export interface WysiwygDraftTextReplacementState {
  baseText: string
  draftText: string
  allowDraftOverflow?: boolean
}

interface WysiwygDraftTextReplacementLine {
  line: PaginatedLine
  draftStart: number
  draftEnd: number
}

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

function lineBaselineY(line: PaginatedLine): number {
  return resolvePaginatedLineBaselineY(line)
}

function fontWeightForRenderProps(renderProps: ParagraphRenderProps | undefined): number | undefined {
  return renderProps?.fontWeight === "bold" ? 700 : undefined
}

function fontStyleForRenderProps(renderProps: ParagraphRenderProps | undefined): "italic" | undefined {
  return renderProps?.fontStyle === "italic" ? "italic" : undefined
}

function textColorForRenderProps(renderProps: ParagraphRenderProps | undefined): string {
  return `#${renderProps?.textColor ?? "000000"}`
}

function textDecorationForRenderProps(renderProps: ParagraphRenderProps | undefined): string | undefined {
  const decorations: string[] = []
  if (renderProps?.textDecoration === "underline") decorations.push("underline")
  if (renderProps?.strikethrough) decorations.push("line-through")
  return decorations.length > 0 ? decorations.join(" ") : undefined
}

function renderCaretBlinkAnimation(caretVisualMode: WysiwygDraftTextReplacementCaretVisualMode) {
  if (caretVisualMode === "typing") return null
  return (
    <animate
      data-wysiwyg-caret-blink="true"
      attributeName="opacity"
      values="1;1;0;0"
      keyTimes="0;0.48;0.5;1"
      dur={WYSIWYG_CARET_BLINK_DURATION}
      repeatCount="indefinite"
    />
  )
}

function resolveWysiwygDraftTextDiff(baseText: string, draftText: string) {
  let prefixLength = 0
  const maxPrefixLength = Math.min(baseText.length, draftText.length)
  while (prefixLength < maxPrefixLength && baseText[prefixLength] === draftText[prefixLength]) {
    prefixLength += 1
  }

  let baseSuffixStart = baseText.length
  let draftSuffixStart = draftText.length
  while (
    baseSuffixStart > prefixLength &&
    draftSuffixStart > prefixLength &&
    baseText[baseSuffixStart - 1] === draftText[draftSuffixStart - 1]
  ) {
    baseSuffixStart -= 1
    draftSuffixStart -= 1
  }

  return {
    prefixLength,
    baseSuffixStart,
    draftSuffixStart,
    delta: draftText.length - baseText.length,
  }
}

function mapWysiwygBaseOffsetToDraft(
  offset: number,
  diff: ReturnType<typeof resolveWysiwygDraftTextDiff>,
): number {
  if (offset <= diff.prefixLength) return offset
  if (offset >= diff.baseSuffixStart) return offset + diff.delta
  return diff.draftSuffixStart
}

export function resolveWysiwygLineSourceRange(line: PaginatedLine, fallbackStart: number): { start: number; end: number } {
  const positionedParts = line.runs?.length ? line.runs : line.segments
  if (positionedParts?.length) {
    return {
      start: Math.min(...positionedParts.map((part) => part.start)),
      end: Math.max(...positionedParts.map((part) => part.end)),
    }
  }
  return {
    start: fallbackStart,
    end: fallbackStart + line.text.length,
  }
}

function splitWysiwygDraftLineText(text: string, capacity: number): string[] {
  if (!text) return [""]
  const safeCapacity = Math.max(1, Math.floor(capacity))
  if (text.length <= safeCapacity) return [text]

  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + safeCapacity)
    if (end < text.length) {
      const minBreak = start + Math.max(1, Math.floor(safeCapacity * 0.45))
      let breakAt = -1
      for (let index = end; index > minBreak; index -= 1) {
        if (/\s/.test(text[index - 1] ?? "")) {
          breakAt = index
          break
        }
      }
      if (breakAt > start) end = breakAt
    }
    chunks.push(text.slice(start, end))
    start = end
  }
  return chunks
}

function buildWysiwygDraftTextReplacementLines(
  fragment: PageFragment,
  baseText: string,
  draftText: string,
  allowDraftOverflow = true,
): WysiwygDraftTextReplacementLine[] | null {
  const sourceLines = fragment.lines
  if (!sourceLines?.length) return null

  const diff = resolveWysiwygDraftTextDiff(baseText, draftText)
  let fallbackStart = 0
  let extraLineOffset = 0
  const replacementLines: WysiwygDraftTextReplacementLine[] = []
  sourceLines.forEach((line, lineIndex) => {
    const sourceRange = resolveWysiwygLineSourceRange(line, fallbackStart)
    fallbackStart = Math.max(sourceRange.end, fallbackStart + line.text.length)
    const draftStart = Math.max(0, Math.min(draftText.length, mapWysiwygBaseOffsetToDraft(sourceRange.start, diff)))
    const mappedEnd = Math.max(0, Math.min(draftText.length, mapWysiwygBaseOffsetToDraft(sourceRange.end, diff)))
    const draftEnd = allowDraftOverflow && lineIndex === sourceLines.length - 1
      ? Math.max(mappedEnd, draftText.length)
      : mappedEnd
    const safeDraftEnd = Math.max(draftStart, Math.min(draftText.length, draftEnd))
    const lineDraftText = draftText.slice(draftStart, safeDraftEnd)
    const estimatedCharWidth = Math.max(4, (line.fontSize ?? 12) * 0.52)
    const geometryCapacity = Math.max(1, Math.floor(fragment.width / estimatedCharWidth))
    const sourceCapacity = Math.max(1, sourceRange.end - sourceRange.start, line.text.length, geometryCapacity)
    const chunks = splitWysiwygDraftLineText(lineDraftText, sourceCapacity)
    let chunkStart = draftStart
    const baseY = line.y + (line.height * extraLineOffset)
    chunks.forEach((chunk, chunkIndex) => {
      const chunkEnd = Math.min(safeDraftEnd, chunkStart + chunk.length)
      replacementLines.push({
        draftStart: chunkStart,
        draftEnd: chunkEnd,
        line: {
          ...line,
          y: baseY + (line.height * chunkIndex),
          text: chunk,
          segments: undefined,
          runs: undefined,
        },
      })
      chunkStart = chunkEnd
    })
    extraLineOffset += Math.max(0, chunks.length - 1)
  })
  return replacementLines
}

export function cloneWysiwygDraftReplacementSourceFragment(fragment: PageFragment): PageFragment {
  return {
    ...fragment,
    lines: fragment.lines?.map((line) => ({
      ...line,
      segments: line.segments?.map((segment) => ({ ...segment })),
      runs: line.runs?.map((run) => ({ ...run, style: { ...run.style } })),
    })),
  }
}

function renderDraftTextReplacementCaret(
  lines: WysiwygDraftTextReplacementLine[],
  caretIndex: number | null,
  pageKey: string,
  fragment: PageFragment,
  scale: number,
  clipPathId: string | undefined,
  caretVisualMode: WysiwygDraftTextReplacementCaretVisualMode,
): React.ReactNode {
  const draftCaret = caretIndex == null ? null : Math.max(0, caretIndex)
  const target = draftCaret == null
    ? lines.at(-1)
    : lines.find((line) => draftCaret <= line.draftEnd) ?? lines.at(-1)
  if (!target) return null

  const line = target.line
  const span = Math.max(1, target.draftEnd - target.draftStart)
  const rawRatio = draftCaret == null
    ? 1
    : (draftCaret - target.draftStart) / span
  const ratio = Math.max(0, Math.min(1, Number.isFinite(rawRatio) ? rawRatio : 1))
  const caretX = line.x + Math.max(line.width, fragment.width * 0.2) * ratio
  const clip = `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`

  return (
    <line
      data-wysiwyg-draft-text-replacement-caret="true"
      data-wysiwyg-caret-mode={caretVisualMode}
      x1={caretX * scale}
      y1={line.y * scale}
      x2={caretX * scale}
      y2={(line.y + line.height) * scale}
      stroke={INLINE_EDIT_TEXT_COLOR}
      strokeWidth={Math.max(1, 1.1 * scale)}
      strokeLinecap="round"
      clipPath={clip}
      style={{ pointerEvents: "none" }}
    >
      {renderCaretBlinkAnimation(caretVisualMode)}
    </line>
  )
}

export function renderDraftTextReplacement(
  fragment: PageFragment,
  replacement: WysiwygDraftTextReplacementState | null | undefined,
  caretIndex: number | null,
  renderProps: ParagraphRenderProps | undefined,
  pageKey: string,
  scale: number,
  clipPathId?: string,
  caretVisualMode: WysiwygDraftTextReplacementCaretVisualMode = "idle",
): { content: React.ReactNode; caret: React.ReactNode } | null {
  if (!replacement) return null
  const replacementLines = buildWysiwygDraftTextReplacementLines(
    fragment,
    replacement.baseText,
    replacement.draftText,
    replacement.allowDraftOverflow ?? true,
  )
  if (!replacementLines) return null

  const align = renderProps?.align
  const fontFamily = resolveFontCssFamily(renderProps?.fontFamilyKey)
  const fontWeight = fontWeightForRenderProps(renderProps)
  const fontStyle = fontStyleForRenderProps(renderProps)
  const textDecoration = textDecorationForRenderProps(renderProps)
  const textColor = textColorForRenderProps(renderProps)
  const clip = `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`
  const firstLine = replacementLines[0]?.line
  const lastLine = replacementLines.at(-1)?.line
  const replacementHeight = firstLine && lastLine
    ? (lastLine.y + lastLine.height) - firstLine.y
    : fragment.height

  return {
    content: (
      <g
        data-wysiwyg-draft-text-replacement="true"
        data-wysiwyg-draft-text-replacement-mode="flowdoc-line-box"
        data-wysiwyg-draft-text-length={replacement.draftText.length}
        data-wysiwyg-draft-text-replacement-source-line-count={fragment.lines?.length ?? 0}
        data-wysiwyg-draft-text-replacement-line-count={replacementLines.length}
        data-wysiwyg-draft-text-replacement-x={fragment.x}
        data-wysiwyg-draft-text-replacement-y={firstLine?.y ?? fragment.y}
        data-wysiwyg-draft-text-replacement-width={fragment.width}
        data-wysiwyg-draft-text-replacement-height={replacementHeight}
        clipPath={clip}
        style={{ pointerEvents: "none" }}
      >
        {replacementLines.map(({ line, draftStart, draftEnd }, index) => (
          <text
            key={`draft-line-${index}`}
            data-wysiwyg-draft-text-replacement-line="true"
            data-wysiwyg-draft-line-index={index}
            data-wysiwyg-draft-line-start={draftStart}
            data-wysiwyg-draft-line-end={draftEnd}
            x={lineX(line, align) * scale}
            y={lineBaselineY(line) * scale}
            fontSize={(line.fontSize ?? renderProps?.fontSize ?? 8) * scale}
            fontFamily={fontFamily}
            fontWeight={fontWeight}
            fontStyle={fontStyle}
            textDecoration={textDecoration}
            textAnchor={textAnchorForAlign(align)}
            fill={textColor}
            xmlSpace="preserve"
            style={SVG_TEXT_PRESERVE_WHITESPACE_STYLE}
          >
            {line.text}
          </text>
        ))}
      </g>
    ),
    caret: renderDraftTextReplacementCaret(replacementLines, caretIndex, pageKey, fragment, scale, clipPathId, caretVisualMode),
  }
}
