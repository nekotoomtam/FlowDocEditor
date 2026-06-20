import type { VNextMeasuredPagination, VNextMeasuredPaginationWarning } from "./measuredPagination.js"
import {
  buildVNextMeasuredRendererConsumption,
  type VNextMeasuredRendererConsumptionIssue,
} from "./rendererConsumption.js"

export type VNextExportReadinessStatus = "ready" | "ready-with-warnings" | "blocked"

export interface VNextExportReadinessIssue {
  severity: "blocking" | "warning"
  code: VNextMeasuredPaginationWarning["code"] | VNextMeasuredRendererConsumptionIssue["code"]
  sectionId: string
  nodeId: string
  pageIndex?: number
  message: string
}

export interface VNextMeasuredPaginationExportReadiness {
  documentId: string
  source: "vnext-measured-pagination"
  status: VNextExportReadinessStatus
  pageCount: number
  rendererContract: {
    pdf: {
      consumes: "measured-pagination-output"
      mayRelayout: false
    }
    docx: {
      consumes: "measured-pagination-output"
      mayRelayout: false
      mayUseSourceDocumentForStructure: true
    }
  }
  rendererConsumption: {
    source: "vnext-measured-pagination"
    status: "consumable" | "blocked"
    consumes: "measured-pagination-fragments"
    requiresAuthoredDocumentForLayout: false
    mayRelayout: false
    blockingIssueCount: number
    warningIssueCount: number
  }
  blockingIssues: VNextExportReadinessIssue[]
  warningIssues: VNextExportReadinessIssue[]
}

const BLOCKING_WARNING_CODES = new Set<VNextMeasuredPaginationWarning["code"]>([
  "forced-overflow",
  "missing-source-item",
  "table-row-forced-overflow",
])

function toIssue(warning: VNextMeasuredPaginationWarning): VNextExportReadinessIssue {
  return {
    severity: BLOCKING_WARNING_CODES.has(warning.code) ? "blocking" : "warning",
    code: warning.code,
    sectionId: warning.sectionId,
    nodeId: warning.nodeId,
    pageIndex: warning.pageIndex,
    message: warning.message,
  }
}

function rendererIssueToIssue(issue: VNextMeasuredRendererConsumptionIssue): VNextExportReadinessIssue {
  return {
    severity: issue.severity,
    code: issue.code,
    sectionId: issue.sectionId,
    nodeId: issue.nodeId,
    pageIndex: issue.pageIndex,
    message: issue.message,
  }
}

export function assessVNextMeasuredPaginationExportReadiness(
  pagination: VNextMeasuredPagination,
): VNextMeasuredPaginationExportReadiness {
  const rendererConsumption = buildVNextMeasuredRendererConsumption(pagination)
  const issues = [
    ...pagination.warnings.map(toIssue),
    ...rendererConsumption.blockingIssues.map(rendererIssueToIssue),
    ...rendererConsumption.warningIssues.map(rendererIssueToIssue),
  ]
  const blockingIssues = issues.filter((issue) => issue.severity === "blocking")
  const warningIssues = issues.filter((issue) => issue.severity === "warning")

  return {
    documentId: pagination.documentId,
    source: "vnext-measured-pagination",
    status: blockingIssues.length > 0
      ? "blocked"
      : warningIssues.length > 0
        ? "ready-with-warnings"
        : "ready",
    pageCount: pagination.pageCount,
    rendererContract: {
      pdf: {
        consumes: "measured-pagination-output",
        mayRelayout: false,
      },
      docx: {
        consumes: "measured-pagination-output",
        mayRelayout: false,
        mayUseSourceDocumentForStructure: true,
      },
    },
    rendererConsumption: {
      source: rendererConsumption.source,
      status: rendererConsumption.status,
      consumes: rendererConsumption.rendererContract.consumes,
      requiresAuthoredDocumentForLayout: rendererConsumption.rendererContract.requiresAuthoredDocumentForLayout,
      mayRelayout: rendererConsumption.rendererContract.mayRelayout,
      blockingIssueCount: rendererConsumption.blockingIssues.length,
      warningIssueCount: rendererConsumption.warningIssues.length,
    },
    blockingIssues,
    warningIssues,
  }
}
