import type { WysiwygDraftStoreState } from "./wysiwygDraftStore"

export function describeWysiwygDraftStoreAccessibilityStatus(
  state: Pick<WysiwygDraftStoreState, "nodeId" | "text" | "caretIndex" | "selection">,
): string | null {
  if (!state.nodeId) return null
  const textLength = state.text.length
  const caretOffset = clampTextOffset(state.text, state.caretIndex) ?? textLength
  const anchorOffset = clampTextOffset(state.text, state.selection?.anchorOffset) ?? caretOffset
  const focusOffset = clampTextOffset(state.text, state.selection?.focusOffset) ?? caretOffset
  const startOffset = Math.min(anchorOffset, focusOffset)
  const endOffset = Math.max(anchorOffset, focusOffset)
  if (startOffset !== endOffset) {
    return `Editing paragraph text. ${endOffset - startOffset} characters selected, ${startOffset} to ${endOffset} of ${textLength}.`
  }
  return `Editing paragraph text. Caret at ${caretOffset} of ${textLength}.`
}

function clampTextOffset(text: string, offset: number | null | undefined): number | null {
  if (offset == null || !Number.isFinite(offset)) return null
  return Math.max(0, Math.min(text.length, Math.trunc(offset)))
}
