import type { EditorAction, EditorState } from "../editorReducer"
import {
  finishStructuralReducerAttribution,
} from "../editorReducerCommit"
import { startWysiwygPerfSpan } from "../wysiwygPerformance"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import {
  createOperationDocumentGraphDiagnostics,
} from "./editorDocumentGraphDiagnostics"
import { createEditorGraphPlanningDecision } from "./editorGraphPlanningDecision"
import type { EditorOperationCommand, EditorOperationEnvelope, EditorOperationStructuralRuntimeContext } from "./editorOperationTypes"
import { createEditorReducerMergePlan } from "./editorReducerMergePlan"
import { createEditorReducerSplitPlan } from "./editorReducerSplitPlan"

type SplitParagraphAction = Extract<EditorAction, { type: "SPLIT_PARAGRAPH" }>
type MergeParagraphAction = Extract<EditorAction, { type: "MERGE_PARAGRAPH" }>
type ParagraphSplitCommand = Extract<EditorOperationCommand, { kind: "paragraph.split" }>
type ParagraphMergeCommand = Extract<EditorOperationCommand, { kind: "paragraph.merge" }>
type ParagraphSplitInput = ParagraphSplitCommand & {
  history?: SplitParagraphAction["history"]
  paginated?: SplitParagraphAction["paginated"]
  precomputed?: SplitParagraphAction["precomputed"]
  precomputedDocValidation?: SplitParagraphAction["precomputedDocValidation"]
  isOptimistic?: SplitParagraphAction["isOptimistic"]
}
type ParagraphMergeInput = ParagraphMergeCommand & {
  history?: MergeParagraphAction["history"]
  paginated?: MergeParagraphAction["paginated"]
  precomputed?: MergeParagraphAction["precomputed"]
  precomputedDocValidation?: MergeParagraphAction["precomputedDocValidation"]
  isOptimistic?: MergeParagraphAction["isOptimistic"]
}
type ParagraphGraphPlanningResult = ReturnType<typeof createEditorGraphPlanningDecision>

function paragraphRuntime(operation: EditorOperationEnvelope | undefined): EditorOperationStructuralRuntimeContext | undefined {
  return operation?.runtime?.structural
}

function createParagraphSplitInputFromAction(action: SplitParagraphAction): ParagraphSplitInput {
  return {
    kind: "paragraph.split",
    nodeId: action.nodeId,
    splitIndex: action.splitIndex,
    ...(action.text !== undefined ? { text: action.text } : {}),
    ...(action.newNodeId ? { newNodeId: action.newNodeId } : {}),
    ...(action.history ? { history: action.history } : {}),
    ...(action.paginated ? { paginated: action.paginated } : {}),
    ...(action.precomputed ? { precomputed: action.precomputed } : {}),
    ...(action.precomputedDocValidation ? { precomputedDocValidation: action.precomputedDocValidation } : {}),
    ...(action.isOptimistic !== undefined ? { isOptimistic: action.isOptimistic } : {}),
  }
}

function createParagraphMergeInputFromAction(action: MergeParagraphAction): ParagraphMergeInput {
  return {
    kind: "paragraph.merge",
    nodeId: action.nodeId,
    ...(action.text !== undefined ? { text: action.text } : {}),
    ...(action.history ? { history: action.history } : {}),
    ...(action.paginated ? { paginated: action.paginated } : {}),
    ...(action.precomputed ? { precomputed: action.precomputed } : {}),
    ...(action.precomputedDocValidation ? { precomputedDocValidation: action.precomputedDocValidation } : {}),
    ...(action.isOptimistic !== undefined ? { isOptimistic: action.isOptimistic } : {}),
  }
}

function createParagraphSplitInputFromOperation(operation: EditorOperationEnvelope): ParagraphSplitInput | null {
  const command = operation.command?.kind === "paragraph.split"
    ? operation.command
    : operation.payload?.kind === "paragraph.split"
      ? operation.payload
      : null
  if (command == null) return null
  const runtime = paragraphRuntime(operation)
  return {
    ...command,
    ...(runtime?.history ? { history: runtime.history } : {}),
    ...(runtime?.paginated ? { paginated: runtime.paginated } : {}),
    ...(runtime?.precomputed ? { precomputed: runtime.precomputed as SplitParagraphAction["precomputed"] } : {}),
    ...(runtime?.precomputedDocValidation ? { precomputedDocValidation: runtime.precomputedDocValidation as SplitParagraphAction["precomputedDocValidation"] } : {}),
    ...(runtime?.isOptimistic !== undefined ? { isOptimistic: runtime.isOptimistic } : {}),
  }
}

function createParagraphMergeInputFromOperation(operation: EditorOperationEnvelope): ParagraphMergeInput | null {
  const command = operation.command?.kind === "paragraph.merge"
    ? operation.command
    : operation.payload?.kind === "paragraph.merge"
      ? operation.payload
      : null
  if (command == null) return null
  const runtime = paragraphRuntime(operation)
  return {
    ...command,
    ...(runtime?.history ? { history: runtime.history } : {}),
    ...(runtime?.paginated ? { paginated: runtime.paginated } : {}),
    ...(runtime?.precomputed ? { precomputed: runtime.precomputed as MergeParagraphAction["precomputed"] } : {}),
    ...(runtime?.precomputedDocValidation ? { precomputedDocValidation: runtime.precomputedDocValidation as MergeParagraphAction["precomputedDocValidation"] } : {}),
    ...(runtime?.isOptimistic !== undefined ? { isOptimistic: runtime.isOptimistic } : {}),
  }
}

function createParagraphGraphPlanningContext(
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

function createParagraphGraphPreflightResult(
  operationKind: "paragraph.split" | "paragraph.merge",
  reducerPath: string,
  targetNodeIds: readonly string[],
  graphDiagnostics: ReturnType<typeof createOperationDocumentGraphDiagnostics>,
  graphDecision: ParagraphGraphPlanningResult,
): EditorOperationCommitResult | null {
  if (graphDecision.kind === "failure") {
    return {
      status: "failure",
      failure: { reason: graphDecision.reason },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
      diagnostics: {
        operationKind,
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
        operationKind,
        reducerPath,
        targetNodeIds,
        ...graphDiagnostics,
        ...graphDecision.diagnostics,
      },
    }
  }

  return null
}

function allowedParagraphGraphDecision(
  graphDecision: ParagraphGraphPlanningResult,
): Extract<ParagraphGraphPlanningResult, { kind: "allow" }> {
  if (graphDecision.kind !== "allow") {
    throw new Error("expected allowed paragraph graph decision after preflight")
  }
  return graphDecision
}

function createParagraphSplitCommitResult(
  state: EditorState,
  input: ParagraphSplitInput,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = [input.nodeId]
  const { graphDiagnostics, graphDecision } = createParagraphGraphPlanningContext(state, operation, targetNodeIds, "paragraph-split")
  const preflightResult = createParagraphGraphPreflightResult("paragraph.split", "SPLIT_PARAGRAPH", targetNodeIds, graphDiagnostics, graphDecision)
  if (preflightResult != null) return preflightResult
  const allowedGraphDecision = allowedParagraphGraphDecision(graphDecision)
  const reducerStartedAt = startWysiwygPerfSpan()
  const plan = createEditorReducerSplitPlan({
    doc: state.doc,
    nodeId: input.nodeId,
    splitIndex: input.splitIndex,
    text: input.text,
    newNodeId: input.newNodeId,
    precomputed: input.precomputed,
    precomputedDocValidation: input.precomputedDocValidation,
    reducerStartedAt,
  })
  if (plan.status === "noop") {
    finishStructuralReducerAttribution(plan.attribution, "reducer-total", reducerStartedAt, {
      active: false,
      validationMode: plan.validationMode,
    })
    return {
      status: "noop",
      noopReason: "paragraph-split-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: {
        operationKind: "paragraph.split",
        reducerPath: plan.attribution.reducerPath,
        targetNodeIds,
        validationMode: plan.validationMode,
        ...graphDiagnostics,
        ...allowedGraphDecision.diagnostics,
      },
    }
  }

  finishStructuralReducerAttribution(plan.attribution, "reducer-total", reducerStartedAt, {
    validationMode: plan.validationPolicy,
    active: true,
  })
  return {
    status: "success",
    nextDoc: plan.result.doc,
    validationPolicy: plan.validationPolicy,
    historyPolicy: { kind: "push", entry: input.history },
    structuralAttribution: plan.attribution,
    paginatedPatch: input.paginated != null ? { paginated: input.paginated } : undefined,
    selectionPatch: input.isOptimistic ? undefined : { lastSplitNodeId: plan.result.newNodeId },
    diagnostics: {
      operationKind: "paragraph.split",
      reducerPath: plan.attribution.reducerPath,
      validationPolicy: plan.validationPolicy,
      targetNodeIds,
      ...graphDiagnostics,
      ...allowedGraphDecision.diagnostics,
    },
  }
}

function createParagraphMergeCommitResult(
  state: EditorState,
  input: ParagraphMergeInput,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = [input.nodeId, ...(input.precomputed?.prevNodeId ? [input.precomputed.prevNodeId] : [])]
  const { graphDiagnostics, graphDecision } = createParagraphGraphPlanningContext(state, operation, targetNodeIds, "paragraph-merge")
  const preflightResult = createParagraphGraphPreflightResult("paragraph.merge", "MERGE_PARAGRAPH", targetNodeIds, graphDiagnostics, graphDecision)
  if (preflightResult != null) return preflightResult
  const allowedGraphDecision = allowedParagraphGraphDecision(graphDecision)
  const reducerStartedAt = startWysiwygPerfSpan()
  const plan = createEditorReducerMergePlan({
    doc: state.doc,
    nodeId: input.nodeId,
    text: input.text,
    precomputed: input.precomputed,
    precomputedDocValidation: input.precomputedDocValidation,
    isOptimistic: input.isOptimistic,
    reducerStartedAt,
  })
  if (plan.status === "noop") {
    finishStructuralReducerAttribution(plan.totalAttribution, "reducer-total", reducerStartedAt, {
      validationMode: "full",
      active: false,
    })
    return {
      status: "noop",
      noopReason: "paragraph-merge-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: {
        operationKind: "paragraph.merge",
        reducerPath: plan.attribution.reducerPath,
        targetNodeIds,
        validationPolicy: plan.validationMode,
        ...graphDiagnostics,
        ...allowedGraphDecision.diagnostics,
      },
    }
  }

  finishStructuralReducerAttribution(plan.totalAttribution, "reducer-total", reducerStartedAt, {
    validationMode: plan.validationPolicy,
    active: true,
  })
  return {
    status: "success",
    nextDoc: plan.result.doc,
    validationPolicy: plan.validationPolicy,
    historyPolicy: { kind: "push", entry: input.history },
    structuralAttribution: plan.attribution,
    paginatedPatch: input.paginated != null ? { paginated: input.paginated } : undefined,
    selectionPatch: plan.selectionPatch,
    diagnostics: {
      operationKind: "paragraph.merge",
      reducerPath: plan.attribution.reducerPath,
      validationPolicy: plan.validationPolicy,
      targetNodeIds,
      ...graphDiagnostics,
      ...allowedGraphDecision.diagnostics,
    },
  }
}

export function createParagraphSplitActionResult(
  state: EditorState,
  action: SplitParagraphAction,
): EditorOperationCommitResult {
  return createParagraphSplitCommitResult(state, createParagraphSplitInputFromAction(action))
}

export function createParagraphMergeActionResult(
  state: EditorState,
  action: MergeParagraphAction,
): EditorOperationCommitResult {
  return createParagraphMergeCommitResult(state, createParagraphMergeInputFromAction(action))
}

export function createParagraphSplitOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const input = createParagraphSplitInputFromOperation(operation)
  if (operation.kind !== "paragraph.split" || input == null) {
    return {
      status: "failure",
      failure: { reason: "invalid-paragraph-split-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "SPLIT_PARAGRAPH",
      },
    }
  }
  return createParagraphSplitCommitResult(state, input, operation)
}

export function createParagraphMergeOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const input = createParagraphMergeInputFromOperation(operation)
  if (operation.kind !== "paragraph.merge" || input == null) {
    return {
      status: "failure",
      failure: { reason: "invalid-paragraph-merge-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "MERGE_PARAGRAPH",
      },
    }
  }
  return createParagraphMergeCommitResult(state, input, operation)
}
