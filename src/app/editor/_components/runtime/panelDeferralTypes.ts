export type PanelDeferralPhase =
  | "idle"
  | "snapshot-active"
  | "release-scheduled"
  | "release-running"
  | "live-restored"
  | "cancelled"
  | "aborted"

export type PanelDeferralReason =
  | "structural-split"
  | "structural-merge"
  | "structural-delete-empty"
  | "superseded"
  | "aborted"
  | "input-quiet-window"
  | "idle-release"

export type PanelDeferralStructuralKind = "split" | "merge" | "delete-empty" | "rollback" | "unknown"

export interface PanelDeferralState {
  id: string
  transactionId: string
  generation: number
  phase: PanelDeferralPhase
  reason: PanelDeferralReason
  structuralKind: PanelDeferralStructuralKind
  nodeId: string | null
  startedAt: number
  scheduledAt?: number
  releaseStartedAt?: number
  releaseCompletedAt?: number
  cancelledAt?: number
  abortedAt?: number
  lastInputAt?: number
  inputDuringDeferralCount: number
  urgentStructuralFlushActive: boolean
  snapshotActive: boolean
  liveRestored: boolean
  nonInteractive: boolean
  latestDocVersion?: number
  staleDocVersion?: number
}

export interface PanelDeferralMetricsSnapshot {
  panelDeferralBeginCount: number
  panelDeferralCancelCount: number
  panelDeferralAbortCount: number
  panelDeferralSupersedeCount: number
  panelDeferralReleaseStartedCount: number
  panelDeferralReleaseCompletedCount: number
  stalePanelReleaseIgnoredCount: number
  nextInputDuringDeferredReleaseCount: number
  panelSnapshotActiveMs: number
  panelLiveDocRestoredMs: number
  panelReleaseRanInsideUrgentStructuralFlush: boolean
}

export type PanelDeferralRuntimeEventAction =
  | "begin"
  | "superseded"
  | "release-scheduled"
  | "release-cancelled"
  | "release-started"
  | "release-completed"
  | "input-during-quiet-window"
  | "urgent-structural-flush-active"
  | "urgent-structural-flush-complete"
  | "stale-release-ignored"
  | "aborted"

export interface PanelDeferralRuntimeEvent {
  action: PanelDeferralRuntimeEventAction
  id?: string
  transactionId?: string
  generation?: number
  phase?: PanelDeferralPhase
  reason?: PanelDeferralReason | string
  structuralKind?: PanelDeferralStructuralKind
  nodeId?: string | null
  startedAt: number
  durationMs?: number
}
