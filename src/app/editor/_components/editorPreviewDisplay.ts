import type { PaginatedDocument } from "@/pagination"
import {
  resolveEditorDisplayPaginatedResolution,
  type EditorDisplayPaginatedInput,
  type EditorDisplayPaginatedResolution,
} from "./editorPaginationOwnership"

export type {
  EditorDisplayPaginatedInput,
  EditorDisplayPaginatedResolution,
  EditorDisplayPaginatedSource,
  EditorPaginationSnapshotAdoptionPurpose,
  EditorPaginationSnapshotFreshness,
  EditorPaginationSnapshotIdentity,
  EditorPaginationSnapshotSource,
  EditorPartialPreviewPaginated,
} from "./editorPaginationOwnership"

export function resolveEditorDisplayPagination(
  input: EditorDisplayPaginatedInput,
): EditorDisplayPaginatedResolution {
  return resolveEditorDisplayPaginatedResolution(input)
}

export function resolveEditorDisplayPaginated(input: EditorDisplayPaginatedInput): PaginatedDocument {
  return resolveEditorDisplayPagination(input).paginated
}
