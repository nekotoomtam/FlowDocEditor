import type { TextMeasurer } from "@/layout"
import type { PageFragment } from "@/pagination"
import { resolveFontVariantKeyForStyle } from "@/font-registry"
import { resolveCaretPositionInFragment } from "./wysiwygCaretMapping"
import type { WysiwygCollapsedCaretOverlay } from "./wysiwygCaretMapping"
import { resolvePointerSelectionWheelScrollDelta } from "./wysiwygTextSelectionState"
import { clampWysiwygTextOffset } from "./useWysiwygTextSession"

const WYSIWYG_NATIVE_HEIGHT_PREVIEW_THRESHOLD_PX = 0.5

export interface WysiwygCaretFollowScrollRect {
  left: number
  right: number
  top: number
  bottom: number
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

export function shouldApplyWysiwygNativeHeightPreview(
  previousHeightPx: number | null,
  nextHeightPx: number,
  thresholdPx = WYSIWYG_NATIVE_HEIGHT_PREVIEW_THRESHOLD_PX,
): boolean {
  return previousHeightPx == null || Math.abs(nextHeightPx - previousHeightPx) > thresholdPx
}

export function safelySetPointerCapture(element: Element | null | undefined, pointerId: number): void {
  try {
    element?.setPointerCapture?.(pointerId)
  } catch {
    // Pointer capture is a drag continuity optimization; selection still works
    // through document-level listeners if the browser rejects capture here.
  }
}

export function safelyReleasePointerCapture(element: Element | null | undefined, pointerId: number): void {
  try {
    element?.releasePointerCapture?.(pointerId)
  } catch {
    // The browser may already have released capture when pointerup/cancel fires.
  }
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

export function scrollEditorCanvasByPointerSelectionWheel(input: {
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

export function scrollActiveWysiwygCaretIntoEditorCanvas(layer: Element | null): boolean {
  const caret = layer?.querySelector('[data-wysiwyg-live-caret="true"], [data-wysiwyg-caret="true"]') ?? null
  return scrollWysiwygCaretIntoEditorCanvas(caret)
}
