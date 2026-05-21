import type { FlowBox } from "../../layout"
import { createEmptyPage } from "../metrics"
import type { PageFlowCursor, PageFragment, PaginatedPage } from "../types"

export function shouldMoveToNextPage(cursorY: number, contentBottom: number): boolean {
  return cursorY >= contentBottom
}

export function shouldMoveBlockToNextPage(
  cursorY: number,
  blockHeight: number,
  contentTop: number,
  contentBottom: number,
): boolean {
  if (cursorY <= contentTop) return false
  return cursorY + blockHeight > contentBottom
}

export function advancePage(cursor: PageFlowCursor, contentTop: number): PageFlowCursor {
  return { pageIndex: cursor.pageIndex + 1, cursorY: contentTop, pageNumberOffset: cursor.pageNumberOffset }
}

export function ensurePage(pages: PaginatedPage[], index: number, template: PaginatedPage): PaginatedPage {
  if (pages[index] == null) {
    pages[index] = createEmptyPage(index, {
      pageWidth: template.width,
      pageHeight: template.height,
      contentBox: { ...template.contentBox },
    })
  }
  return pages[index]
}

export function pushFragment(pages: PaginatedPage[], template: PaginatedPage, fragment: PageFragment): void {
  ensurePage(pages, fragment.pageIndex, template).fragments.push(fragment)
}

export function toPageFragmentNodeType(nodeType: FlowBox["nodeType"]): PageFragment["nodeType"] {
  switch (nodeType) {
    case "flow-row":
    case "flow-stack":
      throw new Error(`${nodeType} pagination is not implemented yet`)
    default:
      return nodeType
  }
}
