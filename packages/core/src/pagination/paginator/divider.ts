import { measureDivider } from "../../layout"
import type { FlowBox } from "../../layout"
import type { DocumentSection } from "../../schema"
import type { PageFlowCursor, PaginatedPage } from "../types"
import {
  advancePage,
  pushFragment,
  shouldMoveBlockToNextPage,
  shouldMoveToNextPage,
} from "./cursor"

export function paginateDivider(
  box: FlowBox,
  section: DocumentSection,
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

  const node = section.nodes[box.nodeId]
  const measured = node?.type === "divider" ? measureDivider(node, box.width) : null

  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "divider",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: measured?.height ?? box.height,
    dividerRenderProps: measured ? {
      color: measured.color,
      thickness: measured.thickness,
      marginBefore: measured.marginBefore,
      marginAfter: measured.marginAfter,
      style: measured.style,
    } : undefined,
  })

  return { ...current, cursorY: current.cursorY + (measured?.height ?? box.height) }
}
