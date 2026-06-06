import { getTextRunParagraphText } from "@/document"
import {
  nextTextGraphemeBoundary,
  previousTextGraphemeBoundary,
  snapToGraphemeBoundary,
} from "@/layout"
import type { PageFragment } from "@/pagination"
import type { DocumentNode, FlowTableNode, ParagraphNode } from "@/schema"
import type { WysiwygTextSelection } from "./useWysiwygTextSession"
import { getWysiwygFragmentTextRange } from "./wysiwygCaretMapping"
import { INLINE_EDIT_TEXT_COLOR } from "./WysiwygTextRenderPrimitives"

export interface ContinuationEditState {
  continuationCharStart: number | null
  continuationCharEnd: number | null
  editText: string
  preText: string
  postText: string
  adjustedInitialCaret: number | null
}

export interface SplitEditInput {
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

export const EDIT_CHROME_X = 3
export const EDIT_CHROME_Y = 3

export function resolveInlineEditTextareaPointerPagePoint(input: {
  textareaContentX: number
  fragmentY: number
  clientX: number
  clientY: number
  rectLeft: number
  rectTop: number
  scale: number
}): { x: number; y: number } {
  return {
    x: input.textareaContentX + (input.clientX - input.rectLeft - EDIT_CHROME_X) / input.scale,
    y: input.fragmentY + (input.clientY - input.rectTop - EDIT_CHROME_Y) / input.scale,
  }
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

export function isWysiwygRichTextToolbarFocusTarget(
  element: Element | null | undefined,
  nodeId: string,
): boolean {
  let current: Element | null = element ?? null
  while (current) {
    if (current.getAttribute("data-wysiwyg-rich-text-toolbar-node-id") === nodeId) {
      return true
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
  void input.isVisualFresh
  return input.enabled &&
    input.isEditing &&
    input.canPlainTextEdit &&
    (input.supportsLocalDraftLayout ?? true)
}

export function hasWysiwygTextDraftChange(
  fullText: string | null,
  draftText: string | null | undefined,
): boolean {
  return fullText != null && draftText != null && draftText !== fullText
}

export function isCollapsedWysiwygTextSelection(selection: WysiwygTextSelection | null | undefined): boolean {
  return !selection || selection.anchorOffset === selection.focusOffset
}

export function findParagraphNode(doc: DocumentNode, nodeId: string): ParagraphNode | null {
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

export function getEditableParagraphText(doc: DocumentNode, nodeId: string): string | null {
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

export function isParagraphInsideTableCell(
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
