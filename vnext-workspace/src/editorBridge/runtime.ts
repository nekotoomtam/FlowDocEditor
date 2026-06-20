import type { RelationshipGraph } from "../graph/relationshipGraph.js"
import { buildRelationshipGraph } from "../graph/relationshipGraph.js"
import type { VNextOperationKind } from "../operations/documentOperations.js"
import type {
  FlowDocPackageParseIssue,
  FlowDocPackageParseReason,
  FlowDocPackageV2DocumentVNext,
} from "../persistence/package.js"
import { safeParseFlowDocPackageV2DocumentVNext } from "../persistence/package.js"
import type {
  VNextMeasuredPagination,
  VNextMeasuredPaginationOptions,
} from "../pagination/measuredPagination.js"
import { paginateVNextDocument } from "../pagination/measuredPagination.js"
import type { VNextMeasuredPaginationExportReadiness } from "../pagination/exportReadiness.js"
import { assessVNextMeasuredPaginationExportReadiness } from "../pagination/exportReadiness.js"
import type { VNextMeasuredRendererConsumption } from "../pagination/rendererConsumption.js"
import { buildVNextMeasuredRendererConsumption } from "../pagination/rendererConsumption.js"

export type VNextEditorBridgeRuntimeSource =
  | "canonical-vnext-package"
  | "fixture"

export type VNextEditorBridgeRuntimeStatus =
  | "ready"
  | "ready-with-warnings"
  | "blocked"

export type VNextEditorBridgeRuntimeFailureReason =
  | FlowDocPackageParseReason
  | "invalid-document"

export interface VNextEditorBridgeRuntimeOptions extends VNextMeasuredPaginationOptions {
  source?: VNextEditorBridgeRuntimeSource
}

export interface VNextEditorBridgeRuntimeDiagnostics {
  graphIssueCount: number
  paginationWarningCount: number
  rendererBlockingIssueCount: number
  rendererWarningIssueCount: number
  exportBlockingIssueCount: number
  exportWarningIssueCount: number
  supportedOperationKinds: readonly VNextOperationKind[]
}

export interface VNextEditorBridgeRuntime {
  source: "vnext-editor-bridge-runtime"
  sourceKind: VNextEditorBridgeRuntimeSource
  status: VNextEditorBridgeRuntimeStatus
  packageVersion: 2
  documentVersion: 3
  package: FlowDocPackageV2DocumentVNext
  graph: RelationshipGraph
  pagination: VNextMeasuredPagination
  rendererConsumption: VNextMeasuredRendererConsumption
  exportReadiness: VNextMeasuredPaginationExportReadiness
  diagnostics: VNextEditorBridgeRuntimeDiagnostics
}

export type VNextEditorBridgeRuntimeResult =
  | { ok: true; runtime: VNextEditorBridgeRuntime }
  | {
      ok: false
      reason: VNextEditorBridgeRuntimeFailureReason
      issues: FlowDocPackageParseIssue[]
    }

export const VNEXT_EDITOR_BRIDGE_SUPPORTED_OPERATION_KINDS: readonly VNextOperationKind[] = [
  "node.delete",
  "node.duplicate",
  "node.reorder",
  "columns.insert",
  "columns.layout.patch",
  "text-block.insert",
  "text-block.text.replace",
  "table.row.insert",
  "table.row.delete",
  "table.column.insert",
  "table.column.delete",
]

function graphErrorIssue(error: unknown): FlowDocPackageParseIssue {
  return {
    severity: "error",
    code: "invalid-document",
    path: "document",
    message: error instanceof Error ? error.message : "document graph validation failed",
  }
}

function statusFromReadiness(
  exportReadiness: VNextMeasuredPaginationExportReadiness,
): VNextEditorBridgeRuntimeStatus {
  return exportReadiness.status
}

export function safeCreateVNextEditorBridgeRuntime(
  value: unknown,
  options: VNextEditorBridgeRuntimeOptions = {},
): VNextEditorBridgeRuntimeResult {
  const parsed = safeParseFlowDocPackageV2DocumentVNext(value)

  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      issues: parsed.issues,
    }
  }

  try {
    const graph = buildRelationshipGraph(parsed.package.document)
    const pagination = paginateVNextDocument(parsed.package.document, {
      ...options,
      data: options.data ?? parsed.package.data?.values,
    })
    const rendererConsumption = buildVNextMeasuredRendererConsumption(pagination)
    const exportReadiness = assessVNextMeasuredPaginationExportReadiness(pagination)

    return {
      ok: true,
      runtime: {
        source: "vnext-editor-bridge-runtime",
        sourceKind: options.source ?? "canonical-vnext-package",
        status: statusFromReadiness(exportReadiness),
        packageVersion: parsed.package.packageVersion,
        documentVersion: parsed.package.document.version,
        package: parsed.package,
        graph,
        pagination,
        rendererConsumption,
        exportReadiness,
        diagnostics: {
          graphIssueCount: graph.diagnostics.issues.length,
          paginationWarningCount: pagination.warnings.length,
          rendererBlockingIssueCount: rendererConsumption.blockingIssues.length,
          rendererWarningIssueCount: rendererConsumption.warningIssues.length,
          exportBlockingIssueCount: exportReadiness.blockingIssues.length,
          exportWarningIssueCount: exportReadiness.warningIssues.length,
          supportedOperationKinds: VNEXT_EDITOR_BRIDGE_SUPPORTED_OPERATION_KINDS,
        },
      },
    }
  } catch (error) {
    return {
      ok: false,
      reason: "invalid-document",
      issues: [graphErrorIssue(error)],
    }
  }
}

export function createVNextEditorBridgeRuntime(
  value: unknown,
  options: VNextEditorBridgeRuntimeOptions = {},
): VNextEditorBridgeRuntime {
  const result = safeCreateVNextEditorBridgeRuntime(value, options)

  if (!result.ok) {
    throw new Error(result.issues.map((issue) => `[${issue.path}] ${issue.message}`).join("\n"))
  }

  return result.runtime
}
