import type { DataSnapshotIssue, DataSnapshotValidationResult, DataSnapshotV1 } from "../dataSnapshot"
import { validateDataSnapshot } from "../dataSnapshot"
import type { FieldRegistryIssue, FieldRegistryValidationResult, FieldRegistryV1 } from "../fieldRegistry"
import { validateFieldRegistryReferences } from "../fieldRegistry"
import type { DocumentNode } from "../schema"

export type DocumentDataReadinessIssueSource = "field-registry" | "data-snapshot"

export interface DocumentDataReadinessIssue {
  source: DocumentDataReadinessIssueSource
  code: string
  severity: "error" | "warning"
  key: string
  message: string
}

export interface DocumentDataReadinessReport {
  fieldRegistry: FieldRegistryValidationResult
  dataSnapshot: DataSnapshotValidationResult
  issues: DocumentDataReadinessIssue[]
  hasErrors: boolean
  hasWarnings: boolean
}

export interface DocumentDataReadinessInput {
  doc: DocumentNode
  registry: FieldRegistryV1
  snapshot: DataSnapshotV1
}

function fieldRegistryIssueToReadiness(issue: FieldRegistryIssue): DocumentDataReadinessIssue {
  return {
    source: "field-registry",
    code: issue.code,
    severity: issue.severity,
    key: issue.key,
    message: issue.message,
  }
}

function dataSnapshotIssueToReadiness(issue: DataSnapshotIssue): DocumentDataReadinessIssue {
  return {
    source: "data-snapshot",
    code: issue.code,
    severity: issue.severity,
    key: issue.key,
    message: issue.message,
  }
}

export function assessDocumentDataReadiness({
  doc,
  registry,
  snapshot,
}: DocumentDataReadinessInput): DocumentDataReadinessReport {
  const fieldRegistry = validateFieldRegistryReferences(doc, registry)
  const usedKeys = new Set(fieldRegistry.usages.map((usage) => usage.key))
  const documentScopedRegistry: FieldRegistryV1 = {
    version: registry.version,
    fields: registry.fields.filter((field) => usedKeys.has(field.key)),
  }
  const dataSnapshot = validateDataSnapshot(snapshot, documentScopedRegistry)
  const issues = [
    ...fieldRegistry.issues.map(fieldRegistryIssueToReadiness),
    ...dataSnapshot.issues.map(dataSnapshotIssueToReadiness),
  ]

  return {
    fieldRegistry,
    dataSnapshot,
    issues,
    hasErrors: issues.some((issue) => issue.severity === "error"),
    hasWarnings: issues.some((issue) => issue.severity === "warning"),
  }
}
