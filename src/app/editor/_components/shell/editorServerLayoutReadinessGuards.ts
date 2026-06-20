import type { LayoutWarningSummary } from "@/pagination"
import type {
  EditorPaginationSnapshotFreshness,
  EditorPaginationSnapshotIdentity,
} from "../editorPaginationOwnership"

export type ServerPaginationSnapshotFreshnessReason =
  | "server-pagination-current"
  | "server-pagination-cancelled"
  | "server-pagination-aborted"
  | "server-pagination-layout-version-mismatch"

export interface ServerPaginationSnapshotFreshnessDecision {
  identity: EditorPaginationSnapshotIdentity
  freshness: EditorPaginationSnapshotFreshness
  reason: ServerPaginationSnapshotFreshnessReason
}

export function createServerPaginationSnapshotIdentity(input: {
  layoutVersion: number
  documentId?: string | null
}): EditorPaginationSnapshotIdentity {
  return {
    source: "server-check",
    layoutVersion: input.layoutVersion,
    ...(input.documentId !== undefined ? { documentId: input.documentId } : {}),
  }
}

export function resolveServerPaginationSnapshotFreshness(input: {
  identity: EditorPaginationSnapshotIdentity
  currentLayoutVersion: number
  cancelled: boolean
  aborted: boolean
}): ServerPaginationSnapshotFreshnessDecision {
  if (input.cancelled) {
    return {
      identity: input.identity,
      freshness: "stale",
      reason: "server-pagination-cancelled",
    }
  }
  if (input.aborted) {
    return {
      identity: input.identity,
      freshness: "stale",
      reason: "server-pagination-aborted",
    }
  }
  if (input.identity.layoutVersion !== input.currentLayoutVersion) {
    return {
      identity: input.identity,
      freshness: "stale",
      reason: "server-pagination-layout-version-mismatch",
    }
  }
  return {
    identity: input.identity,
    freshness: "current",
    reason: "server-pagination-current",
  }
}

export function areLayoutWarningSummariesEqual(
  current: LayoutWarningSummary[],
  next: LayoutWarningSummary[],
): boolean {
  if (current === next) return true
  if (current.length !== next.length) return false
  return current.every((warning, index) => {
    const nextWarning = next[index]
    return (
      warning.code === nextWarning?.code &&
      warning.count === nextWarning.count &&
      warning.message === nextWarning.message
    )
  })
}

export function shouldApplyServerLayoutWarnings(
  current: LayoutWarningSummary[],
  next: LayoutWarningSummary[],
): boolean {
  return !areLayoutWarningSummariesEqual(current, next)
}
