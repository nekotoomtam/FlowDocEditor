export type PreviewSettleKind =
  | "structural-split"
  | "structural-merge"
  | "text-edit"
  | "style-edit"
  | "page-settings"
  | "manual-refresh"
  | "unknown"

export type PreviewSettlePhase =
  | "idle"
  | "scheduled"
  | "running"
  | "completed"
  | "applied"
  | "ignored-stale"
  | "superseded"
  | "cancelled"
  | "failed"

export interface PreviewSettleRequest {
  id: string
  generation: number
  kind: PreviewSettleKind
  phase: PreviewSettlePhase
  reason: string
  docVersion?: number
  structuralTransactionId?: string | null
  structuralGeneration?: number | null
  activeInlineNodeId?: string | null
  draftVersion?: number | null
  scheduledAt: number
  startedAt?: number
  completedAt?: number
  appliedAt?: number
  ignoredAt?: number
  failedAt?: number
  cancelledAt?: number
  affectedNodeIds?: string[]
  affectedPageIds?: number[]
  error?: string
}

export type PreviewSettleApplyDecision =
  | { type: "apply"; reason: string }
  | { type: "ignore-stale"; reason: string }
  | { type: "supersede"; reason: string }
  | { type: "cancel"; reason: string }

export interface PreviewSettleMetricsSnapshot {
  previewSettleScheduledCount: number
  previewSettleStartedCount: number
  previewSettleCompletedCount: number
  previewSettleAppliedCount: number
  previewSettleSupersededCount: number
  previewSettleIgnoredStaleCount: number
  previewSettleCancelledCount: number
  previewSettleFailedCount: number
  previewSettleGeneration: number
  previewSettleCurrentPhase: PreviewSettlePhase
  previewSettleApplyDecision: PreviewSettleApplyDecision["type"] | null
  previewSettleLatestAppliedGeneration: number | null
  previewSettleScheduledMs: number
  previewSettleRunningMs: number
}

export type PreviewSettleRuntimeEventAction =
  | "scheduled"
  | "started"
  | "completed"
  | "applied"
  | "ignored-stale"
  | "superseded"
  | "cancelled"
  | "failed"
  | "invalidated"

export interface PreviewSettleRuntimeEvent {
  action: PreviewSettleRuntimeEventAction
  id?: string
  generation?: number
  kind?: PreviewSettleKind
  phase?: PreviewSettlePhase
  reason?: string
  applyDecision?: PreviewSettleApplyDecision["type"] | null
  latestAppliedGeneration?: number | null
  activeInlineNodeId?: string | null
  draftVersion?: number | null
  structuralTransactionId?: string | null
  structuralGeneration?: number | null
  startedAt: number
  durationMs?: number
}
