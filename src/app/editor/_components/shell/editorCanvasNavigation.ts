import type { PageContentBox, PageFragment, PaginatedDocument, PaginatedPage } from "@/pagination"

export type EditorPageThumbnailZone = "header" | "body" | "footer"

export interface EditorPageThumbnailFragment {
  nodeType: PageFragment["nodeType"]
  zone: EditorPageThumbnailZone
  x: number
  y: number
  width: number
  height: number
  lineCount: number
}

export interface EditorPageNavItem {
  key: string
  pageIndex: number
  sectionIndex: number
  pageArrayIndex: number
  width: number
  height: number
  contentBox: PageContentBox
  thumbnailFragments: EditorPageThumbnailFragment[]
}

const MAX_PAGE_THUMBNAIL_FRAGMENTS = 96

function toThumbnailFragment(fragment: PageFragment, zone: EditorPageThumbnailZone): EditorPageThumbnailFragment | null {
  if (fragment.width <= 0 || fragment.height <= 0) return null
  return {
    nodeType: fragment.nodeType,
    zone,
    x: fragment.x,
    y: fragment.y,
    width: fragment.width,
    height: fragment.height,
    lineCount: fragment.lines?.length ?? 0,
  }
}

function collectPageThumbnailFragments(page: PaginatedPage): EditorPageThumbnailFragment[] {
  return [
    ...page.headerFragments.map((fragment) => toThumbnailFragment(fragment, "header")),
    ...page.fragments.map((fragment) => toThumbnailFragment(fragment, "body")),
    ...page.footerFragments.map((fragment) => toThumbnailFragment(fragment, "footer")),
  ]
    .filter((fragment): fragment is EditorPageThumbnailFragment => fragment !== null)
    .sort((a, b) => a.y - b.y || a.x - b.x || b.width * b.height - a.width * a.height)
    .slice(0, MAX_PAGE_THUMBNAIL_FRAGMENTS)
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
      contentBox: { ...page.contentBox },
      thumbnailFragments: collectPageThumbnailFragments(page),
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
