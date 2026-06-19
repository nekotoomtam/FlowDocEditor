import { addFlowStackColumn, updateNodeProps } from "@/document"
import type { DocumentNode } from "@/schema"
import type { EditorAction, EditorState } from "../editorReducer"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import { createOperationDocumentGraphDiagnostics } from "./editorDocumentGraphDiagnostics"
import { createEditorGraphPlanningDecision } from "./editorGraphPlanningDecision"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

type FlowRowAddColumnAction = Extract<EditorAction, { type: "FLOW_ROW_ADD_COL" }>
type ResizeColumnsAction = Extract<EditorAction, { type: "RESIZE_COLUMNS" }>
type ResizeRowMinHeightAction = Extract<EditorAction, { type: "RESIZE_ROW_MIN_HEIGHT" }>
type FlowRowLayoutAction = ResizeColumnsAction | ResizeRowMinHeightAction
type FlowRowGraphPlanningResult = ReturnType<typeof createEditorGraphPlanningDecision>

export function resizeColumnsDocument(
  doc: DocumentNode,
  leftStackId: string,
  leftShare: number,
  rightStackId: string,
  rightShare: number,
): DocumentNode {
  let nextDoc = updateNodeProps(doc, leftStackId, { widthShare: leftShare })
  nextDoc = updateNodeProps(nextDoc, rightStackId, { widthShare: rightShare })
  return nextDoc
}

function createFlowRowGraphPlanningDecision(
  state: EditorState,
  operation: EditorOperationEnvelope | undefined,
  targetNodeIds: readonly string[],
  operationName: string,
  currentValidationPolicy: "full" | "scoped",
): { graphDiagnostics: ReturnType<typeof createOperationDocumentGraphDiagnostics>; graphDecision: FlowRowGraphPlanningResult } {
  const graphDiagnostics = createOperationDocumentGraphDiagnostics(state, operation, targetNodeIds)
  return {
    graphDiagnostics,
    graphDecision: createEditorGraphPlanningDecision({
      graphDiagnostics,
      operationName,
      allowedOperationSurfaces: ["flow-row"],
      currentValidationPolicy,
      documentV2ValidationPolicy: currentValidationPolicy,
    }),
  }
}

function createFlowRowGraphFailureResult(
  actionType: EditorAction["type"],
  operationKind: "flow-row.structure.patch" | "flow-row.layout.patch",
  targetNodeIds: readonly string[],
  graphDiagnostics: ReturnType<typeof createOperationDocumentGraphDiagnostics>,
  graphDecision: Extract<FlowRowGraphPlanningResult, { kind: "failure" }>,
): EditorOperationCommitResult {
  return {
    status: "failure",
    failure: { reason: graphDecision.reason },
    validationPolicy: "read-only",
    historyPolicy: { kind: "none", reason: "document graph unresolved" },
    diagnostics: {
      operationKind,
      reducerPath: actionType,
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

function createFlowRowGraphNoopResult(
  actionType: EditorAction["type"],
  operationKind: "flow-row.structure.patch" | "flow-row.layout.patch",
  targetNodeIds: readonly string[],
  graphDiagnostics: ReturnType<typeof createOperationDocumentGraphDiagnostics>,
  graphDecision: Extract<FlowRowGraphPlanningResult, { kind: "noop" }>,
): EditorOperationCommitResult {
  return {
    status: "noop",
    noopReason: graphDecision.noopReason,
    validationPolicy: "read-only",
    historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
    diagnostics: {
      operationKind,
      reducerPath: actionType,
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

function createFlowRowAddColumnCommitResult(
  state: EditorState,
  action: FlowRowAddColumnAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [action.rowId, ...(action.stackId ? [action.stackId] : [])]
  const { graphDiagnostics, graphDecision } = createFlowRowGraphPlanningDecision(
    state,
    operation,
    targetNodeIds,
    "flow-row-add-column",
    "scoped",
  )
  if (graphDecision.kind === "failure") {
    return createFlowRowGraphFailureResult(action.type, "flow-row.structure.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  if (graphDecision.kind === "noop") {
    return createFlowRowGraphNoopResult(action.type, "flow-row.structure.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  const nextDoc = addFlowStackColumn(state.doc, action.rowId, action.stackId, action.position)

  if (nextDoc === state.doc) {
    return {
      status: "noop",
      noopReason: "flow-row-add-column-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: {
        operationKind: "flow-row.structure.patch",
        reducerPath: "FLOW_ROW_ADD_COL",
        rowId: action.rowId,
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }

  return {
    status: "success",
    nextDoc,
    validationPolicy: "scoped",
    validationScope: { kind: "flow-row", rowId: action.rowId, fallback: "full-document" },
    historyPolicy: { kind: "push" },
    diagnostics: {
      operationKind: "flow-row.structure.patch",
      reducerPath: "FLOW_ROW_ADD_COL",
      rowId: action.rowId,
      validationPolicy: "scoped",
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

export function createFlowRowAddColumnActionResult(
  state: EditorState,
  action: FlowRowAddColumnAction,
): EditorOperationCommitResult {
  return createFlowRowAddColumnCommitResult(state, action)
}

export function createFlowRowAddColumnOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "flow-row.structure.patch" || operation.action.type !== "FLOW_ROW_ADD_COL") {
    return {
      status: "failure",
      failure: { reason: "invalid-flow-row-structure-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "FLOW_ROW_ADD_COL",
      },
    }
  }
  return createFlowRowAddColumnCommitResult(state, operation.action, operation)
}

function createResizeColumnsCommitResult(
  state: EditorState,
  action: ResizeColumnsAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [action.leftStackId, action.rightStackId]
  const { graphDiagnostics, graphDecision } = createFlowRowGraphPlanningDecision(
    state,
    operation,
    targetNodeIds,
    "flow-row-resize-columns",
    "full",
  )
  if (graphDecision.kind === "failure") {
    return createFlowRowGraphFailureResult(action.type, "flow-row.layout.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  if (graphDecision.kind === "noop") {
    return createFlowRowGraphNoopResult(action.type, "flow-row.layout.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  const nextDoc = resizeColumnsDocument(
    state.doc,
    action.leftStackId,
    action.leftShare,
    action.rightStackId,
    action.rightShare,
  )

  return {
    status: "success",
    nextDoc,
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    paginatedPatch: action.paginated != null && nextDoc !== state.doc ? { paginated: action.paginated } : undefined,
    diagnostics: {
      operationKind: "flow-row.layout.patch",
      reducerPath: "RESIZE_COLUMNS",
      leftStackId: action.leftStackId,
      rightStackId: action.rightStackId,
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

function createResizeRowMinHeightCommitResult(
  state: EditorState,
  action: ResizeRowMinHeightAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [action.rowId]
  const { graphDiagnostics, graphDecision } = createFlowRowGraphPlanningDecision(
    state,
    operation,
    targetNodeIds,
    "flow-row-resize-min-height",
    "full",
  )
  if (graphDecision.kind === "failure") {
    return createFlowRowGraphFailureResult(action.type, "flow-row.layout.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  if (graphDecision.kind === "noop") {
    return createFlowRowGraphNoopResult(action.type, "flow-row.layout.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  const nextDoc = updateNodeProps(state.doc, action.rowId, { minHeight: action.minHeight })

  return {
    status: "success",
    nextDoc,
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    diagnostics: {
      operationKind: "flow-row.layout.patch",
      reducerPath: "RESIZE_ROW_MIN_HEIGHT",
      rowId: action.rowId,
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

export function createFlowRowLayoutActionResult(
  state: EditorState,
  action: FlowRowLayoutAction,
): EditorOperationCommitResult {
  return action.type === "RESIZE_COLUMNS"
    ? createResizeColumnsCommitResult(state, action)
    : createResizeRowMinHeightCommitResult(state, action)
}

export function createFlowRowLayoutOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "flow-row.layout.patch") {
    return {
      status: "failure",
      failure: { reason: "invalid-flow-row-layout-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "FLOW_ROW_LAYOUT",
      },
    }
  }

  if (operation.action.type === "RESIZE_COLUMNS") {
    return createResizeColumnsCommitResult(state, operation.action, operation)
  }

  if (operation.action.type === "RESIZE_ROW_MIN_HEIGHT") {
    return createResizeRowMinHeightCommitResult(state, operation.action, operation)
  }

  return {
    status: "failure",
    failure: { reason: "invalid-flow-row-layout-action" },
    validationPolicy: "read-only",
    historyPolicy: { kind: "none", reason: "invalid operation" },
    diagnostics: {
      operationKind: operation.kind,
      reducerPath: "FLOW_ROW_LAYOUT",
    },
  }
}
