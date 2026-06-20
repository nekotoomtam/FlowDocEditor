import type { PaginatedDocument } from "@/pagination"
import type { EditorPreviewLayoutState } from "./editorPreviewLayoutStatus"

export type EditorPaginationSnapshotSource =
  | "authoritative-state"
  | "full-browser-preview"
  | "partial-browser-preview"
  | "wysiwyg-draft"
  | "optimistic-structural"
  | "server-check"

export type EditorPaginationSnapshotFreshness =
  | "current"
  | "stale"
  | "unknown"

export type EditorPaginationSnapshotAdoptionPurpose =
  | "display"
  | "export-readiness"
  | "history"
  | "diagnostics"

export interface EditorPaginationSnapshotIdentity {
  source: EditorPaginationSnapshotSource
  generation?: number | null
  requestId?: number | null
  sourceRevision?: number | null
  layoutVersion?: number | null
  documentId?: string | null
}

export interface EditorPartialPreviewPaginated {
  generation: number
  requestId: number
  paginated: PaginatedDocument
  identity?: EditorPaginationSnapshotIdentity
}

export type EditorDisplayPaginatedSource =
  | "authoritative-state"
  | "partial-browser-preview"

export type EditorDisplayPaginatedReason =
  | "partial-preview-current"
  | "preview-layout-not-partial"
  | "partial-preview-missing"
  | "partial-preview-generation-mismatch"
  | "partial-preview-identity-mismatch"

export interface EditorDisplayPaginatedInput {
  authoritativePaginated: PaginatedDocument
  partialPreviewPaginated: EditorPartialPreviewPaginated | null
  previewLayout: EditorPreviewLayoutState
}

export interface EditorDisplayPaginatedResolution {
  source: EditorDisplayPaginatedSource
  reason: EditorDisplayPaginatedReason
  paginated: PaginatedDocument
  identity: EditorPaginationSnapshotIdentity
  freshness: EditorPaginationSnapshotFreshness
  adoptionPurpose: "display"
  previewGeneration: number | null
  partialGeneration: number | null
}

export function createAuthoritativePaginationSnapshotIdentity(): EditorPaginationSnapshotIdentity {
  return { source: "authoritative-state" }
}

export function createPartialBrowserPreviewPaginationSnapshotIdentity(
  partial: Pick<EditorPartialPreviewPaginated, "generation" | "requestId" | "identity">,
): EditorPaginationSnapshotIdentity {
  return partial.identity ?? {
    source: "partial-browser-preview",
    generation: partial.generation,
    requestId: partial.requestId,
  }
}

export function areEditorPaginationSnapshotIdentitiesEqual(
  current: EditorPaginationSnapshotIdentity | null | undefined,
  next: EditorPaginationSnapshotIdentity | null | undefined,
): boolean {
  if (current === next) return true
  if (current == null || next == null) return false
  return (
    current.source === next.source &&
    current.generation === next.generation &&
    current.requestId === next.requestId &&
    current.sourceRevision === next.sourceRevision &&
    current.layoutVersion === next.layoutVersion &&
    current.documentId === next.documentId
  )
}

export function resolveGenerationFreshness(
  identity: EditorPaginationSnapshotIdentity,
  currentGeneration: number | null,
): EditorPaginationSnapshotFreshness {
  if (currentGeneration === null || identity.generation == null) return "unknown"
  return identity.generation === currentGeneration ? "current" : "stale"
}

export function resolveEditorDisplayPaginatedResolution(
  input: EditorDisplayPaginatedInput,
): EditorDisplayPaginatedResolution {
  const previewGeneration = input.previewLayout.generation
  const partialGeneration = input.partialPreviewPaginated?.generation ?? null
  const authoritativeIdentity = createAuthoritativePaginationSnapshotIdentity()

  if (input.previewLayout.status !== "partial" || previewGeneration === null) {
    return {
      source: "authoritative-state",
      reason: "preview-layout-not-partial",
      paginated: input.authoritativePaginated,
      identity: authoritativeIdentity,
      freshness: "current",
      adoptionPurpose: "display",
      previewGeneration,
      partialGeneration,
    }
  }

  if (!input.partialPreviewPaginated) {
    return {
      source: "authoritative-state",
      reason: "partial-preview-missing",
      paginated: input.authoritativePaginated,
      identity: authoritativeIdentity,
      freshness: "current",
      adoptionPurpose: "display",
      previewGeneration,
      partialGeneration,
    }
  }

  const partialIdentity = createPartialBrowserPreviewPaginationSnapshotIdentity(input.partialPreviewPaginated)
  const partialFreshness = resolveGenerationFreshness(partialIdentity, previewGeneration)

  if (
    partialIdentity.source !== "partial-browser-preview" ||
    partialIdentity.generation !== input.partialPreviewPaginated.generation ||
    partialIdentity.requestId !== input.partialPreviewPaginated.requestId
  ) {
    return {
      source: "authoritative-state",
      reason: "partial-preview-identity-mismatch",
      paginated: input.authoritativePaginated,
      identity: authoritativeIdentity,
      freshness: "current",
      adoptionPurpose: "display",
      previewGeneration,
      partialGeneration,
    }
  }

  if (partialFreshness !== "current" || input.partialPreviewPaginated.generation !== previewGeneration) {
    return {
      source: "authoritative-state",
      reason: "partial-preview-generation-mismatch",
      paginated: input.authoritativePaginated,
      identity: authoritativeIdentity,
      freshness: "current",
      adoptionPurpose: "display",
      previewGeneration,
      partialGeneration,
    }
  }

  return {
    source: "partial-browser-preview",
    reason: "partial-preview-current",
    paginated: input.partialPreviewPaginated.paginated,
    identity: partialIdentity,
    freshness: partialFreshness,
    adoptionPurpose: "display",
    previewGeneration,
    partialGeneration,
  }
}
