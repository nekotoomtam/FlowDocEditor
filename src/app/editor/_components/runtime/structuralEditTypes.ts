export type StructuralEditKind = "split" | "merge" | "delete-empty"

export type StructuralEditKey = "Enter" | "Backspace"

export type StructuralEditPhase =
  | "idle"
  | "preparing"
  | "committing"
  | "urgent-painting"
  | "urgent-painted"
  | "panel-release-pending"
  | "settling"
  | "complete"
  | "aborted"

export type StructuralEditGuardState = "idle" | "active" | "ready"

export interface StructuralEditTransaction {
  id: string
  generation: number
  kind: StructuralEditKind
  phase: StructuralEditPhase
  sourceNodeId: string
  targetNodeId?: string
  removedNodeId?: string
  expectedActiveNodeId?: string | null
  expectedNodeCommitted: boolean
  removedNodeCommitted: boolean
  guardState: StructuralEditGuardState
  acceptedStructuralKeyCount: number
  guardedStructuralKeyCount: number
  droppedStructuralKeyCount: number
  compositionIgnoredCount: number
  lastGuardedReason?: string
  docVersionBefore?: number
  docVersionAfter?: number
  affectedPageIds: number[]
  suppressedPageBreakNodeId?: string | null
  startedAt: number
  urgentPaintAt?: number
  panelReleaseAt?: number
  settleStartedAt?: number
  completedAt?: number
  abortReason?: string
}

export interface StructuralEditTransactionIdentity {
  id: string
  generation?: number
}

export interface StructuralGuardInput {
  key: StructuralEditKey
  nodeId: string
  caretIndex: number
  isComposing: boolean
  hasActiveComposition: boolean
  currentActiveNodeId?: string | null
  expectedNodeExists?: boolean
  removedNodeStillExists?: boolean
  timestamp: number
}

export type StructuralGuardDecision =
  | { type: "allow"; reason: string; transactionId?: string; generation?: number }
  | { type: "guard"; reason: string; transactionId?: string; generation?: number }
  | { type: "ignore-composition"; reason: string; transactionId?: string; generation?: number }

export type StructuralEditRuntimeEventAction =
  | "begin"
  | "superseded"
  | "phase"
  | "complete"
  | "aborted"
  | "cleared"
  | "stale-ignored"
  | "guard-allow"
  | "guard-guard"
  | "guard-ignore-composition"
  | "guard-accepted"
  | "key-repeat-dropped"
  | "node-committed"
  | "node-removed"
  | "ready-for-next-structural-key"

export interface StructuralEditRuntimeEvent {
  action: StructuralEditRuntimeEventAction
  id?: string
  generation?: number
  kind?: StructuralEditKind
  phase?: StructuralEditPhase
  key?: StructuralEditKey
  sourceNodeId?: string
  targetNodeId?: string
  removedNodeId?: string
  expectedActiveNodeId?: string | null
  abortReason?: string
  source?: string
  startedAt: number
}
