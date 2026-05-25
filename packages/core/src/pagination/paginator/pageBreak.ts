import type { FlowBox } from "../../layout"
import type { PageFlowCursor, PaginatedPage } from "../types"
import { advancePage, ensurePage, pushFragment } from "./cursor"

export function paginatePageBreak(
  box: FlowBox,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  cursor: PageFlowCursor,
  parentNodeId?: string,
): PageFlowCursor {
  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "page-break",
    parentNodeId,
    pageIndex: cursor.pageIndex,
    x: box.x,
    y: cursor.cursorY,
    width: box.width,
    height: 0,
  })

  const next = advancePage(cursor, contentTop)
  ensurePage(pages, next.pageIndex, template)
  return next
}
