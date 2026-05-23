import type { PaginatedDocument } from "@/pagination"

export interface EditorPageNavItem {
  key: string
  pageIndex: number
  sectionIndex: number
  pageArrayIndex: number
  width: number
  height: number
}

export function collectEditorPageNavItems(paginated: PaginatedDocument): EditorPageNavItem[] {
  return paginated.sections.flatMap((section, sectionIndex) =>
    section.pages.map((page, pageArrayIndex) => ({
      key: `${sectionIndex}-${pageArrayIndex}`,
      pageIndex: page.index,
      sectionIndex,
      pageArrayIndex,
      width: page.width,
      height: page.height,
    })),
  )
}

export function findFirstPageIndexForNode(paginated: PaginatedDocument, nodeId: string | null): number | null {
  if (!nodeId) return null
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const fragments = [
        ...page.headerFragments,
        ...page.fragments,
        ...page.footerFragments,
      ]
      if (fragments.some((fragment) => fragment.nodeId === nodeId)) return page.index
    }
  }
  return null
}
