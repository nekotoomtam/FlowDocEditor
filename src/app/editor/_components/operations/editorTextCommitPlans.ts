import { assertDocument } from "@/document"
import type { ParagraphNode } from "@/schema"
import type { EditorAction, EditorState } from "../editorReducer"
import {
  getEditableParagraphFromDocument,
  getEditableParagraphTextFromDocument,
  replaceEditableParagraphInDocument,
  replaceEditableParagraphTextInDocument,
} from "../wysiwygTextCommit"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

type UpdateTextAction = Extract<EditorAction, { type: "UPDATE_TEXT" }>
type InlineTextDraftAction = Extract<EditorAction, { type: "UPDATE_INLINE_TEXT_DRAFT" }>
type InlineTextCommitAction = Extract<EditorAction, { type: "COMMIT_INLINE_TEXT_EDIT" }>
type WysiwygTextCommitAction = Extract<EditorAction, { type: "COMMIT_WYSIWYG_TEXT_EDIT" }>
type WysiwygRichTextCommitAction = Extract<EditorAction, { type: "COMMIT_WYSIWYG_RICH_TEXT_EDIT" }>
type TextCommitAction =
  | UpdateTextAction
  | InlineTextCommitAction
  | WysiwygTextCommitAction
  | WysiwygRichTextCommitAction

function areParagraphNodesEqual(a: ParagraphNode, b: ParagraphNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function createUpdateTextCommitResult(
  state: EditorState,
  action: UpdateTextAction,
): EditorOperationCommitResult {
  return {
    status: "success",
    nextDoc: replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text),
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    diagnostics: { operationKind: "text.commit", reducerPath: "UPDATE_TEXT", nodeId: action.nodeId },
  }
}

export function createInlineTextDraftResult(
  state: EditorState,
  action: InlineTextDraftAction,
): EditorOperationCommitResult {
  return {
    status: "success",
    nextDoc: replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text),
    validationPolicy: "full",
    historyPolicy: { kind: "none", reason: "active inline text draft" },
    diagnostics: { operationKind: "text.draft", reducerPath: "UPDATE_INLINE_TEXT_DRAFT", nodeId: action.nodeId },
  }
}

export function createInlineTextCommitResult(
  state: EditorState,
  action: InlineTextCommitAction,
): EditorOperationCommitResult {
  const currentText = getEditableParagraphTextFromDocument(state.doc, action.nodeId)
  if (currentText == null || currentText === action.beforeText) {
    return {
      status: "state-patch",
      historyPolicy: { kind: "none", reason: "inline text unchanged" },
      paginatedPatch: { paginated: action.afterPaginated },
      diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_INLINE_TEXT_EDIT" },
    }
  }
  return {
    status: "history-only",
    historyPolicy: { kind: "push", entry: { doc: action.beforeDoc, paginated: action.beforePaginated } },
    paginatedPatch: { paginated: action.afterPaginated },
    diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_INLINE_TEXT_EDIT" },
  }
}

export function createWysiwygTextCommitResult(
  state: EditorState,
  action: WysiwygTextCommitAction,
): EditorOperationCommitResult {
  const currentText = getEditableParagraphTextFromDocument(state.doc, action.nodeId)
  if (currentText == null || action.text === action.beforeText) {
    return {
      status: "state-patch",
      historyPolicy: { kind: "none", reason: "wysiwyg text unchanged" },
      paginatedPatch: { paginated: action.afterPaginated },
      diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_WYSIWYG_TEXT_EDIT" },
    }
  }

  const nextDoc = replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text)
  try {
    assertDocument(nextDoc)
  } catch (error) {
    console.error("WYSIWYG text commit produced invalid document:", error)
    return {
      status: "failure",
      failure: { reason: "invalid-wysiwyg-text-commit", error },
      validationPolicy: "full",
      historyPolicy: { kind: "none", reason: "invalid document" },
      diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_WYSIWYG_TEXT_EDIT" },
    }
  }

  return {
    status: "success",
    nextDoc,
    validationPolicy: "prevalidated",
    historyPolicy: { kind: "push", entry: action.history },
    paginatedPatch: { paginated: action.afterPaginated },
    diagnostics: {
      operationKind: "text.commit",
      reducerPath: "COMMIT_WYSIWYG_TEXT_EDIT",
      validationPolicy: "prevalidated",
    },
  }
}

export function createTextCommitActionResult(
  state: EditorState,
  action: TextCommitAction,
): EditorOperationCommitResult {
  switch (action.type) {
    case "UPDATE_TEXT":
      return createUpdateTextCommitResult(state, action)
    case "COMMIT_INLINE_TEXT_EDIT":
      return createInlineTextCommitResult(state, action)
    case "COMMIT_WYSIWYG_TEXT_EDIT":
      return createWysiwygTextCommitResult(state, action)
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
      return createWysiwygRichTextCommitResult(state, action)
  }
}

export function createTextDraftOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "text.draft" || operation.action.type !== "UPDATE_INLINE_TEXT_DRAFT") {
    return {
      status: "failure",
      failure: { reason: "invalid-text-draft-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "UPDATE_INLINE_TEXT_DRAFT",
      },
    }
  }
  return createInlineTextDraftResult(state, operation.action)
}

export function createTextCommitOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "text.commit") {
    return {
      status: "failure",
      failure: { reason: "invalid-text-commit-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "TEXT_COMMIT",
      },
    }
  }

  switch (operation.action.type) {
    case "UPDATE_TEXT":
    case "COMMIT_INLINE_TEXT_EDIT":
    case "COMMIT_WYSIWYG_TEXT_EDIT":
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
      return createTextCommitActionResult(state, operation.action)
    default:
      return {
        status: "failure",
        failure: { reason: "invalid-text-commit-action" },
        validationPolicy: "read-only",
        historyPolicy: { kind: "none", reason: "invalid operation" },
        diagnostics: {
          operationKind: operation.kind,
          reducerPath: "TEXT_COMMIT",
        },
      }
  }
}

export function createWysiwygRichTextCommitResult(
  state: EditorState,
  action: WysiwygRichTextCommitAction,
): EditorOperationCommitResult {
  const currentParagraph = getEditableParagraphFromDocument(state.doc, action.nodeId)
  const nextParagraph: ParagraphNode = { ...action.paragraph, id: action.nodeId, type: "paragraph" }
  if (currentParagraph == null || areParagraphNodesEqual(currentParagraph, nextParagraph)) {
    return {
      status: "state-patch",
      historyPolicy: { kind: "none", reason: "wysiwyg rich text unchanged" },
      paginatedPatch: { paginated: action.afterPaginated },
      diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_WYSIWYG_RICH_TEXT_EDIT" },
    }
  }

  const nextDoc = replaceEditableParagraphInDocument(state.doc, action.nodeId, nextParagraph)
  try {
    assertDocument(nextDoc)
  } catch (error) {
    console.error("WYSIWYG rich text commit produced invalid document:", error)
    return {
      status: "failure",
      failure: { reason: "invalid-wysiwyg-rich-text-commit", error },
      validationPolicy: "full",
      historyPolicy: { kind: "none", reason: "invalid document" },
      diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_WYSIWYG_RICH_TEXT_EDIT" },
    }
  }

  return {
    status: "success",
    nextDoc,
    validationPolicy: "prevalidated",
    historyPolicy: { kind: "push", entry: action.history },
    paginatedPatch: { paginated: action.afterPaginated },
    diagnostics: {
      operationKind: "text.commit",
      reducerPath: "COMMIT_WYSIWYG_RICH_TEXT_EDIT",
      validationPolicy: "prevalidated",
    },
  }
}
