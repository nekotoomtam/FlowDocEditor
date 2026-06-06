import type {
  PreviewSettleApplyDecision,
  PreviewSettleKind,
  PreviewSettleMetricsSnapshot,
  PreviewSettlePhase,
  PreviewSettleRequest,
  PreviewSettleRuntimeEvent,
} from "./previewSettleTypes"

export type {
  PreviewSettleApplyDecision,
  PreviewSettleKind,
  PreviewSettleMetricsSnapshot,
  PreviewSettlePhase,
  PreviewSettleRequest,
  PreviewSettleRuntimeEvent,
  PreviewSettleRuntimeEventAction,
} from "./previewSettleTypes"

export interface PreviewSettleIdentity {
  id: string
  generation?: number
}

export interface SchedulePreviewSettleInput {
  kind: PreviewSettleKind
  reason: string
  docVersion?: number
  structuralTransactionId?: string | null
  structuralGeneration?: number | null
  activeInlineNodeId?: string | null
  draftVersion?: number | null
  affectedNodeIds?: string[]
  affectedPageIds?: number[]
  scheduledAt?: number
}

export interface PreviewSettleApplyDecisionInput extends PreviewSettleIdentity {
  currentDocVersion?: number
  currentStructuralGeneration?: number | null
  currentActiveInlineNodeId?: string | null
  currentDraftVersion?: number | null
}

export interface PreviewSettleRuntimeOptions {
  idFactory?: (generation: number) => string
  now?: () => number
  onEvent?: (event: PreviewSettleRuntimeEvent) => void
}

export interface PreviewSettleRuntime {
  createSettleRequest: (input: SchedulePreviewSettleInput) => PreviewSettleRequest
  scheduleSettle: (input: SchedulePreviewSettleInput) => PreviewSettleRequest
  markSettleStarted: (identity: PreviewSettleIdentity) => PreviewSettleRequest | null
  markSettleCompleted: (identity: PreviewSettleIdentity, completedAt?: number) => PreviewSettleRequest | null
  getApplyDecision: (input: PreviewSettleApplyDecisionInput) => PreviewSettleApplyDecision
  markSettleApplied: (identity: PreviewSettleIdentity, appliedAt?: number) => PreviewSettleRequest | null
  markSettleIgnored: (identity: PreviewSettleIdentity, reason: string, ignoredAt?: number) => PreviewSettleRequest | null
  markSettleSuperseded: (identity: PreviewSettleIdentity, reason: string, supersededAt?: number) => PreviewSettleRequest | null
  markSettleCancelled: (identity: PreviewSettleIdentity, reason: string, cancelledAt?: number) => PreviewSettleRequest | null
  markSettleFailed: (identity: PreviewSettleIdentity, error: unknown, failedAt?: number) => PreviewSettleRequest | null
  invalidateCurrent: (reason: string, invalidatedAt?: number) => number
  isCurrentGeneration: (generation: number) => boolean
  isCurrentRequest: (identity: PreviewSettleIdentity) => boolean
  getCurrentGeneration: () => number
  getCurrentRequest: () => PreviewSettleRequest | null
  getMetricsSnapshot: () => PreviewSettleMetricsSnapshot
}

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

function defaultIdFactory(generation: number): string {
  return `preview-settle-${generation}`
}

function cloneRequest(request: PreviewSettleRequest): PreviewSettleRequest {
  return {
    ...request,
    affectedNodeIds: request.affectedNodeIds ? [...request.affectedNodeIds] : undefined,
    affectedPageIds: request.affectedPageIds ? [...request.affectedPageIds] : undefined,
  }
}

function isTerminalPhase(phase: PreviewSettlePhase): boolean {
  return phase === "applied" ||
    phase === "ignored-stale" ||
    phase === "superseded" ||
    phase === "cancelled" ||
    phase === "failed"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createPreviewSettleRuntime(options: PreviewSettleRuntimeOptions = {}): PreviewSettleRuntime {
  const idFactory = options.idFactory ?? defaultIdFactory
  const now = options.now ?? defaultNow
  let generation = 0
  let currentRequest: PreviewSettleRequest | null = null
  let latestAppliedGeneration: number | null = null
  let latestApplyDecision: PreviewSettleApplyDecision["type"] | null = null
  const metrics: PreviewSettleMetricsSnapshot = {
    previewSettleScheduledCount: 0,
    previewSettleStartedCount: 0,
    previewSettleCompletedCount: 0,
    previewSettleAppliedCount: 0,
    previewSettleSupersededCount: 0,
    previewSettleIgnoredStaleCount: 0,
    previewSettleCancelledCount: 0,
    previewSettleFailedCount: 0,
    previewSettleGeneration: 0,
    previewSettleCurrentPhase: "idle",
    previewSettleApplyDecision: null,
    previewSettleLatestAppliedGeneration: null,
    previewSettleScheduledMs: 0,
    previewSettleRunningMs: 0,
  }

  const syncMetricsState = () => {
    metrics.previewSettleGeneration = generation
    metrics.previewSettleCurrentPhase = currentRequest?.phase ?? "idle"
    metrics.previewSettleApplyDecision = latestApplyDecision
    metrics.previewSettleLatestAppliedGeneration = latestAppliedGeneration
  }

  const emit = (
    action: PreviewSettleRuntimeEvent["action"],
    request: PreviewSettleRequest | null,
    extra: Partial<PreviewSettleRuntimeEvent> = {},
  ) => {
    syncMetricsState()
    options.onEvent?.({
      action,
      id: request?.id,
      generation: request?.generation,
      kind: request?.kind,
      phase: request?.phase,
      reason: request?.reason,
      activeInlineNodeId: request?.activeInlineNodeId,
      draftVersion: request?.draftVersion,
      structuralTransactionId: request?.structuralTransactionId,
      structuralGeneration: request?.structuralGeneration,
      latestAppliedGeneration,
      startedAt: now(),
      ...extra,
    })
  }

  const buildRequest = (input: SchedulePreviewSettleInput, requestGeneration: number): PreviewSettleRequest => ({
    id: idFactory(requestGeneration),
    generation: requestGeneration,
    kind: input.kind,
    phase: "scheduled",
    reason: input.reason,
    docVersion: input.docVersion,
    structuralTransactionId: input.structuralTransactionId,
    structuralGeneration: input.structuralGeneration,
    activeInlineNodeId: input.activeInlineNodeId,
    draftVersion: input.draftVersion,
    scheduledAt: input.scheduledAt ?? now(),
    affectedNodeIds: input.affectedNodeIds ? [...input.affectedNodeIds] : undefined,
    affectedPageIds: input.affectedPageIds ? [...input.affectedPageIds] : undefined,
  })

  const isCurrentRequest = (identity: PreviewSettleIdentity): boolean => (
    currentRequest !== null &&
    currentRequest.id === identity.id &&
    (identity.generation === undefined || currentRequest.generation === identity.generation)
  )

  const updateCurrent = (
    identity: PreviewSettleIdentity,
    update: (request: PreviewSettleRequest) => PreviewSettleRequest,
  ): PreviewSettleRequest | null => {
    if (!isCurrentRequest(identity) || currentRequest === null) return null
    currentRequest = update(currentRequest)
    syncMetricsState()
    return cloneRequest(currentRequest)
  }

  const markCurrentSuperseded = (reason: string, supersededAt: number) => {
    if (!currentRequest || isTerminalPhase(currentRequest.phase)) return null
    const superseded = {
      ...currentRequest,
      phase: "superseded" as const,
      ignoredAt: supersededAt,
      reason,
    }
    metrics.previewSettleSupersededCount += 1
    metrics.previewSettleScheduledMs += Math.max(0, supersededAt - currentRequest.scheduledAt)
    emit("superseded", superseded, {
      reason,
      startedAt: supersededAt,
      durationMs: Math.max(0, supersededAt - currentRequest.scheduledAt),
    })
    currentRequest = null
    syncMetricsState()
    return superseded
  }

  const decide = (input: PreviewSettleApplyDecisionInput): PreviewSettleApplyDecision => {
    const request = currentRequest
    if (!request || request.id !== input.id) {
      return { type: "ignore-stale", reason: "newer-request-current" }
    }
    if (input.generation !== undefined && request.generation !== input.generation) {
      return { type: "ignore-stale", reason: "generation-mismatch" }
    }
    if (request.phase === "superseded") return { type: "supersede", reason: "request-superseded" }
    if (request.phase === "cancelled") return { type: "cancel", reason: "request-cancelled" }
    if (request.phase === "failed") return { type: "cancel", reason: "request-failed" }
    if (request.phase === "ignored-stale") return { type: "ignore-stale", reason: "request-already-ignored" }
    if (generation !== request.generation) {
      return { type: "ignore-stale", reason: "runtime-generation-mismatch" }
    }
    if (
      request.docVersion !== undefined &&
      input.currentDocVersion !== undefined &&
      request.docVersion !== input.currentDocVersion
    ) {
      return { type: "ignore-stale", reason: "doc-version-mismatch" }
    }
    if (
      request.structuralGeneration != null &&
      input.currentStructuralGeneration != null &&
      request.structuralGeneration !== input.currentStructuralGeneration
    ) {
      return { type: "ignore-stale", reason: "structural-generation-mismatch" }
    }
    if ((request.activeInlineNodeId ?? null) !== (input.currentActiveInlineNodeId ?? null)) {
      return { type: "ignore-stale", reason: "inline-edit-node-changed" }
    }
    if (
      request.activeInlineNodeId &&
      request.draftVersion != null &&
      input.currentDraftVersion != null &&
      input.currentDraftVersion > request.draftVersion
    ) {
      return { type: "ignore-stale", reason: "draft-version-advanced" }
    }
    return { type: "apply", reason: "current-request" }
  }

  return {
    createSettleRequest: (input) => buildRequest(input, generation + 1),

    scheduleSettle: (input) => {
      const scheduledAt = input.scheduledAt ?? now()
      markCurrentSuperseded("superseded-by-new-preview-settle", scheduledAt)
      generation += 1
      currentRequest = buildRequest({ ...input, scheduledAt }, generation)
      metrics.previewSettleScheduledCount += 1
      emit("scheduled", currentRequest, { startedAt: scheduledAt })
      syncMetricsState()
      return cloneRequest(currentRequest)
    },

    markSettleStarted: (identity) => updateCurrent(identity, (request) => {
      const startedAt = now()
      const next = {
        ...request,
        phase: "running" as const,
        startedAt,
      }
      metrics.previewSettleStartedCount += 1
      emit("started", next, {
        startedAt,
        durationMs: Math.max(0, startedAt - request.scheduledAt),
      })
      return next
    }),

    markSettleCompleted: (identity, completedAtInput) => updateCurrent(identity, (request) => {
      const completedAt = completedAtInput ?? now()
      const next = {
        ...request,
        phase: "completed" as const,
        completedAt,
      }
      metrics.previewSettleCompletedCount += 1
      metrics.previewSettleRunningMs += Math.max(0, completedAt - (request.startedAt ?? request.scheduledAt))
      emit("completed", next, {
        startedAt: completedAt,
        durationMs: Math.max(0, completedAt - (request.startedAt ?? request.scheduledAt)),
      })
      return next
    }),

    getApplyDecision: (input) => {
      const decision = decide(input)
      latestApplyDecision = decision.type
      syncMetricsState()
      return decision
    },

    markSettleApplied: (identity, appliedAtInput) => updateCurrent(identity, (request) => {
      const appliedAt = appliedAtInput ?? now()
      const next = {
        ...request,
        phase: "applied" as const,
        appliedAt,
      }
      latestAppliedGeneration = request.generation
      latestApplyDecision = "apply"
      metrics.previewSettleAppliedCount += 1
      metrics.previewSettleScheduledMs += Math.max(0, appliedAt - request.scheduledAt)
      emit("applied", next, {
        applyDecision: "apply",
        latestAppliedGeneration,
        startedAt: appliedAt,
        durationMs: Math.max(0, appliedAt - request.scheduledAt),
      })
      return next
    }),

    markSettleIgnored: (identity, reason, ignoredAtInput) => updateCurrent(identity, (request) => {
      const ignoredAt = ignoredAtInput ?? now()
      const next = {
        ...request,
        phase: "ignored-stale" as const,
        ignoredAt,
        reason,
      }
      latestApplyDecision = "ignore-stale"
      metrics.previewSettleIgnoredStaleCount += 1
      emit("ignored-stale", next, {
        reason,
        applyDecision: "ignore-stale",
        startedAt: ignoredAt,
        durationMs: Math.max(0, ignoredAt - request.scheduledAt),
      })
      return next
    }),

    markSettleSuperseded: (identity, reason, supersededAtInput) => {
      if (!isCurrentRequest(identity)) return null
      return markCurrentSuperseded(reason, supersededAtInput ?? now())
    },

    markSettleCancelled: (identity, reason, cancelledAtInput) => updateCurrent(identity, (request) => {
      const cancelledAt = cancelledAtInput ?? now()
      const next = {
        ...request,
        phase: "cancelled" as const,
        cancelledAt,
        reason,
      }
      latestApplyDecision = "cancel"
      metrics.previewSettleCancelledCount += 1
      emit("cancelled", next, {
        reason,
        applyDecision: "cancel",
        startedAt: cancelledAt,
        durationMs: Math.max(0, cancelledAt - request.scheduledAt),
      })
      return next
    }),

    markSettleFailed: (identity, error, failedAtInput) => updateCurrent(identity, (request) => {
      const failedAt = failedAtInput ?? now()
      const next = {
        ...request,
        phase: "failed" as const,
        failedAt,
        error: errorMessage(error),
      }
      latestApplyDecision = "cancel"
      metrics.previewSettleFailedCount += 1
      emit("failed", next, {
        reason: next.error,
        applyDecision: "cancel",
        startedAt: failedAt,
        durationMs: Math.max(0, failedAt - request.scheduledAt),
      })
      return next
    }),

    invalidateCurrent: (reason, invalidatedAtInput) => {
      const invalidatedAt = invalidatedAtInput ?? now()
      if (currentRequest && !isTerminalPhase(currentRequest.phase)) {
        const next = {
          ...currentRequest,
          phase: "cancelled" as const,
          cancelledAt: invalidatedAt,
          reason,
        }
        metrics.previewSettleCancelledCount += 1
        emit("cancelled", next, {
          reason,
          applyDecision: "cancel",
          startedAt: invalidatedAt,
          durationMs: Math.max(0, invalidatedAt - currentRequest.scheduledAt),
        })
        currentRequest = next
      }
      generation += 1
      emit("invalidated", currentRequest, {
        reason,
        startedAt: invalidatedAt,
      })
      syncMetricsState()
      return generation
    },

    isCurrentGeneration: (candidateGeneration) => generation === candidateGeneration,

    isCurrentRequest,

    getCurrentGeneration: () => generation,

    getCurrentRequest: () => currentRequest ? cloneRequest(currentRequest) : null,

    getMetricsSnapshot: () => {
      syncMetricsState()
      return { ...metrics }
    },
  }
}
