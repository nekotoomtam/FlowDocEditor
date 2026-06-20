import { addFlowStackColumn, updateNodeProps } from "@/document"
import type { DocumentNode } from "@/schema"
import type { EditorAction, EditorState } from "../editorReducer"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import { createOperationDocumentGraphDiagnostics } from "./editorDocumentGraphDiagnostics"
import { createEditorGraphPlanningDecision } from "./editorGraphPlanningDecision"
import type { EditorOperationCommand, EditorOperationEnvelope } from "./editorOperationTypes"

type FlowRowAddColumnAction = Extract<EditorAction, { type: "FLOW_ROW_ADD_COL" }>
type ResizeColumnsAction = Extract<EditorAction, { type: "RESIZE_COLUMNS" }>
type ResizeRowMinHeightAction = Extract<EditorAction, { type: "RESIZE_ROW_MIN_HEIGHT" }>
type FlowRowLayoutAction = ResizeColumnsAction | ResizeRowMinHeightAction
type FlowRowAddColumnCommand = Extract<EditorOperationCommand, { kind: "flow-row.structure.patch" }>
type ResizeColumnsCommand = Extract<EditorOperationCommand, { kind: "flow-row.layout.patch"; layoutType: "resize-columns" }>
type ResizeRowMinHeightCommand = Extract<EditorOperationCommand, { kind: "flow-row.layout.patch"; layoutType: "resize-row-min-height" }>
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
  input: FlowRowAddColumnCommand,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [input.rowId, ...(input.stackId ? [input.stackId] : [])]
  const { graphDiagnostics, graphDecision } = createFlowRowGraphPlanningDecision(
    state,
    operation,
    targetNodeIds,
    "flow-row-add-column",
    "scoped",
  )
  if (graphDecision.kind === "failure") {
    return createFlowRowGraphFailureResult("FLOW_ROW_ADD_COL", "flow-row.structure.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  if (graphDecision.kind === "noop") {
    return createFlowRowGraphNoopResult("FLOW_ROW_ADD_COL", "flow-row.structure.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  const nextDoc = addFlowStackColumn(state.doc, input.rowId, input.stackId, input.position)

  if (nextDoc === state.doc) {
    return {
      status: "noop",
      noopReason: "flow-row-add-column-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: {
        operationKind: "flow-row.structure.patch",
        reducerPath: "FLOW_ROW_ADD_COL",
        rowId: input.rowId,
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
    validationScope: { kind: "flow-row", rowId: input.rowId, fallback: "full-document" },
    historyPolicy: { kind: "push" },
    diagnostics: {
      operationKind: "flow-row.structure.patch",
      reducerPath: "FLOW_ROW_ADD_COL",
      rowId: input.rowId,
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
  return createFlowRowAddColumnCommitResult(state, {
    kind: "flow-row.structure.patch",
    rowId: action.rowId,
    ...(action.stackId ? { stackId: action.stackId } : {}),
    ...(action.position ? { position: action.position } : {}),
  })
}

export function createFlowRowAddColumnOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const command = operation.command?.kind === "flow-row.structure.patch"
    ? operation.command
    : operation.payload?.kind === "flow-row.structure.patch"
      ? operation.payload
      : undefined
  if (operation.kind !== "flow-row.structure.patch" || !command) {
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
  return createFlowRowAddColumnCommitResult(state, command, operation)
}

function createResizeColumnsCommitResult(
  state: EditorState,
  input: ResizeColumnsCommand,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [input.leftStackId, input.rightStackId]
  const { graphDiagnostics, graphDecision } = createFlowRowGraphPlanningDecision(
    state,
    operation,
    targetNodeIds,
    "flow-row-resize-columns",
    "full",
  )
  if (graphDecision.kind === "failure") {
    return createFlowRowGraphFailureResult("RESIZE_COLUMNS", "flow-row.layout.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  if (graphDecision.kind === "noop") {
    return createFlowRowGraphNoopResult("RESIZE_COLUMNS", "flow-row.layout.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  const nextDoc = resizeColumnsDocument(
    state.doc,
    input.leftStackId,
    input.leftShare,
    input.rightStackId,
    input.rightShare,
  )

  return {
    status: "success",
    nextDoc,
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    paginatedPatch: input.paginated != null && nextDoc !== state.doc ? { paginated: input.paginated } : undefined,
    diagnostics: {
      operationKind: "flow-row.layout.patch",
      reducerPath: "RESIZE_COLUMNS",
      leftStackId: input.leftStackId,
      rightStackId: input.rightStackId,
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

function createResizeRowMinHeightCommitResult(
  state: EditorState,
  input: ResizeRowMinHeightCommand,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [input.rowId]
  const { graphDiagnostics, graphDecision } = createFlowRowGraphPlanningDecision(
    state,
    operation,
    targetNodeIds,
    "flow-row-resize-min-height",
    "full",
  )
  if (graphDecision.kind === "failure") {
    return createFlowRowGraphFailureResult("RESIZE_ROW_MIN_HEIGHT", "flow-row.layout.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  if (graphDecision.kind === "noop") {
    return createFlowRowGraphNoopResult("RESIZE_ROW_MIN_HEIGHT", "flow-row.layout.patch", targetNodeIds, graphDiagnostics, graphDecision)
  }
  const nextDoc = updateNodeProps(state.doc, input.rowId, { minHeight: input.minHeight })

  return {
    status: "success",
    nextDoc,
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    diagnostics: {
      operationKind: "flow-row.layout.patch",
      reducerPath: "RESIZE_ROW_MIN_HEIGHT",
      rowId: input.rowId,
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
    ? createResizeColumnsCommitResult(state, {
        kind: "flow-row.layout.patch",
        layoutType: "resize-columns",
        leftStackId: action.leftStackId,
        leftShare: action.leftShare,
        rightStackId: action.rightStackId,
        rightShare: action.rightShare,
        ...(action.paginated ? { paginated: action.paginated } : {}),
      })
    : createResizeRowMinHeightCommitResult(state, {
        kind: "flow-row.layout.patch",
        layoutType: "resize-row-min-height",
        rowId: action.rowId,
        minHeight: action.minHeight,
      })
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

  const command = operation.command?.kind === "flow-row.layout.patch"
    ? operation.command
    : operation.payload?.kind === "flow-row.layout.patch"
      ? operation.payload
      : undefined
  if (command?.layoutType === "resize-columns") {
    return createResizeColumnsCommitResult(state, command, operation)
  }

  if (command?.layoutType === "resize-row-min-height") {
    return createResizeRowMinHeightCommitResult(state, command, operation)
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
