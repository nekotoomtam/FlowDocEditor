import type { DocumentDataReadinessIssue } from "@/readiness"
import type { LayoutWarningSummary } from "@/pagination"
import type { DriftReport } from "./comparePagination"
import type { LayoutStatus } from "./layoutReconciliation"

export interface ExportReadinessInput {
  layoutStatus: LayoutStatus
  layoutError: boolean
  serverLayoutCheckedForCurrentPreview: boolean
  fontFallback: boolean
  driftReport: DriftReport | null
  isFillMode: boolean
  dataReadinessHasErrors: boolean
  dataReadinessIssues?: DocumentDataReadinessIssue[]
  layoutWarnings?: LayoutWarningSummary[]
}

export interface ExportReadiness {
  canExport: boolean
  reasons: string[]
}

export function selectAuthoritativeLayoutWarnings({
  serverLayoutCheckedForCurrentPreview,
  serverLayoutWarnings,
  optimisticLayoutWarnings,
}: {
  serverLayoutCheckedForCurrentPreview: boolean
  serverLayoutWarnings: LayoutWarningSummary[]
  optimisticLayoutWarnings: LayoutWarningSummary[]
}): LayoutWarningSummary[] {
  return serverLayoutCheckedForCurrentPreview ? serverLayoutWarnings : optimisticLayoutWarnings
}

function layoutPendingReason(layoutStatus: LayoutStatus): string {
  if (layoutStatus === "reconciling") return "server layout check is still running"
  return "server layout has not checked the current document"
}

function firstFillReadinessError(issues: DocumentDataReadinessIssue[] | undefined): string {
  const issue = issues?.find((issue) => issue.severity === "error")
  return issue ? `fill data error for ${issue.key}: ${issue.message}` : "fill data has errors"
}

function firstMissingRequiredFillValue(issues: DocumentDataReadinessIssue[] | undefined): DocumentDataReadinessIssue | undefined {
  return issues?.find((issue) => (
    issue.source === "data-snapshot" &&
    issue.code === "missing-required-value" &&
    issue.severity === "warning"
  ))
}

function hasSplitBoundaryDrift(driftReport: DriftReport | null): boolean {
  if (!driftReport) return false
  return Array.from(driftReport.driftMap.values()).some((drift) => drift.splitBoundaryMoved)
}

function zoneLayoutDriftReasons(driftReport: DriftReport | null): string[] {
  if (!driftReport) return []
  const zones = new Set<string>()
  for (const drift of driftReport.driftMap.values()) {
    if (drift.zone !== "body") zones.add(drift.zone)
  }
  for (const drift of driftReport.geometryDriftMap.values()) {
    if (drift.zone !== "body") zones.add(drift.zone)
  }
  return Array.from(zones).sort().map((zone) => `browser/server ${zone} layout differs`)
}

function hasBodyGeometryDrift(driftReport: DriftReport | null): boolean {
  if (!driftReport) return false
  return Array.from(driftReport.geometryDriftMap.values()).some((drift) => drift.zone === "body")
}

export function getExportReadiness({
  layoutStatus,
  layoutError,
  serverLayoutCheckedForCurrentPreview,
  fontFallback,
  driftReport,
  isFillMode,
  dataReadinessHasErrors,
  dataReadinessIssues,
  layoutWarnings = [],
}: ExportReadinessInput): ExportReadiness {
  const reasons: string[] = []

  if (layoutError) reasons.push("server pagination failed")
  if (layoutStatus !== "server-checked" || !serverLayoutCheckedForCurrentPreview) {
    reasons.push(layoutPendingReason(layoutStatus))
  }
  if (fontFallback) reasons.push("runtime font fallback is active")
  for (const warning of layoutWarnings) {
    reasons.push(`layout warning: ${warning.message}`)
  }
  if (driftReport?.pageBreakChanged) reasons.push("browser/server pagination changes page breaks")
  if ((driftReport?.continuationChangedCount ?? 0) > 0) {
    reasons.push("browser/server pagination changes paragraph continuations")
  }
  reasons.push(...zoneLayoutDriftReasons(driftReport))
  if ((driftReport?.maxLineDelta ?? 0) > 0) {
    reasons.push("browser/server pagination changes line wrapping")
  }
  if (hasSplitBoundaryDrift(driftReport)) {
    reasons.push("browser/server pagination moves split boundaries")
  }
  if (hasBodyGeometryDrift(driftReport)) {
    reasons.push("browser/server layout geometry differs")
  }
  if (isFillMode && dataReadinessHasErrors) {
    reasons.push(firstFillReadinessError(dataReadinessIssues))
  }
  if (isFillMode) {
    const missingRequired = firstMissingRequiredFillValue(dataReadinessIssues)
    if (missingRequired) {
      reasons.push(`fill data required value missing for ${missingRequired.key}: ${missingRequired.message}`)
    }
  }

  return {
    canExport: reasons.length === 0,
    reasons,
  }
}

export function formatExportReadinessMessage(readiness: ExportReadiness): string | null {
  if (readiness.canExport) return null
  return readiness.reasons.join("; ")
}
