import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"

export type LayoutStatus = "server-checked" | "optimistic" | "reconciling"

export interface OptimisticLayoutSnapshot {
  doc: DocumentNode
  paginated: PaginatedDocument
}

export interface ResolvedOptimisticLayout {
  paginated: PaginatedDocument
  source: "same-preview-doc" | "fallback-current-canvas"
}

export function resolveSamePreviewOptimisticLayout(
  snapshot: OptimisticLayoutSnapshot | null,
  previewDoc: DocumentNode,
  fallbackPaginated: PaginatedDocument,
): ResolvedOptimisticLayout {
  if (snapshot?.doc === previewDoc) {
    return {
      paginated: snapshot.paginated,
      source: "same-preview-doc",
    }
  }

  return {
    paginated: fallbackPaginated,
    source: "fallback-current-canvas",
  }
}
