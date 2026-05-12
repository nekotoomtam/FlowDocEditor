import { normalizeDocument, updateParagraphText } from "@/document"
import type { DocumentNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"

export function buildWysiwygTextDraftPreviewDocument(input: {
  doc: DocumentNode
  nodeId: string
  draftText: string
}): DocumentNode {
  return normalizeDocument(updateParagraphText(input.doc, input.nodeId, input.draftText))
}

export function countWysiwygTextDraftFragments(
  paginated: PaginatedDocument,
  nodeId: string,
): number {
  return paginated.sections
    .flatMap((section) => section.pages)
    .flatMap((page) => page.fragments)
    .filter((fragment) => fragment.nodeId === nodeId && fragment.nodeType === "paragraph")
    .length
}
