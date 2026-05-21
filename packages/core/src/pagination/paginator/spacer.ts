import type { FlowBox } from "../../layout"
import type { PageFlowCursor, PaginatedPage } from "../types"
import {
  advancePage,
  pushFragment,
  shouldMoveBlockToNextPage,
  shouldMoveToNextPage,
} from "./cursor"

export function paginateSpacer(
  box: FlowBox,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  parentNodeId?: string,
): PageFlowCursor {
  let current = cursor

  if (
    shouldMoveToNextPage(current.cursorY, contentBottom) ||
    shouldMoveBlockToNextPage(current.cursorY, box.height, contentTop, contentBottom)
  ) {
    current = advancePage(current, contentTop)
  }

  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "spacer",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: box.height,
  })

  return { ...current, cursorY: current.cursorY + box.height }
}
