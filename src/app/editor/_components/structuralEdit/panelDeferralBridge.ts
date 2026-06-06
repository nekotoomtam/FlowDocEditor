import type {
  PanelDeferralReason,
  PanelDeferralRuntime,
  PanelDeferralState,
  PanelDeferralStructuralKind,
} from "../runtime/panelDeferralRuntime"
import type { StructuralBridgeOperation, StructuralPanelDeferralPlan } from "./structuralEditBridgeTypes"

export type StructuralPanelReleaseOperation = StructuralBridgeOperation | "rollback" | "unknown"

export interface DeferredStructuralPanelRelease {
  deferralId: string
  transactionId: string
  generation: number
  pending: boolean
  reason: string
  operation: StructuralPanelReleaseOperation
  nodeId: string | null
  startedAt: number
}

export interface ScheduledStructuralPanelRelease {
  deferralId: string
  transactionId: string
  generation: number
  reason: string
  scheduledAt: number
  frameId: number | null
  timeoutId: number | ReturnType<typeof setTimeout> | null
  idleId: number | null
}

export interface StructuralPanelReleaseApplying {
  deferralId: string
  transactionId: string
  generation: number
  operation: StructuralPanelReleaseOperation
  nodeId: string | null
  applyStartedAt: number
  scheduledAt: number
  deferredStartedAt: number
}

export function panelDeferralStructuralKindForOperation(
  operation: StructuralPanelReleaseOperation,
): PanelDeferralStructuralKind {
  if (operation === "split" || operation === "merge" || operation === "rollback" || operation === "unknown") {
    return operation
  }
  return "unknown"
}

export function panelDeferralReasonForOperation(
  operation: StructuralPanelReleaseOperation,
): PanelDeferralReason {
  if (operation === "split") return "structural-split"
  if (operation === "merge") return "structural-merge"
  return "idle-release"
}

export function beginStructuralPanelDeferralBridge(
  runtime: PanelDeferralRuntime,
  plan: StructuralPanelDeferralPlan,
): DeferredStructuralPanelRelease {
  const panelDeferral = runtime.beginPanelDeferral({
    transactionId: plan.transactionId,
    generation: plan.generation,
    structuralKind: panelDeferralStructuralKindForOperation(plan.operation),
    nodeId: plan.nodeId,
    reason: panelDeferralReasonForOperation(plan.operation),
    startedAt: plan.startedAt,
  })

  return {
    deferralId: panelDeferral.id,
    transactionId: plan.transactionId,
    generation: plan.generation,
    pending: true,
    reason: plan.reason,
    operation: plan.operation,
    nodeId: plan.nodeId,
    startedAt: plan.startedAt,
  }
}

export function createScheduledStructuralPanelRelease(
  release: DeferredStructuralPanelRelease,
  input: {
    reason: string
    scheduledAt: number
  },
): ScheduledStructuralPanelRelease {
  return {
    deferralId: release.deferralId,
    generation: release.generation,
    transactionId: release.transactionId,
    reason: input.reason,
    scheduledAt: input.scheduledAt,
    frameId: null,
    timeoutId: null,
    idleId: null,
  }
}

export function createStructuralPanelReleaseApplying(
  release: DeferredStructuralPanelRelease,
  input: {
    scheduledAt: number
    applyStartedAt: number
  },
): StructuralPanelReleaseApplying {
  return {
    deferralId: release.deferralId,
    transactionId: release.transactionId,
    generation: release.generation,
    operation: release.operation,
    nodeId: release.nodeId,
    applyStartedAt: input.applyStartedAt,
    scheduledAt: input.scheduledAt,
    deferredStartedAt: release.startedAt,
  }
}

export function scheduleStructuralPanelReleaseBridge(
  runtime: PanelDeferralRuntime,
  release: DeferredStructuralPanelRelease,
  scheduledAt: number,
): PanelDeferralState | null {
  return runtime.scheduleRelease({
    id: release.deferralId,
    generation: release.generation,
    reason: "idle-release",
    scheduledAt,
  })
}

export function cancelScheduledStructuralPanelReleaseBridge(
  runtime: PanelDeferralRuntime,
  scheduled: ScheduledStructuralPanelRelease,
  reason: string,
): PanelDeferralState | null {
  return runtime.cancelRelease(scheduled.deferralId, reason)
}

export function abortStructuralPanelDeferralBridge(
  runtime: PanelDeferralRuntime,
  release: DeferredStructuralPanelRelease,
  reason: string,
): PanelDeferralState | null {
  return runtime.abortDeferral(release.deferralId, reason)
}

export function markStructuralPanelInputDuringDeferralBridge(
  runtime: PanelDeferralRuntime,
  release: DeferredStructuralPanelRelease,
  inputAt: number,
): PanelDeferralState | null {
  return runtime.markInputDuringQuietWindow(release.deferralId, inputAt)
}

export function markStructuralPanelReleaseStartedBridge(
  runtime: PanelDeferralRuntime,
  release: DeferredStructuralPanelRelease,
  releaseStartedAt: number,
): PanelDeferralState | null {
  return runtime.markReleaseStarted(release.deferralId, releaseStartedAt)
}

export function markStructuralPanelReleaseCompletedBridge(
  runtime: PanelDeferralRuntime,
  applying: StructuralPanelReleaseApplying,
  releaseCompletedAt: number,
): PanelDeferralState | null {
  return runtime.markReleaseCompleted(applying.deferralId, releaseCompletedAt)
}

export function markStructuralPanelUrgentFlushCompleteBridge(
  runtime: PanelDeferralRuntime,
  release: DeferredStructuralPanelRelease,
): PanelDeferralState | null {
  return runtime.markUrgentStructuralFlushComplete(release.deferralId)
}

export function canApplyStructuralPanelReleaseBridge(
  runtime: PanelDeferralRuntime,
  release: DeferredStructuralPanelRelease,
): boolean {
  return runtime.canApplyRelease({
    id: release.deferralId,
    generation: release.generation,
  })
}

export function isStructuralPanelReleaseBlockedByUrgentFlushBridge(
  runtime: PanelDeferralRuntime,
  release: DeferredStructuralPanelRelease,
): boolean {
  return runtime.isReleaseBlockedByUrgentStructuralFlush(release.deferralId)
}

export function shouldDelayStructuralPanelReleaseForInputBridge(
  runtime: PanelDeferralRuntime,
  release: DeferredStructuralPanelRelease,
  quietWindowMs: number,
  at: number,
) {
  return runtime.shouldDelayForInputQuietWindow(release.deferralId, quietWindowMs, at)
}

export function matchesStructuralPanelReleaseTransaction(
  release: DeferredStructuralPanelRelease | null,
  identity: { id: string; generation?: number },
): release is DeferredStructuralPanelRelease {
  return Boolean(
    release &&
    release.transactionId === identity.id &&
    release.generation === identity.generation,
  )
}

export function matchesScheduledStructuralPanelReleaseTransaction(
  scheduled: ScheduledStructuralPanelRelease | null,
  identity: { id: string; generation?: number },
): scheduled is ScheduledStructuralPanelRelease {
  return Boolean(
    scheduled &&
    scheduled.transactionId === identity.id &&
    scheduled.generation === identity.generation,
  )
}

export function matchesApplyingStructuralPanelReleaseTransaction(
  applying: StructuralPanelReleaseApplying | null,
  release: DeferredStructuralPanelRelease,
): applying is StructuralPanelReleaseApplying {
  return Boolean(
    applying &&
    applying.transactionId === release.transactionId &&
    applying.generation === release.generation &&
    applying.deferralId === release.deferralId,
  )
}
