import type { StructuralEditTransactionIdentity } from "./runtime/structuralEditRuntime"
import type {
  WysiwygDraftRuntime,
  WysiwygDraftSession,
  WysiwygDraftSessionIdentity,
  WysiwygDraftSessionSource,
} from "./runtime/wysiwygDraftRuntime"

export interface WysiwygDraftRuntimeSessionTracker {
  current: WysiwygDraftSessionIdentity | null
}

export interface WysiwygDraftSelectionInput {
  anchorOffset: number
  focusOffset: number
}

export interface BeginTrackedWysiwygDraftRuntimeSessionInput {
  nodeId: string
  mode: WysiwygDraftSession["mode"]
  source: WysiwygDraftSessionSource
  initialTextLength?: number
  caretIndex?: number | null
  selection?: WysiwygDraftSelectionInput | null
  textVersion?: number
  structuralTransactionId?: string | null
  structuralGeneration?: number | null
  timestamp: number
}

export interface UpdateTrackedWysiwygDraftRuntimeMetadataInput {
  nodeId: string
  caretIndex: number | null
  selection?: WysiwygDraftSelectionInput | null
  textVersion: number
  draftTextLength: number
  timestamp: number
}

export interface MarkTrackedWysiwygDraftRuntimeCompositionInput {
  nodeId: string
  isComposing: boolean
  timestamp: number
}

export function createWysiwygDraftRuntimeSessionIdentity(
  session: WysiwygDraftSession | null | undefined,
): WysiwygDraftSessionIdentity | null {
  return session
    ? { id: session.id, generation: session.generation }
    : null
}

export function clearTrackedWysiwygDraftRuntimeSessionIfCurrentBridge(
  tracker: WysiwygDraftRuntimeSessionTracker,
  identity: WysiwygDraftSessionIdentity,
): void {
  if (
    tracker.current?.id === identity.id &&
    tracker.current.generation === identity.generation
  ) {
    tracker.current = null
  }
}

export function getCurrentTrackedWysiwygDraftRuntimeSessionBridge(
  runtime: WysiwygDraftRuntime,
  tracker: WysiwygDraftRuntimeSessionTracker,
  nodeId?: string | null,
): WysiwygDraftSession | null {
  const identity = tracker.current
  if (!identity || !runtime.isCurrentSession(identity)) return null
  const current = runtime.getCurrentSession()
  if (!current) return null
  if (nodeId && current.nodeId !== nodeId) return null
  return current
}

export function beginTrackedWysiwygDraftRuntimeSessionBridge(
  runtime: WysiwygDraftRuntime,
  tracker: WysiwygDraftRuntimeSessionTracker,
  input: BeginTrackedWysiwygDraftRuntimeSessionInput,
): WysiwygDraftSession {
  const session = runtime.beginDraftSession({
    nodeId: input.nodeId,
    mode: input.mode,
    source: input.source,
    initialTextLength: input.initialTextLength,
    caretIndex: input.caretIndex,
    selectionStart: input.selection?.anchorOffset ?? input.caretIndex ?? null,
    selectionEnd: input.selection?.focusOffset ?? input.caretIndex ?? null,
    textVersion: input.textVersion,
    structuralTransactionId: input.structuralTransactionId,
    structuralGeneration: input.structuralGeneration,
    timestamp: input.timestamp,
  })
  const active = runtime.markDraftActive(session, input.timestamp) ?? session
  tracker.current = {
    id: active.id,
    generation: active.generation,
  }
  return active
}

export function cancelCurrentTrackedWysiwygDraftRuntimeSessionBridge(
  runtime: WysiwygDraftRuntime,
  tracker: WysiwygDraftRuntimeSessionTracker,
  reason: string,
  timestamp: number,
): boolean {
  const current = getCurrentTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker)
  if (!current) {
    tracker.current = null
    return false
  }
  const identity = createWysiwygDraftRuntimeSessionIdentity(current)
  if (!identity) return false
  runtime.cancelDraftSession(identity, reason, timestamp)
  clearTrackedWysiwygDraftRuntimeSessionIfCurrentBridge(tracker, identity)
  return true
}

export function abortTrackedWysiwygDraftRuntimeSessionForStructuralTransactionBridge(
  runtime: WysiwygDraftRuntime,
  tracker: WysiwygDraftRuntimeSessionTracker,
  identity: StructuralEditTransactionIdentity,
  reason: string,
  timestamp: number,
): boolean {
  const current = runtime.getCurrentSession()
  if (
    !current ||
    current.structuralTransactionId !== identity.id ||
    current.structuralGeneration !== identity.generation
  ) {
    return false
  }
  const draftIdentity = createWysiwygDraftRuntimeSessionIdentity(current)
  if (!draftIdentity) return false
  runtime.abortDraftSession(draftIdentity, reason, timestamp)
  clearTrackedWysiwygDraftRuntimeSessionIfCurrentBridge(tracker, draftIdentity)
  return true
}

export function markTrackedWysiwygDraftRuntimeSessionCommittingBridge(
  runtime: WysiwygDraftRuntime,
  identity: WysiwygDraftSessionIdentity | null,
  timestamp: number,
): WysiwygDraftSession | null {
  return identity ? runtime.markCommitting(identity, timestamp) : null
}

export function markTrackedWysiwygDraftRuntimeSessionCommittedBridge(
  runtime: WysiwygDraftRuntime,
  tracker: WysiwygDraftRuntimeSessionTracker,
  identity: WysiwygDraftSessionIdentity | null,
  timestamp: number,
): WysiwygDraftSession | null {
  if (!identity) return null
  const committed = runtime.markCommitted(identity, timestamp)
  clearTrackedWysiwygDraftRuntimeSessionIfCurrentBridge(tracker, identity)
  return committed
}

export function updateCurrentTrackedWysiwygDraftRuntimeMetadataBridge(
  runtime: WysiwygDraftRuntime,
  tracker: WysiwygDraftRuntimeSessionTracker,
  input: UpdateTrackedWysiwygDraftRuntimeMetadataInput,
): boolean {
  const current = getCurrentTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, input.nodeId)
  const identity = createWysiwygDraftRuntimeSessionIdentity(current)
  if (!identity) return false
  runtime.updateCaret(identity, {
    caretIndex: input.caretIndex,
    selectionStart: input.selection?.anchorOffset ?? input.caretIndex,
    selectionEnd: input.selection?.focusOffset ?? input.caretIndex,
    timestamp: input.timestamp,
  })
  runtime.updateDraftTextMetadata(identity, {
    textVersion: input.textVersion,
    draftTextLength: input.draftTextLength,
    timestamp: input.timestamp,
  })
  return true
}

export function markCurrentTrackedWysiwygDraftRuntimeCompositionBridge(
  runtime: WysiwygDraftRuntime,
  tracker: WysiwygDraftRuntimeSessionTracker,
  input: MarkTrackedWysiwygDraftRuntimeCompositionInput,
): boolean {
  const current = getCurrentTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, input.nodeId)
  const identity = createWysiwygDraftRuntimeSessionIdentity(current)
  if (!identity) return false
  if (input.isComposing) {
    runtime.markCompositionStarted(identity, input.timestamp)
    return true
  }
  runtime.markCompositionEnded(identity, input.timestamp)
  return true
}
