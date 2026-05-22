import type { DocumentNode, ParagraphNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import { replaceEditableParagraphInDocument, replaceEditableParagraphTextInDocument } from "./wysiwygTextCommit"

export function buildWysiwygTextDraftPreviewDocument(input: {
  doc: DocumentNode
  nodeId: string
  draftText: string
  draftParagraph?: ParagraphNode | null
}): DocumentNode {
  if (input.draftParagraph) {
    return replaceEditableParagraphInDocument(input.doc, input.nodeId, input.draftParagraph)
  }
  return replaceEditableParagraphTextInDocument(input.doc, input.nodeId, input.draftText)
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
