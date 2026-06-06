import {
  shouldFollowInlineEditPageChange,
  shouldRelocateInlineEditPage,
} from "../editorPageFollow"
import type {
  BrowserPreviewSettleApplyPlan,
  DraftPreviewPaginationApplyPlan,
} from "./previewSettleBridge"

export const PREVIEW_SETTLE_SHELL_ADAPTER_CONTRACT_VERSION = 1

export type PreviewSettleShellMutationStep =
  | "schedule-draft-pagination"
  | "write-optimistic-layout"
  | "write-paginated-ref"
  | "set-partial-preview"
  | "clear-partial-preview"
  | "update-browser-preview-layout"
  | "dispatch-set-paginated"
  | "mark-preview-settle-lifecycle"
  | "mark-inline-edit-visual-fresh"
  | "relocate-inline-edit-page"
  | "follow-inline-edit-page"
  | "set-draft-pagination-node"
  | "complete-structural-settle"

export interface DraftPreviewShellMutationApplyPlan {
  lane: "draft-pagination"
  action: "apply"
  nodeId: string
  sourceRevision: number
  nextPageIndex: number | null
  previousInlineEditPageIndex: number | null
  shouldRelocateInlineEditPage: boolean
  shouldFollowInlineEditPage: boolean
  draftPaginationNodeId: string | null
  markInlineEditVisualFreshVersion: number | null
  steps: PreviewSettleShellMutationStep[]
}

export type DraftPreviewShellMutationPlan =
  | {
      lane: "draft-pagination"
      action: "ignore"
      reason: Extract<DraftPreviewPaginationApplyPlan, { action: "ignore" }>["reason"]
      nodeId: string
      steps: PreviewSettleShellMutationStep[]
    }
  | {
      lane: "draft-pagination"
      action: "reschedule"
      reason: Extract<DraftPreviewPaginationApplyPlan, { action: "reschedule" }>["reason"]
      nodeId: string
      requestedDelayMs: number
      sourceRevision: number
      nextSourceRevision: number
      steps: PreviewSettleShellMutationStep[]
    }
  | DraftPreviewShellMutationApplyPlan

export interface DraftPreviewShellMutationPlanInput {
  applyPlan: DraftPreviewPaginationApplyPlan
  nextPageIndex: number | null
  previousInlineEditPageIndex: number | null
  isInlineEditVisualLocked: boolean
  draftPaginationNodeId: string | null
  markInlineEditVisualFreshVersion: number | null
}

export interface ApplyDraftPreviewShellMutationInput<
  TOptimisticLayout,
  TPaginated,
> {
  plan: DraftPreviewShellMutationPlan
  optimisticLayout: TOptimisticLayout
  paginated: TPaginated
  fallbackInlineEditVisualFreshVersion: number
  scheduleDraftPagination: (nodeId: string, requestedDelayMs: number) => void
  writePaginatedRef: (paginated: TPaginated) => void
  writeOptimisticLayout: (layout: TOptimisticLayout) => void
  relocateInlineEditPage: (pageIndex: number) => void
  followInlineEditPage: (pageIndex: number) => void
  setDraftPaginationNodeId: (nodeId: string | null) => void
  dispatchSetPaginated: (paginated: TPaginated) => void
  markInlineEditVisualFresh: (draftVersion: number) => void
}

export type BrowserPreviewShellMutationMode =
  | "precomputed"
  | "visual-only"
  | "partial-worker"
  | "paginated-output"

export type BrowserPreviewLayoutMutation =
  | "full"
  | "partial"
  | "settling-blocking"
  | "unchanged"

export interface BrowserPreviewShellMutationApplyPlan {
  lane: "browser-preview"
  action: "apply"
  source: string
  mode: BrowserPreviewShellMutationMode
  generation: number
  browserPreviewLayout: BrowserPreviewLayoutMutation
  shouldWriteOptimisticLayout: boolean
  shouldWritePaginatedRef: boolean
  shouldSetPartialPreview: boolean
  shouldClearPartialPreview: boolean
  shouldDispatchSetPaginated: boolean
  shouldMarkPreviewSettleLifecycle: boolean
  shouldMarkInlineEditVisualFresh: boolean
  shouldCompleteStructuralSettle: boolean
  steps: PreviewSettleShellMutationStep[]
}

export type BrowserPreviewShellMutationPlan =
  | {
      lane: "browser-preview"
      action: "ignore"
      source: string
      reason: string
      decisionType: BrowserPreviewSettleApplyPlan["decision"]["type"]
      generation: number
      currentGeneration: number
      steps: PreviewSettleShellMutationStep[]
    }
  | BrowserPreviewShellMutationApplyPlan

export interface BrowserPreviewShellMutationPlanInput {
  applyPlan: BrowserPreviewSettleApplyPlan
  mode: BrowserPreviewShellMutationMode
  source: string
  generation: number
  isTextMeasurerReady: boolean
  hasStructuralSettleForInlineNode: boolean
}

export interface ApplyPrecomputedBrowserPreviewShellMutationInput<
  TOptimisticLayout,
  TBrowserPreviewLayout,
> {
  plan: BrowserPreviewShellMutationApplyPlan
  optimisticLayout: TOptimisticLayout
  createFullBrowserPreviewLayout: (generation: number) => TBrowserPreviewLayout
  writeOptimisticLayout: (layout: TOptimisticLayout) => void
  clearPartialPreview: () => void
  setBrowserPreviewLayout: (layout: TBrowserPreviewLayout) => void
  markPreviewSettleLifecycle: () => void
}

export interface ApplyPartialWorkerBrowserPreviewShellMutationInput<
  TPartialPreview,
  TBrowserPreviewLayout,
> {
  plan: BrowserPreviewShellMutationApplyPlan
  partialPreview: TPartialPreview
  createPartialBrowserPreviewLayout: (generation: number) => TBrowserPreviewLayout
  setPartialPreview: (partialPreview: TPartialPreview) => void
  setBrowserPreviewLayout: (layout: TBrowserPreviewLayout) => void
}

export interface ApplyVisualOnlyBrowserPreviewShellMutationInput<
  TOptimisticLayout,
  TPaginated,
  TBrowserPreviewLayout,
> {
  plan: BrowserPreviewShellMutationApplyPlan
  optimisticLayout: TOptimisticLayout
  paginated: TPaginated
  createFullBrowserPreviewLayout: (generation: number) => TBrowserPreviewLayout
  writeOptimisticLayout: (layout: TOptimisticLayout) => void
  writePaginatedRef: (paginated: TPaginated) => void
  clearPartialPreview: () => void
  setBrowserPreviewLayout: (layout: TBrowserPreviewLayout) => void
  dispatchSetPaginated: (paginated: TPaginated) => void
  markPreviewSettleLifecycle: () => void
}

export interface ApplyPaginatedOutputBrowserPreviewShellMutationInput<
  TOptimisticLayout,
  TPaginated,
  TBrowserPreviewLayout,
> {
  plan: BrowserPreviewShellMutationApplyPlan
  optimisticLayout: TOptimisticLayout
  paginated: TPaginated
  inlineEditVisualFreshVersion: number | null
  createFullBrowserPreviewLayout: (generation: number) => TBrowserPreviewLayout
  createSettlingBlockingBrowserPreviewLayout: (generation: number) => TBrowserPreviewLayout
  writeOptimisticLayout: (layout: TOptimisticLayout) => void
  writePaginatedRef: (paginated: TPaginated) => void
  clearPartialPreview: () => void
  setBrowserPreviewLayout: (layout: TBrowserPreviewLayout) => void
  dispatchSetPaginated: (paginated: TPaginated) => void
  markPreviewSettleLifecycle: () => void
  markInlineEditVisualFresh: (draftVersion: number) => void
  completeStructuralSettle: (() => void) | null
}

export interface PreviewSettleShellMutationPlanSummary {
  contractVersion: number
  lane: DraftPreviewShellMutationPlan["lane"] | BrowserPreviewShellMutationPlan["lane"]
  action: DraftPreviewShellMutationPlan["action"] | BrowserPreviewShellMutationPlan["action"]
  steps: string
  stepCount: number
  nodeId?: string
  reason?: string
  source?: string
  mode?: BrowserPreviewShellMutationMode
  generation?: number
  currentGeneration?: number
  browserPreviewLayout?: BrowserPreviewLayoutMutation
  decisionType?: BrowserPreviewSettleApplyPlan["decision"]["type"]
  shouldDispatchSetPaginated?: boolean
  shouldWritePaginatedRef?: boolean
  shouldWriteOptimisticLayout?: boolean
  shouldSetPartialPreview?: boolean
  shouldClearPartialPreview?: boolean
}

function appendStep(
  steps: PreviewSettleShellMutationStep[],
  enabled: boolean,
  step: PreviewSettleShellMutationStep,
): void {
  if (enabled) steps.push(step)
}

export function createDraftPreviewShellMutationPlan({
  applyPlan,
  nextPageIndex,
  previousInlineEditPageIndex,
  isInlineEditVisualLocked,
  draftPaginationNodeId,
  markInlineEditVisualFreshVersion,
}: DraftPreviewShellMutationPlanInput): DraftPreviewShellMutationPlan {
  if (applyPlan.action === "ignore") {
    return {
      lane: "draft-pagination",
      action: "ignore",
      reason: applyPlan.reason,
      nodeId: applyPlan.nodeId,
      steps: [],
    }
  }
  if (applyPlan.action === "reschedule") {
    return {
      lane: "draft-pagination",
      action: "reschedule",
      reason: applyPlan.reason,
      nodeId: applyPlan.nodeId,
      requestedDelayMs: applyPlan.requestedDelayMs,
      sourceRevision: applyPlan.sourceRevision,
      nextSourceRevision: applyPlan.nextSourceRevision,
      steps: ["schedule-draft-pagination"],
    }
  }

  const shouldRelocate = shouldRelocateInlineEditPage({
    nextPageIndex,
    isVisualLocked: isInlineEditVisualLocked,
  })
  const shouldFollow = shouldRelocate && shouldFollowInlineEditPageChange({
    previousPageIndex: previousInlineEditPageIndex,
    nextPageIndex,
  })
  const steps: PreviewSettleShellMutationStep[] = [
    "write-paginated-ref",
    "write-optimistic-layout",
  ]
  appendStep(steps, shouldRelocate, "relocate-inline-edit-page")
  appendStep(steps, shouldFollow, "follow-inline-edit-page")
  steps.push(
    "set-draft-pagination-node",
    "dispatch-set-paginated",
    "mark-inline-edit-visual-fresh",
  )

  return {
    lane: "draft-pagination",
    action: "apply",
    nodeId: applyPlan.nodeId,
    sourceRevision: applyPlan.sourceRevision,
    nextPageIndex,
    previousInlineEditPageIndex,
    shouldRelocateInlineEditPage: shouldRelocate,
    shouldFollowInlineEditPage: shouldFollow,
    draftPaginationNodeId,
    markInlineEditVisualFreshVersion,
    steps,
  }
}

export function summarizePreviewSettleShellMutationPlan(
  plan: DraftPreviewShellMutationPlan | BrowserPreviewShellMutationPlan,
): PreviewSettleShellMutationPlanSummary {
  const base = {
    contractVersion: PREVIEW_SETTLE_SHELL_ADAPTER_CONTRACT_VERSION,
    lane: plan.lane,
    action: plan.action,
    steps: plan.steps.join(","),
    stepCount: plan.steps.length,
  }
  if (plan.lane === "draft-pagination") {
    return {
      ...base,
      nodeId: plan.nodeId,
      ...(plan.action === "apply" ? {} : { reason: plan.reason }),
    }
  }
  if (plan.action === "ignore") {
    return {
      ...base,
      source: plan.source,
      reason: plan.reason,
      decisionType: plan.decisionType,
      generation: plan.generation,
      currentGeneration: plan.currentGeneration,
    }
  }
  return {
    ...base,
    source: plan.source,
    mode: plan.mode,
    generation: plan.generation,
    browserPreviewLayout: plan.browserPreviewLayout,
    shouldDispatchSetPaginated: plan.shouldDispatchSetPaginated,
    shouldWritePaginatedRef: plan.shouldWritePaginatedRef,
    shouldWriteOptimisticLayout: plan.shouldWriteOptimisticLayout,
    shouldSetPartialPreview: plan.shouldSetPartialPreview,
    shouldClearPartialPreview: plan.shouldClearPartialPreview,
  }
}

export function applyDraftPreviewShellMutation<
  TOptimisticLayout,
  TPaginated,
>({
  plan,
  optimisticLayout,
  paginated,
  fallbackInlineEditVisualFreshVersion,
  scheduleDraftPagination,
  writePaginatedRef,
  writeOptimisticLayout,
  relocateInlineEditPage,
  followInlineEditPage,
  setDraftPaginationNodeId,
  dispatchSetPaginated,
  markInlineEditVisualFresh,
}: ApplyDraftPreviewShellMutationInput<TOptimisticLayout, TPaginated>): boolean {
  if (plan.action === "ignore") return true
  if (plan.action === "reschedule") {
    scheduleDraftPagination(plan.nodeId, plan.requestedDelayMs)
    return true
  }

  writePaginatedRef(paginated)
  writeOptimisticLayout(optimisticLayout)
  if (plan.shouldRelocateInlineEditPage) {
    const relocatedPageIndex = plan.nextPageIndex!
    relocateInlineEditPage(relocatedPageIndex)
    if (plan.shouldFollowInlineEditPage) {
      followInlineEditPage(relocatedPageIndex)
    }
  }
  setDraftPaginationNodeId(plan.draftPaginationNodeId)
  dispatchSetPaginated(paginated)
  markInlineEditVisualFresh(plan.markInlineEditVisualFreshVersion ?? fallbackInlineEditVisualFreshVersion)
  return true
}

export function applyPrecomputedBrowserPreviewShellMutation<
  TOptimisticLayout,
  TBrowserPreviewLayout,
>({
  plan,
  optimisticLayout,
  createFullBrowserPreviewLayout,
  writeOptimisticLayout,
  clearPartialPreview,
  setBrowserPreviewLayout,
  markPreviewSettleLifecycle,
}: ApplyPrecomputedBrowserPreviewShellMutationInput<TOptimisticLayout, TBrowserPreviewLayout>): boolean {
  if (plan.mode !== "precomputed") return false
  if (plan.shouldWriteOptimisticLayout) {
    writeOptimisticLayout(optimisticLayout)
  }
  if (plan.shouldClearPartialPreview) {
    clearPartialPreview()
  }
  if (plan.browserPreviewLayout === "full") {
    setBrowserPreviewLayout(createFullBrowserPreviewLayout(plan.generation))
  }
  if (plan.shouldMarkPreviewSettleLifecycle) {
    markPreviewSettleLifecycle()
  }
  return true
}

export function applyPartialWorkerBrowserPreviewShellMutation<
  TPartialPreview,
  TBrowserPreviewLayout,
>({
  plan,
  partialPreview,
  createPartialBrowserPreviewLayout,
  setPartialPreview,
  setBrowserPreviewLayout,
}: ApplyPartialWorkerBrowserPreviewShellMutationInput<TPartialPreview, TBrowserPreviewLayout>): boolean {
  if (plan.mode !== "partial-worker") return false
  if (plan.shouldSetPartialPreview) {
    setPartialPreview(partialPreview)
  }
  if (plan.browserPreviewLayout === "partial") {
    setBrowserPreviewLayout(createPartialBrowserPreviewLayout(plan.generation))
  }
  return true
}

export function applyVisualOnlyBrowserPreviewShellMutation<
  TOptimisticLayout,
  TPaginated,
  TBrowserPreviewLayout,
>({
  plan,
  optimisticLayout,
  paginated,
  createFullBrowserPreviewLayout,
  writeOptimisticLayout,
  writePaginatedRef,
  clearPartialPreview,
  setBrowserPreviewLayout,
  dispatchSetPaginated,
  markPreviewSettleLifecycle,
}: ApplyVisualOnlyBrowserPreviewShellMutationInput<TOptimisticLayout, TPaginated, TBrowserPreviewLayout>): boolean {
  if (plan.mode !== "visual-only") return false
  if (plan.shouldWriteOptimisticLayout) {
    writeOptimisticLayout(optimisticLayout)
  }
  if (plan.shouldWritePaginatedRef) {
    writePaginatedRef(paginated)
  }
  if (plan.shouldClearPartialPreview) {
    clearPartialPreview()
  }
  if (plan.browserPreviewLayout === "full") {
    setBrowserPreviewLayout(createFullBrowserPreviewLayout(plan.generation))
  }
  if (plan.shouldDispatchSetPaginated) {
    dispatchSetPaginated(paginated)
  }
  if (plan.shouldMarkPreviewSettleLifecycle) {
    markPreviewSettleLifecycle()
  }
  return true
}

export function applyPaginatedOutputBrowserPreviewShellMutation<
  TOptimisticLayout,
  TPaginated,
  TBrowserPreviewLayout,
>({
  plan,
  optimisticLayout,
  paginated,
  inlineEditVisualFreshVersion,
  createFullBrowserPreviewLayout,
  createSettlingBlockingBrowserPreviewLayout,
  writeOptimisticLayout,
  writePaginatedRef,
  clearPartialPreview,
  setBrowserPreviewLayout,
  dispatchSetPaginated,
  markPreviewSettleLifecycle,
  markInlineEditVisualFresh,
  completeStructuralSettle,
}: ApplyPaginatedOutputBrowserPreviewShellMutationInput<TOptimisticLayout, TPaginated, TBrowserPreviewLayout>): boolean {
  if (plan.mode !== "paginated-output") return false
  if (plan.shouldWriteOptimisticLayout) {
    writeOptimisticLayout(optimisticLayout)
  }
  if (plan.shouldWritePaginatedRef) {
    writePaginatedRef(paginated)
  }
  if (plan.shouldClearPartialPreview) {
    clearPartialPreview()
  }
  if (plan.browserPreviewLayout === "full") {
    setBrowserPreviewLayout(createFullBrowserPreviewLayout(plan.generation))
  } else if (plan.browserPreviewLayout === "settling-blocking") {
    setBrowserPreviewLayout(createSettlingBlockingBrowserPreviewLayout(plan.generation))
  }
  if (plan.shouldDispatchSetPaginated) {
    dispatchSetPaginated(paginated)
  }
  if (plan.shouldMarkPreviewSettleLifecycle) {
    markPreviewSettleLifecycle()
  }
  if (plan.shouldMarkInlineEditVisualFresh && inlineEditVisualFreshVersion !== null) {
    markInlineEditVisualFresh(inlineEditVisualFreshVersion)
  }
  if (plan.shouldCompleteStructuralSettle && completeStructuralSettle) {
    completeStructuralSettle()
  }
  return true
}

export function createBrowserPreviewShellMutationPlan({
  applyPlan,
  mode,
  source,
  generation,
  isTextMeasurerReady,
  hasStructuralSettleForInlineNode,
}: BrowserPreviewShellMutationPlanInput): BrowserPreviewShellMutationPlan {
  if (applyPlan.action === "ignore") {
    return {
      lane: "browser-preview",
      action: "ignore",
      source,
      reason: applyPlan.reason,
      decisionType: applyPlan.decision.type,
      generation,
      currentGeneration: applyPlan.currentGeneration,
      steps: [],
    }
  }

  const browserPreviewLayout: BrowserPreviewLayoutMutation = mode === "precomputed"
    ? isTextMeasurerReady ? "full" : "unchanged"
    : mode === "partial-worker"
      ? "partial"
    : mode === "visual-only" || isTextMeasurerReady || source === "document-preview-worker"
      ? "full"
      : "settling-blocking"
  const shouldWriteOptimisticLayout = mode !== "partial-worker"
  const shouldWritePaginatedRef = mode !== "precomputed"
    && mode !== "partial-worker"
  const shouldSetPartialPreview = mode === "partial-worker"
  const shouldClearPartialPreview = mode !== "partial-worker"
  const shouldDispatchSetPaginated = mode !== "precomputed"
    && mode !== "partial-worker"
  const shouldMarkPreviewSettleLifecycle = mode !== "partial-worker"
  const shouldMarkInlineEditVisualFresh =
    mode === "paginated-output" &&
    applyPlan.scheduledDraftVersion !== null
  const shouldCompleteStructuralSettle =
    mode === "paginated-output" &&
    hasStructuralSettleForInlineNode
  const steps: PreviewSettleShellMutationStep[] = []
  appendStep(steps, shouldWriteOptimisticLayout, "write-optimistic-layout")
  appendStep(steps, shouldWritePaginatedRef, "write-paginated-ref")
  appendStep(steps, shouldSetPartialPreview, "set-partial-preview")
  appendStep(steps, shouldClearPartialPreview, "clear-partial-preview")
  appendStep(steps, browserPreviewLayout !== "unchanged", "update-browser-preview-layout")
  appendStep(steps, shouldDispatchSetPaginated, "dispatch-set-paginated")
  appendStep(steps, shouldMarkPreviewSettleLifecycle, "mark-preview-settle-lifecycle")
  appendStep(steps, shouldMarkInlineEditVisualFresh, "mark-inline-edit-visual-fresh")
  appendStep(steps, shouldCompleteStructuralSettle, "complete-structural-settle")

  return {
    lane: "browser-preview",
    action: "apply",
    source,
    mode,
    generation,
    browserPreviewLayout,
    shouldWriteOptimisticLayout,
    shouldWritePaginatedRef,
    shouldSetPartialPreview,
    shouldClearPartialPreview,
    shouldDispatchSetPaginated,
    shouldMarkPreviewSettleLifecycle,
    shouldMarkInlineEditVisualFresh,
    shouldCompleteStructuralSettle,
    steps,
  }
}
