import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { isPlainTextParagraph } from "@/document"
import { measureParagraph, nextTextGraphemeBoundary, previousTextGraphemeBoundary, snapToGraphemeBoundary } from "@/layout"
import type { TextMeasurer } from "@/layout"
import { buildPaginatedLines } from "@/pagination"
import type { DocumentNode, FlowTableNode, ParagraphNode, TableNode } from "@/schema"
import type { PageFragment, PaginatedLine, ParagraphRenderProps } from "@/pagination"
import { resolveFontCssFamily } from "@/font-registry"
import {
  resolveCollapsedCaretOverlayInFragment,
  resolveCaretPositionInFragment,
  resolveCaretOffsetFromPointInFragment,
  resolveSelectionOverlayRectsInFragment,
} from "./wysiwygCaretMapping"
import { classifyInlineEditKey, getInlineEditInputSnapshot } from "./wysiwygTextInteraction"
import type { InlineEditSelectionSnapshot } from "./wysiwygTextInteraction"
import {
  applyWysiwygTextClipboardCut,
  applyWysiwygTextInputKey,
  applyWysiwygTextInputText,
  clampWysiwygTextOffset,
  getWysiwygTextSelectedText,
  WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID,
} from "./useWysiwygTextSession"
import type { WysiwygTextSelection, WysiwygTextSessionDraftChange } from "./useWysiwygTextSession"
import {
  classifyWysiwygTextReflow,
  shouldPrepareWysiwygTableCellDraftVisualPreview,
  shouldUseWysiwygLocalDraftLines,
} from "./wysiwygReflow"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import { isParagraphInsideFlowStack } from "./wysiwygTextEligibility"

interface Props {
  fragment: PageFragment
  doc: DocumentNode
  pageKey: string
  scale: number
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
  onSplitParagraph: (nodeId: string, splitIndex: number) => void
  onMergeParagraph: (nodeId: string) => void
  onWysiwygTextDraftChange?: (nodeId: string, text: string, caretIndex: number | null, selection?: WysiwygTextSelection | null) => void
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

const EDIT_CHROME_X = 3
const EDIT_CHROME_Y = 3
const INLINE_EDIT_TEXT_COLOR = "#1e40af"
const POINTER_SELECTION_DRAG_THRESHOLD_PX = 3

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
      if (candidate.type !== "table" && candidate.type !== "flow-table") continue
      const inner = (candidate as unknown as TableNode | FlowTableNode).nodes[nodeId]
      if (inner?.type === "paragraph") return inner as ParagraphNode
    }
  }
  return null
}

function getEditableParagraphText(doc: DocumentNode, nodeId: string): string | null {
  const node = findParagraphNode(doc, nodeId)
  if (!node) return null
  if (!isPlainTextParagraph(node)) return null
  return node.children
    .map((child) => child.type === "text" ? child.text : "")
    .join("")
}

function isTableCellNodeId(doc: DocumentNode, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type !== "table" && node.type !== "flow-table") continue
      const inner = (node as unknown as TableNode | FlowTableNode).nodes[nodeId]
      if (inner?.type === "table-cell" || inner?.type === "flow-table-cell") return true
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
      if (node.type !== "table" && node.type !== "flow-table") continue
      const table = node as unknown as TableNode | FlowTableNode
      for (const candidate of Object.values(table.nodes)) {
        if ((candidate.type === "table-cell" || candidate.type === "flow-table-cell") && candidate.childIds.includes(nodeId)) return true
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

export function shouldUseNativeInlineEditEnter(): boolean {
  return true
}

export function shouldUseNativeTableCellBoundaryBackspace(
  isTableCellParagraph: boolean,
  preText: string,
): boolean {
  return isTableCellParagraph && preText.length === 0
}

function getFragmentTextRange(fragment: PageFragment, fullTextLength: number): { start: number; end: number } | null {
  const segments = (fragment.lines ?? []).flatMap((line) => line.segments ?? [])
  if (segments.length === 0) return null

  const start = Math.max(0, Math.min(fullTextLength, Math.min(...segments.map((segment) => segment.start))))
  const end = Math.max(start, Math.min(fullTextLength, Math.max(...segments.map((segment) => segment.end))))
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

// line.x now contains the alignment offset (baked in by buildPaginatedLines).
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
  return line.y + line.height * 0.78
}

function segmentColor(kind: NonNullable<PaginatedLine["segments"]>[number]["kind"]): string {
  if (kind === "space") return "#f59e0b"
  if (kind === "field") return "#8b5cf6"
  if (kind === "grapheme") return "#ef4444"
  return "#10b981"
}

function renderLine(
  line: PaginatedLine,
  index: number,
  fragment: PageFragment,
  renderProps: ParagraphRenderProps | undefined,
  pageKey: string,
  scale: number,
  opacity?: number,
) {
  const align = renderProps?.align
  const fontSize = (line.fontSize ?? renderProps?.fontSize ?? 8) * scale
  const baseY = lineBaselineY(line) * scale
  const fontFamily = resolveFontCssFamily(renderProps?.fontFamilyKey)
  const clip = `url(#cp-${pageKey}-${fragment.nodeId})`
  const style: React.CSSProperties = { pointerEvents: "none", userSelect: "none" }

  // Justify: draw each non-space word segment at its adjusted x position
  if (align === "justify" && line.segments?.length) {
    return (
      <g key={index} clipPath={clip} opacity={opacity} style={style}>
        {line.segments
          .filter((seg) => seg.kind !== "space" && seg.text.trim() !== "")
          .map((seg, si) => (
            <text key={si} x={(line.x + seg.x) * scale} y={baseY}
              fontSize={fontSize} fontFamily={fontFamily} fill="#1e40af">
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
      textAnchor={textAnchorForAlign(align)}
      fill="#1e40af"
      opacity={opacity}
      clipPath={clip}
      style={style}
    >
      {line.text}
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

function renderCollapsedCaret(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  caretIndex: number | null,
  textMeasurer: TextMeasurer | undefined,
) {
  if (caretIndex == null) return null
  const overlay = resolveCollapsedCaretOverlayInFragment(fragment, caretIndex, { textMeasurer })
  if (!overlay) return null

  return (
    <line
      key={`caret-${fragment.nodeId}-${overlay.offset}`}
      data-wysiwyg-caret="true"
      x1={overlay.x1 * scale}
      y1={overlay.y1 * scale}
      x2={overlay.x2 * scale}
      y2={overlay.y2 * scale}
      stroke={INLINE_EDIT_TEXT_COLOR}
      strokeWidth={Math.max(1, 1.1 * scale)}
      strokeLinecap="round"
      clipPath={`url(#cp-${pageKey}-${fragment.nodeId})`}
      style={{ pointerEvents: "none" }}
    />
  )
}

function renderSelectionOverlay(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  rects: ReturnType<typeof resolveSelectionOverlayRectsInFragment>,
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
      clipPath={`url(#cp-${pageKey}-${fragment.nodeId})`}
      style={{ pointerEvents: "none" }}
    />
  ))
}

interface TextEngineClipboardShortcutEvent {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  preventDefault: () => void
  stopPropagation: () => void
}

function paragraphWithDraftText(node: ParagraphNode, draftText: string): ParagraphNode | null {
  if (!isPlainTextParagraph(node)) return null
  const firstRun = node.children[0]
  if (!firstRun) return null
  return {
    ...node,
    children: [{ ...firstRun, text: draftText }],
  }
}

export interface WysiwygDraftParagraphLayout {
  lines: PaginatedLine[]
  height: number
}

export interface WysiwygLiveTextEcho {
  anchorOffset: number
  text: string
}

export function buildWysiwygDraftParagraphLayout(
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  textMeasurer: TextMeasurer,
  options: { allowContinuedFirstFragment?: boolean } = {},
): WysiwygDraftParagraphLayout | null {
  if (fragment.continuesFrom || (fragment.isContinued && !options.allowContinuedFirstFragment)) return null
  const draftNode = paragraphWithDraftText(node, draftText)
  if (!draftNode) return null
  const measured = measureParagraph(draftNode, fragment.width, textMeasurer)
  return {
    lines: buildPaginatedLines(
      measured.lines,
      fragment.x,
      fragment.y,
      measured.spacingBefore,
      node.props.align,
      fragment.width,
      true,
    ),
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
  scale: number
  textMeasurer?: TextMeasurer
  caretIndex: number | null
  selection?: WysiwygTextSelection | null
  draftText?: string | null
  onDraftChange?: (nodeId: string, text: string, caretIndex: number | null, selection?: WysiwygTextSelection | null) => void
  onEndEdit?: (nodeId: string, reason?: "blur" | "keyboard") => void
  showTextSegments: boolean
  selectionOverlayRects?: ReturnType<typeof resolveSelectionOverlayRectsInFragment>
  pointerFragments?: WysiwygTextPointerFragmentTarget[]
  reflowKind?: WysiwygTextReflowDecision["kind"]
  liveTextEcho?: WysiwygLiveTextEcho | null
  tableCellDraftVisualPreviewCandidate?: boolean
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
  if (textMeasurer && fontFamilyKey && fontSize) {
    return textMeasurer.measureText(text, fontFamilyKey, fontSize).width
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
): { content: React.ReactNode; caret: React.ReactNode } | null {
  if (!echo || echo.text.length === 0) return null

  const anchor = resolveCaretPositionInFragment(fragment, echo.anchorOffset, { textMeasurer })
  if (!anchor) return null

  const anchorLine = fragment.lines?.[anchor.lineIndex]
  const lineHeight = anchorLine?.height ?? renderProps?.lineHeight ?? (renderProps?.fontSize ?? 8) * 1.5
  const fontSize = (anchorLine?.fontSize ?? renderProps?.fontSize ?? 8) * scale
  const fontFamily = resolveFontCssFamily(renderProps?.fontFamilyKey)
  const parts = echo.text.split("\n")
  const continuationX = anchorLine ? lineVisualLeft(anchorLine) : fragment.x
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
        fill={INLINE_EDIT_TEXT_COLOR}
        opacity={0.88}
        style={{ pointerEvents: "none", userSelect: "none" }}
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
        x1={caretX * scale}
        y1={caretY * scale}
        x2={caretX * scale}
        y2={(caretY + lineHeight) * scale}
        stroke={INLINE_EDIT_TEXT_COLOR}
        strokeWidth={Math.max(1, 1.1 * scale)}
        strokeLinecap="round"
        style={{ pointerEvents: "none" }}
      />
    ),
  }
}

export function WysiwygTextLayer({
  fragment,
  lines,
  renderProps,
  pageKey,
  scale,
  textMeasurer,
  caretIndex,
  selection,
  draftText,
  onDraftChange,
  onEndEdit,
  showTextSegments,
  selectionOverlayRects = [],
  pointerFragments = [],
  reflowKind,
  liveTextEcho,
  tableCellDraftVisualPreviewCandidate = false,
}: WysiwygTextLayerProps) {
  const layerRef = useRef<SVGGElement | null>(null)
  const inputBridgeRef = useRef<HTMLDivElement | null>(null)
  const pointerSelectionAnchorRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const pointerDragStartPointRef = useRef<{ x: number; y: number } | null>(null)
  const isComposingTextEngineRef = useRef(false)
  const suppressNextCompositionInputRef = useRef(false)
  const [isPointerSelecting, setIsPointerSelecting] = useState(false)
  const draftStateRef = useRef<{
    text: string
    caretOffset: number | null
    selection: WysiwygTextSelection | null | undefined
  }>({
    text: draftText ?? "",
    caretOffset: caretIndex,
    selection,
  })
  const visualFragment = useMemo(() => (
    lines ? { ...fragment, lines } : fragment
  ), [fragment, lines])
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
  const liveEchoVisual = useMemo(() => renderLiveTextEcho(
    visualFragment,
    liveTextEcho,
    renderProps,
    pageKey,
    scale,
    textMeasurer,
  ), [liveTextEcho, pageKey, renderProps, scale, textMeasurer, visualFragment])

  useEffect(() => {
    draftStateRef.current = {
      text: draftText ?? "",
      caretOffset: caretIndex,
      selection,
    }
  }, [caretIndex, draftText, selection])

  useEffect(() => {
    focusElementWithoutScroll(inputBridgeRef.current)
  }, [fragment.nodeId])

  const clearInputBridgeText = useCallback((input: HTMLElement | null = inputBridgeRef.current) => {
    if (input) input.textContent = ""
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

  const applyDraftChange = useCallback((change: WysiwygTextSessionDraftChange | null) => {
    if (!change || !onDraftChange) return false
    draftStateRef.current = {
      text: change.text,
      caretOffset: change.caretOffset ?? null,
      selection: change.selection ?? null,
    }
    onDraftChange(fragment.nodeId, change.text, change.caretOffset ?? null, change.selection ?? null)
    return true
  }, [fragment.nodeId, onDraftChange])

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
    if (event.altKey || (!event.ctrlKey && !event.metaKey)) return false
    const key = event.key.toLowerCase()
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

  const resolveTextEnginePointerOffsetFromClientPoint = useCallback((clientX: number, clientY: number): number | null => {
    const pageElements = typeof document === "undefined"
      ? []
      : Array.from(document.querySelectorAll<SVGSVGElement>('[data-testid="editor-page"]'))

    return resolveWysiwygTextPointerOffsetFromFragmentTargets({
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
  }, [pointerFragmentTargets, scale, textMeasurer])

  const resolveTextEnginePointerOffset = useCallback((event: React.PointerEvent<SVGGElement> | React.MouseEvent<SVGGElement>): number | null => (
    resolveTextEnginePointerOffsetFromClientPoint(event.clientX, event.clientY)
  ), [resolveTextEnginePointerOffsetFromClientPoint])

  const applyPointerSelection = useCallback((anchorOffset: number, focusOffset: number) => {
    if (!onDraftChange) return false
    const text = draftStateRef.current.text
    const safeAnchor = clampWysiwygTextOffset(text, anchorOffset) ?? 0
    const safeFocus = clampWysiwygTextOffset(text, focusOffset) ?? safeAnchor
    const nextSelection = { anchorOffset: safeAnchor, focusOffset: safeFocus }
    draftStateRef.current = {
      text,
      caretOffset: safeFocus,
      selection: nextSelection,
    }
    onDraftChange(fragment.nodeId, text, safeFocus, nextSelection)
    return true
  }, [fragment.nodeId, onDraftChange])

  const applyPointerSelectionFromClientPoint = useCallback((clientX: number, clientY: number) => {
    if (pointerSelectionAnchorRef.current === null) return false
    const offset = resolveTextEnginePointerOffsetFromClientPoint(clientX, clientY)
    if (offset === null) return false
    return applyPointerSelection(pointerSelectionAnchorRef.current, offset)
  }, [applyPointerSelection, resolveTextEnginePointerOffsetFromClientPoint])

  const maybeStartPointerSelectionDrag = useCallback((clientX: number, clientY: number) => {
    const startPoint = pointerDragStartPointRef.current
    if (!startPoint || isPointerSelecting) return
    const dx = clientX - startPoint.x
    const dy = clientY - startPoint.y
    if (Math.sqrt(dx * dx + dy * dy) < POINTER_SELECTION_DRAG_THRESHOLD_PX) return
    setIsPointerSelecting(true)
  }, [isPointerSelecting])

  const finishPointerSelection = useCallback((clientX: number, clientY: number) => {
    applyPointerSelectionFromClientPoint(clientX, clientY)
    if (activePointerIdRef.current !== null) {
      safelyReleasePointerCapture(document.body, activePointerIdRef.current)
    }
    pointerSelectionAnchorRef.current = null
    activePointerIdRef.current = null
    pointerDragStartPointRef.current = null
    setIsPointerSelecting(false)
  }, [applyPointerSelectionFromClientPoint])

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (pointerSelectionAnchorRef.current === null) return
      maybeStartPointerSelectionDrag(event.clientX, event.clientY)
      event.preventDefault()
      applyPointerSelectionFromClientPoint(event.clientX, event.clientY)
    }

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (pointerSelectionAnchorRef.current === null) return
      maybeStartPointerSelectionDrag(event.clientX, event.clientY)
      event.preventDefault()
      applyPointerSelectionFromClientPoint(event.clientX, event.clientY)
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
    applyPointerSelectionFromClientPoint,
    finishPointerSelection,
    maybeStartPointerSelectionDrag,
  ])

  useEffect(() => {
    const input = inputBridgeRef.current
    if (!input) return

    const handleNativeKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === "Escape") {
        event.preventDefault()
        onEndEdit?.(fragment.nodeId, "keyboard")
        return
      }
      if (handleClipboardShortcutKeyDown(event)) return
      if (!applyKeyInput({
        key: event.key,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.isComposing,
      })) return
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
    applyTextInput,
    clearInputBridgeText,
    consumeSuppressedCompositionInput,
    endCompositionInput,
    fragment.nodeId,
    getSelectedDraftText,
    handleClipboardShortcutKeyDown,
    isCompositionBridgeInput,
    onEndEdit,
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
    const offset = resolveTextEnginePointerOffset(event)
    if (offset === null) return
    event.stopPropagation()
    event.preventDefault()
    applyPointerSelection(pointerSelectionAnchorRef.current, offset)
  }, [applyPointerSelection, maybeStartPointerSelectionDrag, resolveTextEnginePointerOffset])

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGGElement>) => {
    if (pointerSelectionAnchorRef.current === null) return
    event.stopPropagation()
    finishPointerSelection(event.clientX, event.clientY)
  }, [finishPointerSelection])

  const handlePointerCancel = useCallback(() => {
    if (activePointerIdRef.current !== null) {
      safelyReleasePointerCapture(document.body, activePointerIdRef.current)
    }
    pointerSelectionAnchorRef.current = null
    activePointerIdRef.current = null
    pointerDragStartPointRef.current = null
    setIsPointerSelecting(false)
  }, [])

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
          applyPointerSelectionFromClientPoint(event.clientX, event.clientY)
        }}
        onMouseUp={(event) => {
          event.preventDefault()
          finishPointerSelection(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          event.preventDefault()
          applyPointerSelectionFromClientPoint(event.clientX, event.clientY)
        }}
        onPointerUp={(event) => {
          event.preventDefault()
          finishPointerSelection(event.clientX, event.clientY)
        }}
        onPointerCancel={() => {
          pointerSelectionAnchorRef.current = null
          activePointerIdRef.current = null
          pointerDragStartPointRef.current = null
          setIsPointerSelecting(false)
        }}
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
        data-wysiwyg-table-cell-preview-candidate={tableCellDraftVisualPreviewCandidate ? "true" : undefined}
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
        onBlur={() => onEndEdit?.(fragment.nodeId, "blur")}
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
      {renderSelectionOverlay(visualFragment, pageKey, scale, selectionOverlayRects)}
      {visualFragment.lines?.map((line, index) =>
        renderLine(line, index, visualFragment, renderProps, pageKey, scale),
      )}
      {liveEchoVisual?.content}
      {showTextSegments && renderSegmentDebug(visualFragment.lines, visualFragment, renderProps, scale)}
      {liveEchoVisual?.caret ?? renderCollapsedCaret(visualFragment, pageKey, scale, caretIndex, textMeasurer)}
      </g>
    </>
  )
}

export function ParagraphTextSurface({
  fragment,
  doc,
  pageKey,
  scale,
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
  onWysiwygTextDraftChange,
  onWysiwygTextReflowDecision,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pointerSelectionAnchorRef = useRef<number | null>(null)
  const sliceContextRef = useRef<(ContinuationEditState & { editSliceKey: string }) | null>(null)
  const textEngineHeightRequestRef = useRef<string | null>(null)
  const textEngineReflowRequestRef = useRef<string | null>(null)
  const [isSelectionCollapsed, setIsSelectionCollapsed] = useState(true)
  const [selectionSnapshot, setSelectionSnapshot] = useState<InlineEditSelectionSnapshot | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const renderProps = fragment.renderProps
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
      x: fragment.x + (event.clientX - rect.left - EDIT_CHROME_X) / scale,
      y: fragment.y + (event.clientY - rect.top - EDIT_CHROME_Y) / scale,
    }
    const candidate = resolveCaretOffsetFromPointInFragment(fragment, point, { textMeasurer })
    if (!candidate) return null
    return Math.max(0, Math.min(editText.length, candidate.offset - preText.length))
  }, [editText.length, fragment, preText.length, scale, textMeasurer])

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
    return { lines: fragment.lines ?? [], height: fragment.height }
  }, [fragment.height, fragment.lines, isEditing])
  const editPreviewHeight = (editPreview?.height ?? 0) * scale
  const activeEditHeight = Math.max(editHeight, minimumEditHeight, editPreviewHeight)
  const selectionOverlayRects = useMemo(() => {
    if (!selectionSnapshot || selectionSnapshot.isCollapsed) return []
    return resolveSelectionOverlayRectsInFragment(
      fragment,
      selectionSnapshot.anchorOffset,
      selectionSnapshot.focusOffset,
      { textMeasurer },
    )
  }, [fragment, selectionSnapshot, textMeasurer])
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
      ? renderCollapsedCaret(fragment, pageKey, scale, initialCaretIndex, textMeasurer)
      : null
  ), [canUseDocumentVisual, fragment, initialCaretIndex, isSelectionCollapsed, pageKey, scale, textMeasurer])
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
  const textEngineDraftLayout = useMemo(() => {
    if (!textEngineDraftChanged || !supportsLocalDraftLayout || !useWysiwygTextEngineLayer || !paragraphNode || textEngineDraftText == null || !textMeasurer) return null
    return buildWysiwygDraftParagraphLayout(fragment, paragraphNode, textEngineDraftText, textMeasurer)
  }, [fragment, paragraphNode, supportsLocalDraftLayout, textEngineDraftChanged, textEngineDraftText, textMeasurer, useWysiwygTextEngineLayer])
  const textEngineDraftLines = textEngineDraftLayout?.lines ?? null
  const textEngineReflowDecision = useMemo(() => (
    classifyWysiwygTextReflow({
      fragment,
      draftLines: textEngineDraftLines ?? (supportsPaginatedDraftLayout ? fragment.lines : null),
      draftHeight: textEngineDraftLayout?.height ?? (supportsPaginatedDraftLayout ? fragment.height : null),
      pageContentBottom,
      supportsLocalDraftLayout: supportsLocalDraftLayout || supportsPaginatedDraftLayout,
      supportsSamePageHeightPatch: isFlowStackParagraph,
    })
  ), [
    fragment,
    isFlowStackParagraph,
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
    const visualFragment = textEngineVisualDraftLines ? { ...fragment, lines: textEngineVisualDraftLines } : fragment
    return resolveSelectionOverlayRectsInFragment(
      visualFragment,
      wysiwygTextSelection.anchorOffset,
      wysiwygTextSelection.focusOffset,
      { textMeasurer },
    )
  }, [fragment, textEngineVisualDraftLines, textMeasurer, useWysiwygTextEngineLayer, wysiwygTextSelection])
  const passiveTextEngineSelectionOverlayRects = useMemo(() => {
    if (isEditing || !wysiwygTextEngineEnabled || !wysiwygTextSelection) return []
    if (wysiwygTextSelection.anchorOffset === wysiwygTextSelection.focusOffset) return []
    const visualFragment = wysiwygTextVisualDraftLines ? { ...fragment, lines: wysiwygTextVisualDraftLines } : fragment
    return resolveSelectionOverlayRectsInFragment(
      visualFragment,
      wysiwygTextSelection.anchorOffset,
      wysiwygTextSelection.focusOffset,
      { textMeasurer },
    )
  }, [fragment, isEditing, textMeasurer, wysiwygTextEngineEnabled, wysiwygTextSelection, wysiwygTextVisualDraftLines])
  const passiveTextEngineSelectionFragment = wysiwygTextVisualDraftLines
    ? { ...fragment, lines: wysiwygTextVisualDraftLines }
    : fragment
  // The foreignObject expands by EDIT_CHROME_* for outline/click affordance.
  // Matching padding cancels that expansion so textarea content starts at the
  // same paragraph origin as SVG lines instead of drifting by the chrome size.
  const textareaPadding = `${spacingBefore + EDIT_CHROME_Y}px ${EDIT_CHROME_X}px ${spacingAfter + EDIT_CHROME_Y}px`

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

  if (isEditing && canPlainTextEdit) {
    if (useWysiwygTextEngineLayer) {
      return (
        <WysiwygTextLayer
          fragment={fragment}
          lines={textEngineVisualDraftLines ?? undefined}
          renderProps={renderProps}
          pageKey={pageKey}
          scale={scale}
          textMeasurer={textMeasurer}
          caretIndex={textEngineCaretOffset}
          selection={wysiwygTextSelection}
          draftText={textEngineDraftText}
          onDraftChange={onWysiwygTextDraftChange}
          onEndEdit={onEndEdit}
          showTextSegments={showTextSegments}
          selectionOverlayRects={textEngineSelectionOverlayRects}
          pointerFragments={wysiwygTextPointerFragments}
          reflowKind={textEngineReflowDecision.kind}
          liveTextEcho={textEngineLiveTextEcho}
          tableCellDraftVisualPreviewCandidate={tableCellDraftVisualPreviewCandidate}
        />
      )
    }

    return (
      <>
        {visualMode.useDocumentVisual && renderSelectionOverlay(fragment, pageKey, scale, selectionOverlayRects)}
        {visualMode.useDocumentVisual && fragment.lines?.map((line, index) =>
          renderLine(line, index, fragment, renderProps, pageKey, scale),
        )}
        {showTextSegments && renderSegmentDebug(fragment.lines, fragment, renderProps, scale)}
        <foreignObject
          x={fragment.x * scale - EDIT_CHROME_X}
          y={fragment.y * scale - EDIT_CHROME_Y}
          width={fragment.width * scale + EDIT_CHROME_X * 2}
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
                plainEnterBehavior: shouldUseNativeInlineEditEnter() ? "native" : "split-paragraph",
              })

              if (decision.action === "native") return

              if (decision.action === "end-edit") {
                event.preventDefault()
                onEndEdit(fragment.nodeId, "keyboard")
                return
              }

              if (decision.action === "split-paragraph") {
                event.preventDefault()
                const selectionStart = el.selectionStart ?? el.value.length
                const selectionEnd = el.selectionEnd ?? selectionStart
                const input = buildSplitEditInput(preText, el.value, selectionStart, selectionEnd, postText)
                onChange(fragment.nodeId, input.text, input.splitIndex)
                onSplitParagraph(fragment.nodeId, input.splitIndex)
                return
              }

              if (decision.action === "merge-or-boundary-backspace") {
                const continuationBackspace = buildContinuationBackspaceInput(preText, el.value, postText)
                if (continuationBackspace) {
                  event.preventDefault()
                  onChange(fragment.nodeId, continuationBackspace.text, continuationBackspace.caretIndex)
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
    ...renderSelectionOverlay(passiveTextEngineSelectionFragment, pageKey, scale, passiveTextEngineSelectionOverlayRects),
    ...(fragment.lines?.map((line, index) =>
      renderLine(line, index, fragment, renderProps, pageKey, scale),
    ) ?? []),
    ...(showTextSegments ? renderSegmentDebug(fragment.lines, fragment, renderProps, scale) ?? [] : []),
  ]
}
