import {
  defaultWordBreaker,
  measureDivider,
  measureParagraph,
  paragraphBoxLeftInset,
} from "../../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { DocumentSection } from "../../schema"
import type {
  PageFlowCursor,
  DividerRenderProps,
  PageFragment,
  PaginatedLine,
  PaginatedPage,
  ParagraphRenderProps,
} from "../types"
import {
  advancePage,
  pushFragment,
  shouldMoveBlockToNextPage,
  shouldMoveToNextPage,
  toPageFragmentNodeType,
} from "./cursor"
import {
  buildPositionedParagraphLines,
  buildRenderProps,
  resolvePageNumbers,
} from "./paragraph"
import { toListMarkerRenderProps, withListBodyIndent, type ListNumberingPaginationContext } from "./listMarker"

function pushStackContents(
  stackBox: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  pageIndex: number,
  pageY: number,
  wordBreaker: WordBreaker = defaultWordBreaker,
  pageNumberOffset: number = 0,
  listNumbering?: ListNumberingPaginationContext,
): void {
  const offsetY = pageY - stackBox.y
  stackBox.children.forEach((child) => {
    const childPageY = child.y + offsetY
    let lines: PaginatedLine[] | undefined
    let renderProps: ParagraphRenderProps | undefined
    let dividerRenderProps: DividerRenderProps | undefined
    let listMarker: PageFragment["listMarker"]

    if (child.nodeType === "paragraph") {
      const node = section.nodes[child.nodeId]
      if (node?.type === "paragraph") {
        const resolvedListMarker = listNumbering?.markers.get(node.id)
        const layoutNode = withListBodyIndent(node, resolvedListMarker, listNumbering)
        const measured = measureParagraph(layoutNode, child.width, measurer, wordBreaker)
        const rawLines = buildPositionedParagraphLines(measured, measured.lines, child.x, childPageY, 0, layoutNode.props.align)
        lines = resolvePageNumbers(rawLines, pageIndex + 1 + pageNumberOffset)
        renderProps = buildRenderProps(layoutNode, measured.lineHeight, measured.box)
        listMarker = toListMarkerRenderProps(resolvedListMarker, listNumbering, child.x + paragraphBoxLeftInset(measured.box))
      }
    }
    if (child.nodeType === "divider") {
      const node = section.nodes[child.nodeId]
      if (node?.type === "divider") {
        const measured = measureDivider(node, child.width)
        dividerRenderProps = {
          color: measured.color,
          thickness: measured.thickness,
          marginBefore: measured.marginBefore,
          marginAfter: measured.marginAfter,
          style: measured.style,
        }
      }
    }

    pushFragment(pages, template, {
      nodeId: child.nodeId,
      nodeType: toPageFragmentNodeType(child.nodeType),
      parentNodeId: stackBox.nodeId,
      pageIndex,
      x: child.x,
      y: childPageY,
      width: child.width,
      height: child.height,
      lines,
      renderProps,
      listMarker,
      dividerRenderProps,
    })
  })
}

export function paginateRow(
  box: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  parentNodeId?: string,
  wordBreaker: WordBreaker = defaultWordBreaker,
  listNumbering?: ListNumberingPaginationContext,
): PageFlowCursor {
  let current = cursor

  if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
    current = advancePage(current, contentTop)
  }

  if (shouldMoveBlockToNextPage(current.cursorY, box.height, contentTop, contentBottom)) {
    const nextPageCursor = advancePage(current, contentTop)
    if (nextPageCursor.cursorY + box.height <= contentBottom) {
      current = nextPageCursor
    }
  }

  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "row",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: box.height,
  })

  box.children.forEach((stackBox) => {
    pushFragment(pages, template, {
      nodeId: stackBox.nodeId,
      nodeType: "stack",
      parentNodeId: box.nodeId,
      pageIndex: current.pageIndex,
      x: stackBox.x,
      y: current.cursorY,
      width: stackBox.width,
      height: box.height,
    })
    pushStackContents(stackBox, section, measurer, pages, template, current.pageIndex, current.cursorY, wordBreaker, current.pageNumberOffset, listNumbering)
  })

  return { ...current, cursorY: current.cursorY + box.height }
}
