import { createEmptyPage, getPageMetrics, type PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"

export function createEditorPlaceholderPaginatedDocument(doc: DocumentNode): PaginatedDocument {
  let pageIndex = 0
  return {
    sections: doc.document.sections.map((section, sectionIndex) => {
      if (sectionIndex > 0) pageIndex += 1
      const metrics = getPageMetrics(section.page)
      return {
        sectionId: section.id,
        pages: [createEmptyPage(pageIndex, metrics)],
      }
    }),
    tocEntries: [],
  }
}
