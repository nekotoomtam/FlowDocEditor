import { applyPlacementOperation } from "@/document"
import type { DragSource, PlacementOperation } from "@/placement"
import type { EditorAction, EditorState } from "../editorReducer"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import { createOperationDocumentGraphDiagnostics } from "./editorDocumentGraphDiagnostics"
import { createEditorGraphPlanningDecision } from "./editorGraphPlanningDecision"
import type { EditorOperationCommand, EditorOperationEnvelope } from "./editorOperationTypes"

type DragCommitAction = Extract<EditorAction, { type: "DRAG_COMMIT" }>
type DragPlacementCommand = Extract<EditorOperationCommand, { kind: "drag.placement" }>
type DragGraphPlanningResult = ReturnType<typeof createEditorGraphPlanningDecision>

function nodeIdsForPlacementOperation(op: PlacementOperation): string[] {
  switch (op.kind) {
    case "insert-inline-field":
      return [op.paragraphId]
    case "insert-before":
    case "insert-after":
      return [op.parentId, op.anchorNodeId]
    case "insert-into-container":
      return [op.containerId]
    case "expand-row-left":
    case "expand-row-right":
    case "insert-stacks-into-row":
    case "add-flow-stack-column":
    case "move-flow-stack-into-row":
      return [op.rowId, op.targetStackId]
    case "move-flow-stack-to-new-row":
      return [op.parentId]
    case "wrap-in-row-left":
    case "wrap-in-row-right":
      return [op.parentId, op.targetNodeId]
  }
}

function nodeIdsForDragSource(source: DragSource): string[] {
  return source.source === "document" || source.source === "document-copy" ? [source.nodeId] : []
}

function uniqueNodeIds(nodeIds: readonly string[]): string[] {
  return Array.from(new Set(nodeIds))
}

function createDragGraphPreflightResult(
  targetNodeIds: readonly string[],
  graphDiagnostics: ReturnType<typeof createOperationDocumentGraphDiagnostics>,
  graphDecision: DragGraphPlanningResult,
  input: DragPlacementCommand,
): EditorOperationCommitResult | null {
  if (graphDecision.kind === "failure") {
    return {
      status: "failure",
      failure: { reason: graphDecision.reason },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
      diagnostics: {
        operationKind: "drag.placement",
        reducerPath: "DRAG_COMMIT",
        sectionId: input.sectionId,
        placementKind: input.op.kind,
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
        operationKind: "drag.placement",
        reducerPath: "DRAG_COMMIT",
        sectionId: input.sectionId,
        placementKind: input.op.kind,
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }

  return null
}

function allowedDragGraphDecision(
  graphDecision: DragGraphPlanningResult,
): Extract<DragGraphPlanningResult, { kind: "allow" }> {
  if (graphDecision.kind !== "allow") {
    throw new Error("expected allowed drag graph decision after preflight")
  }
  return graphDecision
}

function createDragPlacementCommandFromAction(action: DragCommitAction): DragPlacementCommand {
  return { kind: "drag.placement", sectionId: action.sectionId, op: action.op }
}

function createDragPlacementCommandFromOperation(operation: EditorOperationEnvelope): DragPlacementCommand | null {
  return operation.command?.kind === "drag.placement"
    ? operation.command
    : operation.payload?.kind === "drag.placement"
      ? operation.payload
      : null
}

function createDragPlacementCommitResult(
  state: EditorState,
  input: DragPlacementCommand,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (!state.drag) {
    return {
      status: "noop",
      noopReason: "drag-commit-without-active-drag",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "missing active drag" },
      diagnostics: {
        operationKind: "drag.placement",
        reducerPath: "DRAG_COMMIT",
        sectionId: input.sectionId,
        placementKind: input.op.kind,
      },
    }
  }

  const targetNodeIds = uniqueNodeIds([
    ...(operation?.scope.nodeIds ?? []),
    ...nodeIdsForPlacementOperation(input.op),
    ...nodeIdsForDragSource(state.drag.source),
  ])
  const graphDiagnostics = createOperationDocumentGraphDiagnostics(state, operation, targetNodeIds)
  const graphDecision = createEditorGraphPlanningDecision({
    graphDiagnostics,
    operationName: "drag-placement",
    currentValidationPolicy: "full",
    documentV2ValidationPolicy: "full",
  })
  const preflightResult = createDragGraphPreflightResult(targetNodeIds, graphDiagnostics, graphDecision, input)
  if (preflightResult != null) return preflightResult
  const allowedGraphDecision = allowedDragGraphDecision(graphDecision)

  return {
    status: "success",
    nextDoc: applyPlacementOperation(state.doc, input.sectionId, input.op, state.drag.source),
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    selectionPatch: { drag: null },
    diagnostics: {
      operationKind: "drag.placement",
      reducerPath: "DRAG_COMMIT",
      sectionId: input.sectionId,
      placementKind: input.op.kind,
      targetNodeIds,
      ...graphDiagnostics,
      ...allowedGraphDecision.diagnostics,
    },
  }
}

export function createDragPlacementActionResult(
  state: EditorState,
  action: DragCommitAction,
): EditorOperationCommitResult {
  return createDragPlacementCommitResult(state, createDragPlacementCommandFromAction(action))
}

export function createDragPlacementOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const input = createDragPlacementCommandFromOperation(operation)
  if (operation.kind !== "drag.placement" || input == null) {
    return {
      status: "failure",
      failure: { reason: "invalid-drag-placement-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "DRAG_COMMIT",
      },
    }
  }
  return createDragPlacementCommitResult(state, input, operation)
}
