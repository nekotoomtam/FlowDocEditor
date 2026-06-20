import { deleteNode, duplicateNode, reorderBodyChild } from "@/document"
import type { EditorAction, EditorState } from "../editorReducer"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import {
  createOperationDocumentGraphDiagnostics,
} from "./editorDocumentGraphDiagnostics"
import { createEditorGraphPlanningDecision } from "./editorGraphPlanningDecision"
import type { EditorOperationCommand, EditorOperationEnvelope } from "./editorOperationTypes"

type DeleteNodeAction = Extract<EditorAction, { type: "DELETE_NODE" }>
type DuplicateNodeAction = Extract<EditorAction, { type: "DUPLICATE_NODE" }>
type ReorderBodyChildAction = Extract<EditorAction, { type: "REORDER_BODY_CHILD" }>
type NodeDeleteCommand = Extract<EditorOperationCommand, { kind: "node.delete" }>
type NodeDuplicateCommand = Extract<EditorOperationCommand, { kind: "node.duplicate" }>
type NodeReorderCommand = Extract<EditorOperationCommand, { kind: "node.reorder" }>

function createNodeDeleteCommitResult(
  state: EditorState,
  input: NodeDeleteCommand,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [input.nodeId]
  const graphDiagnostics = createOperationDocumentGraphDiagnostics(state, operation, targetNodeIds)
  const graphDecision = createEditorGraphPlanningDecision({
    graphDiagnostics,
    capability: "canDelete",
    operationName: "node-delete",
  })
  if (graphDecision.kind === "failure") {
    return {
      status: "failure",
      failure: { reason: graphDecision.reason },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
      diagnostics: {
        operationKind: "node.delete",
        reducerPath: "DELETE_NODE",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  if (graphDecision.kind === "noop") {
    return {
      status: "noop",
      noopReason: graphDecision.noopReason,
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
      diagnostics: {
        operationKind: "node.delete",
        reducerPath: "DELETE_NODE",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  const nextDoc = deleteNode(state.doc, input.nodeId)
  if (nextDoc === state.doc) {
    return {
      status: "noop",
      noopReason: "node-delete-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: {
        operationKind: "node.delete",
        reducerPath: "DELETE_NODE",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  return {
    status: "success",
    nextDoc,
    validationPolicy: graphDecision.validationPolicy,
    validationScope: { kind: "node-subtree", nodeIds: targetNodeIds, fallback: "full-document" },
    historyPolicy: { kind: "push" },
    selectionPatch: { selectedNodeId: null, selectionAnchorNodeId: null },
    diagnostics: {
      operationKind: "node.delete",
      reducerPath: "DELETE_NODE",
      validationPolicy: graphDecision.validationPolicy,
      historyPolicy: "push",
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

export function createNodeDeleteActionResult(
  state: EditorState,
  action: DeleteNodeAction,
): EditorOperationCommitResult {
  return createNodeDeleteCommitResult(state, { kind: "node.delete", nodeId: action.nodeId })
}

export function createNodeDeleteOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const command = operation.command?.kind === "node.delete"
    ? operation.command
    : operation.payload?.kind === "node.delete"
      ? operation.payload
      : undefined
  if (operation.kind !== "node.delete" || !command) {
    return {
      status: "failure",
      failure: { reason: "invalid-node-delete-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "DELETE_NODE",
      },
    }
  }
  return createNodeDeleteCommitResult(state, command, operation)
}

function createNodeDuplicateCommitResult(
  state: EditorState,
  input: NodeDuplicateCommand,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [input.nodeId]
  const graphDiagnostics = createOperationDocumentGraphDiagnostics(state, operation, targetNodeIds)
  const graphDecision = createEditorGraphPlanningDecision({
    graphDiagnostics,
    capability: "canDuplicate",
    operationName: "node-duplicate",
  })
  if (graphDecision.kind === "failure") {
    return {
      status: "failure",
      failure: { reason: graphDecision.reason },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
      diagnostics: {
        operationKind: "node.duplicate",
        reducerPath: "DUPLICATE_NODE",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  if (graphDecision.kind === "noop") {
    return {
      status: "noop",
      noopReason: graphDecision.noopReason,
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
      diagnostics: {
        operationKind: "node.duplicate",
        reducerPath: "DUPLICATE_NODE",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  const result = duplicateNode(state.doc, input.nodeId)
  if (result.doc === state.doc || !result.duplicatedNodeId) {
    return {
      status: "noop",
      noopReason: "node-duplicate-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: {
        operationKind: "node.duplicate",
        reducerPath: "DUPLICATE_NODE",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  return {
    status: "success",
    nextDoc: result.doc,
    validationPolicy: graphDecision.validationPolicy,
    validationScope: { kind: "node-subtree", nodeIds: targetNodeIds, fallback: "full-document" },
    historyPolicy: { kind: "push" },
    selectionPatch: {
      selectedNodeId: result.duplicatedNodeId,
      selectionAnchorNodeId: result.duplicatedNodeId,
    },
    diagnostics: {
      operationKind: "node.duplicate",
      reducerPath: "DUPLICATE_NODE",
      validationPolicy: graphDecision.validationPolicy,
      historyPolicy: "push",
      targetNodeIds,
      duplicatedNodeId: result.duplicatedNodeId,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

export function createNodeDuplicateActionResult(
  state: EditorState,
  action: DuplicateNodeAction,
): EditorOperationCommitResult {
  return createNodeDuplicateCommitResult(state, { kind: "node.duplicate", nodeId: action.nodeId })
}

export function createNodeDuplicateOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const command = operation.command?.kind === "node.duplicate"
    ? operation.command
    : operation.payload?.kind === "node.duplicate"
      ? operation.payload
      : undefined
  if (operation.kind !== "node.duplicate" || !command) {
    return {
      status: "failure",
      failure: { reason: "invalid-node-duplicate-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "DUPLICATE_NODE",
      },
    }
  }
  return createNodeDuplicateCommitResult(state, command, operation)
}

function createNodeReorderCommitResult(
  state: EditorState,
  input: NodeReorderCommand,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [input.sourceNodeId, input.targetNodeId]
  const graphDiagnostics = createOperationDocumentGraphDiagnostics(state, operation, targetNodeIds)
  const graphDecision = createEditorGraphPlanningDecision({
    graphDiagnostics,
    capability: "canReorder",
    operationName: "node-reorder",
  })
  if (graphDecision.kind === "failure") {
    return {
      status: "failure",
      failure: { reason: graphDecision.reason },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
      diagnostics: {
        operationKind: "node.reorder",
        reducerPath: "REORDER_BODY_CHILD",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  if (graphDecision.kind === "noop") {
    return {
      status: "noop",
      noopReason: graphDecision.noopReason,
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
      diagnostics: {
        operationKind: "node.reorder",
        reducerPath: "REORDER_BODY_CHILD",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  const nextDoc = reorderBodyChild(
    state.doc,
    input.sectionId,
    input.sourceNodeId,
    input.targetNodeId,
    input.position,
  )
  if (nextDoc === state.doc) {
    return {
      status: "noop",
      noopReason: "body-reorder-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: {
        operationKind: "node.reorder",
        reducerPath: "REORDER_BODY_CHILD",
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }
  return {
    status: "success",
    nextDoc,
    validationPolicy: graphDecision.validationPolicy,
    validationScope: { kind: "node-subtree", nodeIds: targetNodeIds, fallback: "full-document" },
    historyPolicy: { kind: "push" },
    selectionPatch: {
      selectedNodeId: input.sourceNodeId,
      selectionAnchorNodeId: input.sourceNodeId,
    },
    diagnostics: {
      operationKind: "node.reorder",
      reducerPath: "REORDER_BODY_CHILD",
      validationPolicy: graphDecision.validationPolicy,
      historyPolicy: "push",
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

export function createNodeReorderActionResult(
  state: EditorState,
  action: ReorderBodyChildAction,
): EditorOperationCommitResult {
  return createNodeReorderCommitResult(state, {
    kind: "node.reorder",
    sectionId: action.sectionId,
    sourceNodeId: action.sourceNodeId,
    targetNodeId: action.targetNodeId,
    position: action.position,
  })
}

export function createNodeReorderOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const command = operation.command?.kind === "node.reorder"
    ? operation.command
    : operation.payload?.kind === "node.reorder"
      ? operation.payload
      : undefined
  if (operation.kind !== "node.reorder" || !command) {
    return {
      status: "failure",
      failure: { reason: "invalid-node-reorder-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "REORDER_BODY_CHILD",
      },
    }
  }
  return createNodeReorderCommitResult(state, command, operation)
}
