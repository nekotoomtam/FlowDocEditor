import {
  safeCreateVNextEditorBridgeRuntime,
  type VNextEditorBridgeRuntimeStatus,
  type VNextOperationKind,
} from "../../../../../vnext-workspace/src/index"

export type EditorVNextBridgeHostSnapshotStatus = VNextEditorBridgeRuntimeStatus

export interface EditorVNextBridgeHostOptions {
  measurementProfileId?: string
}

export interface EditorVNextBridgeHostIssueSummary {
  code: string
  path: string
  message: string
}

export interface EditorVNextBridgeHostSnapshot {
  source: "editor-vnext-bridge-host"
  input: "canonical-vnext-package"
  status: EditorVNextBridgeHostSnapshotStatus
  documentId: string | null
  packageVersion: 2 | null
  documentVersion: 3 | null
  pageCount: number
  graph: {
    sectionCount: number
    zoneCount: number
    nodeCount: number
    issueCount: number
  }
  rendererConsumption: {
    status: "consumable" | "blocked"
    commandCount: number
    blockingIssueCount: number
    warningIssueCount: number
    mayRelayout: false
    requiresAuthoredDocumentForLayout: false
  }
  exportReadiness: {
    status: EditorVNextBridgeHostSnapshotStatus
    blockingIssueCount: number
    warningIssueCount: number
  }
  supportedOperationKinds: readonly VNextOperationKind[]
  issues: EditorVNextBridgeHostIssueSummary[]
}

export type EditorVNextBridgeHostResult =
  | { ok: true; snapshot: EditorVNextBridgeHostSnapshot }
  | { ok: false; reason: string; snapshot: EditorVNextBridgeHostSnapshot }

function summarizeIssues(issues: readonly { code: string; path?: string; message: string }[]): EditorVNextBridgeHostIssueSummary[] {
  return issues.slice(0, 10).map((issue) => ({
    code: issue.code,
    path: issue.path ?? "",
    message: issue.message,
  }))
}

function failedSnapshot(issues: EditorVNextBridgeHostIssueSummary[]): EditorVNextBridgeHostSnapshot {
  return {
    source: "editor-vnext-bridge-host",
    input: "canonical-vnext-package",
    status: "blocked",
    documentId: null,
    packageVersion: null,
    documentVersion: null,
    pageCount: 0,
    graph: {
      sectionCount: 0,
      zoneCount: 0,
      nodeCount: 0,
      issueCount: issues.length,
    },
    rendererConsumption: {
      status: "blocked",
      commandCount: 0,
      blockingIssueCount: issues.length,
      warningIssueCount: 0,
      mayRelayout: false,
      requiresAuthoredDocumentForLayout: false,
    },
    exportReadiness: {
      status: "blocked",
      blockingIssueCount: issues.length,
      warningIssueCount: 0,
    },
    supportedOperationKinds: [],
    issues,
  }
}

export function createEditorVNextBridgeHostSnapshot(
  value: unknown,
  options: EditorVNextBridgeHostOptions = {},
): EditorVNextBridgeHostResult {
  const result = safeCreateVNextEditorBridgeRuntime(value, {
    source: "canonical-vnext-package",
    measurementProfileId: options.measurementProfileId,
  })

  if (!result.ok) {
    const issues = summarizeIssues(result.issues)
    return {
      ok: false,
      reason: result.reason,
      snapshot: failedSnapshot(issues),
    }
  }

  const runtime = result.runtime
  return {
    ok: true,
    snapshot: {
      source: "editor-vnext-bridge-host",
      input: "canonical-vnext-package",
      status: runtime.status,
      documentId: runtime.package.id,
      packageVersion: runtime.packageVersion,
      documentVersion: runtime.documentVersion,
      pageCount: runtime.pagination.pageCount,
      graph: {
        sectionCount: runtime.graph.sectionsById.size,
        zoneCount: runtime.graph.zonesById.size,
        nodeCount: runtime.graph.nodesById.size,
        issueCount: runtime.diagnostics.graphIssueCount,
      },
      rendererConsumption: {
        status: runtime.rendererConsumption.status,
        commandCount: runtime.rendererConsumption.commandCount,
        blockingIssueCount: runtime.diagnostics.rendererBlockingIssueCount,
        warningIssueCount: runtime.diagnostics.rendererWarningIssueCount,
        mayRelayout: runtime.rendererConsumption.rendererContract.mayRelayout,
        requiresAuthoredDocumentForLayout: runtime.rendererConsumption.rendererContract.requiresAuthoredDocumentForLayout,
      },
      exportReadiness: {
        status: runtime.exportReadiness.status,
        blockingIssueCount: runtime.diagnostics.exportBlockingIssueCount,
        warningIssueCount: runtime.diagnostics.exportWarningIssueCount,
      },
      supportedOperationKinds: runtime.diagnostics.supportedOperationKinds,
      issues: [
        ...summarizeIssues(runtime.exportReadiness.blockingIssues),
        ...summarizeIssues(runtime.exportReadiness.warningIssues),
      ],
    },
  }
}
