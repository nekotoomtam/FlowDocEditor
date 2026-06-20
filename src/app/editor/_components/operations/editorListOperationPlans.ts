import type { EditorAction, EditorState } from "../editorReducer"
import { createOperationDocumentGraphDiagnostics } from "./editorDocumentGraphDiagnostics"
import { createEditorGraphPlanningDecision } from "./editorGraphPlanningDecision"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationCommand, EditorOperationEnvelope, EditorOperationStructuralRuntimeContext } from "./editorOperationTypes"
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
type ListStructureCommand = Extract<EditorOperationCommand, { kind: "list.structure.patch" }>
type ListStructureInput = ListStructureCommand & {
  history?: ListStructureAction["history"]
  caretIndex?: ChangeListItemLevelAction["caretIndex"] | BackspaceListItemAtStartAction["caretIndex"]
  refocus?: ChangeListItemLevelAction["refocus"]
  paragraph?: ToggleListPresetAction["paragraph"]
}
type ListGraphPlanningResult = ReturnType<typeof createEditorGraphPlanningDecision>

function listReducerPath(input: ListStructureInput): string {
  switch (input.mutation) {
    case "exit-item":
      return "EXIT_LIST_ITEM"
    case "change-level":
      return "CHANGE_LIST_ITEM_LEVEL"
    case "backspace-at-start":
      return "BACKSPACE_LIST_ITEM_AT_START"
    case "toggle-preset":
      return "TOGGLE_LIST_PRESET"
  }
}

function createListStructureInputFromAction(action: ListStructureAction): ListStructureInput {
  switch (action.type) {
    case "EXIT_LIST_ITEM":
      return {
        kind: "list.structure.patch",
        mutation: "exit-item",
        nodeId: action.nodeId,
        ...(action.text !== undefined ? { text: action.text } : {}),
        ...(action.history ? { history: action.history } : {}),
      }
    case "CHANGE_LIST_ITEM_LEVEL":
      return {
        kind: "list.structure.patch",
        mutation: "change-level",
        nodeId: action.nodeId,
        direction: action.direction,
        ...(action.text !== undefined ? { text: action.text } : {}),
        ...(action.history ? { history: action.history } : {}),
        ...(action.caretIndex !== undefined ? { caretIndex: action.caretIndex } : {}),
        ...(action.refocus !== undefined ? { refocus: action.refocus } : {}),
      }
    case "BACKSPACE_LIST_ITEM_AT_START":
      return {
        kind: "list.structure.patch",
        mutation: "backspace-at-start",
        nodeId: action.nodeId,
        ...(action.text !== undefined ? { text: action.text } : {}),
        ...(action.history ? { history: action.history } : {}),
        ...(action.caretIndex !== undefined ? { caretIndex: action.caretIndex } : {}),
      }
    case "TOGGLE_LIST_PRESET":
      return {
        kind: "list.structure.patch",
        mutation: "toggle-preset",
        nodeId: action.nodeId,
        styleId: action.styleId,
        instanceId: action.instanceId,
        ...(action.level !== undefined ? { level: action.level } : {}),
        ...(action.text !== undefined ? { text: action.text } : {}),
        ...(action.history ? { history: action.history } : {}),
        ...(action.paragraph ? { paragraph: action.paragraph } : {}),
      }
  }
}

function createListStructureInputFromOperation(operation: EditorOperationEnvelope): ListStructureInput | null {
  const command = operation.command?.kind === "list.structure.patch"
    ? operation.command
    : operation.payload?.kind === "list.structure.patch"
      ? operation.payload
      : null
  if (command == null) return null
  const runtime: EditorOperationStructuralRuntimeContext | undefined = operation.runtime?.structural
  return {
    ...command,
    ...(runtime?.history ? { history: runtime.history } : {}),
    ...(runtime?.caretIndex !== undefined ? { caretIndex: runtime.caretIndex } : {}),
    ...(runtime?.refocus !== undefined ? { refocus: runtime.refocus } : {}),
    ...(runtime?.paragraph ? { paragraph: runtime.paragraph as ToggleListPresetAction["paragraph"] } : {}),
  }
}

function createListPlan(state: EditorState, input: ListStructureInput) {
  switch (input.mutation) {
    case "exit-item":
      return createExitListItemPlan({
        doc: state.doc,
        nodeId: input.nodeId,
        text: input.text,
      })
    case "change-level":
      return createChangeListItemLevelPlan({
        doc: state.doc,
        nodeId: input.nodeId,
        direction: input.direction,
        text: input.text,
        caretIndex: input.caretIndex,
        refocus: input.refocus,
      })
    case "backspace-at-start":
      return createBackspaceListItemAtStartPlan({
        doc: state.doc,
        nodeId: input.nodeId,
        text: input.text,
        caretIndex: input.caretIndex,
      })
    case "toggle-preset":
      return createToggleListPresetPlan({
        doc: state.doc,
        nodeId: input.nodeId,
        styleId: input.styleId,
        instanceId: input.instanceId,
        level: input.level,
        text: input.text,
        paragraph: input.paragraph,
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
  input: ListStructureInput,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = operation?.scope.nodeIds ?? [input.nodeId]
  const { graphDiagnostics, graphDecision } = createListGraphPlanningContext(
    state,
    operation,
    targetNodeIds,
    "list-structure",
  )
  const preflightResult = createListGraphPreflightResult(listReducerPath(input), targetNodeIds, graphDiagnostics, graphDecision)
  if (preflightResult != null) return preflightResult
  const allowedGraphDecision = allowedListGraphDecision(graphDecision)
  const plan = createListPlan(state, input)
  const diagnostics = {
    operationKind: "list.structure.patch" as const,
    reducerPath: plan.reducerPath,
    nodeId: input.nodeId,
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
    historyPolicy: { kind: "push", entry: input.history },
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
  return createListStructureCommitResult(state, createListStructureInputFromAction(action))
}

export function createListStructureOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const input = createListStructureInputFromOperation(operation)
  if (operation.kind !== "list.structure.patch" || input == null) {
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

  return createListStructureCommitResult(state, input, operation)
}
