import type { TextMeasurer } from "@/layout"
import type { PageFragment } from "@/pagination"
import {
  areWysiwygTextSelectionsEqual,
  clampWysiwygTextOffset,
  type WysiwygTextSelection,
} from "./useWysiwygTextSession"
import { resolveCaretOffsetFromPointInFragment } from "./wysiwygCaretMapping"

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
