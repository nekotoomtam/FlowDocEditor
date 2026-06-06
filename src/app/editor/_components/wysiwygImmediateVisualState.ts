import type { WysiwygDraftParagraphLayout } from "./wysiwygDraftParagraphLayout"

export interface WysiwygLiveTextEcho {
  anchorOffset: number
  text: string
}

export interface WysiwygImmediateTextEcho {
  baseText: string
  draftText: string
}

export interface WysiwygImmediateDraftLayoutState {
  baseText: string
  draftText: string
  layout: WysiwygDraftParagraphLayout
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
