import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import type { EditorState, HistoryEntry } from "../editorReducer"
import { MAX_HISTORY, pushDoc, pushPrevalidatedDoc, setDocWithoutHistory } from "../editorReducerCommit"
import type { StructuralReducerAttribution } from "../editorReducerCommit"
import type { EditorOperationKind } from "./editorOperationTypes"

export type EditorOperationValidationPolicy = "full" | "prevalidated" | "scoped" | "read-only"

export type EditorOperationValidationScope =
  | { kind: "document"; reason: string }
  | { kind: "node-subtree"; nodeIds: string[]; fallback: "full-document" }
  | { kind: "table"; tableId: string; fallback: "full-document" }
  | { kind: "flow-row"; rowId: string; fallback: "full-document" }

export type EditorOperationHistoryPolicy =
  | { kind: "push"; entry?: HistoryEntry }
  | { kind: "none"; reason: string }

export type EditorOperationSelectionPatch = Partial<
  Pick<
    EditorState,
    | "selectedNodeId"
    | "drag"
    | "selectionAnchorNodeId"
    | "lastSplitNodeId"
    | "listExitNodeId"
    | "listLevelChangeResult"
    | "mergeResult"
  >
>

export type EditorOperationPaginatedPatch = {
  paginated?: PaginatedDocument
}

export type EditorOperationCommitDiagnostics = {
  operationKind?: EditorOperationKind
  reducerPath?: string
  validationPolicy?: EditorOperationValidationPolicy
  historyPolicy?: EditorOperationHistoryPolicy["kind"]
  [key: string]: unknown
}

export type EditorOperationFailure = {
  reason: string
  error?: unknown
}

export type EditorOperationDocumentCommitResult =
  | {
      status: "success"
      nextDoc: DocumentNode
      validationPolicy: "full" | "prevalidated" | "scoped"
      validationScope?: EditorOperationValidationScope
      historyPolicy: { kind: "push"; entry?: HistoryEntry }
      structuralAttribution?: StructuralReducerAttribution
      selectionPatch?: EditorOperationSelectionPatch
      paginatedPatch?: EditorOperationPaginatedPatch
      diagnostics?: EditorOperationCommitDiagnostics
    }
  | {
      status: "success"
      nextDoc: DocumentNode
      validationPolicy: "full"
      historyPolicy: { kind: "none"; reason: string }
      structuralAttribution?: StructuralReducerAttribution
      selectionPatch?: EditorOperationSelectionPatch
      paginatedPatch?: EditorOperationPaginatedPatch
      diagnostics?: EditorOperationCommitDiagnostics
    }

export type EditorOperationHistoryOnlyCommitResult = {
  status: "history-only"
  historyPolicy: { kind: "push"; entry: HistoryEntry }
  selectionPatch?: EditorOperationSelectionPatch
  paginatedPatch?: EditorOperationPaginatedPatch
  diagnostics?: EditorOperationCommitDiagnostics
}

export type EditorOperationStatePatchCommitResult = {
  status: "state-patch"
  historyPolicy?: { kind: "none"; reason: string }
  selectionPatch?: EditorOperationSelectionPatch
  paginatedPatch?: EditorOperationPaginatedPatch
  diagnostics?: EditorOperationCommitDiagnostics
}

export type EditorOperationNoopCommitResult = {
  status: "noop"
  noopReason: string
  validationPolicy?: "read-only"
  historyPolicy?: { kind: "none"; reason: string }
  diagnostics?: EditorOperationCommitDiagnostics
}

export type EditorOperationFailedCommitResult = {
  status: "failure"
  failure: EditorOperationFailure
  validationPolicy?: EditorOperationValidationPolicy
  historyPolicy?: { kind: "none"; reason: string }
  diagnostics?: EditorOperationCommitDiagnostics
}

export type EditorOperationCommitResult =
  | EditorOperationDocumentCommitResult
  | EditorOperationHistoryOnlyCommitResult
  | EditorOperationStatePatchCommitResult
  | EditorOperationNoopCommitResult
  | EditorOperationFailedCommitResult

function applyEditorOperationPatches(
  state: EditorState,
  result: Pick<EditorOperationDocumentCommitResult, "selectionPatch" | "paginatedPatch">,
): EditorState {
  return {
    ...state,
    ...result.selectionPatch,
    ...(result.paginatedPatch?.paginated ? { paginated: result.paginatedPatch.paginated } : {}),
  }
}

export function commitEditorOperationResult(state: EditorState, result: EditorOperationCommitResult): EditorState {
  if (result.status === "noop" || result.status === "failure") {
    return state
  }

  if (result.status === "state-patch") {
    return applyEditorOperationPatches(state, result)
  }

  if (result.status === "history-only") {
    return applyEditorOperationPatches({
      ...state,
      past: [...state.past.slice(-(MAX_HISTORY - 1)), result.historyPolicy.entry],
      future: [],
    }, result)
  }

  const committedState =
    result.historyPolicy.kind === "none"
      ? setDocWithoutHistory(state, result.nextDoc)
      : result.validationPolicy === "prevalidated"
        ? pushPrevalidatedDoc(state, result.nextDoc, result.historyPolicy.entry, result.structuralAttribution)
        : pushDoc(state, result.nextDoc, result.historyPolicy.entry, result.structuralAttribution)

  return applyEditorOperationPatches(committedState, result)
}
