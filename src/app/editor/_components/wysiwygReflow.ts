import type { PageFragment, PaginatedLine } from "@/pagination"

export type WysiwygTextReflowKind =
  | "soft"
  | "hard-local"
  | "hard-page-boundary"
  | "unsupported"

export type WysiwygTextReflowReason =
  | "same-fragment-lines"
  | "line-count-changed"
  | "height-changed"
  | "page-boundary"
  | "unsupported-fragment"
  | "missing-layout"

export interface WysiwygTextReflowDecision {
  kind: WysiwygTextReflowKind
  reason: WysiwygTextReflowReason
  shouldPatchActiveLines: boolean
  shouldPatchSamePageHeight: boolean
  shouldQueueSettledPagination: boolean
}

export interface WysiwygDraftPaginationDelayInput {
  reflow?: WysiwygTextReflowDecision | null
  isFlowStackParagraph: boolean
  isTableCellParagraph?: boolean
  draftPaginationActive?: boolean
  defaultDelayMs: number
  flowStackBoundaryDelayMs: number
}

export interface WysiwygDraftPaginationCoalesceInput {
  pendingDelayMs: number | null
  nextDelayMs: number
  responsiveDelayMs: number
}

export interface WysiwygResponsiveFlowStackDraftPaginationInput {
  isFlowStackParagraph: boolean
  draftPaginationActive: boolean
  currentFragmentCount: number
}

export interface WysiwygResponsiveTableCellDraftPaginationInput {
  isTableCellParagraph: boolean
  draftPaginationActive: boolean
  currentFragmentCount: number
}

export interface WysiwygResponsiveContainerDraftPaginationInput {
  isFlowStackParagraph: boolean
  isTableCellParagraph: boolean
  draftPaginationActive: boolean
  currentFragmentCount: number
}

export interface WysiwygLocalDraftLinesInput {
  reflow: WysiwygTextReflowDecision
  isTableCellParagraph: boolean
}

export interface WysiwygTableCellDraftVisualPreviewInput {
  reflow: WysiwygTextReflowDecision
  isTableCellParagraph: boolean
  isFlowStackParagraph: boolean
  draftPaginationActive: boolean
}

export interface WysiwygTableCellDraftVisualPreviewPaginationInput {
  hasVisualPreview: boolean
  draftPaginationActive: boolean
  existingSplitActive: boolean
}

export interface WysiwygDraftPaginationSessionSource {
  nodeId: string | null
  draftText: string
  caretOffset: number | null
  dirtyVersion: number
}

export interface WysiwygDraftPaginationLatestSnapshot {
  nodeId: string
  draftText: string
  caretOffset: number | null
  revision: number
}

export interface WysiwygDraftPaginationSource {
  nodeId: string
  draftText: string
  caretOffset: number | null
  revision: number
}

export interface WysiwygDraftPaginationFrameInput {
  nextDelayMs: number
  responsiveDelayMs: number
  canUseAnimationFrame: boolean
}

const HEIGHT_EPSILON = 0.5

export const WYSIWYG_TABLE_CELL_VISUAL_PREVIEW_REFLOW_DECISION: WysiwygTextReflowDecision = {
  kind: "hard-page-boundary",
  reason: "page-boundary",
  shouldPatchActiveLines: true,
  shouldPatchSamePageHeight: false,
  shouldQueueSettledPagination: true,
}

function fragmentLineCount(fragment: PageFragment): number {
  if (fragment.lineStart != null && fragment.lineEnd != null) {
    return Math.max(0, fragment.lineEnd - fragment.lineStart)
  }
  return fragment.lines?.length ?? 0
}

export function classifyWysiwygTextReflow(input: {
  fragment: PageFragment
  draftLines?: PaginatedLine[] | null
  draftHeight?: number | null
  pageContentBottom?: number | null
  supportsLocalDraftLayout: boolean
  supportsSamePageHeightPatch?: boolean
}): WysiwygTextReflowDecision {
  if (!input.supportsLocalDraftLayout) {
    return {
      kind: "unsupported",
      reason: "unsupported-fragment",
      shouldPatchActiveLines: false,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: false,
    }
  }

  if (!input.draftLines || input.draftHeight == null) {
    return {
      kind: "unsupported",
      reason: "missing-layout",
      shouldPatchActiveLines: false,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: false,
    }
  }

  const draftBottom = input.fragment.y + input.draftHeight
  if (input.pageContentBottom != null && draftBottom > input.pageContentBottom + HEIGHT_EPSILON) {
    return {
      kind: "hard-page-boundary",
      reason: "page-boundary",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: true,
    }
  }

  const lineCountChanged = input.draftLines.length !== fragmentLineCount(input.fragment)
  if (lineCountChanged) {
    return {
      kind: "hard-local",
      reason: "line-count-changed",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: input.supportsSamePageHeightPatch === true,
      shouldQueueSettledPagination: true,
    }
  }

  if (Math.abs(input.draftHeight - input.fragment.height) >= HEIGHT_EPSILON) {
    return {
      kind: "hard-local",
      reason: "height-changed",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: input.supportsSamePageHeightPatch === true,
      shouldQueueSettledPagination: true,
    }
  }

  return {
    kind: "soft",
    reason: "same-fragment-lines",
    shouldPatchActiveLines: true,
    shouldPatchSamePageHeight: false,
    shouldQueueSettledPagination: false,
  }
}

export function resolveWysiwygDraftPaginationDelayMs(input: WysiwygDraftPaginationDelayInput): number {
  if (input.isTableCellParagraph) {
    if (input.draftPaginationActive) return input.flowStackBoundaryDelayMs
    if (input.reflow?.shouldQueueSettledPagination) return input.flowStackBoundaryDelayMs
  }
  if (!input.isFlowStackParagraph) return input.defaultDelayMs
  if (input.draftPaginationActive) return input.flowStackBoundaryDelayMs
  if (
    input.reflow?.kind === "hard-page-boundary" &&
    input.reflow.shouldQueueSettledPagination
  ) {
    return input.flowStackBoundaryDelayMs
  }
  return input.defaultDelayMs
}

export function shouldCoalesceWysiwygDraftPaginationRequest(input: WysiwygDraftPaginationCoalesceInput): boolean {
  return input.pendingDelayMs !== null &&
    input.pendingDelayMs <= input.responsiveDelayMs &&
    input.nextDelayMs <= input.responsiveDelayMs
}

export function shouldUseWysiwygDraftPaginationFrame(input: WysiwygDraftPaginationFrameInput): boolean {
  return input.canUseAnimationFrame && input.nextDelayMs <= input.responsiveDelayMs
}

export function shouldScheduleResponsiveFlowStackDraftPagination(
  input: WysiwygResponsiveFlowStackDraftPaginationInput,
): boolean {
  return input.isFlowStackParagraph &&
    (input.draftPaginationActive || input.currentFragmentCount > 1)
}

export function shouldScheduleResponsiveTableCellDraftPagination(
  input: WysiwygResponsiveTableCellDraftPaginationInput,
): boolean {
  return input.isTableCellParagraph &&
    (input.draftPaginationActive || input.currentFragmentCount > 1)
}

export function shouldScheduleResponsiveContainerDraftPagination(
  input: WysiwygResponsiveContainerDraftPaginationInput,
): boolean {
  return shouldScheduleResponsiveFlowStackDraftPagination(input) ||
    shouldScheduleResponsiveTableCellDraftPagination(input)
}

export function shouldUseWysiwygLocalDraftLines(input: WysiwygLocalDraftLinesInput): boolean {
  if (!input.reflow.shouldPatchActiveLines) return false
  if (input.isTableCellParagraph && input.reflow.kind === "hard-page-boundary") return false
  return true
}

export function shouldPrepareWysiwygTableCellDraftVisualPreview(
  input: WysiwygTableCellDraftVisualPreviewInput,
): boolean {
  if (!input.isTableCellParagraph) return false
  if (input.isFlowStackParagraph) return false
  if (input.draftPaginationActive) return false
  if (input.reflow.kind !== "hard-page-boundary") return false
  return input.reflow.shouldPatchActiveLines && input.reflow.shouldQueueSettledPagination
}

export function shouldQueueSettledTableCellDraftPaginationFromVisualPreview(
  input: WysiwygTableCellDraftVisualPreviewPaginationInput,
): boolean {
  return input.hasVisualPreview &&
    !input.draftPaginationActive &&
    !input.existingSplitActive
}

export function resolveWysiwygDraftPaginationSource(input: {
  nodeId: string
  session: WysiwygDraftPaginationSessionSource
  latestSnapshot?: WysiwygDraftPaginationLatestSnapshot | null
}): WysiwygDraftPaginationSource | null {
  if (input.latestSnapshot?.nodeId === input.nodeId) {
    return {
      nodeId: input.nodeId,
      draftText: input.latestSnapshot.draftText,
      caretOffset: input.latestSnapshot.caretOffset,
      revision: input.latestSnapshot.revision,
    }
  }
  if (input.session.nodeId !== input.nodeId) return null
  return {
    nodeId: input.nodeId,
    draftText: input.session.draftText,
    caretOffset: input.session.caretOffset,
    revision: input.session.dirtyVersion,
  }
}
