import { useCallback, useState } from "react"
import {
  applyRichTextDraftStyleCommand,
  createRichTextDraft,
  getRichTextDraftPlainText,
  replaceRichTextDraftSelection,
  replaceRichTextDraftSelectionWithFragments,
  replaceTextRunParagraphTextInParagraph,
  type RichTextDraftFragment,
  type RichTextDraftState,
  type TextRunStylePatch,
} from "@/document"
import type { ParagraphNode } from "@/schema"
import {
  clampWysiwygTextOffset,
  INACTIVE_WYSIWYG_TEXT_SESSION,
  areWysiwygTextSelectionsEqual,
  type WysiwygTextSelection,
  type WysiwygTextSessionDraftChange,
  type WysiwygTextSessionState,
} from "./useWysiwygTextSession"

export interface WysiwygRichTextDraftSessionStart {
  nodeId: string
  paragraph: ParagraphNode
  caretOffset?: number | null
  pageIndex?: number | null
}

export interface WysiwygRichTextDraftSessionState {
  nodeId: string | null
  pageIndex: number | null
  baseText: string
  draft: RichTextDraftState | null
  dirtyVersion: number
  layoutVersion: number
}

export interface UseWysiwygRichTextDraftSessionOptions {
  enabled: boolean
  getParagraph: (nodeId: string) => ParagraphNode | null
}

export const INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION: WysiwygRichTextDraftSessionState = {
  nodeId: null,
  pageIndex: null,
  baseText: "",
  draft: null,
  dirtyVersion: 0,
  layoutVersion: 0,
}

function collapsedSelection(offset: number): WysiwygTextSelection {
  return { anchorOffset: offset, focusOffset: offset }
}

function selectionFocus(selection: WysiwygTextSelection | null): number | null {
  return selection?.focusOffset ?? null
}

function normalizeSelectionForText(
  text: string,
  caretOffset: number | null | undefined,
  selection?: WysiwygTextSelection | null,
): WysiwygTextSelection {
  const caret = clampWysiwygTextOffset(text, caretOffset) ?? text.length
  if (!selection) return collapsedSelection(caret)
  return {
    anchorOffset: clampWysiwygTextOffset(text, selection.anchorOffset) ?? caret,
    focusOffset: clampWysiwygTextOffset(text, selection.focusOffset) ?? caret,
  }
}

function resolvePlainTextBridgeSelectionReplacement(
  draft: RichTextDraftState,
  nextText: string,
): string | null {
  const currentText = getRichTextDraftPlainText(draft)
  const start = Math.min(draft.selection.anchorOffset, draft.selection.focusOffset)
  const end = Math.max(draft.selection.anchorOffset, draft.selection.focusOffset)
  const prefix = currentText.slice(0, start)
  const suffix = currentText.slice(end)
  if (!nextText.startsWith(prefix)) return null
  if (!nextText.endsWith(suffix)) return null
  const replacementEnd = nextText.length - suffix.length
  if (replacementEnd < prefix.length) return null
  const replacement = nextText.slice(prefix.length, replacementEnd)
  return `${prefix}${replacement}${suffix}` === nextText ? replacement : null
}

export function startWysiwygRichTextDraftSessionState(
  _current: WysiwygRichTextDraftSessionState,
  start: WysiwygRichTextDraftSessionStart,
): WysiwygRichTextDraftSessionState {
  const textLength = getRichTextDraftPlainText(createRichTextDraft(start.paragraph)).length
  const caretOffset = start.caretOffset == null || !Number.isFinite(start.caretOffset)
    ? textLength
    : Math.max(0, Math.min(Math.trunc(start.caretOffset), textLength))
  const draft = createRichTextDraft(start.paragraph, collapsedSelection(caretOffset))
  return {
    nodeId: start.nodeId,
    pageIndex: start.pageIndex ?? null,
    baseText: getRichTextDraftPlainText(draft),
    draft,
    dirtyVersion: 0,
    layoutVersion: 0,
  }
}

export function changeWysiwygRichTextDraftSessionPlainText(
  state: WysiwygRichTextDraftSessionState,
  change: WysiwygTextSessionDraftChange,
): WysiwygRichTextDraftSessionState {
  if (!state.nodeId || !state.draft) return state
  const nextSelection = normalizeSelectionForText(change.text, change.caretOffset, change.selection)
  const replacement = resolvePlainTextBridgeSelectionReplacement(state.draft, change.text)
  if (replacement != null) {
    const draft = replaceRichTextDraftSelection(state.draft, replacement)
    if (draft === state.draft) {
      return {
        ...state,
        draft: {
          ...state.draft,
          selection: nextSelection,
        },
      }
    }
    const paragraphChanged = draft.paragraph !== state.draft.paragraph
    return {
      ...state,
      draft: {
        ...draft,
        selection: nextSelection,
      },
      dirtyVersion: paragraphChanged ? state.dirtyVersion + 1 : state.dirtyVersion,
    }
  }
  const paragraph = replaceTextRunParagraphTextInParagraph(state.draft.paragraph, change.text)
  if (!paragraph) {
    return {
      ...state,
      draft: {
        ...state.draft,
        selection: nextSelection,
      },
    }
  }
  const paragraphChanged = paragraph !== state.draft.paragraph
  return {
    ...state,
    draft: {
      paragraph,
      selection: nextSelection,
    },
    dirtyVersion: paragraphChanged ? state.dirtyVersion + 1 : state.dirtyVersion,
  }
}

export function moveWysiwygRichTextDraftSessionSelection(
  state: WysiwygRichTextDraftSessionState,
  caretOffset: number | null,
  selection?: WysiwygTextSelection | null,
): WysiwygRichTextDraftSessionState {
  if (!state.nodeId || !state.draft) return state
  const text = getRichTextDraftPlainText(state.draft)
  const nextSelection = normalizeSelectionForText(text, caretOffset, selection)
  if (areWysiwygTextSelectionsEqual(state.draft.selection, nextSelection)) return state
  return {
    ...state,
    draft: {
      ...state.draft,
      selection: nextSelection,
    },
  }
}

export function endWysiwygRichTextDraftSessionState(): WysiwygRichTextDraftSessionState {
  return INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION
}

export function projectRichTextDraftSessionToWysiwygTextSession(
  state: WysiwygRichTextDraftSessionState,
): WysiwygTextSessionState {
  if (!state.nodeId || !state.draft) return INACTIVE_WYSIWYG_TEXT_SESSION
  const draftText = getRichTextDraftPlainText(state.draft)
  return {
    nodeId: state.nodeId,
    pageIndex: state.pageIndex,
    baseText: state.baseText,
    draftText,
    caretOffset: selectionFocus(state.draft.selection),
    selection: state.draft.selection,
    dirtyVersion: state.dirtyVersion,
    layoutVersion: state.layoutVersion,
  }
}

export function isWysiwygRichTextDraftSessionLayoutFresh(
  state: WysiwygRichTextDraftSessionState,
): boolean {
  return !state.nodeId || state.layoutVersion >= state.dirtyVersion
}

export function markWysiwygRichTextDraftSessionLayoutFresh(
  state: WysiwygRichTextDraftSessionState,
  layoutVersion: number = state.dirtyVersion,
): WysiwygRichTextDraftSessionState {
  if (!state.nodeId || !state.draft) return state
  return { ...state, layoutVersion }
}

export function applyRichTextDraftSessionStyleCommand(
  state: WysiwygRichTextDraftSessionState,
  patch: TextRunStylePatch,
): WysiwygRichTextDraftSessionState {
  if (!state.nodeId || !state.draft) return state
  const draft = applyRichTextDraftStyleCommand(state.draft, patch)
  if (draft === state.draft) return state
  const paragraphChanged = draft.paragraph !== state.draft.paragraph
  return {
    ...state,
    draft,
    dirtyVersion: paragraphChanged ? state.dirtyVersion + 1 : state.dirtyVersion,
  }
}

export function replaceRichTextDraftSessionSelection(
  state: WysiwygRichTextDraftSessionState,
  text: string,
): WysiwygRichTextDraftSessionState {
  if (!state.nodeId || !state.draft) return state
  const draft = replaceRichTextDraftSelection(state.draft, text)
  if (draft === state.draft) return state
  return {
    ...state,
    draft,
    dirtyVersion: state.dirtyVersion + 1,
  }
}

export function replaceRichTextDraftSessionSelectionWithFragments(
  state: WysiwygRichTextDraftSessionState,
  fragments: RichTextDraftFragment[],
): WysiwygRichTextDraftSessionState {
  if (!state.nodeId || !state.draft) return state
  const draft = replaceRichTextDraftSelectionWithFragments(state.draft, fragments)
  if (draft === state.draft) return state
  return {
    ...state,
    draft,
    dirtyVersion: state.dirtyVersion + 1,
  }
}

export function useWysiwygRichTextDraftSession({
  enabled,
  getParagraph,
}: UseWysiwygRichTextDraftSessionOptions) {
  const [state, setState] = useState<WysiwygRichTextDraftSessionState>(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION)

  const start = useCallback((nodeId: string, caretOffset: number | null = null, pageIndex: number | null = null) => {
    if (!enabled) return false
    const paragraph = getParagraph(nodeId)
    if (!paragraph) return false
    setState((current) => startWysiwygRichTextDraftSessionState(current, {
      nodeId,
      paragraph,
      caretOffset,
      pageIndex,
    }))
    return true
  }, [enabled, getParagraph])

  const changeDraft = useCallback((change: WysiwygTextSessionDraftChange) => {
    if (!enabled) return
    setState((current) => changeWysiwygRichTextDraftSessionPlainText(current, change))
  }, [enabled])

  const moveCaret = useCallback((caretOffset: number | null, selection?: WysiwygTextSelection | null) => {
    if (!enabled) return
    setState((current) => moveWysiwygRichTextDraftSessionSelection(current, caretOffset, selection))
  }, [enabled])

  const applyStyleCommand = useCallback((patch: TextRunStylePatch) => {
    if (!enabled) return
    setState((current) => applyRichTextDraftSessionStyleCommand(current, patch))
  }, [enabled])

  const markLayoutFresh = useCallback((layoutVersion?: number) => {
    if (!enabled) return
    setState((current) => markWysiwygRichTextDraftSessionLayoutFresh(current, layoutVersion))
  }, [enabled])

  const end = useCallback(() => {
    setState(endWysiwygRichTextDraftSessionState())
  }, [])

  return {
    state,
    isActive: state.nodeId !== null,
    isLayoutFresh: isWysiwygRichTextDraftSessionLayoutFresh(state),
    start,
    changeDraft,
    moveCaret,
    applyStyleCommand,
    markLayoutFresh,
    end,
  }
}
