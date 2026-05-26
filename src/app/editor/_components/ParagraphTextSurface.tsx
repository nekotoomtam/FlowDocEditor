import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
import {
  getTextRunParagraphText,
  isTextRunOnlyParagraph,
  replaceTextRunParagraphTextInParagraph,
} from "@/document"
import {
  measureParagraph,
  nextTextGraphemeBoundary,
  paragraphBoxLeftInset,
  previousTextGraphemeBoundary,
  resolveParagraphBoxStyle,
  snapToGraphemeBoundary,
} from "@/layout"
import type { TextMeasurer } from "@/layout"
import { buildPositionedParagraphLines, resolvePaginatedLineBaselineY } from "@/pagination"
import type { DocumentNode, FlowTableNode, ParagraphNode } from "@/schema"
import type { PageFragment, PaginatedLine, ParagraphRenderProps } from "@/pagination"
import { resolveFontCssFamily, resolveFontVariantKeyForStyle } from "@/font-registry"
import {
  getWysiwygFragmentTextRange,
  resolveCollapsedCaretOverlayInFragment,
  resolveCaretPositionInFragment,
  resolveCaretOffsetFromPointInFragment,
  resolveVerticalCaretNavigationInFragments,
  resolveSelectionOverlayRectsInFragment,
} from "./wysiwygCaretMapping"
import type { WysiwygCollapsedCaretOverlay, WysiwygVerticalCaretLineAffinity } from "./wysiwygCaretMapping"
import { classifyInlineEditKey, getInlineEditInputSnapshot, resolveStructuralListEnterInput } from "./wysiwygTextInteraction"
import type { InlineEditSelectionSnapshot, ListLevelChangeDirection } from "./wysiwygTextInteraction"
import {
  applyWysiwygTextClipboardCut,
  applyWysiwygTextInputKey,
  applyWysiwygTextInputText,
  areWysiwygTextSelectionsEqual,
  clampWysiwygTextOffset,
  getWysiwygTextSelectedText,
  normalizeWysiwygTextInputKey,
  WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID,
} from "./useWysiwygTextSession"
import type { WysiwygTextInputKey, WysiwygTextSelection, WysiwygTextSessionDraftChange } from "./useWysiwygTextSession"
import {
  classifyWysiwygTextReflow,
  shouldPrepareWysiwygTableCellDraftVisualPreview,
  shouldPatchWysiwygSamePageHeight,
  shouldUseWysiwygLocalDraftLines,
} from "./wysiwygReflow"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import { isParagraphInsideFlowStack } from "./wysiwygTextEligibility"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { finishWysiwygPerfSpan, isWysiwygPerfTraceRuntimeEnabled, startWysiwygPerfSpan } from "./wysiwygPerformance"
import { hasPlatformShortcutModifier, normalizeShortcutKey } from "./keyboardShortcuts"

interface Props {
  fragment: PageFragment
  doc: DocumentNode
  pageKey: string
  clipPathId?: string
  scale: number
  visualOffsetY?: number
  pageContentBottom?: number | null
  textMeasurer?: TextMeasurer
  isEditing: boolean
  isVisualFresh: boolean
  wysiwygInlineEditEnabled: boolean
  wysiwygTextEngineEnabled: boolean
  wysiwygTextDraftText?: string | null
  wysiwygTextCaretOffset?: number | null
  wysiwygTextSelection?: WysiwygTextSelection | null
  wysiwygTextVisualDraftLines?: PaginatedLine[] | null
  wysiwygTextPointerFragments?: WysiwygTextPointerFragmentTarget[]
  wysiwygTextDraftPaginationActive?: boolean
  showTextSegments: boolean
  initialCaretIndex: number | null
  onChange: (nodeId: string, text: string, caretIndex: number | null) => void
  onCaretChange: (nodeId: string, caretIndex: number | null) => void
  onUserEditInteraction: (nodeId: string) => void
  onHeightChange: (nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => void
  onEndEdit: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph: (nodeId: string) => void
  onExitListItem?: (nodeId: string, text?: string) => void
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  onWysiwygTextDraftChange?: (nodeId: string, text: string, caretIndex: number | null, selection?: WysiwygTextSelection | null) => void
  onWysiwygRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onWysiwygTextReflowDecision?: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
}

export interface ContinuationEditState {
  continuationCharStart: number | null
  continuationCharEnd: number | null
  editText: string
  preText: string
  postText: string
  adjustedInitialCaret: number | null
}

interface SplitEditInput {
  text: string
  splitIndex: number
}

export type InlineEditVisualFallbackReason =
  | "not-editing"
  | "stale-visual"
  | "range-selection"
  | "composition"
  | "wysiwyg-disabled"
  | "missing-caret-geometry"

export interface InlineEditVisualMode {
  useDocumentVisual: boolean
  useCustomCaret: boolean
  fallbackReason: InlineEditVisualFallbackReason | null
  textareaTextColor: string
  textareaCaretColor: string
  textareaOutline: string
  textareaOutlineOffset: number
}

export type WysiwygCaretVisualMode = "idle" | "typing"

const EDIT_CHROME_X = 3
const EDIT_CHROME_Y = 3
const INLINE_EDIT_TEXT_COLOR = "#1e40af"
const WYSIWYG_CARET_BLINK_DURATION = "1.05s"
const WYSIWYG_TYPING_CARET_HOLD_MS = 650
const WYSIWYG_TEXT_BLUR_SETTLE_MS = 32
const POINTER_SELECTION_DRAG_THRESHOLD_PX = 3
const SVG_TEXT_PRESERVE_WHITESPACE_STYLE: React.CSSProperties = {
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "pre",
}

export function focusElementWithoutScroll(
  element: { focus: (options?: FocusOptions) => void } | null | undefined,
): void {
  if (!element) return
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
}

export function isWysiwygTextSessionFocusTarget(
  element: Element | null | undefined,
  nodeId: string,
): boolean {
  let current: Element | null = element ?? null
  while (current) {
    if (current.getAttribute("data-wysiwyg-rich-text-toolbar-node-id") === nodeId) {
      return true
    }
    if (current.getAttribute("data-inline-edit-node-id") === nodeId) {
      if (
        current.getAttribute("data-wysiwyg-input-bridge") === "true" ||
        current.getAttribute("data-wysiwyg-text-engine-layer") === "true"
      ) {
        return true
      }
    }
    current = current.parentElement
  }
  return false
}

export function shouldUseInlineEditSvgVisual(isEditing: boolean, isVisualFresh: boolean): boolean {
  return isEditing && isVisualFresh
}

export function shouldUseInlineEditDocumentVisual(
  isEditing: boolean,
  isVisualFresh: boolean,
  isSelectionCollapsed: boolean,
  isComposing: boolean,
  hasSelectionOverlay = false,
): boolean {
  return shouldUseInlineEditSvgVisual(isEditing, isVisualFresh) &&
    !isComposing &&
    (isSelectionCollapsed || hasSelectionOverlay)
}

export function inlineEditTextareaTextColor(useSvgVisual: boolean): string {
  return useSvgVisual ? "transparent" : INLINE_EDIT_TEXT_COLOR
}

export function inlineEditTextareaCaretColor(useCustomCaret: boolean): string {
  return useCustomCaret ? "transparent" : INLINE_EDIT_TEXT_COLOR
}

export function inlineEditTextareaOutline(useDocumentVisual: boolean): string {
  return useDocumentVisual ? "none" : "2px solid #2563eb"
}

export function shouldUseInlineEditDocumentLayer(
  canUseDocumentVisual: boolean,
  hasCustomCaret: boolean,
): boolean {
  return canUseDocumentVisual && hasCustomCaret
}

export function getInlineEditVisualMode(input: {
  isEditing: boolean
  isVisualFresh: boolean
  isSelectionCollapsed: boolean
  isComposing: boolean
  hasCustomCaret: boolean
  hasSelectionOverlay?: boolean
  isWysiwygEnabled?: boolean
}): InlineEditVisualMode {
  const isWysiwygEnabled = input.isWysiwygEnabled ?? true
  const hasSelectionOverlay = input.hasSelectionOverlay ?? false
  const canUseDocumentVisual = isWysiwygEnabled && shouldUseInlineEditDocumentVisual(
    input.isEditing,
    input.isVisualFresh,
    input.isSelectionCollapsed,
    input.isComposing,
    hasSelectionOverlay,
  )
  const hasRequiredOverlay = input.isSelectionCollapsed ? input.hasCustomCaret : hasSelectionOverlay
  const useDocumentVisual = shouldUseInlineEditDocumentLayer(canUseDocumentVisual, hasRequiredOverlay)
  const useCustomCaret = canUseDocumentVisual && input.isSelectionCollapsed && input.hasCustomCaret
  let fallbackReason: InlineEditVisualFallbackReason | null = null

  if (!input.isEditing) fallbackReason = "not-editing"
  else if (!isWysiwygEnabled) fallbackReason = "wysiwyg-disabled"
  else if (input.isComposing) fallbackReason = "composition"
  else if (!input.isVisualFresh) fallbackReason = "stale-visual"
  else if (!input.isSelectionCollapsed && !hasSelectionOverlay) fallbackReason = "range-selection"
  else if (input.isSelectionCollapsed && !input.hasCustomCaret) fallbackReason = "missing-caret-geometry"

  return {
    useDocumentVisual,
    useCustomCaret,
    fallbackReason: useDocumentVisual ? null : fallbackReason,
    textareaTextColor: inlineEditTextareaTextColor(useDocumentVisual),
    textareaCaretColor: inlineEditTextareaCaretColor(useDocumentVisual),
    textareaOutline: inlineEditTextareaOutline(useDocumentVisual),
    textareaOutlineOffset: useDocumentVisual ? 0 : -2,
  }
}

export function shouldUseWysiwygTextEngineLayer(input: {
  enabled: boolean
  isEditing: boolean
  canPlainTextEdit: boolean
  isVisualFresh: boolean
  supportsLocalDraftLayout?: boolean
}): boolean {
  return input.enabled &&
    input.isEditing &&
    input.canPlainTextEdit &&
    input.isVisualFresh &&
    (input.supportsLocalDraftLayout ?? true)
}

export function hasWysiwygTextDraftChange(
  fullText: string | null,
  draftText: string | null | undefined,
): boolean {
  return fullText != null && draftText != null && draftText !== fullText
}

function findParagraphNode(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      return node
    }
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const inner = (candidate as unknown as FlowTableNode).nodes[nodeId]
      if (inner?.type === "paragraph") return inner as ParagraphNode
    }
  }
  return null
}

function getEditableParagraphText(doc: DocumentNode, nodeId: string): string | null {
  const node = findParagraphNode(doc, nodeId)
  if (!node) return null
  return getTextRunParagraphText(node)
}

function isTableCellNodeId(doc: DocumentNode, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type !== "flow-table") continue
      const inner = (node as unknown as FlowTableNode).nodes[nodeId]
      if (inner?.type === "flow-table-cell") return true
    }
  }
  return false
}

function isParagraphInsideTableCell(
  doc: DocumentNode,
  nodeId: string,
  parentNodeId: string | null | undefined,
): boolean {
  if (isTableCellNodeId(doc, parentNodeId)) return true
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type !== "flow-table") continue
      const table = node as unknown as FlowTableNode
      for (const candidate of Object.values(table.nodes)) {
        if (candidate.type === "flow-table-cell" && candidate.childIds.includes(nodeId)) return true
      }
    }
  }
  return false
}

export function buildInlineEditSliceKey(
  fragment: PageFragment,
  continuationCharStart: number | null,
): string {
  const fragmentPart = fragment.fragmentIndex ?? fragment.lineStart ?? "x"
  return `${fragment.nodeId}:${fragment.pageIndex}:${fragmentPart}:${continuationCharStart ?? 0}`
}

export function shouldUseNativeInlineEditEnter(isListItem = false): boolean {
  return !isListItem
}

export function shouldUseNativeTableCellBoundaryBackspace(
  isTableCellParagraph: boolean,
  preText: string,
): boolean {
  return isTableCellParagraph && preText.length === 0
}

function getFragmentTextRange(fragment: PageFragment, fullTextLength: number): { start: number; end: number } | null {
  const range = getWysiwygFragmentTextRange(fragment)
  if (!range) return null

  const start = Math.max(0, Math.min(fullTextLength, range.start))
  const end = Math.max(start, Math.min(fullTextLength, range.end))
  return { start, end }
}

export function getContinuationEditState(
  fullText: string,
  fragment: PageFragment,
  initialCaretIndex: number | null,
): ContinuationEditState {
  const shouldSliceToFragment = fragment.continuesFrom === true || fragment.isContinued === true
  const fragmentRange = shouldSliceToFragment ? getFragmentTextRange(fragment, fullText.length) : null
  const sliceStart = fragmentRange?.start ?? 0
  const sliceEnd = fragmentRange?.end ?? fullText.length
  const continuationCharStart: number | null = fragmentRange ? sliceStart : null
  const continuationCharEnd: number | null = fragmentRange ? sliceEnd : null
  const editText = fullText.slice(sliceStart, sliceEnd)
  const preText = fullText.slice(0, sliceStart)
  const postText = fullText.slice(sliceEnd)
  const adjustedInitialCaret = initialCaretIndex !== null
    ? Math.min(editText.length, Math.max(0, initialCaretIndex - sliceStart))
    : null

  return { continuationCharStart, continuationCharEnd, editText, preText, postText, adjustedInitialCaret }
}

export function absoluteInlineEditIndex(preText: string, localIndex: number | null | undefined, fallback: number): number {
  return preText.length + Math.max(0, localIndex ?? fallback)
}

function previousGraphemeBoundary(text: string, index: number, includeExact = false): number {
  return previousTextGraphemeBoundary(text, index, { includeExact })
}

function nextGraphemeBoundary(text: string, index: number): number {
  return nextTextGraphemeBoundary(text, index, { includeExact: true })
}

export function buildSplitEditInput(
  preText: string,
  editText: string,
  selectionStart: number,
  selectionEnd: number,
  postText = "",
): SplitEditInput {
  const rawStart = Math.max(0, Math.min(selectionStart, editText.length))
  const rawEnd = Math.max(rawStart, Math.min(selectionEnd, editText.length))
  const currentText = preText + editText
  const rawFullStart = preText.length + rawStart
  const rawFullEnd = preText.length + rawEnd
  const fullStart = rawStart === rawEnd
    ? snapToGraphemeBoundary(currentText, rawFullStart)
    : Math.max(preText.length, previousGraphemeBoundary(currentText, rawFullStart, true))
  const fullEnd = rawStart === rawEnd
    ? fullStart
    : Math.max(fullStart, nextGraphemeBoundary(currentText, rawFullEnd))
  const start = Math.max(0, Math.min(fullStart - preText.length, editText.length))
  const end = Math.max(start, Math.min(fullEnd - preText.length, editText.length))
  const nextEditText = editText.slice(0, start) + editText.slice(end)
  const text = preText + nextEditText + postText
  return {
    text,
    splitIndex: snapToGraphemeBoundary(text, Math.min(preText.length + start, text.length)),
  }
}

export function buildContinuationBackspaceInput(
  preText: string,
  editText: string,
  postText = "",
): { text: string; caretIndex: number } | null {
  if (preText.length === 0) return null
  const deleteFrom = previousGraphemeBoundary(preText, preText.length)
  return {
    text: preText.slice(0, deleteFrom) + editText + postText,
    caretIndex: deleteFrom,
  }
}

function textAnchorForAlign(align: ParagraphRenderProps["align"] | undefined): "start" | "middle" | "end" {
  if (align === "center") return "middle"
  if (align === "right") return "end"
  return "start"
}

function textAlignForParagraph(align: ParagraphRenderProps["align"] | undefined): React.CSSProperties["textAlign"] {
  if (align === "center") return "center"
  if (align === "right") return "right"
  if (align === "justify") return "justify"
  return "left"
}

// line.x now contains the alignment and paragraph-indent offset from pagination.
// lineX computes the SVG anchor point: center/right shift by half/full line width
// to match SVG textAnchor="middle"/"end" behavior.
function lineX(line: PaginatedLine, align: ParagraphRenderProps["align"] | undefined): number {
  if (align === "center") return line.x + line.width / 2
  if (align === "right") return line.x + line.width
  return line.x
}

// Visual left edge of the line — used for caret hit testing. line.x is now the
// aligned visual left, so no further adjustment needed.
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

function fontWeightForRenderProps(renderProps: ParagraphRenderProps | undefined): number | undefined {
  return renderProps?.fontWeight === "bold" ? 700 : undefined
}

type RenderableLineRun = NonNullable<PaginatedLine["runs"]>[number]

function fontWeightForLineRun(run: RenderableLineRun): number | undefined {
  return run.style.fontWeight === "bold" ? 700 : undefined
}

function fontStyleForRenderProps(renderProps: ParagraphRenderProps | undefined): "italic" | undefined {
  return renderProps?.fontStyle === "italic" ? "italic" : undefined
}

function fontStyleForLineRun(run: RenderableLineRun): "italic" | undefined {
  return run.style.fontStyle === "italic" ? "italic" : undefined
}

function textColorForRenderProps(renderProps: ParagraphRenderProps | undefined): string {
  return `#${renderProps?.textColor ?? "000000"}`
}

function shiftFragmentVisualY(fragment: PageFragment, offsetY: number): PageFragment {
  if (Math.abs(offsetY) < 0.01) return fragment
  return {
    ...fragment,
    y: fragment.y + offsetY,
    lines: fragment.lines?.map((line) => ({ ...line, y: line.y + offsetY })),
  }
}

function textDecorationForRenderProps(renderProps: ParagraphRenderProps | undefined): string | undefined {
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
  clipPathId?: string,
) {
  if (!line.runs?.length) return null
  const baseY = lineBaselineY(line) * scale
  const clip = `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`

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

function renderLine(
  line: PaginatedLine,
  index: number,
  fragment: PageFragment,
  renderProps: ParagraphRenderProps | undefined,
  pageKey: string,
  scale: number,
  opacity?: number,
  clipPathId?: string,
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

  // Justify: draw each non-space word segment at its adjusted x position
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

function renderListMarker(
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
  const clip = `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`

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

function renderSegmentDebug(
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

function renderCollapsedCaretOverlay(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  overlay: WysiwygCollapsedCaretOverlay | null,
  clipPathId?: string,
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
      clipPath={`url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`}
      style={{ pointerEvents: "none" }}
    >
      {renderCaretBlinkAnimation(caretVisualMode)}
    </line>
  )
}

function renderCollapsedCaret(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  caretIndex: number | null,
  textMeasurer: TextMeasurer | undefined,
  clipPathId?: string,
  caretVisualMode: WysiwygCaretVisualMode = "idle",
) {
  if (caretIndex == null) return null
  const overlay = resolveCollapsedCaretOverlayInFragment(fragment, caretIndex, { textMeasurer })
  return renderCollapsedCaretOverlay(fragment, pageKey, scale, overlay, clipPathId, caretVisualMode)
}

export function resolveTrailingWhitespaceCaretOverlayInFragment(input: {
  fragment: PageFragment
  caretIndex: number | null
  draftText: string
  textMeasurer?: TextMeasurer
}): WysiwygCollapsedCaretOverlay | null {
  const caret = clampWysiwygTextOffset(input.draftText, input.caretIndex)
  if (caret == null || caret === 0) return null
  const lines = input.fragment.lines ?? []

  for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex]
    const segments = line.segments ?? []
    const lastSegment = segments.at(-1)
    if (!lastSegment) continue
    if (caret <= lastSegment.end) continue
    const trailingText = input.draftText.slice(lastSegment.end, caret)
    if (!/^[ \t]+$/.test(trailingText)) continue
    const baseCaret = resolveCaretPositionInFragment(input.fragment, lastSegment.end, {
      textMeasurer: input.textMeasurer,
    })
    if (!baseCaret) continue
    const fontFamilyKey = input.fragment.renderProps?.fontFamilyKey
    const fontSize = line.fontSize ?? input.fragment.renderProps?.fontSize
    const fontVariant = resolveFontVariantKeyForStyle(
      input.fragment.renderProps?.fontWeight,
      input.fragment.renderProps?.fontStyle,
    )
    const trailingWidth = input.textMeasurer && fontFamilyKey && fontSize
      ? input.textMeasurer.measureText(trailingText, fontFamilyKey, fontSize, fontVariant).width
      : 0
    const x = baseCaret.x + trailingWidth
    return {
      offset: caret,
      pageIndex: input.fragment.pageIndex,
      fragmentIndex: input.fragment.fragmentIndex,
      x1: x,
      y1: baseCaret.y,
      x2: x,
      y2: baseCaret.y + baseCaret.height,
    }
  }

  return null
}

function renderSelectionOverlay(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  rects: ReturnType<typeof resolveSelectionOverlayRectsInFragment>,
  clipPathId?: string,
) {
  return rects.map((rect) => (
    <rect
      key={`selection-${fragment.nodeId}-${rect.lineIndex}-${rect.startOffset}-${rect.endOffset}`}
      data-wysiwyg-selection="true"
      x={rect.x * scale}
      y={rect.y * scale}
      width={Math.max(rect.width * scale, 1)}
      height={rect.height * scale}
      fill="#93c5fd"
      opacity={0.55}
      clipPath={`url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`}
      style={{ pointerEvents: "none" }}
    />
  ))
}

export function resolveSelectionOverlayRectsInFragmentWithPerf(input: {
  fragment: PageFragment
  anchorOffset: number
  focusOffset: number
  textMeasurer?: TextMeasurer
  tracePerf?: boolean
  source?: string
}): ReturnType<typeof resolveSelectionOverlayRectsInFragment> {
  const startedAt = input.tracePerf ? startWysiwygPerfSpan() : null
  const rects = resolveSelectionOverlayRectsInFragment(
    input.fragment,
    input.anchorOffset,
    input.focusOffset,
    { textMeasurer: input.textMeasurer },
  )
  if (startedAt !== null) {
    finishWysiwygPerfSpan(true, "text-engine-selection-overlay", startedAt, {
      nodeId: input.fragment.nodeId,
      pageIndex: input.fragment.pageIndex,
      lineCount: input.fragment.lines?.length ?? 0,
      selectionRangeLength: Math.abs(input.focusOffset - input.anchorOffset),
      overlayRectCount: rects.length,
      source: input.source,
    })
  }
  return rects
}

interface TextEngineClipboardShortcutEvent {
  key: string
  code?: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  preventDefault: () => void
  stopPropagation: () => void
}

function paragraphWithDraftText(node: ParagraphNode, draftText: string): ParagraphNode | null {
  if (!isTextRunOnlyParagraph(node)) return null
  return replaceTextRunParagraphTextInParagraph(node, draftText) ?? node
}

export interface WysiwygDraftParagraphLayout {
  lines: PaginatedLine[]
  height: number
}

export interface WysiwygDraftParagraphLayoutCache {
  nodeId: string | null
  textMeasurer: TextMeasurer | null
  entries: Map<string, WysiwygDraftParagraphLayout>
}

export interface WysiwygLiveTextEcho {
  anchorOffset: number
  text: string
}

interface WysiwygImmediateTextEcho {
  baseText: string
  draftText: string
}

export interface WysiwygImmediateDraftLayoutState {
  baseText: string
  draftText: string
  layout: WysiwygDraftParagraphLayout
}

export interface WysiwygDraftSyncPayload {
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null
}

export function areWysiwygImmediateTextEchoStatesEqual(
  a: WysiwygImmediateTextEcho | null,
  b: WysiwygImmediateTextEcho | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.baseText === b.baseText && a.draftText === b.draftText
}

export function areWysiwygImmediateDraftLayoutStatesEqual(
  a: WysiwygImmediateDraftLayoutState | null,
  b: WysiwygImmediateDraftLayoutState | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.baseText === b.baseText && a.draftText === b.draftText
}

export function shouldFlushWysiwygImmediateVisualState(input: {
  previousTextEcho: WysiwygImmediateTextEcho | null
  previousDraftLayout: WysiwygImmediateDraftLayoutState | null
  nextTextEcho: WysiwygImmediateTextEcho | null
  nextDraftLayout: WysiwygImmediateDraftLayoutState | null
}): boolean {
  return (
    !input.previousTextEcho &&
    !input.previousDraftLayout &&
    Boolean(input.nextTextEcho || input.nextDraftLayout)
  )
}

export function areWysiwygDraftSyncPayloadsEqual(
  a: WysiwygDraftSyncPayload | null,
  b: WysiwygDraftSyncPayload | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.text === b.text &&
    a.caretOffset === b.caretOffset &&
    areWysiwygTextSelectionsEqual(a.selection, b.selection)
}

export function shouldKeepWysiwygImmediateDraftLayout(
  immediate: WysiwygImmediateDraftLayoutState | null,
  currentDraftText: string,
  hasParentDraftLines: boolean,
): boolean {
  if (!immediate) return false
  if (immediate.draftText === currentDraftText && hasParentDraftLines) return false
  if (immediate.baseText !== currentDraftText && immediate.draftText !== currentDraftText) return false
  return true
}

const WYSIWYG_DRAFT_PARAGRAPH_LAYOUT_CACHE_LIMIT = 64

export function createWysiwygDraftParagraphLayoutCache(): WysiwygDraftParagraphLayoutCache {
  return {
    nodeId: null,
    textMeasurer: null,
    entries: new Map(),
  }
}

function cloneWysiwygDraftParagraphLayout(layout: WysiwygDraftParagraphLayout): WysiwygDraftParagraphLayout {
  return {
    height: layout.height,
    lines: layout.lines.map((line) => ({
      ...line,
      runs: line.runs?.map((run) => ({
        ...run,
        style: run.style ? { ...run.style } : run.style,
      })),
      segments: line.segments?.map((segment) => ({ ...segment })),
    })),
  }
}

export function createWysiwygDraftParagraphLayoutCacheKey(
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  options: { allowContinuedFirstFragment?: boolean } = {},
): string {
  return JSON.stringify({
    draftText,
    fragment: {
      nodeId: fragment.nodeId,
      pageIndex: fragment.pageIndex,
      x: fragment.x,
      y: fragment.y,
      width: fragment.width,
      listMarker: fragment.listMarker
        ? {
          markerIndent: fragment.listMarker.markerIndent,
          textIndent: fragment.listMarker.textIndent,
          markerX: fragment.listMarker.markerX,
          bodyX: fragment.listMarker.bodyX,
        }
        : null,
      continuesFrom: fragment.continuesFrom ?? false,
      isContinued: fragment.isContinued ?? false,
      lineStart: fragment.lineStart ?? null,
      lineEnd: fragment.lineEnd ?? null,
    },
    node: {
      id: node.id,
      props: node.props,
      children: node.children.map((child) => (
        child.type === "text"
          ? { id: child.id, type: child.type, text: child.text, style: child.style }
          : { ...child }
      )),
    },
    options: {
      allowContinuedFirstFragment: options.allowContinuedFirstFragment ?? false,
    },
  })
}

function resolveWysiwygListBodyIndent(fragment: PageFragment, node: ParagraphNode): number | null {
  const marker = fragment.listMarker
  if (!marker) return null
  const box = resolveParagraphBoxStyle(node.props.box, fragment.width)
  const contentOriginX = fragment.x + paragraphBoxLeftInset(box)
  const bodyIndent = marker.bodyX - contentOriginX
  if (Number.isFinite(bodyIndent)) return Math.max(0, bodyIndent)
  return Math.max(0, marker.textIndent)
}

function withWysiwygListBodyIndent(fragment: PageFragment, node: ParagraphNode): ParagraphNode {
  const bodyIndent = resolveWysiwygListBodyIndent(fragment, node)
  if (bodyIndent == null) return node
  return {
    ...node,
    props: {
      ...node.props,
      indentLeft: { value: bodyIndent, unit: "pt" },
      textIndent: { value: 0, unit: "pt" },
    },
  }
}

export function buildCachedWysiwygDraftParagraphLayout(
  cache: WysiwygDraftParagraphLayoutCache,
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  textMeasurer: TextMeasurer,
  options: { allowContinuedFirstFragment?: boolean; traceMeasure?: boolean } = {},
): WysiwygDraftParagraphLayout | null {
  if (cache.nodeId !== fragment.nodeId || cache.textMeasurer !== textMeasurer) {
    cache.nodeId = fragment.nodeId
    cache.textMeasurer = textMeasurer
    cache.entries.clear()
  }

  const key = createWysiwygDraftParagraphLayoutCacheKey(fragment, node, draftText, options)
  const cached = cache.entries.get(key)
  if (cached) {
    cache.entries.delete(key)
    cache.entries.set(key, cached)
    return cloneWysiwygDraftParagraphLayout(cached)
  }

  const layout = buildWysiwygDraftParagraphLayout(fragment, node, draftText, textMeasurer, options)
  if (!layout) return null

  if (cache.entries.size >= WYSIWYG_DRAFT_PARAGRAPH_LAYOUT_CACHE_LIMIT) {
    const oldestKey = cache.entries.keys().next().value
    if (oldestKey) cache.entries.delete(oldestKey)
  }
  cache.entries.set(key, cloneWysiwygDraftParagraphLayout(layout))
  return layout
}

export function buildWysiwygDraftParagraphLayout(
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  textMeasurer: TextMeasurer,
  options: { allowContinuedFirstFragment?: boolean; traceMeasure?: boolean } = {},
): WysiwygDraftParagraphLayout | null {
  if (fragment.continuesFrom || (fragment.isContinued && !options.allowContinuedFirstFragment)) return null
  const draftNode = paragraphWithDraftText(node, draftText)
  if (!draftNode) return null
  const layoutNode = withWysiwygListBodyIndent(fragment, draftNode)
  const startedAt = options.traceMeasure ? startWysiwygPerfSpan() : null
  const measured = measureParagraph(layoutNode, fragment.width, textMeasurer)
  if (startedAt !== null) {
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "text-engine-draft-measure", startedAt, {
      nodeId: fragment.nodeId,
      pageIndex: fragment.pageIndex,
      textLength: draftText.length,
      lineCount: measured.lines.length,
      availableWidth: fragment.width,
      paragraphHeight: measured.totalHeight,
    })
  }
  return {
    lines: buildPositionedParagraphLines(measured, measured.lines, fragment.x, fragment.y, 0, layoutNode.props.align, true),
    height: measured.totalHeight,
  }
}

export function buildWysiwygDraftParagraphLines(
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  textMeasurer: TextMeasurer,
): PaginatedLine[] | null {
  return buildWysiwygDraftParagraphLayout(fragment, node, draftText, textMeasurer)?.lines ?? null
}

export function resolveWysiwygLiveTextEcho(
  baseText: string,
  draftText: string,
): WysiwygLiveTextEcho | null {
  if (baseText === draftText) return null

  let prefixLength = 0
  const maxPrefixLength = Math.min(baseText.length, draftText.length)
  while (
    prefixLength < maxPrefixLength &&
    baseText[prefixLength] === draftText[prefixLength]
  ) {
    prefixLength += 1
  }

  let baseSuffixIndex = baseText.length
  let draftSuffixIndex = draftText.length
  while (
    baseSuffixIndex > prefixLength &&
    draftSuffixIndex > prefixLength &&
    baseText[baseSuffixIndex - 1] === draftText[draftSuffixIndex - 1]
  ) {
    baseSuffixIndex -= 1
    draftSuffixIndex -= 1
  }

  const insertedText = draftText.slice(prefixLength, draftSuffixIndex)
  if (!insertedText) return null

  return {
    anchorOffset: prefixLength,
    text: insertedText,
  }
}

export function resolveWysiwygWordSelectionRange(
  text: string,
  offset: number | null,
): WysiwygTextSelection | null {
  if (!text) return null
  const safeOffset = clampWysiwygTextOffset(text, offset) ?? 0

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(["th", "en"], { granularity: "word" })
    for (const rawPart of segmenter.segment(text)) {
      const part = rawPart as { segment: string; index: number; isWordLike?: boolean }
      const start = part.index
      const end = start + part.segment.length
      if (part.isWordLike === false || !/\S/u.test(part.segment)) continue
      if ((safeOffset >= start && safeOffset < end) || (safeOffset === end && safeOffset > start)) {
        return { anchorOffset: start, focusOffset: end }
      }
    }
  }

  const probe = safeOffset < text.length && /\S/u.test(text[safeOffset] ?? "")
    ? safeOffset
    : safeOffset - 1
  if (probe < 0 || !/\S/u.test(text[probe] ?? "")) return null

  let start = probe
  while (start > 0 && /\S/u.test(text[start - 1] ?? "")) start -= 1

  let end = probe + 1
  while (end < text.length && /\S/u.test(text[end] ?? "")) end += 1

  return start < end ? { anchorOffset: start, focusOffset: end } : null
}

export function resolveWysiwygPointerSelectionState(input: {
  text: string
  anchorOffset: number
  focusOffset: number
  currentCaretOffset: number | null | undefined
  currentSelection: WysiwygTextSelection | null | undefined
}): {
  caretOffset: number
  selection: WysiwygTextSelection
  selectionRangeLength: number
  changed: boolean
} {
  const safeAnchor = clampWysiwygTextOffset(input.text, input.anchorOffset) ?? 0
  const safeFocus = clampWysiwygTextOffset(input.text, input.focusOffset) ?? safeAnchor
  const selection = { anchorOffset: safeAnchor, focusOffset: safeFocus }
  return {
    caretOffset: safeFocus,
    selection,
    selectionRangeLength: Math.abs(safeFocus - safeAnchor),
    changed: input.currentCaretOffset !== safeFocus ||
      !areWysiwygTextSelectionsEqual(input.currentSelection, selection),
  }
}

export interface WysiwygTextPointerFragmentTarget {
  pageKey: string
  fragment: PageFragment
}

export interface WysiwygTextPointerPageRect {
  left: number
  top: number
}

function distanceToFragmentRect(point: { x: number; y: number }, fragment: PageFragment): number {
  const left = fragment.x
  const right = fragment.x + fragment.width
  const top = fragment.y
  const bottom = fragment.y + Math.max(fragment.height, 1)
  const dx = point.x < left ? left - point.x : point.x > right ? point.x - right : 0
  const dy = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0
  return dx * dx + dy * dy
}

function safelySetPointerCapture(element: Element | null | undefined, pointerId: number): void {
  try {
    element?.setPointerCapture?.(pointerId)
  } catch {
    // Pointer capture is a drag continuity optimization; selection still works
    // through document-level listeners if the browser rejects capture here.
  }
}

function safelyReleasePointerCapture(element: Element | null | undefined, pointerId: number): void {
  try {
    element?.releasePointerCapture?.(pointerId)
  } catch {
    // The browser may already have released capture when pointerup/cancel fires.
  }
}

export function resolvePointerSelectionWheelScrollDelta(input: {
  deltaX: number
  deltaY: number
  deltaMode: number
  lineHeight?: number
  pageHeight?: number
}): { left: number; top: number } {
  const unit = input.deltaMode === 1
    ? input.lineHeight ?? 16
    : input.deltaMode === 2
      ? input.pageHeight ?? 800
      : 1
  return {
    left: input.deltaX * unit,
    top: input.deltaY * unit,
  }
}

export interface WysiwygCaretFollowScrollRect {
  left: number
  right: number
  top: number
  bottom: number
}

export function resolveWysiwygCaretFollowScrollDelta(input: {
  caretRect: WysiwygCaretFollowScrollRect
  viewportRect: WysiwygCaretFollowScrollRect
  margin?: number
}): { left: number; top: number } {
  const viewportWidth = Math.max(0, input.viewportRect.right - input.viewportRect.left)
  const viewportHeight = Math.max(0, input.viewportRect.bottom - input.viewportRect.top)
  const margin = Math.max(0, input.margin ?? 24)
  const horizontalMargin = Math.min(margin, viewportWidth / 2)
  const verticalMargin = Math.min(margin, viewportHeight / 2)
  const leftLimit = input.viewportRect.left + horizontalMargin
  const rightLimit = input.viewportRect.right - horizontalMargin
  const topLimit = input.viewportRect.top + verticalMargin
  const bottomLimit = input.viewportRect.bottom - verticalMargin
  let left = 0
  let top = 0

  if (input.caretRect.left < leftLimit) {
    left = input.caretRect.left - leftLimit
  } else if (input.caretRect.right > rightLimit) {
    left = input.caretRect.right - rightLimit
  }

  if (input.caretRect.top < topLimit) {
    top = input.caretRect.top - topLimit
  } else if (input.caretRect.bottom > bottomLimit) {
    top = input.caretRect.bottom - bottomLimit
  }

  return { left, top }
}

function scrollEditorCanvasByPointerSelectionWheel(input: {
  deltaX: number
  deltaY: number
  deltaMode: number
}): boolean {
  if (typeof document === "undefined") return false
  const canvas = document.querySelector<HTMLElement>('[data-testid="editor-canvas"]')
  if (!canvas) return false
  const delta = resolvePointerSelectionWheelScrollDelta({
    ...input,
    pageHeight: canvas.clientHeight,
  })
  if (delta.left === 0 && delta.top === 0) return false
  if (typeof canvas.scrollBy === "function") {
    canvas.scrollBy({ left: delta.left, top: delta.top, behavior: "auto" })
  } else {
    canvas.scrollLeft += delta.left
    canvas.scrollTop += delta.top
  }
  return true
}

function scrollWysiwygCaretIntoEditorCanvas(caret: Element | null): boolean {
  if (typeof document === "undefined" || !caret) return false
  const canvas = document.querySelector<HTMLElement>('[data-testid="editor-canvas"]')
  if (!canvas) return false
  const delta = resolveWysiwygCaretFollowScrollDelta({
    caretRect: caret.getBoundingClientRect(),
    viewportRect: canvas.getBoundingClientRect(),
  })
  if (delta.left === 0 && delta.top === 0) return false
  if (typeof canvas.scrollBy === "function") {
    canvas.scrollBy({ left: delta.left, top: delta.top, behavior: "auto" })
  } else {
    canvas.scrollLeft += delta.left
    canvas.scrollTop += delta.top
  }
  return true
}

function scrollActiveWysiwygCaretIntoEditorCanvas(layer: Element | null): boolean {
  const caret = layer?.querySelector('[data-wysiwyg-live-caret="true"], [data-wysiwyg-caret="true"]') ?? null
  return scrollWysiwygCaretIntoEditorCanvas(caret)
}

export function resolveWysiwygTextPointerOffsetFromFragmentTargets(input: {
  clientX: number
  clientY: number
  scale: number
  targets: WysiwygTextPointerFragmentTarget[]
  getPageRect: (pageKey: string) => WysiwygTextPointerPageRect | null | undefined
  textMeasurer?: TextMeasurer
}): number | null {
  let best: { offset: number; distance: number; order: number } | null = null

  for (const [order, target] of input.targets.entries()) {
    const pageRect = input.getPageRect(target.pageKey)
    if (!pageRect) continue

    const point = {
      x: (input.clientX - pageRect.left) / input.scale,
      y: (input.clientY - pageRect.top) / input.scale,
    }
    const mappedCaret = resolveCaretOffsetFromPointInFragment(target.fragment, point, {
      textMeasurer: input.textMeasurer,
    })
    if (!mappedCaret) continue

    const distance = distanceToFragmentRect(point, target.fragment)
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && order < best.order)
    ) {
      best = { offset: mappedCaret.offset, distance, order }
    }
  }

  return best?.offset ?? null
}

interface WysiwygTextLayerProps {
  fragment: PageFragment
  lines?: PaginatedLine[]
  renderProps: ParagraphRenderProps | undefined
  pageKey: string
  clipPathId?: string
  scale: number
  textMeasurer?: TextMeasurer
  caretIndex: number | null
  selection?: WysiwygTextSelection | null
  draftText?: string | null
  isListItem?: boolean
  onDraftChange?: (nodeId: string, text: string, caretIndex: number | null, selection?: WysiwygTextSelection | null) => void
  onRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onEndEdit?: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph?: (nodeId: string, splitIndex: number, text?: string) => void
  onExitListItem?: (nodeId: string, text?: string) => void
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  showTextSegments: boolean
  selectionOverlayRects?: ReturnType<typeof resolveSelectionOverlayRectsInFragment>
  pointerFragments?: WysiwygTextPointerFragmentTarget[]
  reflowKind?: WysiwygTextReflowDecision["kind"]
  liveTextEcho?: WysiwygLiveTextEcho | null
  resolveImmediateDraftLayout?: (draftText: string) => WysiwygDraftParagraphLayout | null
  tableCellDraftVisualPreviewCandidate?: boolean
  followCaretIntoView?: boolean
  suppressLiveTextEcho?: boolean
  caretVisualMode?: WysiwygCaretVisualMode
}

function measureLiveEchoTextWidth(
  text: string,
  renderProps: ParagraphRenderProps | undefined,
  line: PaginatedLine | undefined,
  textMeasurer: TextMeasurer | undefined,
): number {
  if (!text) return 0
  const fontFamilyKey = renderProps?.fontFamilyKey
  const fontSize = line?.fontSize ?? renderProps?.fontSize
  const fontVariant = resolveFontVariantKeyForStyle(renderProps?.fontWeight, renderProps?.fontStyle)
  if (textMeasurer && fontFamilyKey && fontSize) {
    return textMeasurer.measureText(text, fontFamilyKey, fontSize, fontVariant).width
  }
  return text.length * (fontSize ?? 8) * 0.5
}

function renderLiveTextEcho(
  fragment: PageFragment,
  echo: WysiwygLiveTextEcho | null | undefined,
  renderProps: ParagraphRenderProps | undefined,
  pageKey: string,
  scale: number,
  textMeasurer: TextMeasurer | undefined,
  clipPathId?: string,
  caretVisualMode: WysiwygCaretVisualMode = "idle",
): { content: React.ReactNode; caret: React.ReactNode } | null {
  if (!echo || echo.text.length === 0) return null

  const anchor = resolveCaretPositionInFragment(fragment, echo.anchorOffset, { textMeasurer })
  if (!anchor) return null

  const anchorLine = fragment.lines?.[anchor.lineIndex]
  const lineHeight = anchorLine?.height ?? renderProps?.lineHeight ?? (renderProps?.fontSize ?? 8) * 1.5
  const fontSize = (anchorLine?.fontSize ?? renderProps?.fontSize ?? 8) * scale
  const fontFamily = resolveFontCssFamily(renderProps?.fontFamilyKey)
  const fontWeight = fontWeightForRenderProps(renderProps)
  const fontStyle = fontStyleForRenderProps(renderProps)
  const textDecoration = textDecorationForRenderProps(renderProps)
  const textColor = textColorForRenderProps(renderProps)
  const parts = echo.text.split("\n")
  const continuationX = anchorLine ? lineVisualLeft(anchorLine) : fragment.x
  const clip = `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`
  const renderedLines: React.ReactNode[] = []

  let caretX = anchor.x
  let caretY = anchor.y

  parts.forEach((part, index) => {
    const x = index === 0 ? anchor.x : continuationX
    const y = anchor.y + lineHeight * index
    caretX = x + measureLiveEchoTextWidth(part, renderProps, anchorLine, textMeasurer)
    caretY = y
    if (!part) return
    renderedLines.push(
      <text
        key={`live-echo-${index}`}
        data-wysiwyg-live-echo-line="true"
        x={x * scale}
        y={(y + lineHeight * 0.78) * scale}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fontWeight={fontWeight}
        fontStyle={fontStyle}
        textDecoration={textDecoration}
        fill={textColor}
        opacity={0.88}
        xmlSpace="preserve"
        style={SVG_TEXT_PRESERVE_WHITESPACE_STYLE}
      >
        {part}
      </text>,
    )
  })

  return {
    content: renderedLines.length > 0
      ? (
        <g
          data-wysiwyg-live-echo="true"
          data-wysiwyg-live-echo-anchor={echo.anchorOffset}
          clipPath={clip}
          style={{ pointerEvents: "none" }}
        >
          {renderedLines}
        </g>
      )
      : null,
    caret: (
      <line
        key={`live-caret-${fragment.nodeId}-${echo.anchorOffset}`}
        data-wysiwyg-live-caret="true"
        data-wysiwyg-caret-mode={caretVisualMode}
        x1={caretX * scale}
        y1={caretY * scale}
        x2={caretX * scale}
        y2={(caretY + lineHeight) * scale}
        stroke={INLINE_EDIT_TEXT_COLOR}
        strokeWidth={Math.max(1, 1.1 * scale)}
        strokeLinecap="round"
        clipPath={clip}
        style={{ pointerEvents: "none" }}
      >
        {renderCaretBlinkAnimation(caretVisualMode)}
      </line>
    ),
  }
}

export function WysiwygTextLayer({
  fragment,
  lines,
  renderProps,
  pageKey,
  clipPathId,
  scale,
  textMeasurer,
  caretIndex,
  selection,
  draftText,
  isListItem = false,
  onDraftChange,
  onRichTextShortcut,
  onEndEdit,
  onSplitParagraph,
  onExitListItem,
  onChangeListItemLevel,
  onBackspaceListItemAtStart,
  showTextSegments,
  selectionOverlayRects = [],
  pointerFragments = [],
  reflowKind,
  liveTextEcho,
  resolveImmediateDraftLayout,
  tableCellDraftVisualPreviewCandidate = false,
  followCaretIntoView = false,
  suppressLiveTextEcho = false,
  caretVisualMode,
}: WysiwygTextLayerProps) {
  const layerRef = useRef<SVGGElement | null>(null)
  const inputBridgeRef = useRef<HTMLDivElement | null>(null)
  const pointerSelectionAnchorRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const pointerDragStartPointRef = useRef<{ x: number; y: number } | null>(null)
  const scheduledPointerSelectionFrameRef = useRef<number | null>(null)
  const scheduledPointerSelectionStartedAtRef = useRef<number | null>(null)
  const scheduledPointerSelectionPointRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const verticalCaretXRef = useRef<number | null>(null)
  const verticalCaretLineAffinityRef = useRef<WysiwygVerticalCaretLineAffinity | null>(null)
  const isComposingTextEngineRef = useRef(false)
  const suppressNextCompositionInputRef = useRef(false)
  const blurEndEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingCaretIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isPointerSelecting, setIsPointerSelecting] = useState(false)
  const [localCaretVisualMode, setLocalCaretVisualMode] = useState<WysiwygCaretVisualMode>("idle")
  const [localPointerSelectionPreview, setLocalPointerSelectionPreviewState] = useState<WysiwygTextSelection | null>(null)
  const localPointerSelectionPreviewRef = useRef<WysiwygTextSelection | null>(null)
  const [immediateTextEcho, setImmediateTextEcho] = useState<WysiwygImmediateTextEcho | null>(null)
  const immediateTextEchoRef = useRef<WysiwygImmediateTextEcho | null>(null)
  const [immediateDraftLayout, setImmediateDraftLayout] = useState<WysiwygImmediateDraftLayoutState | null>(null)
  const immediateDraftLayoutRef = useRef<WysiwygImmediateDraftLayoutState | null>(null)
  const isApplyingImmediateVisualStateRef = useRef(false)
  const pendingDraftSyncRef = useRef<WysiwygDraftSyncPayload | null>(null)
  const scheduledDraftSyncFrameRef = useRef<number | null>(null)
  const onDraftChangeRef = useRef(onDraftChange)
  const nodeIdRef = useRef(fragment.nodeId)
  const traceHotPathPerf = useMemo(() => (
    isWysiwygPerfTraceRuntimeEnabled(WYSIWYG_PERF_TRACE_ENABLED)
  ), [])
  const draftStateRef = useRef<{
    text: string
    caretOffset: number | null
    selection: WysiwygTextSelection | null | undefined
  }>({
    text: draftText ?? "",
    caretOffset: caretIndex,
    selection,
  })
  const activeImmediateDraftLayout = shouldKeepWysiwygImmediateDraftLayout(
    immediateDraftLayout,
    draftText ?? "",
    lines != null,
  ) ? immediateDraftLayout?.layout ?? null : null
  const visualFragment = useMemo(() => (
    activeImmediateDraftLayout
      ? { ...fragment, lines: activeImmediateDraftLayout.lines, height: activeImmediateDraftLayout.height }
      : lines
        ? { ...fragment, lines }
        : fragment
  ), [activeImmediateDraftLayout, fragment, lines])
  const pointerFragmentTargets = useMemo(() => {
    const seen = new Set<string>()
    const targets: WysiwygTextPointerFragmentTarget[] = []
    const addTarget = (target: WysiwygTextPointerFragmentTarget) => {
      const key = [
        target.pageKey,
        target.fragment.nodeId,
        target.fragment.pageIndex,
        target.fragment.fragmentIndex ?? "x",
        target.fragment.lineStart ?? "x",
        target.fragment.lineEnd ?? "x",
      ].join(":")
      if (seen.has(key)) return
      seen.add(key)
      targets.push(target)
    }

    addTarget({ pageKey, fragment: visualFragment })
    for (const target of pointerFragments) addTarget(target)
    return targets
  }, [pageKey, pointerFragments, visualFragment])
  const activeCaretVisualMode = caretVisualMode ?? localCaretVisualMode
  const liveEchoVisual = useMemo(() => (
    suppressLiveTextEcho
      ? null
      : renderLiveTextEcho(
        visualFragment,
        liveTextEcho,
        renderProps,
        pageKey,
        scale,
        textMeasurer,
        clipPathId,
        activeCaretVisualMode,
      )
  ), [activeCaretVisualMode, clipPathId, liveTextEcho, pageKey, renderProps, scale, suppressLiveTextEcho, textMeasurer, visualFragment])
  const immediateLiveTextEcho = useMemo(() => {
    if (suppressLiveTextEcho) return null
    if (activeImmediateDraftLayout) return null
    if (!immediateTextEcho) return null
    if (immediateTextEcho.draftText === (draftText ?? "") && (lines != null || liveTextEcho != null)) return null
    return resolveWysiwygLiveTextEcho(immediateTextEcho.baseText, immediateTextEcho.draftText)
  }, [activeImmediateDraftLayout, draftText, immediateTextEcho, lines, liveTextEcho, suppressLiveTextEcho])
  const immediateLiveEchoVisual = useMemo(() => renderLiveTextEcho(
    visualFragment,
    immediateLiveTextEcho,
    renderProps,
    pageKey,
    scale,
    textMeasurer,
    clipPathId,
    activeCaretVisualMode,
  ), [activeCaretVisualMode, clipPathId, immediateLiveTextEcho, pageKey, renderProps, scale, textMeasurer, visualFragment])
  const activeLiveEchoVisual = activeImmediateDraftLayout
    ? null
    : liveEchoVisual ?? immediateLiveEchoVisual

  onDraftChangeRef.current = onDraftChange
  nodeIdRef.current = fragment.nodeId

  const setLocalPointerSelectionPreview = useCallback((next: WysiwygTextSelection | null) => {
    localPointerSelectionPreviewRef.current = next
    setLocalPointerSelectionPreviewState((current) => (
      areWysiwygTextSelectionsEqual(current, next) ? current : next
    ))
  }, [])

  const cancelScheduledDraftSyncFrame = useCallback(() => {
    if (scheduledDraftSyncFrameRef.current === null) return
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scheduledDraftSyncFrameRef.current)
    }
    scheduledDraftSyncFrameRef.current = null
  }, [])

  const flushPendingDraftSync = useCallback(() => {
    cancelScheduledDraftSyncFrame()
    const pending = pendingDraftSyncRef.current
    const currentOnDraftChange = onDraftChangeRef.current
    if (!pending || !currentOnDraftChange) return false
    pendingDraftSyncRef.current = null
    currentOnDraftChange(nodeIdRef.current, pending.text, pending.caretOffset, pending.selection)
    return true
  }, [cancelScheduledDraftSyncFrame])

  const flushPendingDraftSyncImmediately = useCallback(() => {
    let flushed = false
    flushSync(() => {
      flushed = flushPendingDraftSync()
    })
    return flushed
  }, [flushPendingDraftSync])

  const scheduleDraftSync = useCallback((payload: WysiwygDraftSyncPayload, options: { defer?: boolean } = {}) => {
    const currentOnDraftChange = onDraftChangeRef.current
    if (!currentOnDraftChange) return false
    if (areWysiwygDraftSyncPayloadsEqual(pendingDraftSyncRef.current, payload)) return true
    pendingDraftSyncRef.current = payload
    if (!options.defer || typeof requestAnimationFrame !== "function") {
      flushPendingDraftSync()
      return true
    }
    if (scheduledDraftSyncFrameRef.current !== null) return true
    scheduledDraftSyncFrameRef.current = requestAnimationFrame(() => {
      scheduledDraftSyncFrameRef.current = null
      const latest = pendingDraftSyncRef.current
      if (!latest || !onDraftChangeRef.current) return
      pendingDraftSyncRef.current = null
      onDraftChangeRef.current(nodeIdRef.current, latest.text, latest.caretOffset, latest.selection)
    })
    return true
  }, [flushPendingDraftSync])

  useEffect(() => {
    const nextText = draftText ?? ""
    const pendingDraftSync = pendingDraftSyncRef.current
    const immediateDraftText = immediateDraftLayoutRef.current?.draftText ??
      immediateTextEchoRef.current?.draftText ??
      null
    const shouldPreserveLocalDraft = Boolean(
      (
        pendingDraftSync &&
        pendingDraftSync.text !== nextText &&
        draftStateRef.current.text !== nextText
      ) ||
      (
        immediateDraftText &&
        immediateDraftText !== nextText &&
        draftStateRef.current.text === immediateDraftText
      ),
    )
    if (shouldPreserveLocalDraft) return
    draftStateRef.current = {
      text: nextText,
      caretOffset: caretIndex,
      selection,
    }
    setImmediateTextEcho((current) => {
      const next = current?.draftText === nextText && (lines != null || liveTextEcho != null)
        ? null
        : current
      immediateTextEchoRef.current = next
      return next
    })
    setImmediateDraftLayout((current) => {
      const next = shouldKeepWysiwygImmediateDraftLayout(current, nextText, lines != null)
        ? current
        : null
      immediateDraftLayoutRef.current = next
      return next
    })
  }, [caretIndex, draftText, lines, liveTextEcho, selection])

  useEffect(() => {
    setLocalPointerSelectionPreview(null)
  }, [draftText, fragment.nodeId, setLocalPointerSelectionPreview])

  useEffect(() => {
    focusElementWithoutScroll(inputBridgeRef.current)
  }, [fragment.nodeId])

  useEffect(() => () => {
    if (blurEndEditTimerRef.current) {
      clearTimeout(blurEndEditTimerRef.current)
      blurEndEditTimerRef.current = null
    }
    if (typingCaretIdleTimerRef.current) {
      clearTimeout(typingCaretIdleTimerRef.current)
      typingCaretIdleTimerRef.current = null
    }
  }, [])

  useEffect(() => () => {
    flushPendingDraftSync()
  }, [flushPendingDraftSync])

  const scheduleBlurEndEdit = useCallback(() => {
    if (!onEndEdit) return
    if (blurEndEditTimerRef.current) clearTimeout(blurEndEditTimerRef.current)
    blurEndEditTimerRef.current = setTimeout(() => {
      blurEndEditTimerRef.current = null
      const activeElement = typeof document === "undefined" ? null : document.activeElement
      if (isWysiwygTextSessionFocusTarget(activeElement, fragment.nodeId)) return
      flushPendingDraftSyncImmediately()
      onEndEdit(fragment.nodeId, "blur")
    }, WYSIWYG_TEXT_BLUR_SETTLE_MS)
  }, [flushPendingDraftSyncImmediately, fragment.nodeId, onEndEdit])

  const handleLayerBlur = useCallback((event: React.FocusEvent<SVGGElement>) => {
    const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null
    if (isWysiwygTextSessionFocusTarget(relatedTarget, fragment.nodeId)) return
    scheduleBlurEndEdit()
  }, [fragment.nodeId, scheduleBlurEndEdit])

  const clearInputBridgeText = useCallback((input: HTMLElement | null = inputBridgeRef.current) => {
    if (input) input.textContent = ""
  }, [])

  const markTypingCaretActive = useCallback(() => {
    if (typingCaretIdleTimerRef.current) clearTimeout(typingCaretIdleTimerRef.current)
    setLocalCaretVisualMode("typing")
    typingCaretIdleTimerRef.current = setTimeout(() => {
      typingCaretIdleTimerRef.current = null
      setLocalCaretVisualMode("idle")
    }, WYSIWYG_TYPING_CARET_HOLD_MS)
  }, [])

  const isCompositionBridgeInput = useCallback((event: InputEvent) => (
    event.isComposing ||
    isComposingTextEngineRef.current ||
    event.inputType === "insertCompositionText" ||
    event.inputType === "deleteCompositionText"
  ), [])

  const consumeSuppressedCompositionInput = useCallback((input: HTMLElement | null) => {
    if (!suppressNextCompositionInputRef.current) return false
    suppressNextCompositionInputRef.current = false
    clearInputBridgeText(input)
    return true
  }, [clearInputBridgeText])

  const applyDraftChange = useCallback((
    change: WysiwygTextSessionDraftChange | null,
    options: { preserveVerticalCaretX?: boolean } = {},
  ) => {
    if (!change || !onDraftChange) return false
    if (!options.preserveVerticalCaretX) {
      verticalCaretXRef.current = null
      verticalCaretLineAffinityRef.current = null
    }
    const previousText = draftStateRef.current.text
    const previousCaretOffset = draftStateRef.current.caretOffset
    const previousSelection = draftStateRef.current.selection ?? null
    const nextCaretOffset = change.caretOffset ?? null
    const nextSelection = change.selection ?? null
    const textChanged = change.text !== previousText
    if (
      !textChanged &&
      previousCaretOffset === nextCaretOffset &&
      areWysiwygTextSelectionsEqual(previousSelection, nextSelection)
    ) return false
    draftStateRef.current = {
      text: change.text,
      caretOffset: nextCaretOffset,
      selection: nextSelection,
    }
    const immediateEchoBaseText = immediateTextEchoRef.current?.baseText ?? draftText ?? ""
    const nextImmediateTextEcho = change.text === immediateEchoBaseText
      ? null
      : { baseText: immediateEchoBaseText, draftText: change.text }
    const nextImmediateDraftLayout = textChanged
      ? resolveImmediateDraftLayout?.(change.text) ?? null
      : null
    const nextImmediateDraftLayoutState = nextImmediateDraftLayout
      ? { baseText: previousText, draftText: change.text, layout: nextImmediateDraftLayout }
      : null
    const previousImmediateTextEcho = immediateTextEchoRef.current
    const previousImmediateDraftLayout = immediateDraftLayoutRef.current
    const immediateVisualChanged = !areWysiwygImmediateTextEchoStatesEqual(
      previousImmediateTextEcho,
      nextImmediateTextEcho,
    ) || !areWysiwygImmediateDraftLayoutStatesEqual(
      previousImmediateDraftLayout,
      nextImmediateDraftLayoutState,
    )
    const applyImmediateVisualState = () => {
      setImmediateTextEcho((current) => (
        areWysiwygImmediateTextEchoStatesEqual(current, nextImmediateTextEcho)
          ? current
          : nextImmediateTextEcho
      ))
      setImmediateDraftLayout((current) => (
        areWysiwygImmediateDraftLayoutStatesEqual(current, nextImmediateDraftLayoutState)
          ? current
          : nextImmediateDraftLayoutState
      ))
    }
    immediateTextEchoRef.current = nextImmediateTextEcho
    immediateDraftLayoutRef.current = nextImmediateDraftLayoutState
    if (immediateVisualChanged) {
      const shouldFlush = shouldFlushWysiwygImmediateVisualState({
        previousTextEcho: previousImmediateTextEcho,
        previousDraftLayout: previousImmediateDraftLayout,
        nextTextEcho: nextImmediateTextEcho,
        nextDraftLayout: nextImmediateDraftLayoutState,
      })
      if (shouldFlush && !isApplyingImmediateVisualStateRef.current) {
        isApplyingImmediateVisualStateRef.current = true
        try {
          flushSync(applyImmediateVisualState)
        } finally {
          isApplyingImmediateVisualStateRef.current = false
        }
      } else {
        applyImmediateVisualState()
      }
    }
    scheduleDraftSync({
      text: change.text,
      caretOffset: nextCaretOffset,
      selection: nextSelection,
    }, { defer: textChanged })
    if (textChanged) markTypingCaretActive()
    return true
  }, [draftText, markTypingCaretActive, onDraftChange, resolveImmediateDraftLayout, scheduleDraftSync])

  const applyTextInput = useCallback((insertedText: string) => {
    if (!insertedText || !onDraftChange) return false
    const current = draftStateRef.current
    return applyDraftChange(applyWysiwygTextInputText(
      current.text,
      current.caretOffset,
      insertedText,
      current.selection,
    ))
  }, [applyDraftChange, onDraftChange])

  const getSelectedDraftText = useCallback(() => {
    const current = draftStateRef.current
    return getWysiwygTextSelectedText(current.text, current.caretOffset, current.selection)
  }, [])

  const getClipboardCutDraft = useCallback(() => {
    const current = draftStateRef.current
    return applyWysiwygTextClipboardCut(current.text, current.caretOffset, current.selection)
  }, [])

  const applyClipboardCutToDraft = useCallback((cut = getClipboardCutDraft()) => {
    if (!cut || !applyDraftChange(cut.change)) return null
    return cut.selectedText
  }, [applyDraftChange, getClipboardCutDraft])

  const writeClipboardText = useCallback((text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return Promise.resolve(false)
    return navigator.clipboard.writeText(text).then(() => true, () => false)
  }, [])

  const readClipboardText = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return Promise.resolve("")
    return navigator.clipboard.readText().then((text) => text, () => "")
  }, [])

  const handleClipboardShortcutKeyDown = useCallback((event: TextEngineClipboardShortcutEvent) => {
    if (!hasPlatformShortcutModifier(event)) return false
    const key = normalizeShortcutKey(event)
    if (key !== "c" && key !== "x" && key !== "v") return false

    if (key === "v") {
      event.stopPropagation()
      event.preventDefault()
      void readClipboardText().then((pastedText) => {
        clearInputBridgeText()
        applyTextInput(pastedText)
      })
      return true
    }

    const cut = key === "x" ? getClipboardCutDraft() : null
    const selectedText = cut?.selectedText ?? getSelectedDraftText()
    if (!selectedText) return false

    event.stopPropagation()
    event.preventDefault()
    void writeClipboardText(selectedText).then((written) => {
      if (written && cut) {
        applyClipboardCutToDraft(cut)
        clearInputBridgeText()
      }
    })
    return true
  }, [
    applyClipboardCutToDraft,
    applyTextInput,
    clearInputBridgeText,
    getClipboardCutDraft,
    getSelectedDraftText,
    readClipboardText,
    writeClipboardText,
  ])

  const startCompositionInput = useCallback((input: HTMLElement | null) => {
    isComposingTextEngineRef.current = true
    suppressNextCompositionInputRef.current = false
    clearInputBridgeText(input)
  }, [clearInputBridgeText])

  const endCompositionInput = useCallback((input: HTMLElement | null, committedText: string) => {
    isComposingTextEngineRef.current = false
    clearInputBridgeText(input)
    if (!committedText) {
      suppressNextCompositionInputRef.current = false
      return false
    }
    suppressNextCompositionInputRef.current = true
    return applyTextInput(committedText)
  }, [applyTextInput, clearInputBridgeText])

  const applyKeyInput = useCallback((input: {
    key: string
    shiftKey?: boolean
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    isComposing?: boolean
  }) => {
    if (!onDraftChange) return false
    const current = draftStateRef.current
    return applyDraftChange(applyWysiwygTextInputKey(current.text, current.caretOffset, input, current.selection))
  }, [applyDraftChange, onDraftChange])

  const applyVerticalKeyInput = useCallback((input: {
    key: string
    shiftKey?: boolean
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    isComposing?: boolean
  }) => {
    if (!onDraftChange) return false
    if (input.key !== "ArrowUp" && input.key !== "ArrowDown") return false
    if (input.isComposing || input.altKey || input.ctrlKey || input.metaKey) return false

    const current = draftStateRef.current
    const caretOffset = clampWysiwygTextOffset(current.text, current.caretOffset) ?? current.text.length
    const navigation = resolveVerticalCaretNavigationInFragments(
      pointerFragmentTargets.map((target) => target.fragment),
      caretOffset,
      input.key === "ArrowUp" ? "up" : "down",
      {
        preferredX: verticalCaretXRef.current,
        lineAffinity: verticalCaretLineAffinityRef.current,
        textMeasurer,
      },
    )
    if (!navigation) return false

    verticalCaretXRef.current = navigation.preferredX
    verticalCaretLineAffinityRef.current = navigation.lineAffinity
    const selectionAnchor = input.shiftKey
      ? clampWysiwygTextOffset(current.text, current.selection?.anchorOffset) ?? caretOffset
      : navigation.offset
    return applyDraftChange({
      text: current.text,
      caretOffset: navigation.offset,
      selection: {
        anchorOffset: selectionAnchor,
        focusOffset: navigation.offset,
      },
    }, { preserveVerticalCaretX: true })
  }, [applyDraftChange, onDraftChange, pointerFragmentTargets, textMeasurer])

  const resolveTextEnginePointerOffsetFromClientPoint = useCallback((clientX: number, clientY: number): number | null => {
    const startedAt = traceHotPathPerf ? startWysiwygPerfSpan() : null
    const pageElements = typeof document === "undefined"
      ? []
      : Array.from(document.querySelectorAll<SVGSVGElement>('[data-testid="editor-page"]'))

    const offset = resolveWysiwygTextPointerOffsetFromFragmentTargets({
      clientX,
      clientY,
      scale,
      targets: pointerFragmentTargets,
      textMeasurer,
      getPageRect: (targetPageKey) => {
        const target = pointerFragmentTargets.find((candidate) => candidate.pageKey === targetPageKey)
        return pageElements
          .find((pageElement) => pageElement.getAttribute("data-page-key") === targetPageKey)
          ?.getBoundingClientRect() ??
          pageElements
            .find((pageElement) => pageElement.getAttribute("data-page-index") === String(target?.fragment.pageIndex))
          ?.getBoundingClientRect()
      },
    })
    if (startedAt !== null) {
      finishWysiwygPerfSpan(true, "text-engine-pointer-hit-test", startedAt, {
        nodeId: fragment.nodeId,
        pageIndex: fragment.pageIndex,
        pointerTargetCount: pointerFragmentTargets.length,
        source: offset === null ? "miss" : "hit",
      })
    }
    return offset
  }, [fragment.nodeId, fragment.pageIndex, pointerFragmentTargets, scale, textMeasurer, traceHotPathPerf])

  const resolveTextEnginePointerOffset = useCallback((event: React.PointerEvent<SVGGElement> | React.MouseEvent<SVGGElement>): number | null => (
    resolveTextEnginePointerOffsetFromClientPoint(event.clientX, event.clientY)
  ), [resolveTextEnginePointerOffsetFromClientPoint])

  const applyPointerSelection = useCallback((anchorOffset: number, focusOffset: number, options: { syncToSession?: boolean } = {}) => {
    if (!onDraftChange) return false
    const startedAt = traceHotPathPerf ? startWysiwygPerfSpan() : null
    const syncToSession = options.syncToSession ?? true
    verticalCaretXRef.current = null
    verticalCaretLineAffinityRef.current = null
    const text = draftStateRef.current.text
    const previewSelection = localPointerSelectionPreviewRef.current
    const resolved = resolveWysiwygPointerSelectionState({
      text,
      anchorOffset,
      focusOffset,
      currentCaretOffset: syncToSession
        ? draftStateRef.current.caretOffset
        : previewSelection?.focusOffset ?? draftStateRef.current.caretOffset,
      currentSelection: syncToSession
        ? draftStateRef.current.selection
        : previewSelection ?? draftStateRef.current.selection,
    })
    if (!resolved.changed) {
      if (startedAt !== null) {
        finishWysiwygPerfSpan(true, "text-engine-pointer-selection-apply", startedAt, {
          nodeId: fragment.nodeId,
          pageIndex: fragment.pageIndex,
          textLength: text.length,
          selectionRangeLength: resolved.selectionRangeLength,
          selectionCollapsed: resolved.selection.anchorOffset === resolved.selection.focusOffset,
          source: syncToSession ? "duplicate" : "preview-duplicate",
        })
      }
      return false
    }
    if (!syncToSession) {
      setLocalPointerSelectionPreview(resolved.selection)
      if (startedAt !== null) {
        finishWysiwygPerfSpan(true, "text-engine-pointer-selection-apply", startedAt, {
          nodeId: fragment.nodeId,
          pageIndex: fragment.pageIndex,
          textLength: text.length,
          selectionRangeLength: resolved.selectionRangeLength,
          selectionCollapsed: resolved.selection.anchorOffset === resolved.selection.focusOffset,
          source: "preview",
        })
      }
      return true
    }
    setLocalPointerSelectionPreview(null)
    draftStateRef.current = {
      text,
      caretOffset: resolved.caretOffset,
      selection: resolved.selection,
    }
    onDraftChange(fragment.nodeId, text, resolved.caretOffset, resolved.selection)
    if (startedAt !== null) {
      finishWysiwygPerfSpan(true, "text-engine-pointer-selection-apply", startedAt, {
        nodeId: fragment.nodeId,
        pageIndex: fragment.pageIndex,
        textLength: text.length,
        selectionRangeLength: resolved.selectionRangeLength,
        selectionCollapsed: resolved.selection.anchorOffset === resolved.selection.focusOffset,
        source: "changed",
      })
    }
    return true
  }, [fragment.nodeId, fragment.pageIndex, onDraftChange, setLocalPointerSelectionPreview, traceHotPathPerf])

  const applyPointerSelectionFromClientPoint = useCallback((clientX: number, clientY: number, options: { syncToSession?: boolean } = {}) => {
    if (pointerSelectionAnchorRef.current === null) return false
    const offset = resolveTextEnginePointerOffsetFromClientPoint(clientX, clientY)
    if (offset === null) return false
    return applyPointerSelection(pointerSelectionAnchorRef.current, offset, options)
  }, [applyPointerSelection, resolveTextEnginePointerOffsetFromClientPoint])

  const cancelScheduledPointerSelection = useCallback(() => {
    if (scheduledPointerSelectionFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(scheduledPointerSelectionFrameRef.current)
    }
    scheduledPointerSelectionFrameRef.current = null
    scheduledPointerSelectionPointRef.current = null
    scheduledPointerSelectionStartedAtRef.current = null
  }, [])

  const schedulePointerSelectionFromClientPoint = useCallback((clientX: number, clientY: number) => {
    if (pointerSelectionAnchorRef.current === null) return false
    scheduledPointerSelectionPointRef.current = { clientX, clientY }
    if (scheduledPointerSelectionFrameRef.current !== null) return true
    scheduledPointerSelectionStartedAtRef.current = traceHotPathPerf ? startWysiwygPerfSpan() : null
    if (typeof requestAnimationFrame === "undefined") {
      scheduledPointerSelectionPointRef.current = null
      scheduledPointerSelectionStartedAtRef.current = null
      return applyPointerSelectionFromClientPoint(clientX, clientY)
    }
    scheduledPointerSelectionFrameRef.current = requestAnimationFrame(() => {
      scheduledPointerSelectionFrameRef.current = null
      const startedAt = scheduledPointerSelectionStartedAtRef.current
      scheduledPointerSelectionStartedAtRef.current = null
      const point = scheduledPointerSelectionPointRef.current
      scheduledPointerSelectionPointRef.current = null
      const applied = point ? applyPointerSelectionFromClientPoint(point.clientX, point.clientY, { syncToSession: false }) : false
      if (startedAt !== null) {
        finishWysiwygPerfSpan(true, "text-engine-pointer-frame", startedAt, {
          nodeId: fragment.nodeId,
          pageIndex: fragment.pageIndex,
          pointerTargetCount: pointerFragmentTargets.length,
          source: applied ? "applied" : "skipped",
        })
      }
    })
    return true
  }, [applyPointerSelectionFromClientPoint, fragment.nodeId, fragment.pageIndex, pointerFragmentTargets.length, traceHotPathPerf])

  const maybeStartPointerSelectionDrag = useCallback((clientX: number, clientY: number) => {
    const startPoint = pointerDragStartPointRef.current
    if (!startPoint || isPointerSelecting) return
    const dx = clientX - startPoint.x
    const dy = clientY - startPoint.y
    if (Math.sqrt(dx * dx + dy * dy) < POINTER_SELECTION_DRAG_THRESHOLD_PX) return
    setIsPointerSelecting(true)
  }, [isPointerSelecting])

  const finishPointerSelection = useCallback((clientX: number, clientY: number) => {
    cancelScheduledPointerSelection()
    applyPointerSelectionFromClientPoint(clientX, clientY)
    if (activePointerIdRef.current !== null) {
      safelyReleasePointerCapture(document.body, activePointerIdRef.current)
    }
    pointerSelectionAnchorRef.current = null
    activePointerIdRef.current = null
    pointerDragStartPointRef.current = null
    setIsPointerSelecting(false)
  }, [applyPointerSelectionFromClientPoint, cancelScheduledPointerSelection])

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (pointerSelectionAnchorRef.current === null) return
      maybeStartPointerSelectionDrag(event.clientX, event.clientY)
      event.preventDefault()
      schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
    }

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (pointerSelectionAnchorRef.current === null) return
      maybeStartPointerSelectionDrag(event.clientX, event.clientY)
      event.preventDefault()
      schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
    }

    const finishWindowPointerSelection = (event: PointerEvent) => {
      finishPointerSelection(event.clientX, event.clientY)
    }

    const finishWindowMouseSelection = (event: MouseEvent) => {
      finishPointerSelection(event.clientX, event.clientY)
    }

    window.addEventListener("pointermove", handleWindowPointerMove, true)
    window.addEventListener("pointerup", finishWindowPointerSelection, true)
    window.addEventListener("pointercancel", finishWindowPointerSelection, true)
    window.addEventListener("mousemove", handleWindowMouseMove, true)
    window.addEventListener("mouseup", finishWindowMouseSelection, true)
    document.addEventListener("pointermove", handleWindowPointerMove, true)
    document.addEventListener("pointerup", finishWindowPointerSelection, true)
    document.addEventListener("pointercancel", finishWindowPointerSelection, true)
    document.addEventListener("mousemove", handleWindowMouseMove, true)
    document.addEventListener("mouseup", finishWindowMouseSelection, true)
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true)
      window.removeEventListener("pointerup", finishWindowPointerSelection, true)
      window.removeEventListener("pointercancel", finishWindowPointerSelection, true)
      window.removeEventListener("mousemove", handleWindowMouseMove, true)
      window.removeEventListener("mouseup", finishWindowMouseSelection, true)
      document.removeEventListener("pointermove", handleWindowPointerMove, true)
      document.removeEventListener("pointerup", finishWindowPointerSelection, true)
      document.removeEventListener("pointercancel", finishWindowPointerSelection, true)
      document.removeEventListener("mousemove", handleWindowMouseMove, true)
      document.removeEventListener("mouseup", finishWindowMouseSelection, true)
    }
  }, [
    finishPointerSelection,
    maybeStartPointerSelectionDrag,
    schedulePointerSelectionFromClientPoint,
  ])

  useEffect(() => () => cancelScheduledPointerSelection(), [cancelScheduledPointerSelection])

  useEffect(() => {
    const input = inputBridgeRef.current
    if (!input) return

    const handleNativeKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === "Escape") {
        event.preventDefault()
        flushPendingDraftSyncImmediately()
        onEndEdit?.(fragment.nodeId, "keyboard")
        return
      }
      if (handleClipboardShortcutKeyDown(event)) return
      const keyInput = {
        key: normalizeWysiwygTextInputKey(event.key),
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.isComposing,
      }
      if (hasPlatformShortcutModifier(keyInput)) flushPendingDraftSyncImmediately()
      if (onRichTextShortcut?.(fragment.nodeId, keyInput)) {
        event.preventDefault()
        return
      }
      if (
        isListItem &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing &&
        !isComposingTextEngineRef.current
      ) {
        event.preventDefault()
        const current = draftStateRef.current
        const structuralInput = resolveStructuralListEnterInput(
          current.text,
          current.caretOffset,
          current.selection ?? null,
        )
        cancelScheduledDraftSyncFrame()
        pendingDraftSyncRef.current = null
        if (structuralInput.action === "exit-list") {
          onExitListItem?.(fragment.nodeId, structuralInput.text)
        } else {
          onSplitParagraph?.(fragment.nodeId, structuralInput.splitIndex, structuralInput.text)
        }
        return
      }
      const listLevelDecision = classifyInlineEditKey({
        key: event.key,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.isComposing || isComposingTextEngineRef.current,
      }, {
        listTabBehavior: isListItem ? "change-list-level" : "native",
      })
      if (listLevelDecision.action === "change-list-level") {
        event.preventDefault()
        const current = draftStateRef.current
        cancelScheduledDraftSyncFrame()
        pendingDraftSyncRef.current = null
        onChangeListItemLevel?.(
          fragment.nodeId,
          listLevelDecision.direction,
          current.text,
          current.caretOffset,
        )
        return
      }
      if (
        isListItem &&
        event.key === "Backspace" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing &&
        !isComposingTextEngineRef.current
      ) {
        const current = draftStateRef.current
        const selection = current.selection
        const isCollapsedAtStart = current.caretOffset === 0 &&
          (!selection || (selection.anchorOffset === 0 && selection.focusOffset === 0))
        if (isCollapsedAtStart) {
          event.preventDefault()
          cancelScheduledDraftSyncFrame()
          pendingDraftSyncRef.current = null
          onBackspaceListItemAtStart?.(fragment.nodeId, current.text, 0)
          return
        }
      }
      const isVerticalNavigation = event.key === "ArrowUp" || event.key === "ArrowDown"
      const handled = applyVerticalKeyInput(keyInput) || applyKeyInput(keyInput)
      if (!handled) {
        if (isVerticalNavigation) event.preventDefault()
        return
      }
      event.preventDefault()
    }

    const handleNativeBeforeInput = (event: InputEvent) => {
      event.stopPropagation()
      if (consumeSuppressedCompositionInput(input)) {
        event.preventDefault()
        return
      }
      if (isCompositionBridgeInput(event)) return
      let handled = false
      if (event.inputType === "insertText" && event.data) {
        handled = applyTextInput(event.data)
      } else if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
        handled = applyKeyInput({ key: "Enter" })
      } else if (event.inputType === "deleteContentBackward") {
        handled = applyKeyInput({ key: "Backspace" })
      } else if (event.inputType === "deleteContentForward") {
        handled = applyKeyInput({ key: "Delete" })
      }
      if (!handled) return
      event.preventDefault()
      clearInputBridgeText(input)
    }

    const handleNativeInput = (event: InputEvent) => {
      event.stopPropagation()
      if (consumeSuppressedCompositionInput(input)) return
      if (isComposingTextEngineRef.current) return
      const insertedText = input.textContent ?? ""
      clearInputBridgeText(input)
      applyTextInput(insertedText)
    }

    const handleNativePaste = (event: ClipboardEvent) => {
      event.stopPropagation()
      event.preventDefault()
      clearInputBridgeText(input)
      applyTextInput(event.clipboardData?.getData("text/plain") ?? "")
    }

    const handleNativeCopy = (event: ClipboardEvent) => {
      const selectedText = getSelectedDraftText()
      if (!selectedText || !event.clipboardData) return
      event.stopPropagation()
      event.preventDefault()
      event.clipboardData.setData("text/plain", selectedText)
    }

    const handleNativeCut = (event: ClipboardEvent) => {
      if (!event.clipboardData) return
      const selectedText = applyClipboardCutToDraft()
      if (!selectedText) return
      event.stopPropagation()
      event.preventDefault()
      event.clipboardData.setData("text/plain", selectedText)
      clearInputBridgeText(input)
    }

    const handleNativeCompositionStart = (event: CompositionEvent) => {
      event.stopPropagation()
      startCompositionInput(input)
    }

    const handleNativeCompositionEnd = (event: CompositionEvent) => {
      event.stopPropagation()
      endCompositionInput(input, event.data || input.textContent || "")
    }

    input.addEventListener("keydown", handleNativeKeyDown)
    input.addEventListener("beforeinput", handleNativeBeforeInput)
    input.addEventListener("input", handleNativeInput)
    input.addEventListener("paste", handleNativePaste)
    input.addEventListener("copy", handleNativeCopy)
    input.addEventListener("cut", handleNativeCut)
    input.addEventListener("compositionstart", handleNativeCompositionStart)
    input.addEventListener("compositionend", handleNativeCompositionEnd)
    return () => {
      input.removeEventListener("keydown", handleNativeKeyDown)
      input.removeEventListener("beforeinput", handleNativeBeforeInput)
      input.removeEventListener("input", handleNativeInput)
      input.removeEventListener("paste", handleNativePaste)
      input.removeEventListener("copy", handleNativeCopy)
      input.removeEventListener("cut", handleNativeCut)
      input.removeEventListener("compositionstart", handleNativeCompositionStart)
      input.removeEventListener("compositionend", handleNativeCompositionEnd)
    }
  }, [
    applyClipboardCutToDraft,
    applyKeyInput,
    applyVerticalKeyInput,
    applyTextInput,
    cancelScheduledDraftSyncFrame,
    clearInputBridgeText,
    consumeSuppressedCompositionInput,
    endCompositionInput,
    fragment.nodeId,
    flushPendingDraftSyncImmediately,
    getSelectedDraftText,
    handleClipboardShortcutKeyDown,
    isCompositionBridgeInput,
    isListItem,
    onBackspaceListItemAtStart,
    onChangeListItemLevel,
    onEndEdit,
    onExitListItem,
    onRichTextShortcut,
    onSplitParagraph,
    startCompositionInput,
  ])

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation()
    event.preventDefault()
    focusElementWithoutScroll(inputBridgeRef.current)
    const offset = resolveTextEnginePointerOffset(event)
    if (offset === null) return
    if (event.detail >= 2) {
      pointerSelectionAnchorRef.current = null
      const wordSelection = resolveWysiwygWordSelectionRange(draftStateRef.current.text, offset)
      if (wordSelection) {
        applyPointerSelection(wordSelection.anchorOffset, wordSelection.focusOffset)
        return
      }
    }
    pointerSelectionAnchorRef.current = offset
    activePointerIdRef.current = event.pointerId
    pointerDragStartPointRef.current = { x: event.clientX, y: event.clientY }
    applyPointerSelection(offset, offset)
  }, [applyPointerSelection, resolveTextEnginePointerOffset])

  const selectWordFromPointerEvent = useCallback((event: React.MouseEvent<SVGGElement>) => {
    focusElementWithoutScroll(inputBridgeRef.current)
    pointerSelectionAnchorRef.current = null
    const offset = resolveTextEnginePointerOffset(event)
    const wordSelection = resolveWysiwygWordSelectionRange(draftStateRef.current.text, offset)
    if (!wordSelection) return false
    return applyPointerSelection(wordSelection.anchorOffset, wordSelection.focusOffset)
  }, [applyPointerSelection, resolveTextEnginePointerOffset])

  const handleDoubleClick = useCallback((event: React.MouseEvent<SVGGElement>) => {
    event.stopPropagation()
    event.preventDefault()
    selectWordFromPointerEvent(event)
  }, [selectWordFromPointerEvent])

  const handleClick = useCallback((event: React.MouseEvent<SVGGElement>) => {
    event.stopPropagation()
    if (event.detail < 2) return
    event.preventDefault()
    selectWordFromPointerEvent(event)
  }, [selectWordFromPointerEvent])

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGGElement>) => {
    if (pointerSelectionAnchorRef.current === null || (event.buttons & 1) === 0) return
    maybeStartPointerSelectionDrag(event.clientX, event.clientY)
    event.stopPropagation()
    event.preventDefault()
    schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
  }, [maybeStartPointerSelectionDrag, schedulePointerSelectionFromClientPoint])

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGGElement>) => {
    if (pointerSelectionAnchorRef.current === null) return
    event.stopPropagation()
    finishPointerSelection(event.clientX, event.clientY)
  }, [finishPointerSelection])

  const handlePointerCancel = useCallback(() => {
    if (activePointerIdRef.current !== null) {
      safelyReleasePointerCapture(document.body, activePointerIdRef.current)
    }
    cancelScheduledPointerSelection()
    setLocalPointerSelectionPreview(null)
    pointerSelectionAnchorRef.current = null
    activePointerIdRef.current = null
    pointerDragStartPointRef.current = null
    setIsPointerSelecting(false)
  }, [cancelScheduledPointerSelection, setLocalPointerSelectionPreview])

  const handlePointerSelectionWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const scrolled = scrollEditorCanvasByPointerSelectionWheel({
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
    })
    if (!scrolled) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const localPointerSelectionOverlayRects = useMemo(() => {
    if (!localPointerSelectionPreview) return []
    if (localPointerSelectionPreview.anchorOffset === localPointerSelectionPreview.focusOffset) return []
    return resolveSelectionOverlayRectsInFragmentWithPerf({
      fragment: visualFragment,
      anchorOffset: localPointerSelectionPreview.anchorOffset,
      focusOffset: localPointerSelectionPreview.focusOffset,
      textMeasurer,
      tracePerf: traceHotPathPerf,
      source: "local-pointer",
    })
  }, [localPointerSelectionPreview, textMeasurer, traceHotPathPerf, visualFragment])
  const activeSelectionOverlayRects = localPointerSelectionPreview
    ? localPointerSelectionOverlayRects
    : selectionOverlayRects
  const activeCaretIndex = localPointerSelectionPreview?.focusOffset ?? caretIndex
  const trailingWhitespaceCaretOverlay = activeLiveEchoVisual?.caret
    ? null
    : resolveTrailingWhitespaceCaretOverlayInFragment({
      fragment: visualFragment,
      caretIndex: activeCaretIndex,
      draftText: draftStateRef.current.text,
      textMeasurer,
    })
  const caretFollowKey = useMemo(() => [
    activeCaretIndex ?? "x",
    activeCaretVisualMode,
    draftText?.length ?? 0,
    immediateTextEcho?.draftText.length ?? 0,
    immediateDraftLayout?.draftText.length ?? 0,
    visualFragment.pageIndex,
    visualFragment.fragmentIndex ?? "x",
    visualFragment.lineStart ?? "x",
    visualFragment.lineEnd ?? "x",
    visualFragment.height,
    visualFragment.lines?.length ?? 0,
    reflowKind ?? "x",
    activeImmediateDraftLayout ? "immediate" : "settled",
    activeLiveEchoVisual?.caret ? "live" : "mapped",
  ].join(":"), [
    activeCaretIndex,
    activeCaretVisualMode,
    activeImmediateDraftLayout,
    activeLiveEchoVisual?.caret,
    draftText?.length,
    immediateDraftLayout?.draftText.length,
    immediateTextEcho?.draftText.length,
    reflowKind,
    visualFragment.fragmentIndex,
    visualFragment.height,
    visualFragment.lineEnd,
    visualFragment.lineStart,
    visualFragment.lines?.length,
    visualFragment.pageIndex,
  ])

  useEffect(() => {
    if (!followCaretIntoView) return
    if (typeof requestAnimationFrame !== "function") {
      scrollActiveWysiwygCaretIntoEditorCanvas(layerRef.current)
      return
    }
    const frame = requestAnimationFrame(() => {
      scrollActiveWysiwygCaretIntoEditorCanvas(layerRef.current)
    })
    return () => cancelAnimationFrame(frame)
  }, [caretFollowKey, followCaretIntoView])

  const pointerSelectionOverlay = isPointerSelecting && typeof document !== "undefined"
    ? createPortal(
      <div
        data-wysiwyg-pointer-selection-overlay="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483647,
          cursor: "text",
          background: "transparent",
          userSelect: "none",
        }}
        onMouseMove={(event) => {
          event.preventDefault()
          schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
        }}
        onMouseUp={(event) => {
          event.preventDefault()
          finishPointerSelection(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          event.preventDefault()
          schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
        }}
        onPointerUp={(event) => {
          event.preventDefault()
          finishPointerSelection(event.clientX, event.clientY)
        }}
        onPointerCancel={() => {
          cancelScheduledPointerSelection()
          pointerSelectionAnchorRef.current = null
          activePointerIdRef.current = null
          pointerDragStartPointRef.current = null
          setIsPointerSelecting(false)
        }}
        onWheel={handlePointerSelectionWheel}
      />,
      document.body,
    )
    : null

  return (
    <>
      {pointerSelectionOverlay}
      <g
        ref={layerRef}
        data-wysiwyg-text-engine-layer="true"
        data-wysiwyg-pointer-fragment-count={pointerFragmentTargets.length}
        data-wysiwyg-reflow-kind={reflowKind}
        data-wysiwyg-caret-mode={activeCaretVisualMode}
        data-wysiwyg-line-count={visualFragment.lines?.length ?? 0}
        data-wysiwyg-immediate-draft-layout={activeImmediateDraftLayout ? "true" : undefined}
        data-wysiwyg-local-selection-preview={localPointerSelectionPreview ? "true" : undefined}
        data-wysiwyg-table-cell-preview-candidate={tableCellDraftVisualPreviewCandidate ? "true" : undefined}
        data-wysiwyg-live-echo-suppressed={suppressLiveTextEcho ? "true" : undefined}
        data-inline-edit-node-id={fragment.nodeId}
        data-inline-edit-visual-mode="text-engine"
        tabIndex={0}
        focusable="true"
        role="textbox"
        aria-multiline="true"
        aria-describedby={WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={handleDoubleClick}
        onClick={handleClick}
        onBlur={handleLayerBlur}
      >
      <foreignObject
        x={fragment.x * scale}
        y={fragment.y * scale}
        width={1}
        height={1}
        style={{ overflow: "hidden" }}
      >
        <div
          ref={inputBridgeRef}
          data-wysiwyg-input-bridge="true"
          data-inline-edit-node-id={fragment.nodeId}
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          spellCheck={false}
          aria-label="WYSIWYG text input"
          aria-describedby={WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID}
          role="textbox"
          style={{
            width: 1,
            height: 1,
            opacity: 0,
            border: 0,
            padding: 0,
            margin: 0,
            outline: "none",
            background: "transparent",
            color: "transparent",
            caretColor: "transparent",
          }}
        />
      </foreignObject>
      <rect
        data-wysiwyg-hit-area="true"
        x={visualFragment.x * scale}
        y={visualFragment.y * scale}
        width={visualFragment.width * scale}
        height={Math.max(visualFragment.height * scale, 1)}
        fill="transparent"
        pointerEvents="all"
      />
      {renderSelectionOverlay(visualFragment, pageKey, scale, activeSelectionOverlayRects, clipPathId)}
      {renderListMarker(visualFragment, renderProps, pageKey, scale, clipPathId)}
      {visualFragment.lines?.map((line, index) =>
        renderLine(line, index, visualFragment, renderProps, pageKey, scale, undefined, clipPathId),
      )}
      {activeLiveEchoVisual?.content}
      {showTextSegments && renderSegmentDebug(visualFragment.lines, visualFragment, renderProps, scale)}
      {activeLiveEchoVisual?.caret ??
        renderCollapsedCaretOverlay(visualFragment, pageKey, scale, trailingWhitespaceCaretOverlay, clipPathId, activeCaretVisualMode) ??
        renderCollapsedCaret(visualFragment, pageKey, scale, activeCaretIndex, textMeasurer, clipPathId, activeCaretVisualMode)}
      </g>
    </>
  )
}

export function ParagraphTextSurface({
  fragment,
  doc,
  pageKey,
  clipPathId,
  scale,
  visualOffsetY = 0,
  pageContentBottom,
  textMeasurer,
  isEditing,
  isVisualFresh,
  wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled,
  wysiwygTextDraftText,
  wysiwygTextCaretOffset,
  wysiwygTextSelection,
  wysiwygTextVisualDraftLines,
  wysiwygTextPointerFragments,
  wysiwygTextDraftPaginationActive = false,
  showTextSegments,
  initialCaretIndex,
  onChange,
  onCaretChange,
  onUserEditInteraction,
  onHeightChange,
  onEndEdit,
  onSplitParagraph,
  onMergeParagraph,
  onExitListItem,
  onChangeListItemLevel,
  onBackspaceListItemAtStart,
  onWysiwygTextDraftChange,
  onWysiwygRichTextShortcut,
  onWysiwygTextReflowDecision,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pointerSelectionAnchorRef = useRef<number | null>(null)
  const sliceContextRef = useRef<(ContinuationEditState & { editSliceKey: string }) | null>(null)
  const textEngineHeightRequestRef = useRef<string | null>(null)
  const textEngineReflowRequestRef = useRef<string | null>(null)
  const textEngineDraftLayoutCacheRef = useRef<WysiwygDraftParagraphLayoutCache>(createWysiwygDraftParagraphLayoutCache())
  const [isSelectionCollapsed, setIsSelectionCollapsed] = useState(true)
  const [selectionSnapshot, setSelectionSnapshot] = useState<InlineEditSelectionSnapshot | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const traceHotPathPerf = useMemo(() => (
    isWysiwygPerfTraceRuntimeEnabled(WYSIWYG_PERF_TRACE_ENABLED)
  ), [])
  const renderProps = fragment.renderProps
  const displayFragment = useMemo(() => (
    shiftFragmentVisualY(fragment, visualOffsetY)
  ), [fragment, visualOffsetY])
  const editHeight = Math.max(fragment.height * scale, 1)
  const fontSize = (renderProps?.fontSize ?? 12) * scale
  const lineHeight = (renderProps?.lineHeight ?? (renderProps?.fontSize ?? 12) * 1.5) * scale
  const spacingBeforeDoc = fragment.continuesFrom ? 0 : (renderProps?.spacingBefore ?? 0)
  const spacingAfterDoc = fragment.isContinued ? 0 : (renderProps?.spacingAfter ?? 0)
  const spacingBefore = spacingBeforeDoc * scale
  const spacingAfter = spacingAfterDoc * scale
  const minimumEditHeight = Math.max(lineHeight + spacingBefore + spacingAfter, 1)

  // For continuation fragments (page 2+), use only the text belonging to this
  // fragment so the textarea starts at the right content and the caret is
  // correctly positioned without relying on scroll (which doesn't work reliably
  // inside SVG foreignObject with overflow:hidden).
  const fullText = getEditableParagraphText(doc, fragment.nodeId)
  const paragraphNode = useMemo(() => findParagraphNode(doc, fragment.nodeId), [doc, fragment.nodeId])
  const isListItem = paragraphNode?.props.list != null
  const canPlainTextEdit = fullText !== null
  const nextEditState = getContinuationEditState(fullText ?? "", fragment, initialCaretIndex)
  const editSliceKey = buildInlineEditSliceKey(
    fragment,
    nextEditState.continuationCharStart,
  )
  if (sliceContextRef.current?.editSliceKey !== editSliceKey) {
    sliceContextRef.current = { ...nextEditState, editSliceKey }
  }
  const {
    continuationCharStart,
    continuationCharEnd,
    editText,
    preText,
    postText,
    adjustedInitialCaret,
  } = sliceContextRef.current
  const isTableCellParagraph = isParagraphInsideTableCell(doc, fragment.nodeId, fragment.parentNodeId)
  const isFlowStackParagraph = isParagraphInsideFlowStack(doc, fragment.nodeId, fragment.parentNodeId)
  const isCurrentEditSlice = useCallback((el: HTMLTextAreaElement) => (
    el.dataset.inlineEditSliceKey === editSliceKey
  ), [editSliceKey])
  const updateCaret = useCallback((el: HTMLTextAreaElement) => {
    if (!isCurrentEditSlice(el)) return
    const snapshot = getInlineEditInputSnapshot(el, preText, postText)
    setIsSelectionCollapsed(snapshot.isSelectionCollapsed)
    setSelectionSnapshot(snapshot.selection)
    onCaretChange(fragment.nodeId, snapshot.caretOffset)
  }, [fragment.nodeId, isCurrentEditSlice, onCaretChange, postText, preText])
  const markUserEditInteraction = useCallback(() => {
    onUserEditInteraction(fragment.nodeId)
  }, [fragment.nodeId, onUserEditInteraction])
  const resolveLocalOffsetFromPointer = useCallback((event: React.PointerEvent<HTMLTextAreaElement>): number | null => {
    const el = event.currentTarget
    const rect = el.getBoundingClientRect()
    const point = {
      x: displayFragment.x + (event.clientX - rect.left - EDIT_CHROME_X) / scale,
      y: displayFragment.y + (event.clientY - rect.top - EDIT_CHROME_Y) / scale,
    }
    const candidate = resolveCaretOffsetFromPointInFragment(displayFragment, point, { textMeasurer })
    if (!candidate) return null
    return Math.max(0, Math.min(editText.length, candidate.offset - preText.length))
  }, [displayFragment, editText.length, preText.length, scale, textMeasurer])

  const setTextareaPointerSelection = useCallback((
    el: HTMLTextAreaElement,
    anchor: number,
    focus: number,
  ) => {
    const start = Math.min(anchor, focus)
    const end = Math.max(anchor, focus)
    const direction = focus < anchor ? "backward" : "forward"
    el.setSelectionRange(start, end, start === end ? "none" : direction)
    updateCaret(el)
  }, [updateCaret])

  useEffect(() => {
    setIsSelectionCollapsed(true)
    setSelectionSnapshot(null)
  }, [editSliceKey])

  const editPreview = useMemo(() => {
    if (!isEditing) return null
    return { lines: displayFragment.lines ?? [], height: fragment.height }
  }, [displayFragment.lines, fragment.height, isEditing])
  const editPreviewHeight = (editPreview?.height ?? 0) * scale
  const activeEditHeight = Math.max(editHeight, minimumEditHeight, editPreviewHeight)
  const selectionOverlayRects = useMemo(() => {
    if (!selectionSnapshot || selectionSnapshot.isCollapsed) return []
    return resolveSelectionOverlayRectsInFragment(
      displayFragment,
      selectionSnapshot.anchorOffset,
      selectionSnapshot.focusOffset,
      { textMeasurer },
    )
  }, [displayFragment, selectionSnapshot, textMeasurer])
  const hasSelectionOverlay = selectionOverlayRects.length > 0
  const canUseDocumentVisual = wysiwygInlineEditEnabled && shouldUseInlineEditDocumentVisual(
    isEditing,
    isVisualFresh,
    isSelectionCollapsed,
    isComposing,
    hasSelectionOverlay,
  )
  const customCaret = useMemo(() => (
    canUseDocumentVisual && isSelectionCollapsed
      ? renderCollapsedCaret(displayFragment, pageKey, scale, initialCaretIndex, textMeasurer, clipPathId)
      : null
  ), [canUseDocumentVisual, clipPathId, displayFragment, initialCaretIndex, isSelectionCollapsed, pageKey, scale, textMeasurer])
  const visualMode = getInlineEditVisualMode({
    isEditing,
    isVisualFresh,
    isSelectionCollapsed,
    isComposing,
    hasCustomCaret: customCaret !== null,
    hasSelectionOverlay,
    isWysiwygEnabled: wysiwygInlineEditEnabled,
  })
  const supportsLocalDraftLayout = !fragment.continuesFrom && !fragment.isContinued
  const supportsPaginatedDraftLayout = wysiwygTextDraftPaginationActive
  const useWysiwygTextEngineLayer = shouldUseWysiwygTextEngineLayer({
    enabled: wysiwygTextEngineEnabled,
    isEditing,
    canPlainTextEdit,
    isVisualFresh,
    supportsLocalDraftLayout: supportsLocalDraftLayout || supportsPaginatedDraftLayout,
  })
  const textEngineDraftText = wysiwygTextDraftText ?? fullText
  const textEngineDraftChanged = hasWysiwygTextDraftChange(fullText, textEngineDraftText)
  const textEngineCaretOffset = wysiwygTextCaretOffset ?? initialCaretIndex
  const resolveTextEngineImmediateDraftLayout = useCallback((draftText: string) => {
    if (!supportsLocalDraftLayout || !useWysiwygTextEngineLayer || !paragraphNode || !textMeasurer) return null
    return buildCachedWysiwygDraftParagraphLayout(textEngineDraftLayoutCacheRef.current, fragment, paragraphNode, draftText, textMeasurer, {
      traceMeasure: true,
    })
  }, [fragment, paragraphNode, supportsLocalDraftLayout, textMeasurer, useWysiwygTextEngineLayer])
  const textEngineDraftLayout = useMemo(() => {
    if (!textEngineDraftChanged || !supportsLocalDraftLayout || !useWysiwygTextEngineLayer || !paragraphNode || textEngineDraftText == null || !textMeasurer) return null
    return buildCachedWysiwygDraftParagraphLayout(textEngineDraftLayoutCacheRef.current, fragment, paragraphNode, textEngineDraftText, textMeasurer, {
      traceMeasure: true,
    })
  }, [fragment, paragraphNode, supportsLocalDraftLayout, textEngineDraftChanged, textEngineDraftText, textMeasurer, useWysiwygTextEngineLayer])
  const textEngineDraftLines = textEngineDraftLayout?.lines ?? null
  const textEngineReflowDecision = useMemo(() => (
    classifyWysiwygTextReflow({
      fragment,
      draftLines: textEngineDraftLines ?? (supportsPaginatedDraftLayout ? fragment.lines : null),
      draftHeight: textEngineDraftLayout?.height ?? (supportsPaginatedDraftLayout ? fragment.height : null),
      pageContentBottom,
      supportsLocalDraftLayout: supportsLocalDraftLayout || supportsPaginatedDraftLayout,
      supportsSamePageHeightPatch: shouldPatchWysiwygSamePageHeight({ isTableCellParagraph }),
    })
  ), [
    fragment,
    isTableCellParagraph,
    pageContentBottom,
    supportsLocalDraftLayout,
    supportsPaginatedDraftLayout,
    textEngineDraftLayout?.height,
    textEngineDraftLines,
  ])
  const useTextEngineLocalDraftLines = shouldUseWysiwygLocalDraftLines({
    reflow: textEngineReflowDecision,
    isTableCellParagraph,
  })
  const tableCellDraftVisualPreviewCandidate = shouldPrepareWysiwygTableCellDraftVisualPreview({
    reflow: textEngineReflowDecision,
    isTableCellParagraph,
    isFlowStackParagraph,
    draftPaginationActive: wysiwygTextDraftPaginationActive,
  })
  const textEngineVisualDraftLines = useTextEngineLocalDraftLines
    ? wysiwygTextVisualDraftLines ?? textEngineDraftLines
    : null
  const textEngineLiveTextEcho = !textEngineReflowDecision.shouldPatchActiveLines &&
    fullText != null &&
    textEngineDraftText != null
    ? resolveWysiwygLiveTextEcho(fullText, textEngineDraftText)
    : null
  const textEngineSelectionOverlayRects = useMemo(() => {
    if (!useWysiwygTextEngineLayer || !wysiwygTextSelection) return []
    if (wysiwygTextSelection.anchorOffset === wysiwygTextSelection.focusOffset) return []
    const visualFragment = textEngineVisualDraftLines ? { ...displayFragment, lines: textEngineVisualDraftLines } : displayFragment
    return resolveSelectionOverlayRectsInFragmentWithPerf({
      fragment: visualFragment,
      anchorOffset: wysiwygTextSelection.anchorOffset,
      focusOffset: wysiwygTextSelection.focusOffset,
      textMeasurer,
      tracePerf: traceHotPathPerf,
      source: "active",
    })
  }, [displayFragment, textEngineVisualDraftLines, textMeasurer, traceHotPathPerf, useWysiwygTextEngineLayer, wysiwygTextSelection])
  const passiveTextEngineSelectionOverlayRects = useMemo(() => {
    if (isEditing || !wysiwygTextEngineEnabled || !wysiwygTextSelection) return []
    if (wysiwygTextSelection.anchorOffset === wysiwygTextSelection.focusOffset) return []
    const visualFragment = wysiwygTextVisualDraftLines ? { ...displayFragment, lines: wysiwygTextVisualDraftLines } : displayFragment
    return resolveSelectionOverlayRectsInFragmentWithPerf({
      fragment: visualFragment,
      anchorOffset: wysiwygTextSelection.anchorOffset,
      focusOffset: wysiwygTextSelection.focusOffset,
      textMeasurer,
      tracePerf: traceHotPathPerf,
      source: "passive",
    })
  }, [displayFragment, isEditing, textMeasurer, traceHotPathPerf, wysiwygTextEngineEnabled, wysiwygTextSelection, wysiwygTextVisualDraftLines])
  const passiveTextEngineSelectionFragment = wysiwygTextVisualDraftLines
    ? { ...displayFragment, lines: wysiwygTextVisualDraftLines }
    : displayFragment
  // The foreignObject expands by EDIT_CHROME_* for outline/click affordance.
  // Matching padding cancels that expansion so textarea content starts at the
  // same paragraph origin as SVG lines instead of drifting by the chrome size.
  const textareaPadding = `${spacingBefore + EDIT_CHROME_Y}px ${EDIT_CHROME_X}px ${spacingAfter + EDIT_CHROME_Y}px`
  const textareaContentX = displayFragment.listMarker?.bodyX ?? displayFragment.x
  const textareaContentWidth = Math.max(0, (displayFragment.x + displayFragment.width) - textareaContentX)

  const syncTextareaHeight = useCallback((el: HTMLTextAreaElement) => {
    el.scrollTop = 0
    onHeightChange(fragment.nodeId, activeEditHeight / scale, fragment.pageIndex)
  }, [activeEditHeight, fragment.nodeId, fragment.pageIndex, onHeightChange, scale])

  useEffect(() => {
    if (!isEditing || adjustedInitialCaret == null) return
    const el = textareaRef.current
    if (!el) return
    const caret = Math.min(Math.max(0, adjustedInitialCaret), el.value.length)
    requestAnimationFrame(() => {
      focusElementWithoutScroll(el)
      el.setSelectionRange(caret, caret)
      el.scrollTop = 0
    })
  }, [adjustedInitialCaret, editSliceKey, fragment.nodeId, isEditing])

  useEffect(() => {
    if (!isEditing) return
    const el = textareaRef.current
    if (!el) return
    requestAnimationFrame(() => syncTextareaHeight(el))
  }, [editHeight, isEditing, syncTextareaHeight])

  useEffect(() => {
    if (!useWysiwygTextEngineLayer || !textEngineDraftLayout) {
      textEngineHeightRequestRef.current = null
      return
    }
    if (!textEngineReflowDecision.shouldPatchSamePageHeight) {
      textEngineHeightRequestRef.current = null
      return
    }
    const height = Math.max(textEngineDraftLayout.height, minimumEditHeight / scale)
    const roundedHeight = Math.round(height * 100) / 100
    const nextKey = `${fragment.nodeId}:${fragment.pageIndex}:${textEngineReflowDecision.kind}:${roundedHeight}`
    if (textEngineHeightRequestRef.current === nextKey) return
    textEngineHeightRequestRef.current = nextKey
    onHeightChange(fragment.nodeId, height, fragment.pageIndex, textEngineReflowDecision)
  }, [
    fragment.nodeId,
    fragment.pageIndex,
    minimumEditHeight,
    onHeightChange,
    scale,
    textEngineDraftLayout,
    textEngineReflowDecision,
    useWysiwygTextEngineLayer,
  ])

  useEffect(() => {
    if (!useWysiwygTextEngineLayer) {
      textEngineReflowRequestRef.current = null
      return
    }
    const nextKey = [
      fragment.nodeId,
      fragment.pageIndex,
      textEngineReflowDecision.kind,
      textEngineReflowDecision.reason,
      textEngineDraftLayout?.height ?? "x",
      textEngineDraftLines?.length ?? "x",
      textEngineDraftText?.length ?? 0,
    ].join(":")
    if (textEngineReflowRequestRef.current === nextKey) return
    textEngineReflowRequestRef.current = nextKey
    onWysiwygTextReflowDecision?.(fragment.nodeId, textEngineReflowDecision)
  }, [
    fragment.nodeId,
    fragment.pageIndex,
    onWysiwygTextReflowDecision,
    textEngineDraftLayout?.height,
    textEngineDraftLines?.length,
    textEngineDraftText,
    textEngineReflowDecision,
    useWysiwygTextEngineLayer,
  ])
  const listMarkerVisual = renderListMarker(displayFragment, renderProps, pageKey, scale, clipPathId)

  if (isEditing && canPlainTextEdit) {
    if (useWysiwygTextEngineLayer) {
      return (
        <WysiwygTextLayer
          fragment={displayFragment}
          lines={textEngineVisualDraftLines ?? undefined}
          renderProps={renderProps}
          pageKey={pageKey}
          clipPathId={clipPathId}
          scale={scale}
          textMeasurer={textMeasurer}
          caretIndex={textEngineCaretOffset}
          selection={wysiwygTextSelection}
          draftText={textEngineDraftText}
          isListItem={isListItem}
          onDraftChange={onWysiwygTextDraftChange}
          onRichTextShortcut={onWysiwygRichTextShortcut}
          onEndEdit={onEndEdit}
          onSplitParagraph={onSplitParagraph}
          onExitListItem={onExitListItem}
          onChangeListItemLevel={onChangeListItemLevel}
          onBackspaceListItemAtStart={onBackspaceListItemAtStart}
          showTextSegments={showTextSegments}
          selectionOverlayRects={textEngineSelectionOverlayRects}
          pointerFragments={wysiwygTextPointerFragments}
          reflowKind={textEngineReflowDecision.kind}
          liveTextEcho={textEngineLiveTextEcho}
          resolveImmediateDraftLayout={resolveTextEngineImmediateDraftLayout}
          tableCellDraftVisualPreviewCandidate={tableCellDraftVisualPreviewCandidate}
          followCaretIntoView={isTableCellParagraph}
          suppressLiveTextEcho={isTableCellParagraph}
        />
      )
    }

    return (
      <>
        {listMarkerVisual}
        {visualMode.useDocumentVisual && renderSelectionOverlay(displayFragment, pageKey, scale, selectionOverlayRects, clipPathId)}
        {visualMode.useDocumentVisual && displayFragment.lines?.map((line, index) =>
          renderLine(line, index, displayFragment, renderProps, pageKey, scale, undefined, clipPathId),
        )}
        {showTextSegments && renderSegmentDebug(displayFragment.lines, displayFragment, renderProps, scale)}
        <foreignObject
          x={textareaContentX * scale - EDIT_CHROME_X}
          y={displayFragment.y * scale - EDIT_CHROME_Y}
          width={textareaContentWidth * scale + EDIT_CHROME_X * 2}
          height={activeEditHeight + EDIT_CHROME_Y * 2}
        >
          <textarea
            key={editSliceKey}
            ref={textareaRef}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...{ xmlns: "http://www.w3.org/1999/xhtml" } as any}
            autoFocus
            spellCheck={false}
            rows={1}
            defaultValue={editText}
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
              border: "none",
              borderRadius: 2,
              display: "block",
              fontFamily: resolveFontCssFamily(renderProps?.fontFamilyKey),
              fontWeight: fontWeightForRenderProps(renderProps),
              fontStyle: fontStyleForRenderProps(renderProps),
              textDecoration: textDecorationForRenderProps(renderProps),
              fontSize,
              lineHeight: `${lineHeight}px`,
              textAlign: textAlignForParagraph(renderProps?.align),
              color: visualMode.textareaTextColor,
              caretColor: visualMode.textareaCaretColor,
              resize: "none",
              overflow: "hidden",
              padding: textareaPadding,
              margin: 0,
              boxSizing: "border-box",
              outline: visualMode.textareaOutline,
              outlineOffset: visualMode.textareaOutlineOffset,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              wordBreak: "normal",
            }}
            onInput={(event) => {
              const el = event.currentTarget
              if (!isCurrentEditSlice(el)) return
              markUserEditInteraction()
              const snapshot = getInlineEditInputSnapshot(el, preText, postText)
              setIsSelectionCollapsed(snapshot.isSelectionCollapsed)
              setSelectionSnapshot(snapshot.selection)
              syncTextareaHeight(el)
              onChange(fragment.nodeId, snapshot.text, snapshot.caretOffset)
            }}
            onSelect={(event) => {
              const el = event.currentTarget
              if (!isCurrentEditSlice(el)) return
              el.scrollTop = 0
              updateCaret(el)
            }}
            onBlur={() => onEndEdit(fragment.nodeId, "blur")}
            onKeyDown={(event) => {
              event.stopPropagation()
              const el = event.currentTarget
              if (!isCurrentEditSlice(el)) return
              markUserEditInteraction()
              const decision = classifyInlineEditKey({
                key: event.key,
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                metaKey: event.metaKey,
                isComposing: event.nativeEvent.isComposing,
                selectionStart: el.selectionStart,
                selectionEnd: el.selectionEnd,
                valueLength: el.value.length,
              }, {
                plainEnterBehavior: shouldUseNativeInlineEditEnter(isListItem) ? "native" : "split-paragraph",
                listTabBehavior: isListItem ? "change-list-level" : "native",
              })

              if (decision.action === "native") return

              if (decision.action === "end-edit") {
                event.preventDefault()
                onEndEdit(fragment.nodeId, "keyboard")
                return
              }

              if (decision.action === "split-paragraph") {
                event.preventDefault()
                const snapshot = getInlineEditInputSnapshot(el, preText, postText)
                if (isListItem && snapshot.text.length === 0 && snapshot.isSelectionCollapsed) {
                  onChange(fragment.nodeId, snapshot.text, 0)
                  onExitListItem?.(fragment.nodeId, snapshot.text)
                  return
                }
                const selectionStart = el.selectionStart ?? el.value.length
                const selectionEnd = el.selectionEnd ?? selectionStart
                const input = buildSplitEditInput(preText, el.value, selectionStart, selectionEnd, postText)
                onChange(fragment.nodeId, input.text, input.splitIndex)
                onSplitParagraph(fragment.nodeId, input.splitIndex, input.text)
                return
              }

              if (decision.action === "change-list-level") {
                event.preventDefault()
                const snapshot = getInlineEditInputSnapshot(el, preText, postText)
                onChangeListItemLevel?.(
                  fragment.nodeId,
                  decision.direction,
                  snapshot.text,
                  snapshot.caretOffset,
                )
                return
              }

              if (decision.action === "merge-or-boundary-backspace") {
                const continuationBackspace = buildContinuationBackspaceInput(preText, el.value, postText)
                if (continuationBackspace) {
                  event.preventDefault()
                  onChange(fragment.nodeId, continuationBackspace.text, continuationBackspace.caretIndex)
                  return
                }

                if (isListItem) {
                  event.preventDefault()
                  const snapshot = getInlineEditInputSnapshot(el, preText, postText)
                  onChange(fragment.nodeId, snapshot.text, snapshot.caretOffset)
                  onBackspaceListItemAtStart?.(fragment.nodeId, snapshot.text, snapshot.caretOffset)
                  return
                }
                if (shouldUseNativeTableCellBoundaryBackspace(isTableCellParagraph, preText)) return
                event.preventDefault()
                onChange(fragment.nodeId, preText + el.value + postText, 0)
                onMergeParagraph(fragment.nodeId)
              }
            }}
            onKeyUp={(event) => {
              if (event.nativeEvent.isComposing) return
              updateCaret(event.currentTarget)
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              event.stopPropagation()
              if (!wysiwygInlineEditEnabled || isComposing || event.button !== 0) return
              const offset = resolveLocalOffsetFromPointer(event)
              if (offset === null) return
              event.preventDefault()
              pointerSelectionAnchorRef.current = offset
              focusElementWithoutScroll(event.currentTarget)
              event.currentTarget.setPointerCapture?.(event.pointerId)
              setTextareaPointerSelection(event.currentTarget, offset, offset)
            }}
            onPointerMove={(event) => {
              if (pointerSelectionAnchorRef.current === null || (event.buttons & 1) === 0) return
              const offset = resolveLocalOffsetFromPointer(event)
              if (offset === null) return
              event.preventDefault()
              event.stopPropagation()
              setTextareaPointerSelection(event.currentTarget, pointerSelectionAnchorRef.current, offset)
            }}
            onPointerUp={(event) => {
              if (pointerSelectionAnchorRef.current === null) return
              event.stopPropagation()
              event.currentTarget.releasePointerCapture?.(event.pointerId)
              pointerSelectionAnchorRef.current = null
            }}
            onPointerCancel={() => {
              pointerSelectionAnchorRef.current = null
            }}
            onCompositionStart={() => {
              setIsComposing(true)
              markUserEditInteraction()
            }}
            onCompositionEnd={(event) => {
              setIsComposing(false)
              updateCaret(event.currentTarget)
            }}
            data-inline-edit-node-id={fragment.nodeId}
            data-inline-edit-slice-key={editSliceKey}
            data-inline-edit-slice-start={continuationCharStart ?? 0}
            data-inline-edit-slice-end={continuationCharEnd ?? (fullText ?? "").length}
            data-wysiwyg-inline-edit-enabled={wysiwygInlineEditEnabled ? "true" : "false"}
            data-wysiwyg-text-engine-enabled={wysiwygTextEngineEnabled ? "true" : "false"}
            data-inline-edit-visual-mode={visualMode.useDocumentVisual ? "document" : "textarea"}
            data-inline-edit-fallback-reason={visualMode.fallbackReason ?? undefined}
          />
        </foreignObject>
        {customCaret}
      </>
    )
  }

  return [
    listMarkerVisual,
    ...renderSelectionOverlay(passiveTextEngineSelectionFragment, pageKey, scale, passiveTextEngineSelectionOverlayRects, clipPathId),
    ...(displayFragment.lines?.map((line, index) =>
      renderLine(line, index, displayFragment, renderProps, pageKey, scale, undefined, clipPathId),
    ) ?? []),
    ...(showTextSegments ? renderSegmentDebug(displayFragment.lines, displayFragment, renderProps, scale) ?? [] : []),
  ]
}
