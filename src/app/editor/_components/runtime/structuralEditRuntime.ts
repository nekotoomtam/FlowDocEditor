import type {
  StructuralEditGuardState,
  StructuralEditKind,
  StructuralEditKey,
  StructuralEditPhase,
  StructuralGuardDecision,
  StructuralGuardInput,
  StructuralEditRuntimeEvent,
  StructuralEditTransaction,
  StructuralEditTransactionIdentity,
} from "./structuralEditTypes"

export type {
  StructuralEditGuardState,
  StructuralEditKind,
  StructuralEditKey,
  StructuralEditPhase,
  StructuralGuardDecision,
  StructuralGuardInput,
  StructuralEditRuntimeEvent,
  StructuralEditRuntimeEventAction,
  StructuralEditTransaction,
  StructuralEditTransactionIdentity,
} from "./structuralEditTypes"

export interface BeginStructuralEditTransactionInput {
  kind: StructuralEditKind
  sourceNodeId: string
  targetNodeId?: string
  removedNodeId?: string
  expectedActiveNodeId?: string | null
  docVersionBefore?: number
  docVersionAfter?: number
  affectedPageIds?: number[]
  suppressedPageBreakNodeId?: string | null
  startedAt?: number
}

export interface BeginStructuralEditInput extends BeginStructuralEditTransactionInput {
  key?: StructuralEditKey
  accepted?: boolean
}

export interface StructuralEditRuntimeOptions {
  idFactory?: (generation: number) => string
  now?: () => number
  onEvent?: (event: StructuralEditRuntimeEvent) => void
}

export interface StructuralEditRuntime {
  getCurrentTransaction: () => StructuralEditTransaction | null
  getCurrentGeneration: () => number
  beginTransaction: (input: BeginStructuralEditTransactionInput) => StructuralEditTransaction
  canStartStructuralEdit: (input: StructuralGuardInput) => StructuralGuardDecision
  beginStructuralEdit: (input: BeginStructuralEditInput) => StructuralEditTransaction
  markStructuralEditAccepted: (identity: StructuralEditTransactionIdentity | string) => StructuralEditTransaction | null
  markStructuralEditGuarded: (identity: StructuralEditTransactionIdentity | string, reason: string) => StructuralEditTransaction | null
  markKeyRepeatDropped: (identity: StructuralEditTransactionIdentity | string, reason: string) => StructuralEditTransaction | null
  markNodeCommitted: (identity: StructuralEditTransactionIdentity | string, nodeId: string) => StructuralEditTransaction | null
  markNodeRemoved: (identity: StructuralEditTransactionIdentity | string, nodeId: string) => StructuralEditTransaction | null
  markReadyForNextStructuralKey: (identity: StructuralEditTransactionIdentity | string) => StructuralEditTransaction | null
  isStructuralKeyAllowed: (input: StructuralGuardInput) => boolean
  shouldGuardStructuralKey: (input: StructuralGuardInput) => boolean
  markCommitting: (identity: StructuralEditTransactionIdentity | string) => StructuralEditTransaction | null
  markUrgentPainting: (identity: StructuralEditTransactionIdentity | string) => StructuralEditTransaction | null
  markUrgentPainted: (identity: StructuralEditTransactionIdentity | string) => StructuralEditTransaction | null
  markPanelReleasePending: (identity: StructuralEditTransactionIdentity | string) => StructuralEditTransaction | null
  markSettling: (identity: StructuralEditTransactionIdentity | string) => StructuralEditTransaction | null
  markComplete: (identity: StructuralEditTransactionIdentity | string) => StructuralEditTransaction | null
  abortTransaction: (identity: StructuralEditTransactionIdentity | string, reason: string) => StructuralEditTransaction | null
  isCurrentGeneration: (generation: number) => boolean
  isCurrentTransaction: (identity: StructuralEditTransactionIdentity | string) => boolean
  clearIfCurrent: (identity: StructuralEditTransactionIdentity | string) => boolean
}

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

function defaultIdFactory(generation: number): string {
  return `structural-edit-${generation}`
}

function cloneTransaction(transaction: StructuralEditTransaction): StructuralEditTransaction {
  return {
    ...transaction,
    affectedPageIds: [...transaction.affectedPageIds],
  }
}

function normalizeIdentity(identity: StructuralEditTransactionIdentity | string): StructuralEditTransactionIdentity {
  return typeof identity === "string" ? { id: identity } : identity
}

function canReuseCurrentTransaction(
  current: StructuralEditTransaction | null,
  input: BeginStructuralEditInput,
): boolean {
  if (!current || current.phase === "complete" || current.phase === "aborted") return false
  if (current.kind !== input.kind) return false
  if (current.sourceNodeId !== input.sourceNodeId) return false
  if (input.targetNodeId && current.targetNodeId && current.targetNodeId !== input.targetNodeId) return false
  if (input.removedNodeId && current.removedNodeId && current.removedNodeId !== input.removedNodeId) return false
  return true
}

export function createStructuralEditRuntime(options: StructuralEditRuntimeOptions = {}): StructuralEditRuntime {
  const idFactory = options.idFactory ?? defaultIdFactory
  const now = options.now ?? defaultNow
  const emit = (event: Omit<StructuralEditRuntimeEvent, "startedAt"> & { startedAt?: number }) => {
    options.onEvent?.({
      ...event,
      startedAt: event.startedAt ?? now(),
    })
  }

  let generation = 0
  let currentTransaction: StructuralEditTransaction | null = null

  const isCurrentTransaction = (identity: StructuralEditTransactionIdentity | string): boolean => {
    if (!currentTransaction) return false
    const normalized = normalizeIdentity(identity)
    return currentTransaction.id === normalized.id &&
      (normalized.generation === undefined || currentTransaction.generation === normalized.generation)
  }

  const recordStaleIgnored = (
    identity: StructuralEditTransactionIdentity | string,
    phase: StructuralEditPhase | "aborted" | "complete" | "cleared",
  ) => {
    const normalized = normalizeIdentity(identity)
    emit({
      action: "stale-ignored",
      id: normalized.id,
      generation: normalized.generation,
      phase: phase === "cleared" ? undefined : phase,
      source: phase,
    })
  }

  const emitTransactionEvent = (
    action: StructuralEditRuntimeEvent["action"],
    transaction: StructuralEditTransaction,
    extra: Partial<StructuralEditRuntimeEvent> = {},
  ) => {
    emit({
      action,
      id: transaction.id,
      generation: transaction.generation,
      kind: transaction.kind,
      phase: transaction.phase,
      sourceNodeId: transaction.sourceNodeId,
      targetNodeId: transaction.targetNodeId,
      removedNodeId: transaction.removedNodeId,
      expectedActiveNodeId: transaction.expectedActiveNodeId,
      ...extra,
    })
  }

  const updateCurrentPhase = (
    identity: StructuralEditTransactionIdentity | string,
    phase: StructuralEditPhase,
    patch: Partial<StructuralEditTransaction> = {},
  ): StructuralEditTransaction | null => {
    if (!isCurrentTransaction(identity) || currentTransaction === null) {
      recordStaleIgnored(identity, phase)
      return null
    }
    const current = currentTransaction
    currentTransaction = {
      ...current,
      ...patch,
      phase,
    }
    const next = cloneTransaction(currentTransaction)
    emitTransactionEvent(phase === "complete" ? "complete" : "phase", next)
    return next
  }

  const createTransaction = (input: BeginStructuralEditInput): StructuralEditTransaction => ({
    id: idFactory(generation),
    generation,
    kind: input.kind,
    phase: "preparing",
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    removedNodeId: input.removedNodeId,
    expectedActiveNodeId: input.expectedActiveNodeId ?? input.targetNodeId ?? null,
    expectedNodeCommitted: false,
    removedNodeCommitted: false,
    guardState: "active",
    acceptedStructuralKeyCount: input.accepted ? 1 : 0,
    guardedStructuralKeyCount: 0,
    droppedStructuralKeyCount: 0,
    compositionIgnoredCount: 0,
    docVersionBefore: input.docVersionBefore,
    docVersionAfter: input.docVersionAfter,
    affectedPageIds: [...(input.affectedPageIds ?? [])],
    suppressedPageBreakNodeId: input.suppressedPageBreakNodeId,
    startedAt: input.startedAt ?? now(),
  })

  const beginStructuralEdit = (input: BeginStructuralEditInput): StructuralEditTransaction => {
    const startedAt = input.startedAt ?? now()
    if (canReuseCurrentTransaction(currentTransaction, input) && currentTransaction !== null) {
      const current = currentTransaction
      const shouldRecordAccepted = Boolean(input.accepted && current.acceptedStructuralKeyCount === 0)
      currentTransaction = {
        ...current,
        targetNodeId: input.targetNodeId ?? current.targetNodeId,
        removedNodeId: input.removedNodeId ?? current.removedNodeId,
        expectedActiveNodeId: input.expectedActiveNodeId ?? input.targetNodeId ?? current.expectedActiveNodeId,
        docVersionBefore: input.docVersionBefore ?? current.docVersionBefore,
        docVersionAfter: input.docVersionAfter ?? current.docVersionAfter,
        affectedPageIds: input.affectedPageIds ? [...input.affectedPageIds] : current.affectedPageIds,
        suppressedPageBreakNodeId: input.suppressedPageBreakNodeId ?? current.suppressedPageBreakNodeId,
        acceptedStructuralKeyCount: input.accepted && current.acceptedStructuralKeyCount === 0
          ? 1
          : current.acceptedStructuralKeyCount,
      }
      const reused = cloneTransaction(currentTransaction)
      emitTransactionEvent("begin", reused, {
        key: input.key,
        source: "reused-current-transaction",
        startedAt,
      })
      if (shouldRecordAccepted) emitTransactionEvent("guard-accepted", reused, { key: input.key, startedAt })
      return reused
    }

    const pendingTransaction = currentTransaction
    if (pendingTransaction && pendingTransaction.phase !== "complete" && pendingTransaction.phase !== "aborted") {
      const superseded = {
        ...pendingTransaction,
        phase: "aborted" as const,
        abortReason: "superseded-by-new-transaction",
        completedAt: startedAt,
      }
      emitTransactionEvent("superseded", superseded, {
        abortReason: superseded.abortReason,
        startedAt,
      })
    }

    generation += 1
    currentTransaction = createTransaction({
      ...input,
      startedAt,
    })
    const next = cloneTransaction(currentTransaction)
    emitTransactionEvent("begin", next, {
      key: input.key,
      startedAt,
    })
    if (input.accepted) emitTransactionEvent("guard-accepted", next, { key: input.key, startedAt })
    return next
  }

  const peekStructuralGuardDecision = (input: StructuralGuardInput): StructuralGuardDecision => {
    const current = currentTransaction
    if (input.isComposing || input.hasActiveComposition) {
      return {
        type: "ignore-composition",
        reason: "composition-active",
        transactionId: current?.id,
        generation: current?.generation,
      }
    }
    if (!current || current.phase === "complete" || current.phase === "aborted") {
      return { type: "allow", reason: "idle" }
    }
    if (
      current.expectedActiveNodeId &&
      input.nodeId === current.expectedActiveNodeId &&
      input.expectedNodeExists === false
    ) {
      return {
        type: "guard",
        reason: "expected-node-missing",
        transactionId: current.id,
        generation: current.generation,
      }
    }
    if (
      current.removedNodeId &&
      input.nodeId === current.removedNodeId &&
      (current.removedNodeCommitted || input.removedNodeStillExists === false)
    ) {
      return {
        type: "guard",
        reason: input.key === "Backspace" ? "repeated-backspace-removed-node" : "removed-node-stale-key",
        transactionId: current.id,
        generation: current.generation,
      }
    }
    if (
      current.kind === "split" &&
      input.key === "Backspace" &&
      current.expectedActiveNodeId === input.nodeId &&
      current.guardState === "ready" &&
      input.expectedNodeExists !== false &&
      input.caretIndex === 0
    ) {
      return {
        type: "allow",
        reason: "enter-after-split-backspace-allowed",
        transactionId: current.id,
        generation: current.generation,
      }
    }
    if (
      current.kind === "split" &&
      input.key === "Enter" &&
      input.nodeId === current.sourceNodeId &&
      current.guardState !== "ready"
    ) {
      return {
        type: "guard",
        reason: "repeated-enter-during-split",
        transactionId: current.id,
        generation: current.generation,
      }
    }
    if (
      (current.kind === "merge" || current.kind === "delete-empty") &&
      input.key === "Backspace" &&
      input.nodeId === current.sourceNodeId &&
      current.guardState !== "ready"
    ) {
      return {
        type: "guard",
        reason: "repeated-backspace-during-merge",
        transactionId: current.id,
        generation: current.generation,
      }
    }
    return {
      type: "allow",
      reason: current.guardState === "ready" ? "current-transaction-ready" : "different-structural-target",
      transactionId: current.id,
      generation: current.generation,
    }
  }

  const updateGuardCountersForDecision = (
    input: StructuralGuardInput,
    decision: StructuralGuardDecision,
  ) => {
    if (!currentTransaction || decision.transactionId !== currentTransaction.id) return
    if (decision.type === "allow") return
    currentTransaction = {
      ...currentTransaction,
      compositionIgnoredCount: decision.type === "ignore-composition"
        ? currentTransaction.compositionIgnoredCount + 1
        : currentTransaction.compositionIgnoredCount,
      guardedStructuralKeyCount: decision.type === "guard"
        ? currentTransaction.guardedStructuralKeyCount + 1
        : currentTransaction.guardedStructuralKeyCount,
      lastGuardedReason: decision.type === "guard" ? decision.reason : currentTransaction.lastGuardedReason,
    }
    emitTransactionEvent(
      decision.type === "ignore-composition" ? "guard-ignore-composition" : "guard-guard",
      currentTransaction,
      {
        key: input.key,
        source: decision.reason,
        startedAt: input.timestamp,
      },
    )
  }

  return {
    getCurrentTransaction: () => currentTransaction ? cloneTransaction(currentTransaction) : null,

    getCurrentGeneration: () => generation,

    beginTransaction: (input) => beginStructuralEdit(input),

    canStartStructuralEdit: (input) => {
      const decision = peekStructuralGuardDecision(input)
      const currentDecisionTransaction = currentTransaction && decision.transactionId === currentTransaction.id
        ? currentTransaction
        : null
      updateGuardCountersForDecision(input, decision)
      if (decision.type === "allow") {
        if (currentDecisionTransaction) {
          emitTransactionEvent("guard-allow", currentDecisionTransaction, {
            key: input.key,
            source: decision.reason,
            startedAt: input.timestamp,
          })
        } else {
          emit({
            action: "guard-allow",
            key: input.key,
            source: decision.reason,
            sourceNodeId: input.nodeId,
            startedAt: input.timestamp,
          })
        }
      } else if (!currentDecisionTransaction) {
        emit({
          action: decision.type === "guard" ? "guard-guard" : "guard-ignore-composition",
          key: input.key,
          source: decision.reason,
          sourceNodeId: input.nodeId,
          startedAt: input.timestamp,
        })
      }
      return decision
    },

    beginStructuralEdit,

    markStructuralEditAccepted: (identity) => {
      if (!isCurrentTransaction(identity) || currentTransaction === null) {
        recordStaleIgnored(identity, "committing")
        return null
      }
      currentTransaction = {
        ...currentTransaction,
        acceptedStructuralKeyCount: currentTransaction.acceptedStructuralKeyCount + 1,
        guardState: "active",
      }
      const next = cloneTransaction(currentTransaction)
      emitTransactionEvent("guard-accepted", next)
      return next
    },

    markStructuralEditGuarded: (identity, reason) => {
      if (!isCurrentTransaction(identity) || currentTransaction === null) {
        recordStaleIgnored(identity, "committing")
        return null
      }
      currentTransaction = {
        ...currentTransaction,
        guardedStructuralKeyCount: currentTransaction.guardedStructuralKeyCount + 1,
        lastGuardedReason: reason,
      }
      const next = cloneTransaction(currentTransaction)
      emitTransactionEvent("guard-guard", next, { source: reason })
      return next
    },

    markKeyRepeatDropped: (identity, reason) => {
      if (!isCurrentTransaction(identity) || currentTransaction === null) {
        recordStaleIgnored(identity, "committing")
        return null
      }
      currentTransaction = {
        ...currentTransaction,
        droppedStructuralKeyCount: currentTransaction.droppedStructuralKeyCount + 1,
        lastGuardedReason: reason,
      }
      const next = cloneTransaction(currentTransaction)
      emitTransactionEvent("key-repeat-dropped", next, { source: reason })
      return next
    },

    markNodeCommitted: (identity, nodeId) => {
      if (!isCurrentTransaction(identity) || currentTransaction === null) {
        recordStaleIgnored(identity, "committing")
        return null
      }
      currentTransaction = {
        ...currentTransaction,
        targetNodeId: nodeId,
        expectedActiveNodeId: nodeId,
        expectedNodeCommitted: true,
      }
      const next = cloneTransaction(currentTransaction)
      emitTransactionEvent("node-committed", next, { source: nodeId })
      return next
    },

    markNodeRemoved: (identity, nodeId) => {
      if (!isCurrentTransaction(identity) || currentTransaction === null) {
        recordStaleIgnored(identity, "committing")
        return null
      }
      currentTransaction = {
        ...currentTransaction,
        removedNodeId: nodeId,
        removedNodeCommitted: true,
      }
      const next = cloneTransaction(currentTransaction)
      emitTransactionEvent("node-removed", next, { source: nodeId })
      return next
    },

    markReadyForNextStructuralKey: (identity) => {
      if (!isCurrentTransaction(identity) || currentTransaction === null) {
        recordStaleIgnored(identity, "committing")
        return null
      }
      currentTransaction = {
        ...currentTransaction,
        guardState: "ready",
      }
      const next = cloneTransaction(currentTransaction)
      emitTransactionEvent("ready-for-next-structural-key", next)
      return next
    },

    isStructuralKeyAllowed: (input) => peekStructuralGuardDecision(input).type === "allow",

    shouldGuardStructuralKey: (input) => peekStructuralGuardDecision(input).type === "guard",

    markCommitting: (identity) => updateCurrentPhase(identity, "committing"),

    markUrgentPainting: (identity) => updateCurrentPhase(identity, "urgent-painting", {
      urgentPaintAt: now(),
    }),

    markUrgentPainted: (identity) => updateCurrentPhase(identity, "urgent-painted", {
      urgentPaintAt: now(),
    }),

    markPanelReleasePending: (identity) => updateCurrentPhase(identity, "panel-release-pending", {
      panelReleaseAt: now(),
    }),

    markSettling: (identity) => updateCurrentPhase(identity, "settling", {
      settleStartedAt: now(),
    }),

    markComplete: (identity) => updateCurrentPhase(identity, "complete", {
      completedAt: now(),
    }),

    abortTransaction: (identity, reason) => {
      if (!isCurrentTransaction(identity) || currentTransaction === null) {
        recordStaleIgnored(identity, "aborted")
        return null
      }
      const current = currentTransaction
      currentTransaction = {
        ...current,
        phase: "aborted",
        abortReason: reason,
        completedAt: now(),
      }
      const aborted = cloneTransaction(currentTransaction)
      currentTransaction = null
      emit({
        action: "aborted",
        id: aborted.id,
        generation: aborted.generation,
        kind: aborted.kind,
        phase: aborted.phase,
        sourceNodeId: aborted.sourceNodeId,
        targetNodeId: aborted.targetNodeId,
        removedNodeId: aborted.removedNodeId,
        abortReason: aborted.abortReason,
        startedAt: aborted.completedAt,
      })
      return aborted
    },

    isCurrentGeneration: (candidateGeneration) => (
      currentTransaction !== null && currentTransaction.generation === candidateGeneration
    ),

    isCurrentTransaction,

    clearIfCurrent: (identity) => {
      if (!isCurrentTransaction(identity) || currentTransaction === null) {
        recordStaleIgnored(identity, "cleared")
        return false
      }
      const cleared = cloneTransaction(currentTransaction)
      currentTransaction = null
      emit({
        action: "cleared",
        id: cleared.id,
        generation: cleared.generation,
        kind: cleared.kind,
        phase: cleared.phase,
        sourceNodeId: cleared.sourceNodeId,
        targetNodeId: cleared.targetNodeId,
        removedNodeId: cleared.removedNodeId,
      })
      return true
    },
  }
}
