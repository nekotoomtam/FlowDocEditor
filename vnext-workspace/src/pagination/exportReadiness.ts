import type { VNextMeasuredPagination, VNextMeasuredPaginationWarning } from "./measuredPagination.js"

export type VNextExportReadinessStatus = "ready" | "ready-with-warnings" | "blocked"

export interface VNextExportReadinessIssue {
  severity: "blocking" | "warning"
  code: VNextMeasuredPaginationWarning["code"]
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

export function assessVNextMeasuredPaginationExportReadiness(
  pagination: VNextMeasuredPagination,
): VNextMeasuredPaginationExportReadiness {
  const issues = pagination.warnings.map(toIssue)
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
    blockingIssues,
    warningIssues,
  }
}
