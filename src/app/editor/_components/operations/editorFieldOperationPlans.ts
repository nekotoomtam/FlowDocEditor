import { updateFieldRefInline } from "@/document"
import type { EditorAction, EditorState } from "../editorReducer"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

type UpdateFieldRefAction = Extract<EditorAction, { type: "UPDATE_FIELD_REF" }>

function createFieldPatchCommitResult(
  state: EditorState,
  action: UpdateFieldRefAction,
): EditorOperationCommitResult {
  return {
    status: "success",
    nextDoc: updateFieldRefInline(state.doc, action.fieldRefId, action.changes),
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    diagnostics: { operationKind: "field.patch", reducerPath: "UPDATE_FIELD_REF", fieldRefId: action.fieldRefId },
  }
}

export function createFieldPatchActionResult(
  state: EditorState,
  action: UpdateFieldRefAction,
): EditorOperationCommitResult {
  return createFieldPatchCommitResult(state, action)
}

export function createFieldPatchOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "field.patch" || operation.action.type !== "UPDATE_FIELD_REF") {
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
  return createFieldPatchCommitResult(state, operation.action)
}
