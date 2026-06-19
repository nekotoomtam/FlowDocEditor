import type {
  EditorDocumentGraphDiagnostics,
  EditorDocumentGraphTargetContext,
} from "./editorDocumentGraphDiagnostics"
import type { EditorOperationValidationPolicy } from "./editorOperationCommit"

export type EditorGraphPlanningCapability = "canDelete" | "canDuplicate" | "canReorder"

export type EditorGraphPlanningDecision =
  | {
      kind: "allow"
      validationPolicy: Extract<EditorOperationValidationPolicy, "full" | "scoped">
      diagnostics: Record<string, unknown>
    }
  | {
      kind: "noop"
      noopReason: string
      diagnostics: Record<string, unknown>
    }
  | {
      kind: "failure"
      reason: string
      diagnostics: Record<string, unknown>
    }

export interface EditorGraphPlanningDecisionOptions {
  graphDiagnostics: EditorDocumentGraphDiagnostics
  operationName: string
  capability?: EditorGraphPlanningCapability
  allowedOperationSurfaces?: EditorDocumentGraphTargetContext["operationSurface"][]
  requireTableContext?: boolean
  currentValidationPolicy?: Extract<EditorOperationValidationPolicy, "full" | "scoped">
  documentV2ValidationPolicy?: Extract<EditorOperationValidationPolicy, "full" | "scoped">
}

function deniedNodeIdsForCapability(
  contexts: readonly EditorDocumentGraphTargetContext[],
  capability: EditorGraphPlanningCapability,
): string[] {
  return contexts
    .filter((context) => context[capability] !== true)
    .map((context) => context.nodeId)
}

function deniedNodeIdsForSurface(
  contexts: readonly EditorDocumentGraphTargetContext[],
  allowedSurfaces: readonly EditorDocumentGraphTargetContext["operationSurface"][],
): string[] {
  const allowed = new Set(allowedSurfaces)
  return contexts
    .filter((context) => !allowed.has(context.operationSurface))
    .map((context) => context.nodeId)
}

function deniedNodeIdsForMissingTableContext(
  contexts: readonly EditorDocumentGraphTargetContext[],
): string[] {
  return contexts
    .filter((context) => context.tableId == null)
    .map((context) => context.nodeId)
}

export function createEditorGraphPlanningDecision({
  graphDiagnostics,
  operationName,
  capability,
  allowedOperationSurfaces,
  requireTableContext = false,
  currentValidationPolicy = "full",
  documentV2ValidationPolicy = "scoped",
}: EditorGraphPlanningDecisionOptions): EditorGraphPlanningDecision {
  if (graphDiagnostics.graphSourceModel !== "document-v2") {
    return {
      kind: "allow",
      validationPolicy: currentValidationPolicy,
      diagnostics: {},
    }
  }

  const baseDiagnostics = {
    graphDecisionSource: "document-v2",
    ...(capability ? { graphDecisionCapability: capability } : {}),
    ...(allowedOperationSurfaces ? { graphDecisionAllowedSurfaces: allowedOperationSurfaces } : {}),
    ...(requireTableContext ? { graphDecisionRequiresTableContext: true } : {}),
  }

  if (!graphDiagnostics.graphContextResolved) {
    return {
      kind: "failure",
      reason: `${operationName}-document-v2-graph-unresolved`,
      diagnostics: {
        ...baseDiagnostics,
        graphDecision: "failure",
        graphDecisionReason: "unresolved-target-context",
      },
    }
  }

  if (capability) {
    const deniedNodeIds = deniedNodeIdsForCapability(graphDiagnostics.graphTargetContexts, capability)
    if (deniedNodeIds.length > 0) {
      return {
        kind: "noop",
        noopReason: `${operationName}-disallowed-by-document-v2-graph`,
        diagnostics: {
          ...baseDiagnostics,
          graphDecision: "deny",
          graphDecisionReason: "capability-disabled",
          graphDecisionDeniedNodeIds: deniedNodeIds,
        },
      }
    }
  }

  if (allowedOperationSurfaces) {
    const deniedNodeIds = deniedNodeIdsForSurface(graphDiagnostics.graphTargetContexts, allowedOperationSurfaces)
    if (deniedNodeIds.length > 0) {
      return {
        kind: "noop",
        noopReason: `${operationName}-disallowed-by-document-v2-graph`,
        diagnostics: {
          ...baseDiagnostics,
          graphDecision: "deny",
          graphDecisionReason: "operation-surface-mismatch",
          graphDecisionDeniedNodeIds: deniedNodeIds,
        },
      }
    }
  }

  if (requireTableContext) {
    const deniedNodeIds = deniedNodeIdsForMissingTableContext(graphDiagnostics.graphTargetContexts)
    if (deniedNodeIds.length > 0) {
      return {
        kind: "noop",
        noopReason: `${operationName}-disallowed-by-document-v2-graph`,
        diagnostics: {
          ...baseDiagnostics,
          graphDecision: "deny",
          graphDecisionReason: "missing-table-context",
          graphDecisionDeniedNodeIds: deniedNodeIds,
        },
      }
    }
  }

  return {
    kind: "allow",
    validationPolicy: documentV2ValidationPolicy,
    diagnostics: {
      ...baseDiagnostics,
      graphDecision: "allow",
    },
  }
}
