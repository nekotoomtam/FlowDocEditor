import type {
  PanelDeferralMetricsSnapshot,
  PanelDeferralReason,
  PanelDeferralRuntimeEvent,
  PanelDeferralState,
  PanelDeferralStructuralKind,
} from "./panelDeferralTypes"

export type {
  PanelDeferralMetricsSnapshot,
  PanelDeferralPhase,
  PanelDeferralReason,
  PanelDeferralRuntimeEvent,
  PanelDeferralRuntimeEventAction,
  PanelDeferralState,
  PanelDeferralStructuralKind,
} from "./panelDeferralTypes"

export interface BeginPanelDeferralInput {
  transactionId: string
  generation: number
  structuralKind: PanelDeferralStructuralKind
  nodeId: string | null
  reason: PanelDeferralReason
  startedAt?: number
  latestDocVersion?: number
  staleDocVersion?: number
}

export interface PanelDeferralReleaseIdentity {
  id: string
  generation: number
}

export interface SchedulePanelReleaseInput extends PanelDeferralReleaseIdentity {
  reason: PanelDeferralReason
  scheduledAt?: number
}

export interface InputQuietDecision {
  shouldDelay: boolean
  lastInputAt: number | null
  elapsedMs: number | null
}

export interface PanelDeferralRuntimeOptions {
  idFactory?: (generation: number, transactionId: string) => string
  now?: () => number
  onEvent?: (event: PanelDeferralRuntimeEvent) => void
}

export interface PanelDeferralRuntime {
  beginPanelDeferral: (input: BeginPanelDeferralInput) => PanelDeferralState
  shouldUsePanelSnapshot: () => boolean
  isPanelNonInteractive: () => boolean
  scheduleRelease: (input: SchedulePanelReleaseInput) => PanelDeferralState | null
  cancelRelease: (id: string, reason: string) => PanelDeferralState | null
  abortDeferral: (id: string, reason: string) => PanelDeferralState | null
  markInputDuringQuietWindow: (id: string, inputAt?: number) => PanelDeferralState | null
  markReleaseStarted: (id: string, releaseStartedAt?: number) => PanelDeferralState | null
  markReleaseCompleted: (id: string, releaseCompletedAt?: number) => PanelDeferralState | null
  markUrgentStructuralFlushActive: (id: string) => PanelDeferralState | null
  markUrgentStructuralFlushComplete: (id: string) => PanelDeferralState | null
  isReleaseBlockedByUrgentStructuralFlush: (id: string) => boolean
  shouldDelayForInputQuietWindow: (id: string, quietWindowMs: number, at?: number) => InputQuietDecision
  isCurrentGeneration: (generation: number) => boolean
  canApplyRelease: (identity: PanelDeferralReleaseIdentity) => boolean
  getCurrentDeferral: () => PanelDeferralState | null
  getMetricsSnapshot: () => PanelDeferralMetricsSnapshot
}

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

function defaultIdFactory(generation: number, transactionId: string): string {
  return `panel-deferral-${generation}-${transactionId}`
}

function cloneState(state: PanelDeferralState): PanelDeferralState {
  return { ...state }
}

export function createPanelDeferralRuntime(options: PanelDeferralRuntimeOptions = {}): PanelDeferralRuntime {
  const idFactory = options.idFactory ?? defaultIdFactory
  const now = options.now ?? defaultNow
  const metrics: PanelDeferralMetricsSnapshot = {
    panelDeferralBeginCount: 0,
    panelDeferralCancelCount: 0,
    panelDeferralAbortCount: 0,
    panelDeferralSupersedeCount: 0,
    panelDeferralReleaseStartedCount: 0,
    panelDeferralReleaseCompletedCount: 0,
    stalePanelReleaseIgnoredCount: 0,
    nextInputDuringDeferredReleaseCount: 0,
    panelSnapshotActiveMs: 0,
    panelLiveDocRestoredMs: 0,
    panelReleaseRanInsideUrgentStructuralFlush: false,
  }
  let currentDeferral: PanelDeferralState | null = null

  const emit = (
    action: PanelDeferralRuntimeEvent["action"],
    state: PanelDeferralState | null,
    extra: Partial<PanelDeferralRuntimeEvent> = {},
  ) => {
    options.onEvent?.({
      action,
      id: state?.id,
      transactionId: state?.transactionId,
      generation: state?.generation,
      phase: state?.phase,
      reason: state?.reason,
      structuralKind: state?.structuralKind,
      nodeId: state?.nodeId,
      startedAt: now(),
      ...extra,
    })
  }

  const updateCurrent = (
    id: string,
    update: (state: PanelDeferralState) => PanelDeferralState,
  ): PanelDeferralState | null => {
    if (!currentDeferral || currentDeferral.id !== id) return null
    currentDeferral = update(currentDeferral)
    return cloneState(currentDeferral)
  }

  const recordStaleReleaseIgnored = (identity: PanelDeferralReleaseIdentity) => {
    metrics.stalePanelReleaseIgnoredCount += 1
    emit("stale-release-ignored", currentDeferral, {
      id: identity.id,
      generation: identity.generation,
      reason: "stale-release",
    })
  }

  return {
    beginPanelDeferral: (input) => {
      const startedAt = input.startedAt ?? now()
      if (currentDeferral && !currentDeferral.liveRestored && currentDeferral.phase !== "aborted") {
        metrics.panelDeferralSupersedeCount += 1
        emit("superseded", currentDeferral, {
          reason: "superseded",
          startedAt,
          durationMs: Math.max(0, startedAt - currentDeferral.startedAt),
        })
      }
      currentDeferral = {
        id: idFactory(input.generation, input.transactionId),
        transactionId: input.transactionId,
        generation: input.generation,
        phase: "snapshot-active",
        reason: input.reason,
        structuralKind: input.structuralKind,
        nodeId: input.nodeId,
        startedAt,
        inputDuringDeferralCount: 0,
        urgentStructuralFlushActive: true,
        snapshotActive: true,
        liveRestored: false,
        nonInteractive: true,
        latestDocVersion: input.latestDocVersion,
        staleDocVersion: input.staleDocVersion,
      }
      metrics.panelDeferralBeginCount += 1
      emit("begin", currentDeferral, { startedAt })
      return cloneState(currentDeferral)
    },

    shouldUsePanelSnapshot: () => Boolean(currentDeferral?.snapshotActive),

    isPanelNonInteractive: () => Boolean(currentDeferral?.nonInteractive),

    scheduleRelease: (input) => updateCurrent(input.id, (state) => {
      if (state.generation !== input.generation || state.phase === "aborted") {
        recordStaleReleaseIgnored(input)
        return state
      }
      const scheduledAt = input.scheduledAt ?? now()
      const next = {
        ...state,
        phase: "release-scheduled" as const,
        reason: input.reason,
        scheduledAt,
      }
      emit("release-scheduled", next, { startedAt: scheduledAt })
      return next
    }),

    cancelRelease: (id, reason) => updateCurrent(id, (state) => {
      const cancelledAt = now()
      metrics.panelDeferralCancelCount += 1
      const next = {
        ...state,
        phase: "snapshot-active" as const,
        cancelledAt,
        scheduledAt: undefined,
      }
      emit("release-cancelled", next, {
        reason,
        startedAt: cancelledAt,
        durationMs: state.scheduledAt == null ? 0 : Math.max(0, cancelledAt - state.scheduledAt),
      })
      return next
    }),

    abortDeferral: (id, reason) => {
      if (!currentDeferral || currentDeferral.id !== id) return null
      const abortedAt = now()
      const aborted = {
        ...currentDeferral,
        phase: "aborted" as const,
        snapshotActive: false,
        liveRestored: false,
        nonInteractive: false,
        abortedAt,
      }
      currentDeferral = null
      metrics.panelDeferralAbortCount += 1
      emit("aborted", aborted, {
        reason,
        startedAt: abortedAt,
        durationMs: Math.max(0, abortedAt - aborted.startedAt),
      })
      return cloneState(aborted)
    },

    markInputDuringQuietWindow: (id, inputAt) => updateCurrent(id, (state) => {
      const observedAt = inputAt ?? now()
      const next = {
        ...state,
        lastInputAt: observedAt,
        inputDuringDeferralCount: state.inputDuringDeferralCount + 1,
      }
      metrics.nextInputDuringDeferredReleaseCount += 1
      emit("input-during-quiet-window", next, { startedAt: observedAt })
      return next
    }),

    markReleaseStarted: (id, releaseStartedAt) => updateCurrent(id, (state) => {
      const startedAt = releaseStartedAt ?? now()
      if (state.urgentStructuralFlushActive) {
        metrics.panelReleaseRanInsideUrgentStructuralFlush = true
      }
      metrics.panelDeferralReleaseStartedCount += 1
      metrics.panelSnapshotActiveMs += Math.max(0, startedAt - state.startedAt)
      const next = {
        ...state,
        phase: "release-running" as const,
        releaseStartedAt: startedAt,
        snapshotActive: false,
        nonInteractive: false,
      }
      emit("release-started", next, {
        startedAt,
        durationMs: Math.max(0, startedAt - state.startedAt),
      })
      return next
    }),

    markReleaseCompleted: (id, releaseCompletedAt) => updateCurrent(id, (state) => {
      const completedAt = releaseCompletedAt ?? now()
      metrics.panelDeferralReleaseCompletedCount += 1
      metrics.panelLiveDocRestoredMs += Math.max(0, completedAt - state.startedAt)
      const next = {
        ...state,
        phase: "live-restored" as const,
        releaseCompletedAt: completedAt,
        snapshotActive: false,
        liveRestored: true,
        nonInteractive: false,
      }
      emit("release-completed", next, {
        startedAt: completedAt,
        durationMs: Math.max(0, completedAt - state.startedAt),
      })
      return next
    }),

    markUrgentStructuralFlushActive: (id) => updateCurrent(id, (state) => {
      const next = { ...state, urgentStructuralFlushActive: true }
      emit("urgent-structural-flush-active", next)
      return next
    }),

    markUrgentStructuralFlushComplete: (id) => updateCurrent(id, (state) => {
      const next = { ...state, urgentStructuralFlushActive: false }
      emit("urgent-structural-flush-complete", next)
      return next
    }),

    isReleaseBlockedByUrgentStructuralFlush: (id) => (
      Boolean(currentDeferral && currentDeferral.id === id && currentDeferral.urgentStructuralFlushActive)
    ),

    shouldDelayForInputQuietWindow: (id, quietWindowMs, at) => {
      if (!currentDeferral || currentDeferral.id !== id || currentDeferral.lastInputAt == null) {
        return { shouldDelay: false, lastInputAt: null, elapsedMs: null }
      }
      const checkedAt = at ?? now()
      const elapsedMs = Math.max(0, checkedAt - currentDeferral.lastInputAt)
      return {
        shouldDelay: elapsedMs < quietWindowMs,
        lastInputAt: currentDeferral.lastInputAt,
        elapsedMs,
      }
    },

    isCurrentGeneration: (generation) => (
      currentDeferral !== null && currentDeferral.generation === generation
    ),

    canApplyRelease: (identity) => {
      if (
        !currentDeferral ||
        currentDeferral.id !== identity.id ||
        currentDeferral.generation !== identity.generation ||
        currentDeferral.phase === "aborted" ||
        currentDeferral.phase === "live-restored"
      ) {
        recordStaleReleaseIgnored(identity)
        return false
      }
      return true
    },

    getCurrentDeferral: () => currentDeferral ? cloneState(currentDeferral) : null,

    getMetricsSnapshot: () => ({ ...metrics }),
  }
}
