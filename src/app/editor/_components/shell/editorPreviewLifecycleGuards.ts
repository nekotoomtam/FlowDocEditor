import type { PaginatedDocument } from "@/pagination"
import type { EditorPartialPreviewPaginated } from "../editorPreviewDisplay"
import type { EditorRenderInvalidationPlan } from "../operations/editorRenderInvalidation"

export type CanvasRenderInvalidationState = {
  plan: EditorRenderInvalidationPlan | null
  paginated: PaginatedDocument
}

export function shouldClearPartialPreviewPaginated(
  current: EditorPartialPreviewPaginated | null,
): boolean {
  return current !== null
}

export function shouldApplyPartialPreviewPaginated(
  current: EditorPartialPreviewPaginated | null,
  next: EditorPartialPreviewPaginated,
): boolean {
  return !(
    current?.generation === next.generation &&
    current.requestId === next.requestId &&
    current.paginated === next.paginated
  )
}

export function shouldApplyCanvasRenderInvalidationState(
  current: CanvasRenderInvalidationState | null,
  next: CanvasRenderInvalidationState,
): boolean {
  if (next.plan === null) return false
  return !(current?.plan === next.plan && current.paginated === next.paginated)
}
