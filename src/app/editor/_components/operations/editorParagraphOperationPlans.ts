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
import type { EditorOperationEnvelope } from "./editorOperationTypes"
import { createEditorReducerMergePlan } from "./editorReducerMergePlan"
import { createEditorReducerSplitPlan } from "./editorReducerSplitPlan"

type SplitParagraphAction = Extract<EditorAction, { type: "SPLIT_PARAGRAPH" }>
type MergeParagraphAction = Extract<EditorAction, { type: "MERGE_PARAGRAPH" }>
type ParagraphGraphPlanningResult = ReturnType<typeof createEditorGraphPlanningDecision>

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
  action: SplitParagraphAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = [action.nodeId]
  const { graphDiagnostics, graphDecision } = createParagraphGraphPlanningContext(state, operation, targetNodeIds, "paragraph-split")
  const preflightResult = createParagraphGraphPreflightResult("paragraph.split", "SPLIT_PARAGRAPH", targetNodeIds, graphDiagnostics, graphDecision)
  if (preflightResult != null) return preflightResult
  const allowedGraphDecision = allowedParagraphGraphDecision(graphDecision)
  const reducerStartedAt = startWysiwygPerfSpan()
  const plan = createEditorReducerSplitPlan({
    doc: state.doc,
    nodeId: action.nodeId,
    splitIndex: action.splitIndex,
    text: action.text,
    newNodeId: action.newNodeId,
    precomputed: action.precomputed,
    precomputedDocValidation: action.precomputedDocValidation,
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
    historyPolicy: { kind: "push", entry: action.history },
    structuralAttribution: plan.attribution,
    paginatedPatch: action.paginated != null ? { paginated: action.paginated } : undefined,
    selectionPatch: action.isOptimistic ? undefined : { lastSplitNodeId: plan.result.newNodeId },
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
  action: MergeParagraphAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const targetNodeIds = [action.nodeId, ...(action.precomputed?.prevNodeId ? [action.precomputed.prevNodeId] : [])]
  const { graphDiagnostics, graphDecision } = createParagraphGraphPlanningContext(state, operation, targetNodeIds, "paragraph-merge")
  const preflightResult = createParagraphGraphPreflightResult("paragraph.merge", "MERGE_PARAGRAPH", targetNodeIds, graphDiagnostics, graphDecision)
  if (preflightResult != null) return preflightResult
  const allowedGraphDecision = allowedParagraphGraphDecision(graphDecision)
  const reducerStartedAt = startWysiwygPerfSpan()
  const plan = createEditorReducerMergePlan({
    doc: state.doc,
    nodeId: action.nodeId,
    text: action.text,
    precomputed: action.precomputed,
    precomputedDocValidation: action.precomputedDocValidation,
    isOptimistic: action.isOptimistic,
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
    historyPolicy: { kind: "push", entry: action.history },
    structuralAttribution: plan.attribution,
    paginatedPatch: action.paginated != null ? { paginated: action.paginated } : undefined,
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
  return createParagraphSplitCommitResult(state, action)
}

export function createParagraphMergeActionResult(
  state: EditorState,
  action: MergeParagraphAction,
): EditorOperationCommitResult {
  return createParagraphMergeCommitResult(state, action)
}

export function createParagraphSplitOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "paragraph.split" || operation.action.type !== "SPLIT_PARAGRAPH") {
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
  return createParagraphSplitCommitResult(state, operation.action, operation)
}

export function createParagraphMergeOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "paragraph.merge" || operation.action.type !== "MERGE_PARAGRAPH") {
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
  return createParagraphMergeCommitResult(state, operation.action, operation)
}
