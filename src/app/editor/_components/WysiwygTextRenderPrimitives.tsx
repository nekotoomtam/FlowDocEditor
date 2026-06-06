import type { CSSProperties, ReactNode } from "react"
import { resolveFontCssFamily } from "@/font-registry"
import type { TextMeasurer } from "@/layout"
import { resolvePaginatedLineBaselineY } from "@/pagination"
import type { PageFragment, PaginatedLine, ParagraphRenderProps } from "@/pagination"
import {
  resolveCollapsedCaretOverlayInFragment,
  type WysiwygCollapsedCaretOverlay,
} from "./wysiwygCaretMapping"

export type WysiwygCaretVisualMode = "idle" | "typing"

export const INLINE_EDIT_TEXT_COLOR = "#1e40af"

const WYSIWYG_CARET_BLINK_DURATION = "1.05s"
const SVG_TEXT_PRESERVE_WHITESPACE_STYLE: CSSProperties = {
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "pre",
}

function textAnchorForAlign(align: ParagraphRenderProps["align"] | undefined): "start" | "middle" | "end" {
  if (align === "center") return "middle"
  if (align === "right") return "end"
  return "start"
}

export function textAlignForParagraph(align: ParagraphRenderProps["align"] | undefined): CSSProperties["textAlign"] {
  if (align === "center") return "center"
  if (align === "right") return "right"
  if (align === "justify") return "justify"
  return "left"
}

function lineX(line: PaginatedLine, align: ParagraphRenderProps["align"] | undefined): number {
  if (align === "center") return line.x + line.width / 2
  if (align === "right") return line.x + line.width
  return line.x
}

function lineVisualLeft(line: PaginatedLine): number {
  return line.x
}

function lineBaselineY(line: PaginatedLine): number {
  return resolvePaginatedLineBaselineY(line)
}

function segmentColor(kind: NonNullable<PaginatedLine["segments"]>[number]["kind"]): string {
  if (kind === "space") return "#f59e0b"
  if (kind === "field") return "#8b5cf6"
  if (kind === "grapheme") return "#ef4444"
  return "#10b981"
}

export function fontWeightForRenderProps(renderProps: ParagraphRenderProps | undefined): number | undefined {
  return renderProps?.fontWeight === "bold" ? 700 : undefined
}

type RenderableLineRun = NonNullable<PaginatedLine["runs"]>[number]

function fontWeightForLineRun(run: RenderableLineRun): number | undefined {
  return run.style.fontWeight === "bold" ? 700 : undefined
}

export function fontStyleForRenderProps(renderProps: ParagraphRenderProps | undefined): "italic" | undefined {
  return renderProps?.fontStyle === "italic" ? "italic" : undefined
}

function fontStyleForLineRun(run: RenderableLineRun): "italic" | undefined {
  return run.style.fontStyle === "italic" ? "italic" : undefined
}

export function textColorForRenderProps(renderProps: ParagraphRenderProps | undefined): string {
  return `#${renderProps?.textColor ?? "000000"}`
}

export function shiftFragmentVisualY(fragment: PageFragment, offsetY: number): PageFragment {
  if (Math.abs(offsetY) < 0.01) return fragment
  return {
    ...fragment,
    y: fragment.y + offsetY,
    lines: fragment.lines?.map((line) => ({ ...line, y: line.y + offsetY })),
  }
}

export function textDecorationForRenderProps(renderProps: ParagraphRenderProps | undefined): string | undefined {
  const decorations: string[] = []
  if (renderProps?.textDecoration === "underline") decorations.push("underline")
  if (renderProps?.strikethrough) decorations.push("line-through")
  return decorations.length > 0 ? decorations.join(" ") : undefined
}

function textDecorationForLineRun(run: RenderableLineRun): string | undefined {
  const decorations: string[] = []
  if (run.style.textDecoration === "underline") decorations.push("underline")
  if (run.style.strikethrough) decorations.push("line-through")
  return decorations.length > 0 ? decorations.join(" ") : undefined
}

function renderRichLineRuns(
  line: PaginatedLine,
  index: number,
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  opacity?: number,
  clipPathId?: string | null,
) {
  if (!line.runs?.length) return null
  const baseY = lineBaselineY(line) * scale
  const clip = clipPathId === null
    ? undefined
    : `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`

  return (
    <g key={index} clipPath={clip} opacity={opacity} style={{ pointerEvents: "none", userSelect: "none" }}>
      {line.runs
        .filter((run) => run.text.trim() !== "")
        .map((run, runIndex) => (
          <text
            key={runIndex}
            xmlSpace="preserve"
            x={(line.x + run.x) * scale}
            y={baseY}
            fontSize={run.style.fontSize * scale}
            fontFamily={resolveFontCssFamily(run.style.fontFamilyKey)}
            fontWeight={fontWeightForLineRun(run)}
            fontStyle={fontStyleForLineRun(run)}
            textDecoration={textDecorationForLineRun(run)}
            fill={`#${run.style.textColor}`}
            style={SVG_TEXT_PRESERVE_WHITESPACE_STYLE}
          >
            {run.text}
          </text>
        ))}
    </g>
  )
}

export function renderLine(
  line: PaginatedLine,
  index: number,
  fragment: PageFragment,
  renderProps: ParagraphRenderProps | undefined,
  pageKey: string,
  scale: number,
  opacity?: number,
  clipPathId?: string | null,
) {
  const align = renderProps?.align
  const fontSize = (line.fontSize ?? renderProps?.fontSize ?? 8) * scale
  const baseY = lineBaselineY(line) * scale
  const fontFamily = resolveFontCssFamily(renderProps?.fontFamilyKey)
  const fontWeight = fontWeightForRenderProps(renderProps)
  const fontStyle = fontStyleForRenderProps(renderProps)
  const textDecoration = textDecorationForRenderProps(renderProps)
  const textColor = textColorForRenderProps(renderProps)
  const clip = `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`

  const richLine = renderRichLineRuns(line, index, fragment, pageKey, scale, opacity, clipPathId)
  if (richLine) return richLine

  if (align === "justify" && line.segments?.length) {
    return (
      <g key={index} clipPath={clip} opacity={opacity} style={{ pointerEvents: "none", userSelect: "none" }}>
        {line.segments
          .filter((seg) => seg.kind !== "space" && seg.text.trim() !== "")
          .map((seg, si) => (
            <text key={si} xmlSpace="preserve" x={(line.x + seg.x) * scale} y={baseY}
              fontSize={fontSize} fontFamily={fontFamily} fontWeight={fontWeight}
              fontStyle={fontStyle} textDecoration={textDecoration} fill={textColor}
              style={SVG_TEXT_PRESERVE_WHITESPACE_STYLE}>
              {seg.text}
            </text>
          ))}
      </g>
    )
  }

  return (
    <text
      key={index}
      x={lineX(line, align) * scale}
      y={baseY}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontWeight={fontWeight}
      fontStyle={fontStyle}
      textDecoration={textDecoration}
      textAnchor={textAnchorForAlign(align)}
      fill={textColor}
      opacity={opacity}
      clipPath={clip}
      xmlSpace="preserve"
      style={SVG_TEXT_PRESERVE_WHITESPACE_STYLE}
    >
      {line.text}
    </text>
  )
}

export function renderListMarker(
  fragment: PageFragment,
  renderProps: ParagraphRenderProps | undefined,
  pageKey: string,
  scale: number,
  clipPathId?: string,
) {
  const marker = fragment.listMarker
  const firstLine = fragment.lines?.[0]
  if (!marker || !firstLine) return null

  const fontSize = (firstLine.fontSize ?? renderProps?.fontSize ?? 8) * scale
  const baseY = lineBaselineY(firstLine) * scale
  const fontFamily = resolveFontCssFamily(renderProps?.fontFamilyKey)
  const fontWeight = fontWeightForRenderProps(renderProps)
  const fontStyle = fontStyleForRenderProps(renderProps)
  const textColor = textColorForRenderProps(renderProps)
  const clip = clipPathId === null
    ? undefined
    : `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`

  return (
    <text
      key="list-marker"
      data-list-marker="true"
      data-list-marker-node-id={fragment.nodeId}
      data-list-marker-level={marker.level}
      x={marker.markerX * scale}
      y={baseY}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontWeight={fontWeight}
      fontStyle={fontStyle}
      fill={textColor}
      clipPath={clip}
      xmlSpace="preserve"
      style={SVG_TEXT_PRESERVE_WHITESPACE_STYLE}
    >
      {marker.text}
    </text>
  )
}

export function renderSegmentDebug(
  lines: PaginatedLine[] | undefined,
  fragment: PageFragment,
  renderProps: ParagraphRenderProps | undefined,
  scale: number,
) {
  return lines?.flatMap((line, lineIndex) => {
    const segments = line.segments ?? []
    const visualLeft = lineVisualLeft(line)
    return segments.map((segment, segmentIndex) => {
      const color = segmentColor(segment.kind)
      return (
        <g key={`seg-${lineIndex}-${segmentIndex}`} style={{ pointerEvents: "none" }}>
          <rect
            x={(visualLeft + segment.x) * scale}
            y={line.y * scale}
            width={Math.max(segment.width * scale, 1)}
            height={line.height * scale}
            fill={color}
            opacity={segment.kind === "space" ? 0.22 : 0.14}
            stroke={color}
            strokeWidth={0.75}
            strokeDasharray={segment.kind === "space" ? "2 2" : undefined}
          >
            <title>{`${segment.kind}: ${segment.start}-${segment.end} (${Math.round(segment.width * 100) / 100})`}</title>
          </rect>
          <line
            x1={(visualLeft + segment.x) * scale}
            y1={line.y * scale}
            x2={(visualLeft + segment.x) * scale}
            y2={(line.y + line.height) * scale}
            stroke={color}
            strokeWidth={0.75}
            opacity={0.55}
          />
        </g>
      )
    })
  }) ?? null
}

function renderCaretBlinkAnimation(caretVisualMode: WysiwygCaretVisualMode) {
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

export function renderCollapsedCaretOverlay(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  overlay: WysiwygCollapsedCaretOverlay | null,
  clipPathId?: string | null,
  caretVisualMode: WysiwygCaretVisualMode = "idle",
) {
  if (!overlay) return null

  return (
    <line
      key={`caret-${fragment.nodeId}-${overlay.offset}`}
      data-wysiwyg-caret="true"
      data-wysiwyg-caret-mode={caretVisualMode}
      x1={overlay.x1 * scale}
      y1={overlay.y1 * scale}
      x2={overlay.x2 * scale}
      y2={overlay.y2 * scale}
      stroke={INLINE_EDIT_TEXT_COLOR}
      strokeWidth={Math.max(1, 1.1 * scale)}
      strokeLinecap="round"
      clipPath={clipPathId === null ? undefined : `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`}
      style={{ pointerEvents: "none" }}
    >
      {renderCaretBlinkAnimation(caretVisualMode)}
    </line>
  )
}

export function renderCollapsedCaret(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  caretIndex: number | null,
  textMeasurer: TextMeasurer | undefined,
  clipPathId?: string | null,
  caretVisualMode: WysiwygCaretVisualMode = "idle",
): ReactNode {
  if (caretIndex == null) return null
  const overlay = resolveCollapsedCaretOverlayInFragment(fragment, caretIndex, { textMeasurer })
  return renderCollapsedCaretOverlay(fragment, pageKey, scale, overlay, clipPathId, caretVisualMode)
}
