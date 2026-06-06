import type {
  WysiwygDraftCaretInput,
  WysiwygDraftMetricsSnapshot,
  WysiwygDraftRuntimeEvent,
  WysiwygDraftSession,
  WysiwygDraftSessionIdentity,
  WysiwygDraftStartInput,
  WysiwygDraftTextMetadataInput,
} from "./wysiwygDraftTypes"

export type {
  WysiwygDraftCaretInput,
  WysiwygDraftMetricsSnapshot,
  WysiwygDraftMode,
  WysiwygDraftPhase,
  WysiwygDraftRuntimeEvent,
  WysiwygDraftRuntimeEventAction,
  WysiwygDraftSession,
  WysiwygDraftSessionIdentity,
  WysiwygDraftSessionSource,
  WysiwygDraftStartInput,
  WysiwygDraftTextMetadataInput,
} from "./wysiwygDraftTypes"

export interface WysiwygDraftRuntimeOptions {
  idFactory?: (generation: number) => string
  now?: () => number
  onEvent?: (event: WysiwygDraftRuntimeEvent) => void
}

export interface WysiwygDraftRuntime {
  beginDraftSession: (input: WysiwygDraftStartInput) => WysiwygDraftSession
  markDraftActive: (identity: WysiwygDraftSessionIdentity | string, timestamp?: number) => WysiwygDraftSession | null
  updateCaret: (identity: WysiwygDraftSessionIdentity | string, input: WysiwygDraftCaretInput) => WysiwygDraftSession | null
  updateDraftTextMetadata: (identity: WysiwygDraftSessionIdentity | string, input: WysiwygDraftTextMetadataInput) => WysiwygDraftSession | null
  markCompositionStarted: (identity: WysiwygDraftSessionIdentity | string, timestamp?: number) => WysiwygDraftSession | null
  markCompositionEnded: (identity: WysiwygDraftSessionIdentity | string, timestamp?: number) => WysiwygDraftSession | null
  markCommitting: (identity: WysiwygDraftSessionIdentity | string, timestamp?: number) => WysiwygDraftSession | null
  markCommitted: (identity: WysiwygDraftSessionIdentity | string, timestamp?: number) => WysiwygDraftSession | null
  cancelDraftSession: (identity: WysiwygDraftSessionIdentity | string, reason: string, timestamp?: number) => WysiwygDraftSession | null
  abortDraftSession: (identity: WysiwygDraftSessionIdentity | string, reason: string, timestamp?: number) => WysiwygDraftSession | null
  completeDraftSession: (identity: WysiwygDraftSessionIdentity | string, timestamp?: number) => WysiwygDraftSession | null
  isCurrentSession: (identity: WysiwygDraftSessionIdentity | string) => boolean
  isCurrentGeneration: (generation: number) => boolean
  getCurrentGeneration: () => number
  getCurrentSession: () => WysiwygDraftSession | null
  getMetricsSnapshot: () => WysiwygDraftMetricsSnapshot
}

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

function defaultIdFactory(generation: number): string {
  return `wysiwyg-draft-${generation}`
}

function normalizeIdentity(identity: WysiwygDraftSessionIdentity | string): WysiwygDraftSessionIdentity {
  return typeof identity === "string" ? { id: identity } : identity
}

function finiteIntegerOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function cloneSession(session: WysiwygDraftSession): WysiwygDraftSession {
  return { ...session }
}

export function createWysiwygDraftRuntime(options: WysiwygDraftRuntimeOptions = {}): WysiwygDraftRuntime {
  const idFactory = options.idFactory ?? defaultIdFactory
  const now = options.now ?? defaultNow
  const emit = (event: Omit<WysiwygDraftRuntimeEvent, "startedAt"> & { startedAt?: number }) => {
    options.onEvent?.({
      ...event,
      startedAt: event.startedAt ?? now(),
    })
  }

  let generation = 0
  let currentSession: WysiwygDraftSession | null = null
  let wysiwygDraftSessionBeginCount = 0
  let wysiwygDraftSessionActiveCount = 0
  let wysiwygDraftSessionCommitCount = 0
  let wysiwygDraftSessionCancelCount = 0
  let wysiwygDraftSessionAbortCount = 0
  let wysiwygDraftCompositionStartCount = 0
  let wysiwygDraftCompositionEndCount = 0
  let wysiwygDraftStaleSessionIgnoredCount = 0

  const isCurrentSession = (identity: WysiwygDraftSessionIdentity | string): boolean => {
    if (!currentSession) return false
    const normalized = normalizeIdentity(identity)
    return currentSession.id === normalized.id &&
      (normalized.generation === undefined || currentSession.generation === normalized.generation)
  }

  const recordStaleIgnored = (
    identity: WysiwygDraftSessionIdentity | string,
    source: string,
  ) => {
    const normalized = normalizeIdentity(identity)
    wysiwygDraftStaleSessionIgnoredCount += 1
    emit({
      action: "stale-ignored",
      id: normalized.id,
      generation: normalized.generation,
      source,
    })
  }

  const emitSessionEvent = (
    action: WysiwygDraftRuntimeEvent["action"],
    session: WysiwygDraftSession,
    extra: Partial<WysiwygDraftRuntimeEvent> = {},
  ) => {
    emit({
      action,
      id: session.id,
      generation: session.generation,
      nodeId: session.nodeId,
      mode: session.mode,
      phase: session.phase,
      source: session.source,
      textVersion: session.textVersion,
      draftTextLength: session.draftTextLength,
      caretIndex: session.caretIndex,
      selectionStart: session.selectionStart,
      selectionEnd: session.selectionEnd,
      isComposing: session.isComposing,
      structuralTransactionId: session.structuralTransactionId,
      structuralGeneration: session.structuralGeneration,
      ...extra,
    })
  }

  const updateCurrent = (
    identity: WysiwygDraftSessionIdentity | string,
    source: string,
    update: (current: WysiwygDraftSession, timestamp: number) => WysiwygDraftSession,
    timestamp?: number,
  ): WysiwygDraftSession | null => {
    if (!isCurrentSession(identity) || currentSession === null) {
      recordStaleIgnored(identity, source)
      return null
    }
    const resolvedTimestamp = timestamp ?? now()
    currentSession = update(currentSession, resolvedTimestamp)
    return cloneSession(currentSession)
  }

  const clearCurrentWithTerminalSession = (
    identity: WysiwygDraftSessionIdentity | string,
    source: string,
    update: (current: WysiwygDraftSession, timestamp: number) => WysiwygDraftSession,
    action: WysiwygDraftRuntimeEvent["action"],
    timestamp?: number,
    extra: Partial<WysiwygDraftRuntimeEvent> = {},
    beforeEmit?: () => void,
  ): WysiwygDraftSession | null => {
    const next = updateCurrent(identity, source, update, timestamp)
    if (!next) return null
    currentSession = null
    beforeEmit?.()
    emitSessionEvent(action, next, extra)
    return next
  }

  const beginDraftSession = (input: WysiwygDraftStartInput): WysiwygDraftSession => {
    const startedAt = input.timestamp
    if (currentSession && currentSession.phase !== "completed" && currentSession.phase !== "cancelled" && currentSession.phase !== "aborted") {
      emitSessionEvent("superseded", {
        ...currentSession,
        phase: "aborted",
        abortedAt: startedAt,
        abortReason: "superseded-by-new-draft-session",
      }, {
        abortReason: "superseded-by-new-draft-session",
        startedAt,
      })
    }
    generation += 1
    currentSession = {
      id: idFactory(generation),
      generation,
      nodeId: input.nodeId,
      mode: input.mode,
      phase: "starting",
      startedAt,
      textVersion: input.textVersion,
      draftTextLength: finiteIntegerOrUndefined(input.initialTextLength),
      caretIndex: finiteIntegerOrUndefined(input.caretIndex),
      selectionStart: finiteIntegerOrUndefined(input.selectionStart),
      selectionEnd: finiteIntegerOrUndefined(input.selectionEnd),
      isComposing: false,
      source: input.source,
      structuralTransactionId: input.structuralTransactionId ?? null,
      structuralGeneration: input.structuralGeneration ?? null,
    }
    wysiwygDraftSessionBeginCount += 1
    const next = cloneSession(currentSession)
    emitSessionEvent("begin", next, { startedAt })
    return next
  }

  return {
    beginDraftSession,
    markDraftActive: (identity, timestamp) => {
      let shouldCountActive = false
      const next = updateCurrent(identity, "active", (current, resolvedTimestamp) => {
        const nextPhase = current.phase === "composing" ? "composing" : "active"
        shouldCountActive = nextPhase === "active" && current.phase !== "active"
        return {
          ...current,
          phase: nextPhase,
          updatedAt: resolvedTimestamp,
        }
      }, timestamp)
      if (!next) return null
      if (shouldCountActive) wysiwygDraftSessionActiveCount += 1
      emitSessionEvent("active", next, { startedAt: timestamp })
      return next
    },
    updateCaret: (identity, input) => {
      const next = updateCurrent(identity, "caret", (current) => ({
        ...current,
        caretIndex: finiteIntegerOrUndefined(input.caretIndex),
        selectionStart: finiteIntegerOrUndefined(input.selectionStart),
        selectionEnd: finiteIntegerOrUndefined(input.selectionEnd),
        updatedAt: input.timestamp,
      }), input.timestamp)
      if (next) emitSessionEvent("caret", next, { startedAt: input.timestamp })
      return next
    },
    updateDraftTextMetadata: (identity, input) => {
      const next = updateCurrent(identity, "text-metadata", (current) => ({
        ...current,
        textVersion: input.textVersion ?? current.textVersion,
        draftTextLength: finiteIntegerOrUndefined(input.draftTextLength),
        updatedAt: input.timestamp,
      }), input.timestamp)
      if (next) emitSessionEvent("text-metadata", next, { startedAt: input.timestamp })
      return next
    },
    markCompositionStarted: (identity, timestamp) => {
      let shouldCountCompositionStart = false
      const next = updateCurrent(identity, "composition-start", (current, resolvedTimestamp) => {
        shouldCountCompositionStart = !current.isComposing
        return {
          ...current,
          phase: "composing",
          isComposing: true,
          compositionStartedAt: resolvedTimestamp,
          updatedAt: resolvedTimestamp,
        }
      }, timestamp)
      if (!next) return null
      if (shouldCountCompositionStart) wysiwygDraftCompositionStartCount += 1
      emitSessionEvent("composition-start", next, { startedAt: timestamp })
      return next
    },
    markCompositionEnded: (identity, timestamp) => {
      let shouldCountCompositionEnd = false
      const next = updateCurrent(identity, "composition-end", (current, resolvedTimestamp) => {
        shouldCountCompositionEnd = current.isComposing
        return {
          ...current,
          phase: current.phase === "composing" ? "active" : current.phase,
          isComposing: false,
          compositionEndedAt: resolvedTimestamp,
          updatedAt: resolvedTimestamp,
        }
      }, timestamp)
      if (!next) return null
      if (shouldCountCompositionEnd) wysiwygDraftCompositionEndCount += 1
      emitSessionEvent("composition-end", next, { startedAt: timestamp })
      return next
    },
    markCommitting: (identity, timestamp) => {
      const next = updateCurrent(identity, "committing", (current, resolvedTimestamp) => ({
        ...current,
        phase: "committing",
        updatedAt: resolvedTimestamp,
      }), timestamp)
      if (next) emitSessionEvent("committing", next, { startedAt: timestamp })
      return next
    },
    markCommitted: (identity, timestamp) => {
      const next = clearCurrentWithTerminalSession(identity, "committed", (current, resolvedTimestamp) => ({
        ...current,
        phase: "completed",
        committedAt: resolvedTimestamp,
        completedAt: resolvedTimestamp,
        updatedAt: resolvedTimestamp,
      }), "committed", timestamp, {}, () => {
        wysiwygDraftSessionCommitCount += 1
      })
      return next
    },
    cancelDraftSession: (identity, reason, timestamp) => {
      const next = clearCurrentWithTerminalSession(identity, "cancelled", (current, resolvedTimestamp) => ({
        ...current,
        phase: "cancelled",
        cancelReason: reason,
        cancelledAt: resolvedTimestamp,
        updatedAt: resolvedTimestamp,
      }), "cancelled", timestamp, { cancelReason: reason }, () => {
        wysiwygDraftSessionCancelCount += 1
      })
      return next
    },
    abortDraftSession: (identity, reason, timestamp) => {
      const next = clearCurrentWithTerminalSession(identity, "aborted", (current, resolvedTimestamp) => ({
        ...current,
        phase: "aborted",
        abortReason: reason,
        abortedAt: resolvedTimestamp,
        updatedAt: resolvedTimestamp,
      }), "aborted", timestamp, { abortReason: reason }, () => {
        wysiwygDraftSessionAbortCount += 1
      })
      return next
    },
    completeDraftSession: (identity, timestamp) => {
      return clearCurrentWithTerminalSession(identity, "completed", (current, resolvedTimestamp) => ({
        ...current,
        phase: "completed",
        completedAt: resolvedTimestamp,
        updatedAt: resolvedTimestamp,
      }), "completed", timestamp)
    },
    isCurrentSession,
    isCurrentGeneration: (candidateGeneration) => currentSession?.generation === candidateGeneration,
    getCurrentGeneration: () => generation,
    getCurrentSession: () => currentSession ? cloneSession(currentSession) : null,
    getMetricsSnapshot: () => ({
      wysiwygDraftSessionBeginCount,
      wysiwygDraftSessionActiveCount,
      wysiwygDraftSessionCommitCount,
      wysiwygDraftSessionCancelCount,
      wysiwygDraftSessionAbortCount,
      wysiwygDraftCompositionStartCount,
      wysiwygDraftCompositionEndCount,
      wysiwygDraftStaleSessionIgnoredCount,
      wysiwygDraftCurrentGeneration: generation,
      wysiwygDraftCurrentPhase: currentSession?.phase ?? "idle",
      wysiwygDraftCurrentNodeId: currentSession?.nodeId ?? null,
      wysiwygDraftSource: currentSession?.source ?? null,
    }),
  }
}
