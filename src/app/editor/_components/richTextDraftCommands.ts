import {
  getTextRunStyleRangeState,
  type TextRunStylePatch,
  type TextRunStyleRangeState,
} from "@/document"
import type { TextRunStyle } from "@/schema"
import {
  applyRichTextDraftSessionStyleCommand,
  type WysiwygRichTextDraftSessionState,
} from "./richTextDraftSession"

export type RichTextDraftSessionCommand =
  | { type: "setStyle"; patch: TextRunStylePatch }
  | { type: "toggleBold" }
  | { type: "toggleItalic" }
  | { type: "toggleUnderline" }
  | { type: "toggleStrikethrough" }

export interface RichTextDraftKeyboardCommandInput {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}

export interface RichTextDraftSessionCommandToggleState {
  active: boolean
  mixed: boolean
}

export interface RichTextDraftSessionCommandState {
  bold: RichTextDraftSessionCommandToggleState
  italic: RichTextDraftSessionCommandToggleState
  underline: RichTextDraftSessionCommandToggleState
  strikethrough: RichTextDraftSessionCommandToggleState
}

type StyleFieldState<T> = { value: T; mixed: boolean }

function hasPendingStyleField<K extends keyof TextRunStyle>(
  style: TextRunStyle | undefined,
  key: K,
): style is TextRunStyle & Required<Pick<TextRunStyle, K>> {
  return style != null && Object.prototype.hasOwnProperty.call(style, key)
}

function isCollapsedSelection(state: WysiwygRichTextDraftSessionState): boolean {
  const selection = state.draft?.selection
  return selection != null && selection.anchorOffset === selection.focusOffset
}

function rangeStateForSession(
  state: WysiwygRichTextDraftSessionState,
): TextRunStyleRangeState | null {
  if (!state.nodeId || !state.draft) return null
  return getTextRunStyleRangeState(
    state.draft.paragraph,
    state.draft.selection.anchorOffset,
    state.draft.selection.focusOffset,
  )
}

function fontWeightState(
  state: WysiwygRichTextDraftSessionState,
  rangeState: TextRunStyleRangeState | null,
): StyleFieldState<"normal" | "bold"> {
  const draft = state.draft!
  if (isCollapsedSelection(state) && hasPendingStyleField(draft.pendingStyle, "fontWeight")) {
    return { value: draft.pendingStyle.fontWeight ?? "normal", mixed: false }
  }
  return rangeState?.fontWeight ?? {
    value: draft.paragraph.props.fontWeight ?? "normal",
    mixed: false,
  }
}

function fontStyleState(
  state: WysiwygRichTextDraftSessionState,
  rangeState: TextRunStyleRangeState | null,
): StyleFieldState<"normal" | "italic"> {
  const draft = state.draft!
  if (isCollapsedSelection(state) && hasPendingStyleField(draft.pendingStyle, "fontStyle")) {
    return { value: draft.pendingStyle.fontStyle ?? "normal", mixed: false }
  }
  return rangeState?.fontStyle ?? {
    value: draft.paragraph.props.fontStyle ?? "normal",
    mixed: false,
  }
}

function textDecorationState(
  state: WysiwygRichTextDraftSessionState,
  rangeState: TextRunStyleRangeState | null,
): StyleFieldState<"none" | "underline"> {
  const draft = state.draft!
  if (isCollapsedSelection(state) && hasPendingStyleField(draft.pendingStyle, "textDecoration")) {
    return { value: draft.pendingStyle.textDecoration ?? "none", mixed: false }
  }
  return rangeState?.textDecoration ?? {
    value: draft.paragraph.props.textDecoration ?? "none",
    mixed: false,
  }
}

function strikethroughState(
  state: WysiwygRichTextDraftSessionState,
  rangeState: TextRunStyleRangeState | null,
): StyleFieldState<boolean> {
  const draft = state.draft!
  if (isCollapsedSelection(state) && hasPendingStyleField(draft.pendingStyle, "strikethrough")) {
    return { value: draft.pendingStyle.strikethrough ?? false, mixed: false }
  }
  return rangeState?.strikethrough ?? {
    value: draft.paragraph.props.strikethrough ?? false,
    mixed: false,
  }
}

function toggleState(active: boolean, mixed: boolean): RichTextDraftSessionCommandToggleState {
  return { active: mixed ? false : active, mixed }
}

export function getRichTextDraftSessionCommandState(
  state: WysiwygRichTextDraftSessionState,
): RichTextDraftSessionCommandState | null {
  if (!state.nodeId || !state.draft) return null
  const rangeState = rangeStateForSession(state)
  const fontWeight = fontWeightState(state, rangeState)
  const fontStyle = fontStyleState(state, rangeState)
  const textDecoration = textDecorationState(state, rangeState)
  const strikethrough = strikethroughState(state, rangeState)
  return {
    bold: toggleState(fontWeight.value === "bold", fontWeight.mixed),
    italic: toggleState(fontStyle.value === "italic", fontStyle.mixed),
    underline: toggleState(textDecoration.value === "underline", textDecoration.mixed),
    strikethrough: toggleState(strikethrough.value, strikethrough.mixed),
  }
}

export function getRichTextDraftSessionCommandPatch(
  state: WysiwygRichTextDraftSessionState,
  command: RichTextDraftSessionCommand,
): TextRunStylePatch {
  if (command.type === "setStyle") return command.patch
  const commandState = getRichTextDraftSessionCommandState(state)
  switch (command.type) {
    case "toggleBold":
      return { fontWeight: commandState?.bold.active ? "normal" : "bold" }
    case "toggleItalic":
      return { fontStyle: commandState?.italic.active ? "normal" : "italic" }
    case "toggleUnderline":
      return { textDecoration: commandState?.underline.active ? "none" : "underline" }
    case "toggleStrikethrough":
      return { strikethrough: commandState?.strikethrough.active ? false : true }
  }
}

export function applyRichTextDraftSessionCommand(
  state: WysiwygRichTextDraftSessionState,
  command: RichTextDraftSessionCommand,
): WysiwygRichTextDraftSessionState {
  return applyRichTextDraftSessionStyleCommand(state, getRichTextDraftSessionCommandPatch(state, command))
}

export function resolveRichTextDraftKeyboardCommand(
  input: RichTextDraftKeyboardCommandInput,
): RichTextDraftSessionCommand | null {
  if (input.isComposing || input.altKey) return null
  if (!input.ctrlKey && !input.metaKey) return null

  switch (input.key.toLowerCase()) {
    case "b":
      return { type: "toggleBold" }
    case "i":
      return { type: "toggleItalic" }
    case "u":
      return { type: "toggleUnderline" }
    default:
      return null
  }
}
