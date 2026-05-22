import type { ParagraphNode, TextRunStyle } from "../schema"
import {
  applyTextRunStyleRangeToParagraph,
  replaceTextRunRangeInParagraph,
  type TextRunStylePatch,
} from "./richText"

export interface RichTextDraftSelection {
  anchorOffset: number
  focusOffset: number
}

export interface RichTextDraftState {
  paragraph: ParagraphNode
  selection: RichTextDraftSelection
  pendingStyle?: TextRunStyle
}

export interface RichTextDraftFragment {
  text: string
  style?: TextRunStyle
}

function clonePlainData<T>(value: T): T {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function draftPlainText(paragraph: ParagraphNode): string {
  return paragraph.children.map((child) => child.type === "text" ? child.text : "").join("")
}

function textLength(paragraph: ParagraphNode): number {
  return draftPlainText(paragraph).length
}

function normalizeSelection(
  paragraph: ParagraphNode,
  selection: RichTextDraftSelection,
): { start: number; end: number; collapsed: boolean } | null {
  if (!Number.isFinite(selection.anchorOffset) || !Number.isFinite(selection.focusOffset)) return null
  const maxLength = textLength(paragraph)
  const anchor = Math.trunc(selection.anchorOffset)
  const focus = Math.trunc(selection.focusOffset)
  const start = Math.max(0, Math.min(Math.min(anchor, focus), maxLength))
  const end = Math.max(0, Math.min(Math.max(anchor, focus), maxLength))
  return { start, end, collapsed: start === end }
}

function authoredTextStyleAtOffset(paragraph: ParagraphNode, offset: number): TextRunStyle | undefined {
  let cursor = 0
  let previousStyle: TextRunStyle | undefined
  let hasPreviousTextRun = false
  let firstStyle: TextRunStyle | undefined
  let hasFirstTextRun = false

  for (const child of paragraph.children) {
    if (child.type !== "text") continue
    if (!hasFirstTextRun && child.text.length > 0) {
      firstStyle = child.style
      hasFirstTextRun = true
    }
    const runStart = cursor
    const runEnd = runStart + child.text.length
    if (offset === runStart && hasPreviousTextRun) return clonePlainData(previousStyle)
    if (offset >= runStart && offset < runEnd) return clonePlainData(child.style)
    if (offset === runEnd && child.text.length > 0) {
      previousStyle = child.style
      hasPreviousTextRun = true
    }
    cursor = runEnd
  }

  return clonePlainData(previousStyle ?? firstStyle)
}

function applyStylePatch(style: TextRunStyle | undefined, patch: TextRunStylePatch): TextRunStyle | undefined {
  const next: TextRunStyle = clonePlainData(style ?? {})

  if (Object.prototype.hasOwnProperty.call(patch, "fontSize")) {
    if (patch.fontSize == null) delete next.fontSize
    else next.fontSize = clonePlainData(patch.fontSize)
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontFamilyKey")) {
    if (patch.fontFamilyKey == null) delete next.fontFamilyKey
    else next.fontFamilyKey = patch.fontFamilyKey
  }
  if (Object.prototype.hasOwnProperty.call(patch, "textColor")) {
    if (patch.textColor == null) delete next.textColor
    else next.textColor = patch.textColor
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontWeight")) {
    if (patch.fontWeight == null) delete next.fontWeight
    else next.fontWeight = patch.fontWeight
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontStyle")) {
    if (patch.fontStyle == null) delete next.fontStyle
    else next.fontStyle = patch.fontStyle
  }
  if (Object.prototype.hasOwnProperty.call(patch, "textDecoration")) {
    if (patch.textDecoration == null) delete next.textDecoration
    else next.textDecoration = patch.textDecoration
  }
  if (Object.prototype.hasOwnProperty.call(patch, "strikethrough")) {
    if (patch.strikethrough == null) delete next.strikethrough
    else next.strikethrough = patch.strikethrough
  }

  return Object.keys(next).length > 0 ? next : undefined
}

function isEmptyStylePatch(patch: TextRunStylePatch): boolean {
  return Object.keys(patch).length === 0
}

export function createRichTextDraft(
  paragraph: ParagraphNode,
  selection: RichTextDraftSelection = { anchorOffset: 0, focusOffset: 0 },
): RichTextDraftState {
  const normalized = normalizeSelection(paragraph, selection) ?? { start: 0, end: 0 }
  return {
    paragraph,
    selection: { anchorOffset: normalized.start, focusOffset: normalized.end },
  }
}

export function getRichTextDraftPlainText(draft: RichTextDraftState): string {
  return draftPlainText(draft.paragraph)
}

export function applyRichTextDraftStyleCommand(
  draft: RichTextDraftState,
  patch: TextRunStylePatch,
): RichTextDraftState {
  if (isEmptyStylePatch(patch)) return draft
  const range = normalizeSelection(draft.paragraph, draft.selection)
  if (!range) return draft

  if (range.collapsed) {
    const baseStyle = draft.pendingStyle ?? authoredTextStyleAtOffset(draft.paragraph, range.start)
    const pendingStyle = applyStylePatch(baseStyle, patch)
    return {
      ...draft,
      pendingStyle,
      selection: { anchorOffset: range.start, focusOffset: range.start },
    }
  }

  const paragraph = applyTextRunStyleRangeToParagraph(draft.paragraph, range.start, range.end, patch)
  if (!paragraph) return draft
  return {
    paragraph,
    selection: { anchorOffset: range.start, focusOffset: range.end },
  }
}

export function replaceRichTextDraftSelection(
  draft: RichTextDraftState,
  text: string,
): RichTextDraftState {
  const range = normalizeSelection(draft.paragraph, draft.selection)
  if (!range) return draft

  const options = range.collapsed && draft.pendingStyle !== undefined
    ? { style: draft.pendingStyle }
    : undefined
  const paragraph = replaceTextRunRangeInParagraph(
    draft.paragraph,
    range.start,
    range.end,
    text,
    options,
  )
  if (!paragraph) return draft

  const caret = range.start + text.length
  return {
    paragraph,
    selection: { anchorOffset: caret, focusOffset: caret },
  }
}

export function replaceRichTextDraftSelectionWithFragments(
  draft: RichTextDraftState,
  fragments: RichTextDraftFragment[],
): RichTextDraftState {
  const range = normalizeSelection(draft.paragraph, draft.selection)
  if (!range) return draft

  const nonEmptyFragments = fragments.filter((fragment) => fragment.text.length > 0)
  let paragraph = draft.paragraph
  if (!range.collapsed) {
    paragraph = replaceTextRunRangeInParagraph(paragraph, range.start, range.end, "", { style: null }) ?? paragraph
  }
  if (nonEmptyFragments.length === 0) {
    if (paragraph === draft.paragraph) return draft
    return {
      paragraph,
      selection: { anchorOffset: range.start, focusOffset: range.start },
    }
  }

  let cursor = range.start
  for (const fragment of nonEmptyFragments) {
    const nextParagraph = replaceTextRunRangeInParagraph(paragraph, cursor, cursor, fragment.text, {
      style: fragment.style == null ? null : fragment.style,
    })
    if (!nextParagraph) continue
    paragraph = nextParagraph
    cursor += fragment.text.length
  }

  return {
    paragraph,
    selection: { anchorOffset: cursor, focusOffset: cursor },
  }
}
