import type { PaginatedDocument } from "@/pagination"
import type { EditorPreviewLayoutState } from "./editorPreviewLayoutStatus"

export interface EditorPartialPreviewPaginated {
  generation: number
  requestId: number
  paginated: PaginatedDocument
}

export function resolveEditorDisplayPaginated(input: {
  authoritativePaginated: PaginatedDocument
  partialPreviewPaginated: EditorPartialPreviewPaginated | null
  previewLayout: EditorPreviewLayoutState
}): PaginatedDocument {
  if (
    input.previewLayout.status === "partial" &&
    input.previewLayout.generation !== null &&
    input.partialPreviewPaginated?.generation === input.previewLayout.generation
  ) {
    return input.partialPreviewPaginated.paginated
  }

  return input.authoritativePaginated
}
