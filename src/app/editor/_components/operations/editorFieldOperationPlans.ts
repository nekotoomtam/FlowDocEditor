import { updateFieldRefInline } from "@/document"
import type { EditorAction, EditorState } from "../editorReducer"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationCommand, EditorOperationEnvelope } from "./editorOperationTypes"

type UpdateFieldRefAction = Extract<EditorAction, { type: "UPDATE_FIELD_REF" }>
type FieldPatchCommand = Extract<EditorOperationCommand, { kind: "field.patch" }>

function createFieldPatchCommitResult(
  state: EditorState,
  input: FieldPatchCommand,
): EditorOperationCommitResult {
  return {
    status: "success",
    nextDoc: updateFieldRefInline(state.doc, input.fieldRefId, input.changes),
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    diagnostics: { operationKind: "field.patch", reducerPath: "UPDATE_FIELD_REF", fieldRefId: input.fieldRefId },
  }
}

export function createFieldPatchActionResult(
  state: EditorState,
  action: UpdateFieldRefAction,
): EditorOperationCommitResult {
  return createFieldPatchCommitResult(state, { kind: "field.patch", fieldRefId: action.fieldRefId, changes: action.changes })
}

export function createFieldPatchOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const command = operation.command?.kind === "field.patch"
    ? operation.command
    : operation.payload?.kind === "field.patch"
      ? operation.payload
      : undefined
  if (operation.kind !== "field.patch" || !command) {
    return {
      status: "failure",
      failure: { reason: "invalid-field-patch-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "UPDATE_FIELD_REF",
      },
    }
  }
  return createFieldPatchCommitResult(state, command)
}
