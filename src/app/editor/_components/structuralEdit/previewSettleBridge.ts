import type { StructuralEditTransaction } from "../runtime/structuralEditRuntime"
import type {
  PreviewSettleApplyDecision,
  PreviewSettleRequest,
  PreviewSettleRuntime,
} from "../runtime/previewSettleRuntime"
import {
  resolveWysiwygDraftPaginationDelayMs,
  resolveWysiwygLatestOnlyDraftPaginationDelayMs,
  shouldScheduleResponsiveContainerDraftPagination,
  shouldUseWysiwygDraftPaginationFrame,
  type WysiwygDraftPaginationLatestSnapshot,
  type WysiwygDraftPaginationSessionSource,
  type WysiwygTextReflowDecision,
} from "../wysiwygReflow"

export interface StructuralPreviewSettleSnapshot {
  sourceNodeId: string
  newNodeId: string
}

export interface PreviewSettleScheduleBridgeInput {
  runtime: PreviewSettleRuntime
  activeStructuralTransaction: StructuralEditTransaction | null
  activeInlineNodeId: string | null
  draftVersion: number | null
  structuralSettle: StructuralPreviewSettleSnapshot | null
  scheduledAt: number
}

export interface PreviewSettleDecisionBridgeInput {
  runtime: PreviewSettleRuntime
  request: PreviewSettleRequest
  activeStructuralTransaction: StructuralEditTransaction | null
  currentStructuralGeneration: number | null
  currentActiveInlineNodeId: string | null
  currentDraftVersion: number | null
}

export interface BrowserPreviewSettleApplyBridgeInput {
  decision: PreviewSettleApplyDecision
  generation: number
  currentGeneration: number
  scheduledActiveInlineNodeId: string | null
  currentActiveInlineNodeId: string | null
  scheduledDraftVersion: number | null
  currentDraftVersion: number | null
}

export type BrowserPreviewSettleApplyPlan =
  | {
      action: "apply"
      reason: string
      decision: Extract<PreviewSettleApplyDecision, { type: "apply" }>
      generation: number
      currentGeneration: number
      scheduledActiveInlineNodeId: string | null
      currentActiveInlineNodeId: string | null
      scheduledDraftVersion: number | null
      currentDraftVersion: number | null
    }
  | {
      action: "ignore"
      reason: string
      decision: Exclude<PreviewSettleApplyDecision, { type: "apply" }>
      generation: number
      currentGeneration: number
      scheduledActiveInlineNodeId: string | null
      currentActiveInlineNodeId: string | null
      scheduledDraftVersion: number | null
      currentDraftVersion: number | null
    }

export interface PreviewSettleDebounceBridgeInput {
  activeInlineNodeId: string | null
  structuralSettleNewNodeId: string | null
  structuralPreviewGraceRemainingMs: number
  structuralDebounceMs: number
  inlineEditDebounceMs: number
  idleDebounceMs: number
}

export interface DraftPreviewPaginationRequest {
  nodeId: string
  requestedDelayMs: number
  firstRequestedAtMs: number
}

export interface DraftPreviewPaginationScheduleBridgeInput {
  nodeId: string
  requestedDelayMs: number
  pendingRequest: DraftPreviewPaginationRequest | null
  latestSnapshot: WysiwygDraftPaginationLatestSnapshot | null
  session: WysiwygDraftPaginationSessionSource
  nowMs: number
  currentGeneration: number
  responsiveDelayMs: number
  quietWindowMs: number
  maxLagMs: number
  canUseAnimationFrame: boolean
}

export interface DraftPreviewPaginationSchedulePlan {
  request: DraftPreviewPaginationRequest
  generation: number
  requestedDelayMs: number
  scheduledDelayMs: number
  firstRequestedAtMs: number
  draftVersion: number | null
  source: "responsive" | "settled"
  useAnimationFrame: boolean
}

export interface DraftPreviewPaginationDelayBridgeInput {
  reflow?: WysiwygTextReflowDecision | null
  isFlowStackParagraph: boolean
  isTableCellParagraph: boolean
  draftPaginationActive: boolean
  defaultDelayMs: number
  flowStackBoundaryDelayMs: number
}

export interface DraftPreviewPaginationResponsiveNodeBridgeInput {
  nodeId: string
  isFlowStackParagraph: boolean
  isTableCellParagraph: boolean
  draftPaginationActive: boolean
  currentFragmentCount: number
}

export interface PlainBoundaryDraftPaginationBridgeInput {
  pageCount: number
  pageLimit: number
}

export interface DraftPreviewPaginationApplyBridgeInput {
  nodeId: string
  requestedDelayMs: number
  scheduledGeneration: number
  currentGeneration: number
  sourceRevision: number
  nextSourceRevision: number | null
}

export type DraftPreviewPaginationApplyPlan =
  | {
      action: "ignore"
      reason: "stale-generation" | "missing-current-source"
      nodeId: string
    }
  | {
      action: "reschedule"
      reason: "source-revision-changed"
      nodeId: string
      requestedDelayMs: number
      sourceRevision: number
      nextSourceRevision: number
    }
  | {
      action: "apply"
      reason: "current-source"
      nodeId: string
      sourceRevision: number
    }

export function resolveActivePreviewSettleStructuralTransaction(
  transaction: StructuralEditTransaction | null,
): StructuralEditTransaction | null {
  if (!transaction) return null
  if (transaction.phase === "complete" || transaction.phase === "aborted") return null
  return transaction
}

export function resolvePreviewSettleGraceRemainingMs(input: {
  graceUntil: number
  now: number
}): number {
  return Math.max(0, input.graceUntil - input.now)
}

export function resolvePreviewSettleDebounceMs({
  activeInlineNodeId,
  structuralSettleNewNodeId,
  structuralPreviewGraceRemainingMs,
  structuralDebounceMs,
  inlineEditDebounceMs,
  idleDebounceMs,
}: PreviewSettleDebounceBridgeInput): number {
  if (!activeInlineNodeId) return idleDebounceMs
  if (structuralPreviewGraceRemainingMs > 0) return structuralPreviewGraceRemainingMs
  if (structuralSettleNewNodeId === activeInlineNodeId) return structuralDebounceMs
  return inlineEditDebounceMs
}

export function shouldSupersedePreviewSettleOnCleanup(input: {
  hasPendingDebounce: boolean
  structuralSettle: StructuralPreviewSettleSnapshot | null
}): boolean {
  return input.hasPendingDebounce && input.structuralSettle !== null
}

export function resolveDraftPreviewPaginationClearedGeneration(currentGeneration: number): number {
  return currentGeneration + 1
}

export function resolveDraftPreviewPaginationDelayMsBridge(input: DraftPreviewPaginationDelayBridgeInput): number {
  return resolveWysiwygDraftPaginationDelayMs(input)
}

export function resolveDraftPreviewPaginationResponsiveNodeId({
  nodeId,
  isFlowStackParagraph,
  isTableCellParagraph,
  draftPaginationActive,
  currentFragmentCount,
}: DraftPreviewPaginationResponsiveNodeBridgeInput): string | null {
  return shouldScheduleResponsiveContainerDraftPagination({
    isFlowStackParagraph,
    isTableCellParagraph,
    draftPaginationActive,
    currentFragmentCount,
  }) ? nodeId : null
}

export function shouldSchedulePlainBoundaryDraftPagination({
  pageCount,
  pageLimit,
}: PlainBoundaryDraftPaginationBridgeInput): boolean {
  return pageCount <= pageLimit
}

export function createDraftPreviewPaginationSchedulePlan({
  nodeId,
  requestedDelayMs: requestedDelayMsInput,
  pendingRequest,
  latestSnapshot,
  session,
  nowMs,
  currentGeneration,
  responsiveDelayMs,
  quietWindowMs,
  maxLagMs,
  canUseAnimationFrame,
}: DraftPreviewPaginationScheduleBridgeInput): DraftPreviewPaginationSchedulePlan {
  const requestedDelayMs = Math.max(0, requestedDelayMsInput)
  const isResponsiveRequest = requestedDelayMs <= responsiveDelayMs
  const canReuseResponsiveWindow = isResponsiveRequest &&
    pendingRequest?.nodeId === nodeId &&
    pendingRequest.requestedDelayMs <= responsiveDelayMs
  const firstRequestedAtMs = canReuseResponsiveWindow
    ? pendingRequest.firstRequestedAtMs
    : nowMs
  const scheduledDelayMs = resolveWysiwygLatestOnlyDraftPaginationDelayMs({
    requestedDelayMs,
    responsiveDelayMs,
    quietWindowMs,
    maxLagMs,
    firstRequestedAtMs,
    nowMs,
  })
  const draftVersion = latestSnapshot?.nodeId === nodeId
    ? latestSnapshot.revision
    : session.nodeId === nodeId
      ? session.dirtyVersion
      : null

  return {
    request: {
      nodeId,
      requestedDelayMs,
      firstRequestedAtMs,
    },
    generation: currentGeneration + 1,
    requestedDelayMs,
    scheduledDelayMs,
    firstRequestedAtMs,
    draftVersion,
    source: isResponsiveRequest ? "responsive" : "settled",
    useAnimationFrame: shouldUseWysiwygDraftPaginationFrame({
      nextDelayMs: scheduledDelayMs,
      responsiveDelayMs,
      canUseAnimationFrame,
    }),
  }
}

export function shouldRunDraftPreviewPagination(input: {
  scheduledGeneration: number
  currentGeneration: number
  hasActiveRequest: boolean
}): boolean {
  return input.scheduledGeneration === input.currentGeneration && input.hasActiveRequest
}

export function shouldRescheduleDraftPreviewPaginationForRevision(input: {
  sourceRevision: number
  nextSourceRevision: number
}): boolean {
  return input.nextSourceRevision !== input.sourceRevision
}

export function createDraftPreviewPaginationApplyPlan({
  nodeId,
  requestedDelayMs,
  scheduledGeneration,
  currentGeneration,
  sourceRevision,
  nextSourceRevision,
}: DraftPreviewPaginationApplyBridgeInput): DraftPreviewPaginationApplyPlan {
  if (scheduledGeneration !== currentGeneration) {
    return {
      action: "ignore",
      reason: "stale-generation",
      nodeId,
    }
  }
  if (nextSourceRevision === null) {
    return {
      action: "ignore",
      reason: "missing-current-source",
      nodeId,
    }
  }
  if (shouldRescheduleDraftPreviewPaginationForRevision({ sourceRevision, nextSourceRevision })) {
    return {
      action: "reschedule",
      reason: "source-revision-changed",
      nodeId,
      requestedDelayMs,
      sourceRevision,
      nextSourceRevision,
    }
  }
  return {
    action: "apply",
    reason: "current-source",
    nodeId,
    sourceRevision,
  }
}

export function previewSettleKindForContext(input: {
  activeStructuralTransaction: StructuralEditTransaction | null
  activeInlineNodeId: string | null
}): PreviewSettleRequest["kind"] {
  const kind = input.activeStructuralTransaction?.kind
  if (kind === "split") return "structural-split"
  if (kind === "merge" || kind === "delete-empty") return "structural-merge"
  if (input.activeInlineNodeId) return "text-edit"
  return "unknown"
}

export function affectedNodeIdsForPreviewSettle(input: {
  structuralSettle: StructuralPreviewSettleSnapshot | null
  activeStructuralTransaction: StructuralEditTransaction | null
}): string[] | undefined {
  if (input.structuralSettle) {
    return [input.structuralSettle.sourceNodeId, input.structuralSettle.newNodeId]
  }
  const transaction = input.activeStructuralTransaction
  if (!transaction) return undefined
  const ids = [
    transaction.sourceNodeId,
    transaction.targetNodeId,
    transaction.removedNodeId,
  ].filter((nodeId): nodeId is string => Boolean(nodeId))
  return ids.length > 0 ? ids : undefined
}

export function schedulePreviewSettleBridge({
  runtime,
  activeStructuralTransaction,
  activeInlineNodeId,
  draftVersion,
  structuralSettle,
  scheduledAt,
}: PreviewSettleScheduleBridgeInput): PreviewSettleRequest {
  return runtime.scheduleSettle({
    kind: previewSettleKindForContext({
      activeStructuralTransaction,
      activeInlineNodeId,
    }),
    reason: "browser-preview",
    structuralTransactionId: activeStructuralTransaction?.id ?? null,
    structuralGeneration: activeStructuralTransaction?.generation ?? null,
    activeInlineNodeId,
    draftVersion,
    affectedNodeIds: affectedNodeIdsForPreviewSettle({
      structuralSettle,
      activeStructuralTransaction,
    }),
    affectedPageIds: activeStructuralTransaction?.affectedPageIds,
    scheduledAt,
  })
}

export function getPreviewSettleApplyDecisionBridge({
  runtime,
  request,
  activeStructuralTransaction,
  currentStructuralGeneration,
  currentActiveInlineNodeId,
  currentDraftVersion,
}: PreviewSettleDecisionBridgeInput): PreviewSettleApplyDecision {
  return runtime.getApplyDecision({
    id: request.id,
    generation: request.generation,
    currentStructuralGeneration: activeStructuralTransaction
      ? currentStructuralGeneration
      : null,
    currentActiveInlineNodeId,
    currentDraftVersion,
  })
}

export function createBrowserPreviewSettleApplyPlan({
  decision,
  generation,
  currentGeneration,
  scheduledActiveInlineNodeId,
  currentActiveInlineNodeId,
  scheduledDraftVersion,
  currentDraftVersion,
}: BrowserPreviewSettleApplyBridgeInput): BrowserPreviewSettleApplyPlan {
  const common = {
    reason: decision.reason,
    generation,
    currentGeneration,
    scheduledActiveInlineNodeId,
    currentActiveInlineNodeId,
    scheduledDraftVersion,
    currentDraftVersion,
  }
  if (decision.type === "apply") {
    return {
      action: "apply",
      decision,
      ...common,
    }
  }
  return {
    action: "ignore",
    decision,
    ...common,
  }
}

export function markPreviewSettleStartedBridge(
  runtime: PreviewSettleRuntime,
  request: PreviewSettleRequest,
): PreviewSettleRequest | null {
  return runtime.markSettleStarted(request)
}

export function markPreviewSettleCompletedBridge(
  runtime: PreviewSettleRuntime,
  request: PreviewSettleRequest,
  completedAt?: number,
): PreviewSettleRequest | null {
  return runtime.markSettleCompleted(request, completedAt)
}

export function markPreviewSettleAppliedBridge(
  runtime: PreviewSettleRuntime,
  request: PreviewSettleRequest,
  appliedAt?: number,
): PreviewSettleRequest | null {
  return runtime.markSettleApplied(request, appliedAt)
}

export function markPreviewSettleIgnoredBridge(
  runtime: PreviewSettleRuntime,
  request: PreviewSettleRequest,
  decision: Exclude<PreviewSettleApplyDecision, { type: "apply" }>,
): PreviewSettleRequest | null {
  return runtime.markSettleIgnored(request, decision.reason)
}

export function markPreviewSettleSupersededBridge(
  runtime: PreviewSettleRuntime,
  request: PreviewSettleRequest,
  reason: string,
  supersededAt?: number,
): PreviewSettleRequest | null {
  return runtime.markSettleSuperseded(request, reason, supersededAt)
}

export function markPreviewSettleCancelledBridge(
  runtime: PreviewSettleRuntime,
  request: PreviewSettleRequest,
  reason: string,
): PreviewSettleRequest | null {
  return runtime.markSettleCancelled(request, reason)
}

export function markPreviewSettleFailedBridge(
  runtime: PreviewSettleRuntime,
  request: PreviewSettleRequest,
  error: unknown,
): PreviewSettleRequest | null {
  return runtime.markSettleFailed(request, error)
}

export function invalidatePreviewSettleBridge(
  runtime: PreviewSettleRuntime,
  reason: string,
): number {
  return runtime.invalidateCurrent(reason)
}

export function getCurrentPreviewSettleGenerationBridge(
  runtime: PreviewSettleRuntime,
): number {
  return runtime.getCurrentGeneration()
}

export function getCurrentPreviewSettleRequestBridge(
  runtime: PreviewSettleRuntime,
): PreviewSettleRequest | null {
  return runtime.getCurrentRequest()
}

export function matchesPreviewSettleStructuralTransaction(
  request: PreviewSettleRequest | null,
  identity: { id: string; generation?: number },
): request is PreviewSettleRequest {
  return Boolean(
    request &&
    request.structuralTransactionId === identity.id &&
    request.structuralGeneration === identity.generation,
  )
}
