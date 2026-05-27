import type { PaginationTrace, PaginationTraceBodyChildSpan, PaginationTraceFragment } from "./trace"

export const SUPPORTED_BODY_CHECKPOINT_NODE_TYPES = new Set([
  "paragraph",
  "spacer",
  "divider",
  "page-break",
])

export type PaginationCheckpointCandidateStatus =
  | "supported"
  | "unsupported-missing-fragment"
  | "unsupported-toc"
  | "unsupported-container"

export interface PaginationCheckpointCandidate {
  sectionId: string
  bodyNodeId: string
  beforeChildIndex: number
  beforeNodeId: string
  beforeNodeType: string
  pageIndex: number | null
  status: PaginationCheckpointCandidateStatus
}

export type PaginationCheckpointTocDependencyStatus =
  | "none-before"
  | "toc-before-or-at"

export interface PaginationCheckpointResumeCursor {
  pageIndex: number
  x: number
  y: number
}

export interface PaginationCheckpointPageNumberContext {
  sectionFirstPageIndex: number
  sectionLocalPageNumber: number
}

export interface PaginationCheckpointState {
  id: string
  sourceDocumentGenerationId: string
  measurementVersion: string
  sectionId: string
  bodyNodeId: string
  beforeChildIndex: number
  beforeNodeId: string
  beforeNodeType: string
  cursor: PaginationCheckpointResumeCursor
  pageNumberContext: PaginationCheckpointPageNumberContext
  tocDependencyStatus: PaginationCheckpointTocDependencyStatus
  listNumberingStatus: "not-captured"
}

export interface BuildPaginationCheckpointStatesOptions {
  sourceDocumentGenerationId: string
  measurementVersion: string
}

export type PaginationCheckpointInvalidationChange =
  | { type: "body-child-content"; sectionId: string; bodyNodeId: string; childIndex: number }
  | { type: "body-structure"; sectionId: string; bodyNodeId: string; fromChildIndex: number }
  | { type: "section-layout"; sectionId: string }
  | { type: "document-layout" }
  | { type: "measurement" }

export type PaginationCheckpointInvalidationReason =
  | "body-content-before-checkpoint"
  | "body-structure-at-or-before-checkpoint"
  | "section-layout-changed"
  | "document-layout-changed"
  | "measurement-changed"
  | "measurement-version-mismatch"
  | "source-document-generation-mismatch"

export interface PaginationCheckpointValidationContext {
  sourceDocumentGenerationId?: string
  measurementVersion?: string
  changes?: readonly PaginationCheckpointInvalidationChange[]
}

function statusForBodyChild(span: PaginationTraceBodyChildSpan): PaginationCheckpointCandidateStatus {
  if (!span.hasFragments || span.firstPageIndex == null) return "unsupported-missing-fragment"
  if (span.nodeType === "toc") return "unsupported-toc"
  if (SUPPORTED_BODY_CHECKPOINT_NODE_TYPES.has(span.nodeType)) return "supported"
  return "unsupported-container"
}

export function buildPaginationCheckpointCandidates(trace: PaginationTrace): PaginationCheckpointCandidate[] {
  return trace.bodyChildSpans.map((span) => ({
    sectionId: span.sectionId,
    bodyNodeId: span.bodyNodeId,
    beforeChildIndex: span.childIndex,
    beforeNodeId: span.nodeId,
    beforeNodeType: span.nodeType,
    pageIndex: span.firstPageIndex,
    status: statusForBodyChild(span),
  }))
}

function checkpointIdFor(input: {
  sourceDocumentGenerationId: string
  measurementVersion: string
  sectionId: string
  bodyNodeId: string
  beforeChildIndex: number
  beforeNodeId: string
}): string {
  return [
    "checkpoint",
    input.sourceDocumentGenerationId,
    input.measurementVersion,
    input.sectionId,
    input.bodyNodeId,
    input.beforeChildIndex,
    input.beforeNodeId,
  ].join(":")
}

function findFirstTraceFragment(
  trace: PaginationTrace,
  candidate: PaginationCheckpointCandidate,
): PaginationTraceFragment | null {
  let first: PaginationTraceFragment | null = null
  for (const fragment of trace.fragments) {
    if (fragment.sectionId !== candidate.sectionId || fragment.nodeId !== candidate.beforeNodeId) continue
    if (first == null || fragment.fragmentOrder < first.fragmentOrder) first = fragment
  }
  return first
}

function sectionFirstPageIndex(trace: PaginationTrace, sectionId: string): number | null {
  return trace.sectionSpans.find((span) => span.sectionId === sectionId)?.firstPageIndex ?? null
}

function tocDependencyStatus(
  trace: PaginationTrace,
  candidate: PaginationCheckpointCandidate,
): PaginationCheckpointTocDependencyStatus {
  const hasTocBeforeOrAt = trace.bodyChildSpans.some((span) =>
    span.sectionId === candidate.sectionId &&
    span.bodyNodeId === candidate.bodyNodeId &&
    span.childIndex <= candidate.beforeChildIndex &&
    span.nodeType === "toc",
  )
  return hasTocBeforeOrAt ? "toc-before-or-at" : "none-before"
}

export function buildPaginationCheckpointStates(
  trace: PaginationTrace,
  options: BuildPaginationCheckpointStatesOptions,
): PaginationCheckpointState[] {
  const candidates = buildPaginationCheckpointCandidates(trace)
  const states: PaginationCheckpointState[] = []

  for (const candidate of candidates) {
    if (candidate.status !== "supported") continue
    const firstFragment = findFirstTraceFragment(trace, candidate)
    const firstSectionPageIndex = sectionFirstPageIndex(trace, candidate.sectionId)
    if (firstFragment == null || firstSectionPageIndex == null) continue

    states.push({
      id: checkpointIdFor({
        sourceDocumentGenerationId: options.sourceDocumentGenerationId,
        measurementVersion: options.measurementVersion,
        sectionId: candidate.sectionId,
        bodyNodeId: candidate.bodyNodeId,
        beforeChildIndex: candidate.beforeChildIndex,
        beforeNodeId: candidate.beforeNodeId,
      }),
      sourceDocumentGenerationId: options.sourceDocumentGenerationId,
      measurementVersion: options.measurementVersion,
      sectionId: candidate.sectionId,
      bodyNodeId: candidate.bodyNodeId,
      beforeChildIndex: candidate.beforeChildIndex,
      beforeNodeId: candidate.beforeNodeId,
      beforeNodeType: candidate.beforeNodeType,
      cursor: {
        pageIndex: firstFragment.pageIndex,
        x: firstFragment.x,
        y: firstFragment.y,
      },
      pageNumberContext: {
        sectionFirstPageIndex: firstSectionPageIndex,
        sectionLocalPageNumber: firstFragment.pageIndex - firstSectionPageIndex + 1,
      },
      tocDependencyStatus: tocDependencyStatus(trace, candidate),
      listNumberingStatus: "not-captured",
    })
  }

  return states
}

export function findNearestSupportedCheckpointAtOrBeforePage(
  candidates: readonly PaginationCheckpointCandidate[],
  pageIndex: number,
): PaginationCheckpointCandidate | null {
  let best: PaginationCheckpointCandidate | null = null
  for (const candidate of candidates) {
    if (candidate.status !== "supported" || candidate.pageIndex == null) continue
    if (candidate.pageIndex > pageIndex) continue
    if (
      best == null ||
      candidate.pageIndex > best.pageIndex! ||
      (candidate.pageIndex === best.pageIndex && candidate.beforeChildIndex > best.beforeChildIndex)
    ) {
      best = candidate
    }
  }
  return best
}

function pushReason(
  reasons: PaginationCheckpointInvalidationReason[],
  reason: PaginationCheckpointInvalidationReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason)
}

export function getPaginationCheckpointInvalidationReasons(
  checkpoint: PaginationCheckpointState,
  context: PaginationCheckpointValidationContext,
): PaginationCheckpointInvalidationReason[] {
  const reasons: PaginationCheckpointInvalidationReason[] = []

  if (
    context.sourceDocumentGenerationId != null &&
    context.sourceDocumentGenerationId !== checkpoint.sourceDocumentGenerationId
  ) {
    pushReason(reasons, "source-document-generation-mismatch")
  }

  if (
    context.measurementVersion != null &&
    context.measurementVersion !== checkpoint.measurementVersion
  ) {
    pushReason(reasons, "measurement-version-mismatch")
  }

  for (const change of context.changes ?? []) {
    switch (change.type) {
      case "measurement":
        pushReason(reasons, "measurement-changed")
        break
      case "document-layout":
        pushReason(reasons, "document-layout-changed")
        break
      case "section-layout":
        if (change.sectionId === checkpoint.sectionId) pushReason(reasons, "section-layout-changed")
        break
      case "body-child-content":
        if (
          change.sectionId === checkpoint.sectionId &&
          change.bodyNodeId === checkpoint.bodyNodeId &&
          change.childIndex < checkpoint.beforeChildIndex
        ) {
          pushReason(reasons, "body-content-before-checkpoint")
        }
        break
      case "body-structure":
        if (
          change.sectionId === checkpoint.sectionId &&
          change.bodyNodeId === checkpoint.bodyNodeId &&
          change.fromChildIndex <= checkpoint.beforeChildIndex
        ) {
          pushReason(reasons, "body-structure-at-or-before-checkpoint")
        }
        break
    }
  }

  return reasons
}

export function isPaginationCheckpointUsable(
  checkpoint: PaginationCheckpointState,
  context: PaginationCheckpointValidationContext,
): boolean {
  return getPaginationCheckpointInvalidationReasons(checkpoint, context).length === 0
}
