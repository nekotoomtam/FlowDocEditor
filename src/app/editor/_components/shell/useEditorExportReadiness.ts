import { useMemo } from "react"
import { collectPaginatedLayoutWarnings, type LayoutWarningSummary, type PaginatedDocument } from "@/pagination"
import type { DocumentDataReadinessReport } from "@/readiness"
import type { DocumentNode } from "@/schema"
import {
  formatExportReadinessMessage,
  getExportReadiness,
  selectAuthoritativeLayoutWarnings,
} from "../exportReadiness"
import type { DriftReport } from "../comparePagination"
import type { EditorPreviewLayoutStatus } from "../editorPreviewLayoutStatus"
import type { LayoutStatus } from "../layoutReconciliation"
import { firstVisibleExportReadinessReason } from "./EditorExportFeedback"

export function useEditorExportReadiness({
  paginated,
  previewDoc,
  browserPreviewLayoutStatus,
  layoutStatus,
  layoutError,
  serverCheckedPreviewDoc,
  serverLayoutWarnings,
  fontFallback,
  driftReport,
  isTemplateMode,
  dataReadiness,
}: {
  paginated: PaginatedDocument
  previewDoc: DocumentNode
  browserPreviewLayoutStatus: EditorPreviewLayoutStatus
  layoutStatus: LayoutStatus
  layoutError: boolean
  serverCheckedPreviewDoc: DocumentNode | null
  serverLayoutWarnings: LayoutWarningSummary[]
  fontFallback: boolean
  driftReport: DriftReport | null
  isTemplateMode: boolean
  dataReadiness: DocumentDataReadinessReport
}) {
  const optimisticLayoutWarnings = useMemo(() => collectPaginatedLayoutWarnings(paginated), [paginated])
  const serverLayoutCheckedForCurrentPreview = layoutStatus === "server-checked" && serverCheckedPreviewDoc === previewDoc
  const authoritativeLayoutWarnings = selectAuthoritativeLayoutWarnings({
    serverLayoutCheckedForCurrentPreview,
    serverLayoutWarnings,
    optimisticLayoutWarnings,
  })
  const layoutWarningSource = serverLayoutCheckedForCurrentPreview ? "server" : "preview"
  const exportReadiness = useMemo(() => getExportReadiness({
    layoutStatus,
    previewLayoutStatus: browserPreviewLayoutStatus,
    layoutError,
    serverLayoutCheckedForCurrentPreview,
    fontFallback,
    driftReport,
    isFillMode: !isTemplateMode,
    dataReadinessHasErrors: dataReadiness.hasErrors,
    dataReadinessIssues: dataReadiness.issues,
    layoutWarnings: authoritativeLayoutWarnings,
  }), [
    authoritativeLayoutWarnings,
    browserPreviewLayoutStatus,
    dataReadiness.hasErrors,
    dataReadiness.issues,
    driftReport,
    fontFallback,
    isTemplateMode,
    layoutError,
    layoutStatus,
    serverLayoutCheckedForCurrentPreview,
  ])
  const exportReadinessMessage = formatExportReadinessMessage(exportReadiness)
  const exportReadinessStatusReason = firstVisibleExportReadinessReason(exportReadiness.reasons)

  return {
    serverLayoutCheckedForCurrentPreview,
    authoritativeLayoutWarnings,
    layoutWarningSource,
    exportReadiness,
    exportReadinessMessage,
    exportReadinessStatusReason,
  }
}
