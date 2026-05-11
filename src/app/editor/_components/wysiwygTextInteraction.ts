export type WysiwygNativeFallbackReason =
  | "composition"
  | "clipboard"
  | "accessibility"
  | "stale-visual"
  | "missing-geometry"

export interface WysiwygNativeFallbackState {
  isComposing?: boolean
  isClipboardOperationActive?: boolean
  requiresNativeAccessibility?: boolean
  isVisualFresh?: boolean
  hasMappingGeometry?: boolean
}

export interface WysiwygTextRange {
  anchorOffset: number
  focusOffset: number
}

export interface NormalizedWysiwygTextRange {
  anchorOffset: number
  focusOffset: number
  startOffset: number
  endOffset: number
  isCollapsed: boolean
  direction: "forward" | "backward" | "none"
}

export interface WysiwygTextReplacement {
  text: string
  caretOffset: number
  selection: NormalizedWysiwygTextRange
}

export type InlineEditKeyDecision =
  | { action: "native" }
  | { action: "end-edit"; reason: "escape" }
  | { action: "split-paragraph" }
  | { action: "merge-or-boundary-backspace" }

export interface InlineEditKeyEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  isComposing?: boolean
  selectionStart?: number | null
  selectionEnd?: number | null
  valueLength?: number
}

export type InlineEditClipboardType = "copy" | "cut" | "paste"

export interface InlineEditClipboardPolicy {
  type: InlineEditClipboardType
  handling: "native"
  preventDefault: false
}

export interface InlineEditTextareaLike {
  value: string
  selectionStart: number | null
  selectionEnd: number | null
  selectionDirection?: "forward" | "backward" | "none" | null
}

export interface InlineEditSelectionSnapshot extends NormalizedWysiwygTextRange {
  localAnchorOffset: number
  localFocusOffset: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getWysiwygNativeFallbackReasons(
  state: WysiwygNativeFallbackState,
): WysiwygNativeFallbackReason[] {
  const reasons: WysiwygNativeFallbackReason[] = []
  if (state.isComposing) reasons.push("composition")
  if (state.isClipboardOperationActive) reasons.push("clipboard")
  if (state.requiresNativeAccessibility) reasons.push("accessibility")
  if (state.isVisualFresh === false) reasons.push("stale-visual")
  if (state.hasMappingGeometry === false) reasons.push("missing-geometry")
  return reasons
}

export function shouldUseWysiwygNativeFallback(state: WysiwygNativeFallbackState): boolean {
  return getWysiwygNativeFallbackReasons(state).length > 0
}

export function normalizeWysiwygTextRange(
  range: WysiwygTextRange,
  textLength: number,
): NormalizedWysiwygTextRange {
  const safeTextLength = Math.max(0, textLength)
  const anchorOffset = clamp(range.anchorOffset, 0, safeTextLength)
  const focusOffset = clamp(range.focusOffset, 0, safeTextLength)
  const startOffset = Math.min(anchorOffset, focusOffset)
  const endOffset = Math.max(anchorOffset, focusOffset)
  return {
    anchorOffset,
    focusOffset,
    startOffset,
    endOffset,
    isCollapsed: startOffset === endOffset,
    direction: anchorOffset === focusOffset
      ? "none"
      : anchorOffset < focusOffset ? "forward" : "backward",
  }
}

export function getWysiwygSelectedText(text: string, range: WysiwygTextRange): string {
  const normalized = normalizeWysiwygTextRange(range, text.length)
  return text.slice(normalized.startOffset, normalized.endOffset)
}

export function replaceWysiwygTextRange(
  text: string,
  range: WysiwygTextRange,
  replacement: string,
): WysiwygTextReplacement {
  const normalized = normalizeWysiwygTextRange(range, text.length)
  const nextText = text.slice(0, normalized.startOffset) + replacement + text.slice(normalized.endOffset)
  const caretOffset = normalized.startOffset + replacement.length
  return {
    text: nextText,
    caretOffset,
    selection: normalizeWysiwygTextRange(
      { anchorOffset: caretOffset, focusOffset: caretOffset },
      nextText.length,
    ),
  }
}

function hasPlainKeyModifiers(event: InlineEditKeyEventLike): boolean {
  return !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
}

export function classifyInlineEditKey(event: InlineEditKeyEventLike): InlineEditKeyDecision {
  if (event.isComposing) return { action: "native" }

  if (event.key === "Escape") return { action: "end-edit", reason: "escape" }

  if (event.key === "Enter" && hasPlainKeyModifiers(event)) {
    return { action: "split-paragraph" }
  }

  if (event.key === "Backspace" && hasPlainKeyModifiers(event)) {
    const valueLength = Math.max(0, event.valueLength ?? 0)
    const selectionStart = clamp(event.selectionStart ?? valueLength, 0, valueLength)
    const selectionEnd = clamp(event.selectionEnd ?? selectionStart, 0, valueLength)
    if (selectionStart === 0 && selectionEnd === 0) {
      return { action: "merge-or-boundary-backspace" }
    }
  }

  return { action: "native" }
}

export function getInlineEditClipboardPolicy(type: InlineEditClipboardType): InlineEditClipboardPolicy {
  return {
    type,
    handling: "native",
    preventDefault: false,
  }
}

export function getInlineEditSelectionSnapshot(
  textarea: InlineEditTextareaLike,
  preText: string,
): InlineEditSelectionSnapshot {
  const localStart = clamp(textarea.selectionStart ?? textarea.value.length, 0, textarea.value.length)
  const localEnd = clamp(textarea.selectionEnd ?? localStart, localStart, textarea.value.length)
  const isBackward = textarea.selectionDirection === "backward"
  const localAnchorOffset = isBackward ? localEnd : localStart
  const localFocusOffset = isBackward ? localStart : localEnd
  const localRange = normalizeWysiwygTextRange({
    anchorOffset: localAnchorOffset,
    focusOffset: localFocusOffset,
  }, textarea.value.length)

  const range = normalizeWysiwygTextRange({
    anchorOffset: preText.length + localRange.anchorOffset,
    focusOffset: preText.length + localRange.focusOffset,
  }, preText.length + textarea.value.length)

  return {
    ...range,
    direction: textarea.selectionDirection ?? range.direction,
    localAnchorOffset: localRange.anchorOffset,
    localFocusOffset: localRange.focusOffset,
  }
}
