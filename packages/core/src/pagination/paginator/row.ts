import {
  defaultWordBreaker,
  measureParagraph,
} from "../../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { DocumentSection } from "../../schema"
import type {
  PageFlowCursor,
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
): void {
  const offsetY = pageY - stackBox.y
  stackBox.children.forEach((child) => {
    const childPageY = child.y + offsetY
    let lines: PaginatedLine[] | undefined
    let renderProps: ParagraphRenderProps | undefined

    if (child.nodeType === "paragraph") {
      const node = section.nodes[child.nodeId]
      if (node?.type === "paragraph") {
        const measured = measureParagraph(node, child.width, measurer, wordBreaker)
        const rawLines = buildPositionedParagraphLines(measured, measured.lines, child.x, childPageY, 0, node.props.align)
        lines = resolvePageNumbers(rawLines, pageIndex + 1 + pageNumberOffset)
        renderProps = buildRenderProps(node, measured.lineHeight, measured.box)
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
    pushStackContents(stackBox, section, measurer, pages, template, current.pageIndex, current.cursorY, wordBreaker, current.pageNumberOffset)
  })

  return { ...current, cursorY: current.cursorY + box.height }
}
