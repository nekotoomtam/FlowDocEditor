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

export interface EditorPageNavigationIndex {
  pageItems: EditorPageNavItem[]
  pageKeyByPageIndex: Map<number, string>
  firstPageIndexByNodeId: Map<string, number>
  pageKeysByNodeId: Map<string, string[]>
}

const MAX_PAGE_THUMBNAIL_FRAGMENTS = 96

function makeEditorPageKey(sectionIndex: number, pageArrayIndex: number): string {
  return `${sectionIndex}-${pageArrayIndex}`
}

function collectPageFragments(page: PaginatedPage): PageFragment[] {
  return [
    ...page.headerFragments,
    ...page.fragments,
    ...page.footerFragments,
  ]
}

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

export function buildEditorPageNavigationIndex(paginated: PaginatedDocument): EditorPageNavigationIndex {
  const pageItems: EditorPageNavItem[] = []
  const pageKeyByPageIndex = new Map<number, string>()
  const firstPageIndexByNodeId = new Map<string, number>()
  const pageKeysByNodeId = new Map<string, string[]>()

  paginated.sections.forEach((section, sectionIndex) => {
    section.pages.forEach((page, pageArrayIndex) => {
      const pageKey = makeEditorPageKey(sectionIndex, pageArrayIndex)
      pageItems.push({
        key: pageKey,
        pageIndex: page.index,
        sectionIndex,
        pageArrayIndex,
        width: page.width,
        height: page.height,
        contentBox: { ...page.contentBox },
        thumbnailFragments: collectPageThumbnailFragments(page),
      })
      pageKeyByPageIndex.set(page.index, pageKey)

      const pageNodeIds = new Set<string>()
      for (const fragment of collectPageFragments(page)) pageNodeIds.add(fragment.nodeId)
      for (const nodeId of pageNodeIds) {
        if (!firstPageIndexByNodeId.has(nodeId)) firstPageIndexByNodeId.set(nodeId, page.index)
        const pageKeys = pageKeysByNodeId.get(nodeId)
        if (pageKeys) {
          pageKeys.push(pageKey)
        } else {
          pageKeysByNodeId.set(nodeId, [pageKey])
        }
      }
    })
  })

  return {
    pageItems,
    pageKeyByPageIndex,
    firstPageIndexByNodeId,
    pageKeysByNodeId,
  }
}

export function collectEditorPageNavItems(paginated: PaginatedDocument): EditorPageNavItem[] {
  return buildEditorPageNavigationIndex(paginated).pageItems
}

export function findFirstPageIndexForNodeInIndex(
  index: Pick<EditorPageNavigationIndex, "firstPageIndexByNodeId">,
  nodeId: string | null,
): number | null {
  if (!nodeId) return null
  return index.firstPageIndexByNodeId.get(nodeId) ?? null
}

export function findFirstPageIndexForNode(paginated: PaginatedDocument, nodeId: string | null): number | null {
  return findFirstPageIndexForNodeInIndex(buildEditorPageNavigationIndex(paginated), nodeId)
}

export function findNearestPageIndexInItems(
  items: readonly Pick<EditorPageNavItem, "pageIndex">[],
  pageIndex: number,
): number | null {
  if (items.length === 0) return null

  let nearest = items[0].pageIndex
  let nearestDistance = Math.abs(nearest - pageIndex)
  for (const item of items.slice(1)) {
    const distance = Math.abs(item.pageIndex - pageIndex)
    if (distance >= nearestDistance) continue
    nearest = item.pageIndex
    nearestDistance = distance
  }
  return nearest
}
