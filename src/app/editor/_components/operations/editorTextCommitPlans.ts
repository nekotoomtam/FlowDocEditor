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
import type {
  EditorOperationCommand,
  EditorOperationEnvelope,
  EditorOperationTextCommitRuntimeContext,
} from "./editorOperationTypes"

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
type TextDraftCommand = Extract<EditorOperationCommand, { kind: "text.draft" }>
type TextCommitCommand = Extract<EditorOperationCommand, { kind: "text.commit" }>
type UpdateTextCommitCommand = Extract<TextCommitCommand, { commitType: "update-text" }>
type InlineTextCommitCommand = Extract<TextCommitCommand, { commitType: "inline-text" }>
type WysiwygTextCommitCommand = Extract<TextCommitCommand, { commitType: "wysiwyg-text" }>
type WysiwygRichTextCommitCommand = Extract<TextCommitCommand, { commitType: "wysiwyg-rich-text" }>
type InlineTextCommitInput = InlineTextCommitCommand & Pick<InlineTextCommitAction, "beforeDoc" | "beforePaginated" | "afterPaginated">
type WysiwygTextCommitInput = WysiwygTextCommitCommand & Pick<WysiwygTextCommitAction, "history" | "afterPaginated">
type WysiwygRichTextCommitInput = WysiwygRichTextCommitCommand & Pick<WysiwygRichTextCommitAction, "history" | "afterPaginated">

function areParagraphNodesEqual(a: ParagraphNode, b: ParagraphNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function createUpdateTextCommitResult(
  state: EditorState,
  input: UpdateTextCommitCommand,
): EditorOperationCommitResult {
  return {
    status: "success",
    nextDoc: replaceEditableParagraphTextInDocument(state.doc, input.nodeId, input.text),
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    diagnostics: { operationKind: "text.commit", reducerPath: "UPDATE_TEXT", nodeId: input.nodeId },
  }
}

export function createInlineTextDraftResult(
  state: EditorState,
  input: InlineTextDraftAction | TextDraftCommand,
): EditorOperationCommitResult {
  return {
    status: "success",
    nextDoc: replaceEditableParagraphTextInDocument(state.doc, input.nodeId, input.text),
    validationPolicy: "full",
    historyPolicy: { kind: "none", reason: "active inline text draft" },
    diagnostics: { operationKind: "text.draft", reducerPath: "UPDATE_INLINE_TEXT_DRAFT", nodeId: input.nodeId },
  }
}

export function createInlineTextCommitResult(
  state: EditorState,
  input: InlineTextCommitInput,
): EditorOperationCommitResult {
  const currentText = getEditableParagraphTextFromDocument(state.doc, input.nodeId)
  if (currentText == null || currentText === input.beforeText) {
    return {
      status: "state-patch",
      historyPolicy: { kind: "none", reason: "inline text unchanged" },
      paginatedPatch: { paginated: input.afterPaginated },
      diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_INLINE_TEXT_EDIT" },
    }
  }
  return {
    status: "history-only",
    historyPolicy: { kind: "push", entry: { doc: input.beforeDoc, paginated: input.beforePaginated } },
    paginatedPatch: { paginated: input.afterPaginated },
    diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_INLINE_TEXT_EDIT" },
  }
}

export function createWysiwygTextCommitResult(
  state: EditorState,
  input: WysiwygTextCommitInput,
): EditorOperationCommitResult {
  const currentText = getEditableParagraphTextFromDocument(state.doc, input.nodeId)
  if (currentText == null || input.text === input.beforeText) {
    return {
      status: "state-patch",
      historyPolicy: { kind: "none", reason: "wysiwyg text unchanged" },
      paginatedPatch: { paginated: input.afterPaginated },
      diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_WYSIWYG_TEXT_EDIT" },
    }
  }

  const nextDoc = replaceEditableParagraphTextInDocument(state.doc, input.nodeId, input.text)
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
    historyPolicy: { kind: "push", entry: input.history },
    paginatedPatch: { paginated: input.afterPaginated },
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
      return createUpdateTextCommitResult(state, {
        kind: "text.commit",
        commitType: "update-text",
        nodeId: action.nodeId,
        text: action.text,
      })
    case "COMMIT_INLINE_TEXT_EDIT":
      return createInlineTextCommitResult(state, {
        kind: "text.commit",
        commitType: "inline-text",
        nodeId: action.nodeId,
        beforeText: action.beforeText,
        beforeDoc: action.beforeDoc,
        beforePaginated: action.beforePaginated,
        afterPaginated: action.afterPaginated,
      })
    case "COMMIT_WYSIWYG_TEXT_EDIT":
      return createWysiwygTextCommitResult(state, {
        kind: "text.commit",
        commitType: "wysiwyg-text",
        nodeId: action.nodeId,
        text: action.text,
        beforeText: action.beforeText,
        history: action.history,
        afterPaginated: action.afterPaginated,
      })
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
      return createWysiwygRichTextCommitResult(state, {
        kind: "text.commit",
        commitType: "wysiwyg-rich-text",
        nodeId: action.nodeId,
        paragraph: action.paragraph,
        history: action.history,
        afterPaginated: action.afterPaginated,
      })
  }
}

function textDraftCommandFromOperation(operation: EditorOperationEnvelope): TextDraftCommand | undefined {
  return operation.command?.kind === "text.draft"
    ? operation.command
    : operation.payload?.kind === "text.draft"
      ? operation.payload
      : undefined
}

function textCommitCommandFromOperation(operation: EditorOperationEnvelope): TextCommitCommand | undefined {
  return operation.command?.kind === "text.commit"
    ? operation.command
    : operation.payload?.kind === "text.commit"
      ? operation.payload
      : undefined
}

function reducerPathForTextCommit(command: Pick<TextCommitCommand, "commitType">): string {
  switch (command.commitType) {
    case "update-text":
      return "UPDATE_TEXT"
    case "inline-text":
      return "COMMIT_INLINE_TEXT_EDIT"
    case "wysiwyg-text":
      return "COMMIT_WYSIWYG_TEXT_EDIT"
    case "wysiwyg-rich-text":
      return "COMMIT_WYSIWYG_RICH_TEXT_EDIT"
  }
}

function missingTextCommitRuntimeResult(
  command: TextCommitCommand,
  missingFields: string[],
): EditorOperationCommitResult {
  return {
    status: "failure",
    failure: { reason: "missing-text-commit-runtime" },
    validationPolicy: "read-only",
    historyPolicy: { kind: "none", reason: "missing text commit runtime" },
    diagnostics: {
      operationKind: "text.commit",
      reducerPath: reducerPathForTextCommit(command),
      commitType: command.commitType,
      missingRuntimeFields: missingFields,
    },
  }
}

function requireTextCommitRuntimeFields(
  command: TextCommitCommand,
  runtime: EditorOperationTextCommitRuntimeContext | undefined,
  fields: Array<keyof EditorOperationTextCommitRuntimeContext>,
): EditorOperationCommitResult | undefined {
  const missingFields = fields.filter((field) => runtime?.[field] == null).map((field) => `textCommit.${field}`)
  return missingFields.length > 0 ? missingTextCommitRuntimeResult(command, missingFields) : undefined
}

export function createTextDraftOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const command = textDraftCommandFromOperation(operation)
  if (operation.kind !== "text.draft" || !command) {
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
  return createInlineTextDraftResult(state, command)
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

  const command = textCommitCommandFromOperation(operation)
  if (!command) {
    return {
      status: "failure",
      failure: { reason: "invalid-text-commit-command" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "TEXT_COMMIT",
      },
    }
  }

  const runtime = operation.runtime?.textCommit
  switch (command.commitType) {
    case "update-text":
      return createUpdateTextCommitResult(state, command)
    case "inline-text": {
      const missingRuntime = requireTextCommitRuntimeFields(command, runtime, ["beforeDoc", "beforePaginated", "afterPaginated"])
      if (missingRuntime) return missingRuntime
      return createInlineTextCommitResult(state, {
        ...command,
        beforeDoc: runtime!.beforeDoc!,
        beforePaginated: runtime!.beforePaginated!,
        afterPaginated: runtime!.afterPaginated!,
      })
    }
    case "wysiwyg-text": {
      const missingRuntime = requireTextCommitRuntimeFields(command, runtime, ["afterPaginated"])
      if (missingRuntime) return missingRuntime
      return createWysiwygTextCommitResult(state, {
        ...command,
        history: runtime?.history,
        afterPaginated: runtime!.afterPaginated!,
      })
    }
    case "wysiwyg-rich-text": {
      const missingRuntime = requireTextCommitRuntimeFields(command, runtime, ["afterPaginated"])
      if (missingRuntime) return missingRuntime
      return createWysiwygRichTextCommitResult(state, {
        ...command,
        history: runtime?.history,
        afterPaginated: runtime!.afterPaginated!,
      })
    }
  }
}

export function createWysiwygRichTextCommitResult(
  state: EditorState,
  input: WysiwygRichTextCommitInput,
): EditorOperationCommitResult {
  const currentParagraph = getEditableParagraphFromDocument(state.doc, input.nodeId)
  const nextParagraph: ParagraphNode = { ...input.paragraph, id: input.nodeId, type: "paragraph" }
  if (currentParagraph == null || areParagraphNodesEqual(currentParagraph, nextParagraph)) {
    return {
      status: "state-patch",
      historyPolicy: { kind: "none", reason: "wysiwyg rich text unchanged" },
      paginatedPatch: { paginated: input.afterPaginated },
      diagnostics: { operationKind: "text.commit", reducerPath: "COMMIT_WYSIWYG_RICH_TEXT_EDIT" },
    }
  }

  const nextDoc = replaceEditableParagraphInDocument(state.doc, input.nodeId, nextParagraph)
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
    historyPolicy: { kind: "push", entry: input.history },
    paginatedPatch: { paginated: input.afterPaginated },
    diagnostics: {
      operationKind: "text.commit",
      reducerPath: "COMMIT_WYSIWYG_RICH_TEXT_EDIT",
      validationPolicy: "prevalidated",
    },
  }
}
