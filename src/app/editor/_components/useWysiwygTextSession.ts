import { useCallback, useState } from "react"
import { nextTextGraphemeBoundary, previousTextGraphemeBoundary } from "@/layout"

export interface WysiwygTextSelection {
  anchorOffset: number
  focusOffset: number
}

export interface WysiwygTextSessionState {
  nodeId: string | null
  pageIndex: number | null
  baseText: string
  draftText: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null
  dirtyVersion: number
  layoutVersion: number
}

export interface WysiwygTextSessionStart {
  nodeId: string
  text: string
  caretOffset?: number | null
  pageIndex?: number | null
}

export interface WysiwygTextSessionDraftChange {
  text: string
  caretOffset?: number | null
  selection?: WysiwygTextSelection | null
}

export interface WysiwygTextClipboardCutResult {
  selectedText: string
  change: WysiwygTextSessionDraftChange
}

export interface WysiwygTextInputKey {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  isComposing?: boolean
}

export interface UseWysiwygTextSessionOptions {
  enabled: boolean
  getParagraphText: (nodeId: string) => string | null
}

export const INACTIVE_WYSIWYG_TEXT_SESSION: WysiwygTextSessionState = {
  nodeId: null,
  pageIndex: null,
  baseText: "",
  draftText: "",
  caretOffset: null,
  selection: null,
  dirtyVersion: 0,
  layoutVersion: 0,
}

export const WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID = "flowdoc-wysiwyg-text-status"

export function clampWysiwygTextOffset(text: string, offset: number | null | undefined): number | null {
  if (offset == null || !Number.isFinite(offset)) return null
  return Math.max(0, Math.min(text.length, Math.trunc(offset)))
}

export function startWysiwygTextSessionState(
  _current: WysiwygTextSessionState,
  start: WysiwygTextSessionStart,
): WysiwygTextSessionState {
  const caretOffset = clampWysiwygTextOffset(start.text, start.caretOffset)
  return {
    nodeId: start.nodeId,
    pageIndex: start.pageIndex ?? null,
    baseText: start.text,
    draftText: start.text,
    caretOffset,
    selection: caretOffset == null ? null : { anchorOffset: caretOffset, focusOffset: caretOffset },
    dirtyVersion: 0,
    layoutVersion: 0,
  }
}

export function changeWysiwygTextSessionDraft(
  current: WysiwygTextSessionState,
  change: WysiwygTextSessionDraftChange,
): WysiwygTextSessionState {
  if (!current.nodeId) return current
  const caretOffset = clampWysiwygTextOffset(change.text, change.caretOffset)
  return {
    ...current,
    draftText: change.text,
    caretOffset,
    selection: change.selection ?? (caretOffset == null ? null : { anchorOffset: caretOffset, focusOffset: caretOffset }),
    dirtyVersion: current.dirtyVersion + 1,
  }
}

export function moveWysiwygTextSessionCaret(
  current: WysiwygTextSessionState,
  caretOffset: number | null,
  selection?: WysiwygTextSelection | null,
): WysiwygTextSessionState {
  if (!current.nodeId) return current
  const safeCaret = clampWysiwygTextOffset(current.draftText, caretOffset)
  return {
    ...current,
    caretOffset: safeCaret,
    selection: selection ?? (safeCaret == null ? null : { anchorOffset: safeCaret, focusOffset: safeCaret }),
  }
}

function previousGraphemeBoundary(text: string, index: number): number {
  return previousTextGraphemeBoundary(text, index)
}

function nextGraphemeBoundary(text: string, index: number): number {
  return nextTextGraphemeBoundary(text, index)
}

function collapsedSelection(caretOffset: number): WysiwygTextSelection {
  return { anchorOffset: caretOffset, focusOffset: caretOffset }
}

function selectedRange(
  text: string,
  caretOffset: number,
  selection?: WysiwygTextSelection | null,
): { start: number; end: number; isCollapsed: boolean } {
  const anchor = clampWysiwygTextOffset(text, selection?.anchorOffset) ?? caretOffset
  const focus = clampWysiwygTextOffset(text, selection?.focusOffset) ?? caretOffset
  const start = Math.min(anchor, focus)
  const end = Math.max(anchor, focus)
  return { start, end, isCollapsed: start === end }
}

function replaceRange(
  text: string,
  start: number,
  end: number,
  replacement: string,
): WysiwygTextSessionDraftChange {
  const nextCaret = start + replacement.length
  return {
    text: text.slice(0, start) + replacement + text.slice(end),
    caretOffset: nextCaret,
    selection: collapsedSelection(nextCaret),
  }
}

// Phase B whitespace decision: tab characters convert to 3 spaces on input.
// Source: docs/WYSIWYG_WHITESPACE_MATRIX.md row 6 (Tab decision).
export const WYSIWYG_TAB_REPLACEMENT = "   "

export function normalizeWysiwygPlainTextInput(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, WYSIWYG_TAB_REPLACEMENT)
}

export function getWysiwygTextSelectedText(
  text: string,
  caretOffset: number | null,
  selection?: WysiwygTextSelection | null,
): string {
  const caret = clampWysiwygTextOffset(text, caretOffset) ?? text.length
  const range = selectedRange(text, caret, selection)
  if (range.isCollapsed) return ""
  return text.slice(range.start, range.end)
}

export function applyWysiwygTextClipboardCut(
  text: string,
  caretOffset: number | null,
  selection?: WysiwygTextSelection | null,
): WysiwygTextClipboardCutResult | null {
  const caret = clampWysiwygTextOffset(text, caretOffset) ?? text.length
  const range = selectedRange(text, caret, selection)
  if (range.isCollapsed) return null
  return {
    selectedText: text.slice(range.start, range.end),
    change: replaceRange(text, range.start, range.end, ""),
  }
}

function moveCaretByKey(
  text: string,
  caret: number,
  key: string,
  shiftKey: boolean,
  selection?: WysiwygTextSelection | null,
): WysiwygTextSessionDraftChange | null {
  const range = selectedRange(text, caret, selection)
  const focusCaret = clampWysiwygTextOffset(text, selection?.focusOffset) ?? caret
  if (shiftKey) {
    let nextFocus: number | null = null
    if (key === "ArrowLeft") nextFocus = previousGraphemeBoundary(text, focusCaret)
    else if (key === "ArrowRight") nextFocus = nextGraphemeBoundary(text, focusCaret)
    else if (key === "Home") nextFocus = 0
    else if (key === "End") nextFocus = text.length
    if (nextFocus === null) return null

    return {
      text,
      caretOffset: nextFocus,
      selection: {
        anchorOffset: clampWysiwygTextOffset(text, selection?.anchorOffset) ?? caret,
        focusOffset: nextFocus,
      },
    }
  }

  let nextCaret: number | null = null
  if (key === "ArrowLeft") nextCaret = range.isCollapsed ? previousGraphemeBoundary(text, caret) : range.start
  else if (key === "ArrowRight") nextCaret = range.isCollapsed ? nextGraphemeBoundary(text, caret) : range.end
  else if (key === "Home") nextCaret = 0
  else if (key === "End") nextCaret = text.length
  if (nextCaret === null) return null

  return {
    text,
    caretOffset: nextCaret,
    selection: collapsedSelection(nextCaret),
  }
}

export function applyWysiwygTextInputKey(
  text: string,
  caretOffset: number | null,
  input: WysiwygTextInputKey,
  selection?: WysiwygTextSelection | null,
): WysiwygTextSessionDraftChange | null {
  if (input.isComposing || input.altKey || input.ctrlKey || input.metaKey) return null
  const caret = clampWysiwygTextOffset(text, caretOffset) ?? text.length
  const range = selectedRange(text, caret, selection)

  const movement = moveCaretByKey(text, caret, input.key, input.shiftKey === true, selection)
  if (movement) return movement

  if (input.key === "Enter") {
    return replaceRange(text, range.start, range.end, "\n")
  }

  if (input.key === "Backspace") {
    if (!range.isCollapsed) return replaceRange(text, range.start, range.end, "")
    if (caret === 0) return { text, caretOffset: caret, selection: collapsedSelection(caret) }
    const start = previousGraphemeBoundary(text, caret)
    return replaceRange(text, start, caret, "")
  }

  if (input.key === "Delete") {
    if (!range.isCollapsed) return replaceRange(text, range.start, range.end, "")
    if (caret >= text.length) return { text, caretOffset: caret, selection: collapsedSelection(caret) }
    const end = nextGraphemeBoundary(text, caret)
    return replaceRange(text, caret, end, "")
  }

  if (input.key.length === 1) {
    return replaceRange(text, range.start, range.end, input.key)
  }

  return null
}

export function applyWysiwygTextInputText(
  text: string,
  caretOffset: number | null,
  insertedText: string,
  selection?: WysiwygTextSelection | null,
): WysiwygTextSessionDraftChange | null {
  const normalizedText = normalizeWysiwygPlainTextInput(insertedText)
  if (!normalizedText) return null
  const caret = clampWysiwygTextOffset(text, caretOffset) ?? text.length
  const range = selectedRange(text, caret, selection)
  return replaceRange(text, range.start, range.end, normalizedText)
}

export function markWysiwygTextLayoutFresh(
  current: WysiwygTextSessionState,
  layoutVersion: number = current.dirtyVersion,
): WysiwygTextSessionState {
  if (!current.nodeId) return current
  return {
    ...current,
    layoutVersion,
  }
}

export function endWysiwygTextSessionState(): WysiwygTextSessionState {
  return INACTIVE_WYSIWYG_TEXT_SESSION
}

export function isWysiwygTextSessionLayoutFresh(state: WysiwygTextSessionState): boolean {
  return !state.nodeId || state.layoutVersion >= state.dirtyVersion
}

export function describeWysiwygTextSessionAccessibility(state: WysiwygTextSessionState): string | null {
  if (!state.nodeId) return null
  const textLength = state.draftText.length
  const caretOffset = clampWysiwygTextOffset(state.draftText, state.caretOffset) ?? textLength
  const anchorOffset = clampWysiwygTextOffset(state.draftText, state.selection?.anchorOffset) ?? caretOffset
  const focusOffset = clampWysiwygTextOffset(state.draftText, state.selection?.focusOffset) ?? caretOffset
  const startOffset = Math.min(anchorOffset, focusOffset)
  const endOffset = Math.max(anchorOffset, focusOffset)
  if (startOffset !== endOffset) {
    return `Editing paragraph text. ${endOffset - startOffset} characters selected, ${startOffset} to ${endOffset} of ${textLength}.`
  }
  return `Editing paragraph text. Caret at ${caretOffset} of ${textLength}.`
}

export function useWysiwygTextSession({
  enabled,
  getParagraphText,
}: UseWysiwygTextSessionOptions) {
  const [state, setState] = useState<WysiwygTextSessionState>(INACTIVE_WYSIWYG_TEXT_SESSION)

  const start = useCallback((nodeId: string, caretOffset: number | null = null, pageIndex: number | null = null) => {
    if (!enabled) return false
    const text = getParagraphText(nodeId)
    if (text == null) return false
    setState((current) => startWysiwygTextSessionState(current, { nodeId, text, caretOffset, pageIndex }))
    return true
  }, [enabled, getParagraphText])

  const changeDraft = useCallback((change: WysiwygTextSessionDraftChange) => {
    if (!enabled) return
    setState((current) => changeWysiwygTextSessionDraft(current, change))
  }, [enabled])

  const moveCaret = useCallback((caretOffset: number | null, selection?: WysiwygTextSelection | null) => {
    if (!enabled) return
    setState((current) => moveWysiwygTextSessionCaret(current, caretOffset, selection))
  }, [enabled])

  const markLayoutFresh = useCallback((layoutVersion?: number) => {
    if (!enabled) return
    setState((current) => markWysiwygTextLayoutFresh(current, layoutVersion))
  }, [enabled])

  const end = useCallback(() => {
    setState(endWysiwygTextSessionState())
  }, [])

  return {
    state,
    isActive: state.nodeId !== null,
    isLayoutFresh: isWysiwygTextSessionLayoutFresh(state),
    start,
    changeDraft,
    moveCaret,
    markLayoutFresh,
    end,
  }
}
