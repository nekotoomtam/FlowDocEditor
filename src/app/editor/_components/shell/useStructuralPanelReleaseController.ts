import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import {
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
} from "../wysiwygPerformance"
import type { StructuralEditRuntime, StructuralEditTransactionIdentity } from "../runtime/structuralEditRuntime"
import type { PanelDeferralRuntime } from "../runtime/panelDeferralRuntime"
import type { PreviewSettleRuntime } from "../runtime/previewSettleRuntime"
import {
  STRUCTURAL_PANEL_RELEASE_IDLE_TIMEOUT_MS,
  STRUCTURAL_PANEL_RELEASE_INPUT_QUIET_MS,
  STRUCTURAL_PANEL_RELEASE_MIN_DELAY_MS,
} from "./editorShellConstants"
import {
  abortStructuralPanelDeferralBridge,
  beginStructuralPanelDeferralBridge,
  cancelScheduledStructuralPanelReleaseBridge,
  canApplyStructuralPanelReleaseBridge,
  createScheduledStructuralPanelRelease,
  createStructuralPanelReleaseApplying,
  isStructuralPanelReleaseBlockedByUrgentFlushBridge,
  markStructuralPanelInputDuringDeferralBridge,
  markStructuralPanelReleaseStartedBridge,
  matchesApplyingStructuralPanelReleaseTransaction,
  matchesScheduledStructuralPanelReleaseTransaction,
  matchesStructuralPanelReleaseTransaction,
  scheduleStructuralPanelReleaseBridge,
  shouldDelayStructuralPanelReleaseForInputBridge,
  type DeferredStructuralPanelRelease,
  type ScheduledStructuralPanelRelease,
  type StructuralPanelReleaseApplying,
} from "../structuralEdit/panelDeferralBridge"
import type { StructuralPanelDeferralPlan } from "../structuralEdit/structuralEditBridgeTypes"
import {
  getCurrentPreviewSettleRequestBridge,
  markPreviewSettleCancelledBridge,
  matchesPreviewSettleStructuralTransaction,
} from "../structuralEdit/previewSettleBridge"

export function useStructuralPanelReleaseController({
  structuralEditRuntime,
  panelDeferralRuntime,
  previewSettleRuntime,
  abortWysiwygDraftRuntimeSessionForStructuralTransaction,
}: {
  structuralEditRuntime: StructuralEditRuntime
  panelDeferralRuntime: PanelDeferralRuntime
  previewSettleRuntime: PreviewSettleRuntime
  abortWysiwygDraftRuntimeSessionForStructuralTransaction: (identity: StructuralEditTransactionIdentity, reason: string) => void
}) {
  const [deferredStructuralPanelRelease, setDeferredStructuralPanelRelease] = useState<DeferredStructuralPanelRelease | null>(null)
  const deferredStructuralPanelReleaseRef = useRef<DeferredStructuralPanelRelease | null>(null)
  const scheduledStructuralPanelReleaseRef = useRef<ScheduledStructuralPanelRelease | null>(null)
  const structuralPanelReleaseApplyingRef = useRef<StructuralPanelReleaseApplying | null>(null)

  useLayoutEffect(() => {
    deferredStructuralPanelReleaseRef.current = deferredStructuralPanelRelease
  }, [deferredStructuralPanelRelease])

  const recordStructuralPanelReleaseEvent = useCallback((
    action: string,
    metadata: {
      generation?: number
      operation?: DeferredStructuralPanelRelease["operation"]
      nodeId?: string | null
      source?: string
      startedAt?: number
      durationMs?: number
      active?: boolean
    } = {},
  ) => {
    const startedAt = metadata.startedAt ?? startWysiwygPerfSpan()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-panel-release",
      startedAt,
      durationMs: Math.max(0, metadata.durationMs ?? 0),
      nodeId: metadata.nodeId ?? undefined,
      source: metadata.source,
      action,
      operation: metadata.operation,
      token: metadata.generation,
      active: metadata.active,
    })
  }, [])

  const cancelScheduledStructuralPanelRelease = useCallback((reason: string) => {
    const scheduled = scheduledStructuralPanelReleaseRef.current
    if (!scheduled) return false
    if (scheduled.frameId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(scheduled.frameId)
    }
    if (scheduled.timeoutId !== null) {
      window.clearTimeout(scheduled.timeoutId)
    }
    if (scheduled.idleId !== null && typeof window !== "undefined") {
      const idleWindow = window as Window & { cancelIdleCallback?: (handle: number) => void }
      idleWindow.cancelIdleCallback?.(scheduled.idleId)
    }
    scheduledStructuralPanelReleaseRef.current = null
    cancelScheduledStructuralPanelReleaseBridge(panelDeferralRuntime, scheduled, reason)
    recordStructuralPanelReleaseEvent("release-cancelled", {
      generation: scheduled.generation,
      source: reason,
      startedAt: scheduled.scheduledAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - scheduled.scheduledAt),
      active: false,
    })
    return true
  }, [panelDeferralRuntime, recordStructuralPanelReleaseEvent])

  const beginStructuralPanelReleaseDeferral = useCallback((plan: StructuralPanelDeferralPlan) => {
    if (scheduledStructuralPanelReleaseRef.current) {
      cancelScheduledStructuralPanelRelease(`${plan.reason}:superseded-by-new-structural-transition`)
    }
    const next = beginStructuralPanelDeferralBridge(panelDeferralRuntime, plan)
    deferredStructuralPanelReleaseRef.current = next
    setDeferredStructuralPanelRelease(next)
    recordStructuralPanelReleaseEvent("defer-start", {
      generation: next.generation,
      operation: next.operation,
      nodeId: next.nodeId,
      source: next.reason,
      startedAt: next.startedAt,
      active: true,
    })
    return next.generation
  }, [cancelScheduledStructuralPanelRelease, panelDeferralRuntime, recordStructuralPanelReleaseEvent])

  const scheduleDeferredStructuralPanelRelease = useCallback((generation: number, reason: string) => {
    const current = deferredStructuralPanelReleaseRef.current
    if (!current || current.generation !== generation || !current.pending) {
      recordStructuralPanelReleaseEvent("release-superseded", {
        generation,
        source: reason,
        active: false,
      })
      return
    }
    if (!structuralEditRuntime.isCurrentGeneration(generation) || !panelDeferralRuntime.isCurrentGeneration(generation)) {
      canApplyStructuralPanelReleaseBridge(panelDeferralRuntime, current)
      recordStructuralPanelReleaseEvent("release-superseded", {
        generation,
        source: `${reason}:stale-structural-generation`,
        active: false,
      })
      return
    }
    if (scheduledStructuralPanelReleaseRef.current) {
      cancelScheduledStructuralPanelRelease(`${reason}:reschedule`)
    }
    const scheduledAt = startWysiwygPerfSpan()
    const scheduled = createScheduledStructuralPanelRelease(current, {
      reason,
      scheduledAt,
    })
    if (!scheduleStructuralPanelReleaseBridge(panelDeferralRuntime, current, scheduledAt)) {
      recordStructuralPanelReleaseEvent("release-superseded", {
        generation,
        operation: current.operation,
        nodeId: current.nodeId,
        source: `${reason}:stale-panel-deferral`,
        startedAt: scheduledAt,
        active: false,
      })
      return
    }
    const applyRelease = () => {
      scheduledStructuralPanelReleaseRef.current = null
      const latest = deferredStructuralPanelReleaseRef.current
      if (!latest || latest.generation !== generation || !latest.pending) {
        recordStructuralPanelReleaseEvent("release-superseded", {
          generation,
          source: reason,
          startedAt: scheduledAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - scheduledAt),
          active: false,
        })
        return
      }
      if (!structuralEditRuntime.isCurrentGeneration(generation) || !panelDeferralRuntime.isCurrentGeneration(generation)) {
        canApplyStructuralPanelReleaseBridge(panelDeferralRuntime, latest)
        recordStructuralPanelReleaseEvent("release-superseded", {
          generation,
          operation: latest.operation,
          nodeId: latest.nodeId,
          source: `${reason}:stale-structural-generation`,
          startedAt: scheduledAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - scheduledAt),
          active: false,
        })
        return
      }
      if (isStructuralPanelReleaseBlockedByUrgentFlushBridge(panelDeferralRuntime, latest)) {
        recordStructuralPanelReleaseEvent("release-delayed-urgent-paint", {
          generation,
          operation: latest.operation,
          nodeId: latest.nodeId,
          source: reason,
          startedAt: scheduledAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - scheduledAt),
          active: true,
        })
        scheduleDeferredStructuralPanelRelease(generation, `${reason}:urgent-paint-still-active`)
        return
      }
      const now = startWysiwygPerfSpan()
      const inputQuietDecision = shouldDelayStructuralPanelReleaseForInputBridge(
        panelDeferralRuntime,
        latest,
        STRUCTURAL_PANEL_RELEASE_INPUT_QUIET_MS,
        now,
      )
      if (inputQuietDecision.shouldDelay && inputQuietDecision.lastInputAt !== null) {
        recordStructuralPanelReleaseEvent("release-delayed-input", {
          generation,
          operation: latest.operation,
          nodeId: latest.nodeId,
          source: reason,
          startedAt: inputQuietDecision.lastInputAt,
          durationMs: Math.max(0, inputQuietDecision.elapsedMs ?? 0),
          active: true,
        })
        scheduleDeferredStructuralPanelRelease(generation, `${reason}:input-quiet-window`)
        return
      }
      if (!canApplyStructuralPanelReleaseBridge(panelDeferralRuntime, latest)) {
        recordStructuralPanelReleaseEvent("release-superseded", {
          generation,
          operation: latest.operation,
          nodeId: latest.nodeId,
          source: `${reason}:stale-panel-deferral`,
          startedAt: scheduledAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - scheduledAt),
          active: false,
        })
        return
      }
      const applyStartedAt = startWysiwygPerfSpan()
      markStructuralPanelReleaseStartedBridge(panelDeferralRuntime, latest, applyStartedAt)
      structuralPanelReleaseApplyingRef.current = createStructuralPanelReleaseApplying(latest, {
        scheduledAt,
        applyStartedAt,
      })
      recordStructuralPanelReleaseEvent("release-apply-start", {
        generation,
        operation: latest.operation,
        nodeId: latest.nodeId,
        source: reason,
        startedAt: scheduledAt,
        durationMs: Math.max(0, applyStartedAt - scheduledAt),
        active: true,
      })
      deferredStructuralPanelReleaseRef.current = null
      setDeferredStructuralPanelRelease((active) => (
        active?.generation === generation ? null : active
      ))
      recordStructuralPanelReleaseEvent("release-state-update-scheduled", {
        generation,
        operation: latest.operation,
        nodeId: latest.nodeId,
        source: reason,
        startedAt: applyStartedAt,
        active: true,
      })
    }
    if (typeof window !== "undefined") {
      scheduled.frameId = window.requestAnimationFrame(() => {
        scheduled.timeoutId = window.setTimeout(() => {
          scheduled.timeoutId = null
          const idleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
          }
          if (typeof idleWindow.requestIdleCallback === "function") {
            scheduled.idleId = idleWindow.requestIdleCallback(applyRelease, {
              timeout: STRUCTURAL_PANEL_RELEASE_IDLE_TIMEOUT_MS,
            })
            return
          }
          scheduled.timeoutId = window.setTimeout(applyRelease, 0)
        }, STRUCTURAL_PANEL_RELEASE_MIN_DELAY_MS)
      })
    } else {
      scheduled.timeoutId = setTimeout(applyRelease, 0)
    }
    scheduledStructuralPanelReleaseRef.current = scheduled
    recordStructuralPanelReleaseEvent("release-scheduled", {
      generation,
      operation: current.operation,
      nodeId: current.nodeId,
      source: reason,
      startedAt: scheduledAt,
      active: true,
    })
  }, [cancelScheduledStructuralPanelRelease, panelDeferralRuntime, recordStructuralPanelReleaseEvent, structuralEditRuntime])

  const abortStructuralEditTransactionAndPanelDeferral = useCallback((
    identity: StructuralEditTransactionIdentity,
    reason: string,
  ) => {
    structuralEditRuntime.abortTransaction(identity, reason)
    abortWysiwygDraftRuntimeSessionForStructuralTransaction(identity, reason)
    const previewSettleRequest = getCurrentPreviewSettleRequestBridge(previewSettleRuntime)
    if (matchesPreviewSettleStructuralTransaction(previewSettleRequest, identity)) {
      markPreviewSettleCancelledBridge(previewSettleRuntime, previewSettleRequest, `${reason}:abort-structural-transaction`)
    }
    const release = deferredStructuralPanelReleaseRef.current
    if (!matchesStructuralPanelReleaseTransaction(release, identity)) {
      return
    }
    const scheduled = scheduledStructuralPanelReleaseRef.current
    if (matchesScheduledStructuralPanelReleaseTransaction(scheduled, identity)) {
      cancelScheduledStructuralPanelRelease(`${reason}:abort-structural-transaction`)
    }
    deferredStructuralPanelReleaseRef.current = null
    abortStructuralPanelDeferralBridge(panelDeferralRuntime, release, reason)
    if (matchesApplyingStructuralPanelReleaseTransaction(structuralPanelReleaseApplyingRef.current, release)) {
      structuralPanelReleaseApplyingRef.current = null
    }
    setDeferredStructuralPanelRelease((active) => (
      active?.transactionId === identity.id && active.generation === identity.generation
        ? null
        : active
    ))
    recordStructuralPanelReleaseEvent("defer-aborted", {
      generation: identity.generation,
      operation: release.operation,
      nodeId: release.nodeId,
      source: reason,
      startedAt: release.startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - release.startedAt),
      active: false,
    })
  }, [
    abortWysiwygDraftRuntimeSessionForStructuralTransaction,
    cancelScheduledStructuralPanelRelease,
    panelDeferralRuntime,
    previewSettleRuntime,
    recordStructuralPanelReleaseEvent,
    structuralEditRuntime,
  ])

  useEffect(() => () => {
    cancelScheduledStructuralPanelRelease("unmount")
  }, [cancelScheduledStructuralPanelRelease])

  useEffect(() => {
    if (deferredStructuralPanelRelease?.pending !== true || typeof window === "undefined") return
    const markInputDuringPanelDeferral = () => {
      const startedAt = startWysiwygPerfSpan()
      const active = deferredStructuralPanelReleaseRef.current
      if (active) {
        markStructuralPanelInputDuringDeferralBridge(panelDeferralRuntime, active, startedAt)
      }
      recordStructuralPanelReleaseEvent("input-during-defer", {
        generation: active?.generation,
        operation: active?.operation,
        nodeId: active?.nodeId,
        source: "window-input-capture",
        startedAt,
        active: true,
      })
    }
    window.addEventListener("keydown", markInputDuringPanelDeferral, { capture: true, passive: true })
    window.addEventListener("beforeinput", markInputDuringPanelDeferral, { capture: true, passive: true })
    return () => {
      window.removeEventListener("keydown", markInputDuringPanelDeferral, { capture: true })
      window.removeEventListener("beforeinput", markInputDuringPanelDeferral, { capture: true })
    }
  }, [deferredStructuralPanelRelease?.pending, panelDeferralRuntime, recordStructuralPanelReleaseEvent])

  return {
    deferredStructuralPanelRelease,
    deferredStructuralPanelReleaseRef,
    structuralPanelReleaseApplyingRef,
    recordStructuralPanelReleaseEvent,
    beginStructuralPanelReleaseDeferral,
    scheduleDeferredStructuralPanelRelease,
    abortStructuralEditTransactionAndPanelDeferral,
  }
}
