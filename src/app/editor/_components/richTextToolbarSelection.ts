import type { WysiwygTextSelection } from "./useWysiwygTextSession"

export const RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS = 120
export const RICH_TEXT_TOOLBAR_SELECTION_MAX_WAIT_MS = 250

export interface RichTextToolbarSelectionSnapshot {
  nodeId: string | null
  anchorOffset: number
  focusOffset: number
}

export function resolveRichTextToolbarSelectionSnapshot(
  nodeId: string | null | undefined,
  selection: WysiwygTextSelection | null | undefined,
): RichTextToolbarSelectionSnapshot | null {
  if (!nodeId || !selection) return null
  return {
    nodeId,
    anchorOffset: selection.anchorOffset,
    focusOffset: selection.focusOffset,
  }
}

export function areRichTextToolbarSelectionsEqual(
  a: RichTextToolbarSelectionSnapshot | null | undefined,
  b: RichTextToolbarSelectionSnapshot | null | undefined,
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.nodeId === b.nodeId &&
    a.anchorOffset === b.anchorOffset &&
    a.focusOffset === b.focusOffset
}

export function shouldDebounceRichTextToolbarSelection(
  selection: RichTextToolbarSelectionSnapshot | null | undefined,
): boolean {
  return Boolean(selection)
}
