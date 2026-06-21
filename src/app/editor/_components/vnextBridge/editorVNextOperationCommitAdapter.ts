import type {
  EditorVNextOperationPilotSnapshot,
  EditorVNextTextReplaceOperationPilotCommand,
} from "./editorVNextBridgeHost"

export type EditorVNextSessionHistoryBlockReason =
  | "bridge-blocked"
  | "operation-not-committed"
  | "missing-history-record"
  | "current-editor-history-requires-current-document-snapshot"

export interface EditorVNextOperationCommitReadinessSnapshot {
  source: "editor-vnext-operation-commit-adapter"
  milestone: "post-11"
  jobItem: "J5"
  mode: "commit-readiness-diagnostic"
  input: "vnext-operation-pilot-snapshot"
  operation: {
    kind: EditorVNextTextReplaceOperationPilotCommand["kind"]
    status: EditorVNextOperationPilotSnapshot["status"]
    targetNodeIds: string[]
    failureReason: EditorVNextOperationPilotSnapshot["operation"]["failureReason"]
    validationPolicy: EditorVNextOperationPilotSnapshot["operation"]["validationPolicy"]
    historyIntent: EditorVNextOperationPilotSnapshot["operation"]["historyIntent"]
    renderInvalidation: EditorVNextOperationPilotSnapshot["operation"]["renderInvalidation"]
    scope: EditorVNextOperationPilotSnapshot["operation"]["scope"]
  }
  durableHistory: {
    recordCreated: boolean
    recordStatus: EditorVNextOperationPilotSnapshot["history"]["recordStatus"]
    recordAvailable: boolean
    auditable: boolean
  }
  sessionHistory: {
    eligible: false
    reason: EditorVNextSessionHistoryBlockReason
    currentHistoryEntryCreated: false
    currentUndoRedoChanged: false
  }
  commitReadiness: {
    operationLayerCommitted: boolean
    durableHistoryReady: boolean
    currentSessionHistoryReady: false
    visibleEditorMutationReady: false
  }
  sideEffects: {
    editorState: false
    history: false
    selection: false
    paginatedPreview: false
    canvasRendering: false
    persistence: false
    apiRoutes: false
  }
  issues: EditorVNextOperationPilotSnapshot["issues"]
}

function resolveSessionHistoryBlockReason(
  snapshot: EditorVNextOperationPilotSnapshot,
): EditorVNextSessionHistoryBlockReason {
  if (snapshot.status === "blocked") return "bridge-blocked"
  if (snapshot.status !== "committed") return "operation-not-committed"
  if (!snapshot.history.recordCreated || !snapshot.history.record) return "missing-history-record"
  return "current-editor-history-requires-current-document-snapshot"
}

export function createEditorVNextOperationCommitReadinessSnapshot(
  snapshot: EditorVNextOperationPilotSnapshot,
): EditorVNextOperationCommitReadinessSnapshot {
  const durableHistoryReady = snapshot.history.recordCreated && snapshot.history.record !== null

  return {
    source: "editor-vnext-operation-commit-adapter",
    milestone: "post-11",
    jobItem: "J5",
    mode: "commit-readiness-diagnostic",
    input: "vnext-operation-pilot-snapshot",
    operation: {
      kind: snapshot.operation.kind,
      status: snapshot.status,
      targetNodeIds: snapshot.operation.targetNodeIds,
      failureReason: snapshot.operation.failureReason,
      validationPolicy: snapshot.operation.validationPolicy,
      historyIntent: snapshot.operation.historyIntent,
      renderInvalidation: snapshot.operation.renderInvalidation,
      scope: snapshot.operation.scope,
    },
    durableHistory: {
      recordCreated: snapshot.history.recordCreated,
      recordStatus: snapshot.history.recordStatus,
      recordAvailable: snapshot.history.record !== null,
      auditable: durableHistoryReady,
    },
    sessionHistory: {
      eligible: false,
      reason: resolveSessionHistoryBlockReason(snapshot),
      currentHistoryEntryCreated: false,
      currentUndoRedoChanged: false,
    },
    commitReadiness: {
      operationLayerCommitted: snapshot.status === "committed",
      durableHistoryReady,
      currentSessionHistoryReady: false,
      visibleEditorMutationReady: false,
    },
    sideEffects: {
      editorState: false,
      history: false,
      selection: false,
      paginatedPreview: false,
      canvasRendering: false,
      persistence: false,
      apiRoutes: false,
    },
    issues: snapshot.issues,
  }
}
