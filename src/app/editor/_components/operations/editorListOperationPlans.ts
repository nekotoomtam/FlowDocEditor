import type { EditorAction, EditorState } from "../editorReducer"
import { createOperationDocumentGraphDiagnostics } from "./editorDocumentGraphDiagnostics"
import { createEditorGraphPlanningDecision } from "./editorGraphPlanningDecision"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationEnvelope } from "./editorOperationTypes"
import {
  createBackspaceListItemAtStartPlan,
  createChangeListItemLevelPlan,
  createExitListItemPlan,
  createToggleListPresetPlan,
} from "./editorReducerListPlan"

type ExitListItemAction = Extract<EditorAction, { type: "EXIT_LIST_ITEM" }>
type ChangeListItemLevelAction = Extract<EditorAction, { type: "CHANGE_LIST_ITEM_LEVEL" }>
type BackspaceListItemAtStartAction = Extract<EditorAction, { type: "BACKSPACE_LIST_ITEM_AT_START" }>
type ToggleListPresetAction = Extract<EditorAction, { type: "TOGGLE_LIST_PRESET" }>
type ListStructureAction =
  | ExitListItemAction
  | ChangeListItemLevelAction
  | BackspaceListItemAtStartAction
  | ToggleListPresetAction
type ListGraphPlanningResult = ReturnType<typeof createEditorGraphPlanningDecision>

function createListPlan(state: EditorState, action: ListStructureAction) {
  switch (action.type) {
    case "EXIT_LIST_ITEM":
      return createExitListItemPlan({
        doc: state.doc,
        nodeId: action.nodeId,
        text: action.text,
      })
    case "CHANGE_LIST_ITEM_LEVEL":
      return createChangeListItemLevelPlan({
        doc: state.doc,
        nodeId: action.nodeId,
        direction: action.direction,
        text: action.text,
        caretIndex: action.caretIndex,
        refocus: action.refocus,
      })
    case "BACKSPACE_LIST_ITEM_AT_START":
      return createBackspaceListItemAtStartPlan({
        doc: state.doc,
        nodeId: action.nodeId,
        text: action.text,
        caretIndex: action.caretIndex,
      })
    case "TOGGLE_LIST_PRESET":
      return createToggleListPresetPlan({
        doc: state.doc,
        nodeId: action.nodeId,
        styleId: action.styleId,
        instanceId: action.instanceId,
        level: action.level,
        text: action.text,
        paragraph: action.paragraph,
      })
  }
}

function createListGraphPlanningContext(
  state: EditorState,
  operation: EditorOperationEnvelope | undefined,
  targetNodeIds: readonly string[],
  operationName: string,
) {
  const graphDiagnostics = createOperationDocumentGraphDiagnostics(state, operation, targetNodeIds)
  const graphDecision = createEditorGraphPlanningDecision({
    graphDiagnostics,
    operationName,
    allowedOperationSurfaces: ["inline"],
    currentValidationPolicy: "full",
    documentV2ValidationPolicy: "scoped",
  })
  return { graphDiagnostics, graphDecision }
}

function createListGraphPreflightResult(
  reducerPath: string,
  targetNodeIds: readonly string[],
  graphDiagnostics: ReturnType<typeof createOperationDocumentGraphDiagnostics>,
  graphDecision: ListGraphPlanningResult,
): EditorOperationCommitResult | null {
  if (graphDecision.kind === "failure") {
    return {
      status: "failure",
      failure: { reason: graphDecision.reason },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
      diagnostics: {
        operationKind: "list.structure.patch",
        reducerPath,
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
        operationKind: "list.structure.patch",
        reducerPath,
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }

  return null
}

function allowedListGraphDecision(
  graphDecision: ListGraphPlanningResult,
): Extract<ListGraphPlanningResult, { kind: "allow" }> {
  if (graphDecision.kind !== "allow") {
    throw new Error("expected allowed list graph decision after preflight")
  }
  return graphDecision
}

function createListStructureCommitResult(
  state: EditorState,
  action: ListStructureAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [action.nodeId]
  const { graphDiagnostics, graphDecision } = createListGraphPlanningContext(
    state,
    operation,
    targetNodeIds,
    "list-structure",
  )
  const preflightResult = createListGraphPreflightResult(action.type, targetNodeIds, graphDiagnostics, graphDecision)
  if (preflightResult != null) return preflightResult
  const allowedGraphDecision = allowedListGraphDecision(graphDecision)
  const plan = createListPlan(state, action)
  const diagnostics = {
    operationKind: "list.structure.patch" as const,
    reducerPath: plan.reducerPath,
    nodeId: action.nodeId,
    targetNodeIds,
    ...graphDiagnostics,
    ...allowedGraphDecision.diagnostics,
  }

  if (plan.nextDoc === plan.noopBaselineDoc) {
    return {
      status: "noop",
      noopReason: "list-structure-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics,
    }
  }

  return {
    status: "success",
    nextDoc: plan.nextDoc,
    validationPolicy: allowedGraphDecision.validationPolicy,
    historyPolicy: { kind: "push", entry: action.history },
    selectionPatch: plan.selectionPatch,
    diagnostics: {
      ...diagnostics,
      validationPolicy: allowedGraphDecision.validationPolicy,
    },
  }
}

export function createListStructureActionResult(
  state: EditorState,
  action: ListStructureAction,
): EditorOperationCommitResult {
  return createListStructureCommitResult(state, action)
}

export function createListStructureOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "list.structure.patch") {
    return {
      status: "failure",
      failure: { reason: "invalid-list-structure-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "LIST_STRUCTURE",
      },
    }
  }

  switch (operation.action.type) {
    case "EXIT_LIST_ITEM":
    case "CHANGE_LIST_ITEM_LEVEL":
    case "BACKSPACE_LIST_ITEM_AT_START":
    case "TOGGLE_LIST_PRESET":
      return createListStructureCommitResult(state, operation.action, operation)
    default:
      return {
        status: "failure",
        failure: { reason: "invalid-list-structure-action" },
        validationPolicy: "read-only",
        historyPolicy: { kind: "none", reason: "invalid operation" },
        diagnostics: {
          operationKind: operation.kind,
          reducerPath: "LIST_STRUCTURE",
        },
      }
  }
}
