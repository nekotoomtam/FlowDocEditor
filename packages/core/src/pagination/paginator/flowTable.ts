import { defaultWordBreaker } from "../../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { DocumentSection, FlowTableNode } from "../../schema"
import { resolveFlowTableGrid } from "../../document/flowTableGrid"
import type {
  FlowTableCellGridRenderProps,
  FlowTableGridRenderProps,
  PageFlowCursor,
  PaginatedPage,
} from "../types"
import {
  advancePage,
  pushFragment,
  shouldMoveBlockToNextPage,
  shouldMoveToNextPage,
} from "./cursor"
import { resolveFlowTableBlockMargins, resolveFlowTableColumnWidths } from "./tableRenderProps"
import { MINIMUM_ROW_SPLIT_HEIGHT } from "./constants"
import {
  paginateFlowTableRowFull,
  paginateFlowTableRowSplit,
} from "./flowTableRow"
import {
  planFlowTableRowspanGroups,
  type FlowTableRowspanGroupPlan,
} from "../flowTableRowspanPlan"
import {
  flowTableRowspanGroupAllowsRowBoundarySplit,
  paginateFlowTableRowspanGroupSplit,
} from "./flowTableRowspan"
import type { ListNumberingPaginationContext } from "./listMarker"
// ─── Flow Table Pagination ───────────────────────────────────────────────────

export function paginateFlowTable(
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
  const tableNode = section.nodes[box.nodeId] as unknown as FlowTableNode
  if (!tableNode || tableNode.type !== "flow-table") return cursor

  let current = cursor
  const groups = planFlowTableRowspanGroups(tableNode, box.children)
  const blockMargins = resolveFlowTableBlockMargins(tableNode)
  const headerRowCount = tableNode.props.headerRowCount ?? 0
  const shouldRepeatHeaders = headerRowCount > 0 && (tableNode.props.repeatHeaderRows ?? true)
  const headerBoxes = shouldRepeatHeaders ? box.children.slice(0, headerRowCount) : []
  const headerHeight = headerBoxes.reduce((sum, rowBox) => sum + rowBox.height, 0)
  const tableContentHeight = box.children.reduce((sum, rowBox) => sum + rowBox.height, 0)
  const flowTableGridProps: FlowTableGridRenderProps = {
    columnWidths: resolveFlowTableColumnWidths(tableNode, box.width),
  }
  const flowTableCellGridPropsById = new Map<string, FlowTableCellGridRenderProps>(
    resolveFlowTableGrid(tableNode).placements.map((placement) => [
      placement.cellId,
      {
        columnIndex: placement.columnIndex,
        colspan: placement.colspan,
        rowspan: placement.rowspan,
      },
    ]),
  )

  const placeHeaders = (c: PageFlowCursor): PageFlowCursor => {
    for (const rowBox of headerBoxes) {
      c = paginateFlowTableRowFull(
        rowBox,
        tableNode,
        pages,
        template,
        c,
        box.nodeId,
        measurer,
        wordBreaker,
        flowTableGridProps,
        flowTableCellGridPropsById,
        listNumbering,
      )
    }
    return c
  }

  const firstGroup = groups[0]
  if (firstGroup) {
    const firstRowStartY = current.cursorY + blockMargins.top
    const firstRowBox = box.children[firstGroup.rowIndices[0]]
    const firstRowNode = firstRowBox ? tableNode.nodes[firstRowBox.nodeId] : undefined
    const firstRowAllowBreak = firstRowNode?.type === "flow-table-row"
      ? firstRowNode.props.allowBreak ?? true
      : true
    const firstGroupIsHeader = firstGroup.rowIndices.every((rowIndex) => rowIndex < headerRowCount)
    const firstGroupIsAtomic = firstGroupIsHeader ||
      (firstGroup.rowIndices.length > 1 && !flowTableRowspanGroupAllowsRowBoundarySplit(tableNode, firstGroup)) ||
      (firstGroup.rowIndices.length === 1 && !firstRowAllowBreak)
    const firstGroupNeedsCleanSplitStart = !firstGroupIsAtomic &&
      firstRowStartY > contentTop &&
      contentBottom - firstRowStartY < MINIMUM_ROW_SPLIT_HEIGHT
    if (shouldMoveToNextPage(firstRowStartY, contentBottom) ||
      firstGroupNeedsCleanSplitStart ||
      (firstGroupIsAtomic && shouldMoveBlockToNextPage(firstRowStartY, firstGroup.totalHeight, contentTop, contentBottom))) {
      current = advancePage(current, contentTop)
    }
  }

  if (blockMargins.top > 0) {
    current = { ...current, cursorY: current.cursorY + blockMargins.top }
  }

  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "flow-table",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: tableContentHeight,
    flowTableGridProps,
  })

  for (const { rowIndices, rowIds, rows, totalHeight, spanningCells } of groups) {
    const isHeaderGroup = rowIndices.every((rowIndex) => rowIndex < headerRowCount)

    if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
      current = advancePage(current, contentTop)
      if (!isHeaderGroup && shouldRepeatHeaders) current = placeHeaders(current)
    }

    if (rowIndices.length > 1) {
      const allowsRowBoundarySplit = !isHeaderGroup &&
        flowTableRowspanGroupAllowsRowBoundarySplit(tableNode, { rowIndices, rowIds, rows, totalHeight, spanningCells })

      if (allowsRowBoundarySplit) {
        current = paginateFlowTableRowspanGroupSplit(
          { rowIndices, rowIds, rows, totalHeight, spanningCells },
          box.children,
          tableNode,
          pages,
          template,
          contentTop,
          contentBottom,
          current,
          box.nodeId,
          measurer,
          wordBreaker,
          flowTableGridProps,
          flowTableCellGridPropsById,
          shouldRepeatHeaders ? placeHeaders : undefined,
          listNumbering,
        )
        continue
      }

      if (shouldMoveBlockToNextPage(current.cursorY, totalHeight, contentTop, contentBottom)) {
        current = advancePage(current, contentTop)
        if (!isHeaderGroup && shouldRepeatHeaders) current = placeHeaders(current)
      }
      for (const rowIndex of rowIndices) {
        const rowBox = box.children[rowIndex]
        if (!rowBox) continue
        if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
          current = advancePage(current, contentTop)
          if (!isHeaderGroup && shouldRepeatHeaders) current = placeHeaders(current)
        }
        current = paginateFlowTableRowFull(
          rowBox,
          tableNode,
          pages,
          template,
          current,
          box.nodeId,
          measurer,
          wordBreaker,
          flowTableGridProps,
          flowTableCellGridPropsById,
          listNumbering,
        )
      }
      continue
    }

    const rowIndex = rowIndices[0]
    const rowBox = box.children[rowIndex]
    if (!rowBox) continue
    const rowNode = tableNode.nodes[rowBox.nodeId]
    const allowBreak = rowNode?.type === "flow-table-row" ? (rowNode.props.allowBreak ?? true) : true
    const doesntFit = shouldMoveBlockToNextPage(current.cursorY, rowBox.height, contentTop, contentBottom)
    const tooTallForOnePage = rowBox.height > contentBottom - contentTop

    if (!doesntFit && !tooTallForOnePage) {
      current = paginateFlowTableRowFull(
        rowBox,
        tableNode,
        pages,
        template,
        current,
        box.nodeId,
        measurer,
        wordBreaker,
        flowTableGridProps,
        flowTableCellGridPropsById,
        listNumbering,
      )
    } else if (allowBreak && !isHeaderGroup) {
      current = paginateFlowTableRowSplit(
        rowBox,
        tableNode,
        pages,
        template,
        contentTop,
        contentBottom,
        current,
        box.nodeId,
        measurer,
        wordBreaker,
        flowTableGridProps,
        flowTableCellGridPropsById,
        shouldRepeatHeaders ? placeHeaders : undefined,
        shouldRepeatHeaders ? headerHeight : 0,
        listNumbering,
      )
    } else {
      const nextPage = advancePage(current, contentTop)
      const reservedForHeaders = isHeaderGroup ? 0 : headerHeight
      if (nextPage.cursorY + reservedForHeaders + rowBox.height <= contentBottom) {
        current = nextPage
        if (!isHeaderGroup && shouldRepeatHeaders) current = placeHeaders(current)
      }
      current = paginateFlowTableRowFull(
        rowBox,
        tableNode,
        pages,
        template,
        current,
        box.nodeId,
        measurer,
        wordBreaker,
        flowTableGridProps,
        flowTableCellGridPropsById,
        listNumbering,
      )
    }
  }

  return blockMargins.bottom > 0
    ? { ...current, cursorY: current.cursorY + blockMargins.bottom }
    : current
}

