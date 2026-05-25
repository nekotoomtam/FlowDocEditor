import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { FlowTableNode } from "../../schema"
import type {
  FlowTableCellGridRenderProps,
  FlowTableGridRenderProps,
  PageFlowCursor,
  PageFragment,
  PageFragmentWarning,
  PaginatedPage,
  ParagraphBoxRenderProps,
} from "../types"
import {
  advancePage,
  pushFragment,
  shouldMoveToNextPage,
} from "./cursor"
import { resolveFlowTableCellBoxRenderProps } from "./tableRenderProps"
import {
  endSplitPoint,
  splitPointProgressed,
  type SplitPoint,
} from "./cellSplit"
import {
  cellHasRemainingSplitContent,
  forcedSplitUnitHeight,
  forceOneSplitUnitProgress,
} from "./cellSplitContent"
import { MINIMUM_ROW_SPLIT_HEIGHT } from "./constants"
import {
  collectFlowTableCellContents,
  collectFlowTableCellSlice,
  computeFlowTableSplitPointFrom,
  flowTableCellSliceTopInset,
} from "./flowTableCell"
import type { ListNumberingPaginationContext } from "./listMarker"
import {
  planFlowTableRowspanGroupSlice,
  type FlowTableRowspanGroupPlan,
  type FlowTableRowspanSlicePlan,
} from "../flowTableRowspanPlan"
function flowTableRowAllowsBreak(tableNode: FlowTableNode, rowIndex: number): boolean {
  const rowId = tableNode.rowIds[rowIndex]
  const rowNode = tableNode.nodes[rowId]
  return rowNode?.type === "flow-table-row" ? rowNode.props.allowBreak ?? true : true
}

export function flowTableRowspanGroupAllowsRowBoundarySplit(tableNode: FlowTableNode, group: FlowTableRowspanGroupPlan): boolean {
  return group.rowIndices.every((rowIndex) => flowTableRowAllowsBreak(tableNode, rowIndex))
}

function flowTableRowspanSliceHeight(group: FlowTableRowspanGroupPlan, rowStartIndex: number, rowEndIndex: number): number {
  return group.rows
    .filter((row) => row.rowIndex >= rowStartIndex && row.rowIndex <= rowEndIndex)
    .reduce((sum, row) => sum + row.height, 0)
}

function flowTableRowspanCellOriginBox(rowBoxes: FlowBox[], cellId: string, originRowIndex: number): FlowBox | null {
  return rowBoxes[originRowIndex]?.children.find((cellBox) => cellBox.nodeId === cellId) ?? null
}

interface FlowTableRowspanPagedCell {
  cellId: string
  cellBox: FlowBox
  parentRowId: string
  continuesFromRowspan: boolean
  continuesOnRowspan: boolean
}

interface FlowTableRowspanPageContentStart {
  pageIndex: number
  from: SplitPoint
  cellPageY: number
}

interface FlowTableRowspanCellMergeState {
  mergedWithPreviousPageSlice: boolean
  from: SplitPoint
  cellPageY: number
}

function rememberFlowTableRowspanPageContentStart(
  pageStarts: Map<string, FlowTableRowspanPageContentStart>,
  cellId: string,
  pageIndex: number,
  from: SplitPoint,
  cellPageY: number,
): void {
  const existing = pageStarts.get(cellId)
  if (existing?.pageIndex === pageIndex) return
  pageStarts.set(cellId, {
    pageIndex,
    from: { ...from },
    cellPageY,
  })
}

function previousFlowTableCellPageFragment(
  pages: PaginatedPage[],
  pageIndex: number,
  cellId: string,
): PageFragment | null {
  const page = pages[pageIndex]
  if (!page) return null
  for (let index = page.fragments.length - 1; index >= 0; index -= 1) {
    const fragment = page.fragments[index]
    if (fragment.nodeId === cellId && fragment.nodeType === "flow-table-cell") return fragment
  }
  return null
}

function removeFlowTableCellContentFragmentsOnPage(
  pages: PaginatedPage[],
  pageIndex: number,
  cellId: string,
): void {
  const page = pages[pageIndex]
  if (!page) return
  page.fragments = page.fragments.filter((fragment) => fragment.parentNodeId !== cellId)
}

function flowTableRowspanPagedCellsForRow(
  group: FlowTableRowspanGroupPlan,
  rowBoxes: FlowBox[],
  rowIndex: number,
): FlowTableRowspanPagedCell[] {
  const rowBox = rowBoxes[rowIndex]
  if (!rowBox) return []

  const spanningCellById = new Map(group.spanningCells.map((cell) => [cell.cellId, cell]))
  const cells: FlowTableRowspanPagedCell[] = []
  const seenCellIds = new Set<string>()

  for (const cellBox of rowBox.children) {
    const spanningCell = spanningCellById.get(cellBox.nodeId)
    cells.push({
      cellId: cellBox.nodeId,
      cellBox,
      parentRowId: rowBox.nodeId,
      continuesFromRowspan: spanningCell ? spanningCell.rowIndex < rowIndex : false,
      continuesOnRowspan: spanningCell ? spanningCell.rowEndIndex > rowIndex : false,
    })
    seenCellIds.add(cellBox.nodeId)
  }

  for (const spanningCell of group.spanningCells) {
    if (spanningCell.rowIndex >= rowIndex || spanningCell.rowEndIndex < rowIndex) continue
    if (seenCellIds.has(spanningCell.cellId)) continue

    const originCellBox = flowTableRowspanCellOriginBox(rowBoxes, spanningCell.cellId, spanningCell.rowIndex)
    if (!originCellBox) continue
    cells.push({
      cellId: spanningCell.cellId,
      cellBox: originCellBox,
      parentRowId: rowBox.nodeId,
      continuesFromRowspan: true,
      continuesOnRowspan: spanningCell.rowEndIndex > rowIndex,
    })
    seenCellIds.add(spanningCell.cellId)
  }

  return cells
}

function flowTableRowspanPagedProgressKey(cells: FlowTableRowspanPagedCell[], splits: Map<string, SplitPoint>): string {
  return cells
    .map((cell) => {
      const split = splits.get(cell.cellId) ?? { childIdx: 0, lineIdx: 0 }
      return `${cell.cellId}:${split.childIdx}:${split.lineIdx}`
    })
    .join("|")
}

function flowTableRowspanSliceFragmentOrder(fragment: PageFragment): number {
  if (fragment.nodeType === "flow-table-row") return 0
  if (fragment.nodeType === "flow-table-cell") return 1
  return 2
}

function compareFlowTableRowspanFragments(a: PageFragment, b: PageFragment): number {
  return a.y - b.y ||
    flowTableRowspanSliceFragmentOrder(a) - flowTableRowspanSliceFragmentOrder(b) ||
    a.x - b.x ||
    a.nodeId.localeCompare(b.nodeId)
}

function sortFlowTableRowspanPageFragments(pages: PaginatedPage[], pageIndex: number): void {
  const page = pages[pageIndex]
  if (!page) return
  page.fragments.sort(compareFlowTableRowspanFragments)
}

function flowTableRowspanSliceContentHeight(contentFragments: PageFragment[], sliceTop: number): number {
  return contentFragments.reduce((height, fragment) => (
    Math.max(height, fragment.y + fragment.height - sliceTop)
  ), 0)
}

function paginateFlowTableRowspanTallRowSlice(
  group: FlowTableRowspanGroupPlan,
  rowIndex: number,
  rowBoxes: FlowBox[],
  tableNode: FlowTableNode,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  tableNodeId: string,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  flowTableGridProps: FlowTableGridRenderProps,
  flowTableCellGridPropsById: Map<string, FlowTableCellGridRenderProps>,
  rowspanContentSplits: Map<string, SplitPoint>,
  rowspanPageContentStarts: Map<string, FlowTableRowspanPageContentStart>,
  repeatHeaders?: (cursor: PageFlowCursor) => PageFlowCursor,
  listNumbering?: ListNumberingPaginationContext,
): PageFlowCursor {
  const rowBox = rowBoxes[rowIndex]
  if (!rowBox) return cursor

  const cells = flowTableRowspanPagedCellsForRow(group, rowBoxes, rowIndex)
  const splitByCellId = new Map<string, SplitPoint>()
  for (const cell of cells) {
    splitByCellId.set(cell.cellId, rowspanContentSplits.get(cell.cellId) ?? { childIdx: 0, lineIdx: 0 })
  }

  let current = cursor
  let rowHeightPlaced = 0
  let fragmentIndex = 0
  let retriedNoProgressKey: string | null = null

  const hasRemainingContent = () => cells.some((cell) =>
    cellHasRemainingSplitContent(
      cell.cellBox,
      tableNode,
      measurer,
      wordBreaker,
      splitByCellId.get(cell.cellId) ?? { childIdx: 0, lineIdx: 0 },
      listNumbering,
    ),
  )

  while (rowHeightPlaced < rowBox.height || hasRemainingContent()) {
    if (shouldMoveToNextPage(current.cursorY, contentBottom) || contentBottom - current.cursorY < MINIMUM_ROW_SPLIT_HEIGHT) {
      current = advancePage(current, contentTop)
      current = repeatHeaders ? repeatHeaders(current) : current
    }

    const availableHeight = contentBottom - current.cursorY
    const remainingRowHeight = Math.max(0, rowBox.height - rowHeightPlaced)
    let sliceHeight = availableHeight
    const toSplits = new Map<string, SplitPoint | null>()
    const sliceWarnings = new Map<string, PageFragmentWarning[]>()

    let anyRemainingContent = false
    let anyContentProgress = false

    for (const cell of cells) {
      const from = splitByCellId.get(cell.cellId) ?? { childIdx: 0, lineIdx: 0 }
      const remaining = cellHasRemainingSplitContent(cell.cellBox, tableNode, measurer, wordBreaker, from, listNumbering)
      if (!remaining) {
        toSplits.set(cell.cellId, null)
        continue
      }

      anyRemainingContent = true
      const to = computeFlowTableSplitPointFrom(cell.cellBox, tableNode, Math.max(0, sliceHeight), measurer, wordBreaker, from, listNumbering)
      toSplits.set(cell.cellId, to)
      anyContentProgress = anyContentProgress || splitPointProgressed(from, to, cell.cellBox)
    }

    if (anyRemainingContent && !anyContentProgress) {
      const progressKey = flowTableRowspanPagedProgressKey(cells, splitByCellId)
      if (current.cursorY > contentTop + 1 && retriedNoProgressKey !== progressKey) {
        retriedNoProgressKey = progressKey
        current = advancePage(current, contentTop)
        current = repeatHeaders ? repeatHeaders(current) : current
        continue
      }

      const forcedCell = cells.find((cell) =>
        cellHasRemainingSplitContent(
          cell.cellBox,
          tableNode,
          measurer,
          wordBreaker,
          splitByCellId.get(cell.cellId) ?? { childIdx: 0, lineIdx: 0 },
          listNumbering,
        ),
      )
      if (forcedCell) {
        const from = splitByCellId.get(forcedCell.cellId) ?? { childIdx: 0, lineIdx: 0 }
        const forcedSplit = forceOneSplitUnitProgress(
          forcedCell.cellBox,
          tableNode,
          measurer,
          wordBreaker,
          from,
          listNumbering,
        )
        if (forcedSplit) {
          toSplits.set(forcedCell.cellId, forcedSplit)
          const forcedCellNode = tableNode.nodes[forcedCell.cellId]
          const forcedTopInset = forcedCellNode?.type === "flow-table-cell"
            ? flowTableCellSliceTopInset(forcedCellNode, from)
            : 0
          const forcedContentHeight = forcedSplitUnitHeight(
            forcedCell.cellBox,
            tableNode,
            measurer,
            wordBreaker,
            from,
            forcedSplit,
            listNumbering,
          )
          const forcedSliceHeight = forcedTopInset + forcedContentHeight
          const visualLimit = remainingRowHeight > 0 ? remainingRowHeight : forcedSliceHeight
          sliceHeight = Math.max(sliceHeight, Math.min(visualLimit, forcedSliceHeight))
          const warning: PageFragmentWarning = {
            code: "forced-flow-table-split-overflow",
            message: "flow-table rowspan split forced one content unit because the row slice could not fit normal progress",
          }
          sliceWarnings.set(rowBox.nodeId, [warning])
          sliceWarnings.set(forcedCell.cellId, [warning])
        }
      }
    } else {
      retriedNoProgressKey = null
    }

    const nextSplits = new Map<string, SplitPoint>()
    for (const cell of cells) {
      const to = toSplits.get(cell.cellId) ?? null
      nextSplits.set(cell.cellId, endSplitPoint(cell.cellBox, to))
    }

    const contentContinuesAfter = cells.some((cell) =>
      cellHasRemainingSplitContent(
        cell.cellBox,
        tableNode,
        measurer,
        wordBreaker,
        nextSplits.get(cell.cellId) ?? { childIdx: 0, lineIdx: 0 },
        listNumbering,
      ),
    )

    const contentFragments: PageFragment[] = []
    const cellMergeStates = new Map<string, FlowTableRowspanCellMergeState>()
    for (const cell of cells) {
      const from = splitByCellId.get(cell.cellId) ?? { childIdx: 0, lineIdx: 0 }
      const pageStart = cell.continuesFromRowspan
        ? rowspanPageContentStarts.get(cell.cellId)
        : undefined
      const previousCellFragment = pageStart?.pageIndex === current.pageIndex
        ? previousFlowTableCellPageFragment(pages, current.pageIndex, cell.cellId)
        : null
      const mergedWithPreviousPageSlice = Boolean(previousCellFragment)
      const contentFrom = mergedWithPreviousPageSlice && pageStart ? pageStart.from : from
      const cellPageY = mergedWithPreviousPageSlice && pageStart ? pageStart.cellPageY : current.cursorY
      const to = mergedWithPreviousPageSlice
        ? computeFlowTableSplitPointFrom(
            cell.cellBox,
            tableNode,
            Math.max(0, current.cursorY + sliceHeight - cellPageY),
            measurer,
            wordBreaker,
            contentFrom,
            listNumbering,
          )
        : toSplits.get(cell.cellId) ?? null
      if (mergedWithPreviousPageSlice) {
        nextSplits.set(cell.cellId, endSplitPoint(cell.cellBox, to))
      }
      cellMergeStates.set(cell.cellId, {
        mergedWithPreviousPageSlice,
        from: contentFrom,
        cellPageY,
      })
      contentFragments.push(...collectFlowTableCellSlice(
        cell.cellBox,
        tableNode,
        measurer,
        current.pageIndex,
        cellPageY,
        contentFrom,
        to,
        wordBreaker,
        current.pageNumberOffset,
        listNumbering,
      ))
    }

    if (!contentContinuesAfter && contentFragments.length > 0) {
      const contentSliceHeight = flowTableRowspanSliceContentHeight(contentFragments, current.cursorY)
      const minimumSliceHeight = remainingRowHeight > 0 ? remainingRowHeight : 1
      sliceHeight = Math.max(minimumSliceHeight, Math.min(sliceHeight, Math.max(minimumSliceHeight, contentSliceHeight)))
    }
    const rowContinuesAfter = rowHeightPlaced + sliceHeight < rowBox.height || contentContinuesAfter

    const fragments: PageFragment[] = [{
      nodeId: rowBox.nodeId,
      nodeType: "flow-table-row",
      parentNodeId: tableNodeId,
      pageIndex: current.pageIndex,
      x: rowBox.x,
      y: current.cursorY,
      width: rowBox.width,
      height: sliceHeight,
      continuesFrom: fragmentIndex > 0,
      isContinued: rowContinuesAfter,
      warnings: sliceWarnings.get(rowBox.nodeId),
      flowTableGridProps,
    }]

    for (const cell of cells) {
      const cellNode = tableNode.nodes[cell.cellId]
      const boxRenderProps = cellNode?.type === "flow-table-cell"
        ? resolveFlowTableCellBoxRenderProps(cellNode)
        : undefined
      const cellContinuesFrom = cell.continuesFromRowspan || fragmentIndex > 0
      const cellIsContinued = cell.continuesOnRowspan || rowContinuesAfter
      const mergeState = cellMergeStates.get(cell.cellId)
      const previousCellFragment = mergeState?.mergedWithPreviousPageSlice
        ? previousFlowTableCellPageFragment(pages, current.pageIndex, cell.cellId)
        : null

      if (previousCellFragment) {
        previousCellFragment.height = Math.max(
          previousCellFragment.height,
          current.cursorY + sliceHeight - previousCellFragment.y,
        )
        previousCellFragment.isContinued = cellIsContinued
        if (sliceWarnings.get(cell.cellId)) previousCellFragment.warnings = sliceWarnings.get(cell.cellId)
        continue
      }

      fragments.push({
        nodeId: cell.cellId,
        nodeType: "flow-table-cell",
        parentNodeId: cell.parentRowId,
        pageIndex: current.pageIndex,
        x: cell.cellBox.x,
        y: current.cursorY,
        width: cell.cellBox.width,
        height: sliceHeight,
        boxRenderProps,
        flowTableCellGridProps: flowTableCellGridPropsById.get(cell.cellId),
        continuesFrom: cellContinuesFrom,
        isContinued: cellIsContinued,
        warnings: sliceWarnings.get(cell.cellId),
      })
      rememberFlowTableRowspanPageContentStart(
        rowspanPageContentStarts,
        cell.cellId,
        current.pageIndex,
        splitByCellId.get(cell.cellId) ?? { childIdx: 0, lineIdx: 0 },
        current.cursorY,
      )
    }

    for (const mergeState of cellMergeStates.entries()) {
      const [cellId, state] = mergeState
      if (state.mergedWithPreviousPageSlice) {
        removeFlowTableCellContentFragmentsOnPage(pages, current.pageIndex, cellId)
      }
    }

    for (const fragment of [...fragments, ...contentFragments].sort(compareFlowTableRowspanFragments)) {
      pushFragment(pages, template, fragment)
    }
    if (Array.from(cellMergeStates.values()).some((state) => state.mergedWithPreviousPageSlice)) {
      sortFlowTableRowspanPageFragments(pages, current.pageIndex)
    }

    for (const cell of cells) {
      const next = nextSplits.get(cell.cellId) ?? { childIdx: cell.cellBox.children.length, lineIdx: 0 }
      splitByCellId.set(cell.cellId, next)
      if (rowspanContentSplits.has(cell.cellId)) {
        rowspanContentSplits.set(cell.cellId, next)
      }
    }

    current = { ...current, cursorY: current.cursorY + sliceHeight }
    rowHeightPlaced += sliceHeight
    fragmentIndex += 1

    if (rowContinuesAfter) {
      current = advancePage(current, contentTop)
      current = repeatHeaders ? repeatHeaders(current) : current
    }
  }

  return current
}

function pushFlowTableRowspanGroupSlice(
  group: FlowTableRowspanGroupPlan,
  slice: FlowTableRowspanSlicePlan,
  rowBoxes: FlowBox[],
  tableNode: FlowTableNode,
  pages: PaginatedPage[],
  template: PaginatedPage,
  cursor: PageFlowCursor,
  tableNodeId: string,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  flowTableGridProps: FlowTableGridRenderProps,
  flowTableCellGridPropsById: Map<string, FlowTableCellGridRenderProps>,
  rowspanContentSplits: Map<string, SplitPoint>,
  rowspanPageContentStarts: Map<string, FlowTableRowspanPageContentStart>,
  listNumbering?: ListNumberingPaginationContext,
): PageFlowCursor {
  const sliceTopRowBox = rowBoxes[slice.rowStartIndex]
  if (!sliceTopRowBox) return cursor

  const sliceTopY = sliceTopRowBox.y
  const fragments: PageFragment[] = []
  const contentFragments: PageFragment[] = []
  const sliceWarnings = new Map<string, PageFragmentWarning[]>()
  const spanningCellById = new Map(group.spanningCells.map((cell) => [cell.cellId, cell]))
  const emittedCellIds = new Set<string>()
  const collectSpanningCellContent = (
    cellBox: FlowBox,
    cellPageY: number,
    cellHeight: number,
    isContinued: boolean,
    warningRowId: string,
  ): void => {
    const from = rowspanContentSplits.get(cellBox.nodeId) ?? { childIdx: 0, lineIdx: 0 }
    rememberFlowTableRowspanPageContentStart(
      rowspanPageContentStarts,
      cellBox.nodeId,
      cursor.pageIndex,
      from,
      cellPageY,
    )
    let to = isContinued
      ? computeFlowTableSplitPointFrom(cellBox, tableNode, Math.max(0, cellHeight), measurer, wordBreaker, from, listNumbering)
      : null

    if (
      isContinued &&
      cellHasRemainingSplitContent(cellBox, tableNode, measurer, wordBreaker, from, listNumbering) &&
      !splitPointProgressed(from, to, cellBox)
    ) {
      const forcedSplit = forceOneSplitUnitProgress(cellBox, tableNode, measurer, wordBreaker, from, listNumbering)
      if (forcedSplit) {
        to = forcedSplit
        const warning: PageFragmentWarning = {
          code: "forced-flow-table-split-overflow",
          message: "flow-table rowspan split forced one content unit because the row-boundary slice could not fit normal progress",
        }
        sliceWarnings.set(warningRowId, [warning])
        sliceWarnings.set(cellBox.nodeId, [warning])
      }
    }

    contentFragments.push(...collectFlowTableCellSlice(
      cellBox,
      tableNode,
      measurer,
      cursor.pageIndex,
      cellPageY,
      from,
      to,
      wordBreaker,
      cursor.pageNumberOffset,
      listNumbering,
    ))

    if (isContinued) {
      rowspanContentSplits.set(cellBox.nodeId, endSplitPoint(cellBox, to))
    }
  }

  for (const rowIndex of slice.rowIndices) {
    const rowBox = rowBoxes[rowIndex]
    if (!rowBox) continue
    const rowPageY = cursor.cursorY + (rowBox.y - sliceTopY)

    fragments.push({
      nodeId: rowBox.nodeId,
      nodeType: "flow-table-row",
      parentNodeId: tableNodeId,
      pageIndex: cursor.pageIndex,
      x: rowBox.x,
      y: rowPageY,
      width: rowBox.width,
      height: rowBox.height,
      flowTableGridProps,
    })

    for (const cellBox of rowBox.children) {
      if (emittedCellIds.has(cellBox.nodeId)) continue
      const cellNode = tableNode.nodes[cellBox.nodeId]
      const boxRenderProps = cellNode?.type === "flow-table-cell"
        ? resolveFlowTableCellBoxRenderProps(cellNode)
        : undefined
      const spanningCell = spanningCellById.get(cellBox.nodeId)
      const cellStartRowIndex = spanningCell
        ? Math.max(spanningCell.rowIndex, slice.rowStartIndex)
        : rowIndex
      if (cellStartRowIndex !== rowIndex) continue
      const cellEndRowIndex = spanningCell
        ? Math.min(spanningCell.rowEndIndex, slice.rowEndIndex)
        : rowIndex
      const cellPageY = cursor.cursorY + ((rowBoxes[cellStartRowIndex]?.y ?? rowBox.y) - sliceTopY)
      const cellHeight = spanningCell
        ? flowTableRowspanSliceHeight(group, cellStartRowIndex, cellEndRowIndex)
        : cellBox.height
      const continuesFrom = spanningCell ? spanningCell.rowIndex < slice.rowStartIndex : false
      const isContinued = spanningCell ? spanningCell.rowEndIndex > slice.rowEndIndex : false

      fragments.push({
        nodeId: cellBox.nodeId,
        nodeType: "flow-table-cell",
        parentNodeId: rowBoxes[cellStartRowIndex]?.nodeId ?? rowBox.nodeId,
        pageIndex: cursor.pageIndex,
        x: cellBox.x,
        y: cellPageY,
        width: cellBox.width,
        height: cellHeight,
        boxRenderProps,
        flowTableCellGridProps: flowTableCellGridPropsById.get(cellBox.nodeId),
        continuesFrom,
        isContinued,
      })
      emittedCellIds.add(cellBox.nodeId)

      if (spanningCell) {
        collectSpanningCellContent(
          cellBox,
          cellPageY,
          cellHeight,
          isContinued,
          rowBoxes[cellStartRowIndex]?.nodeId ?? rowBox.nodeId,
        )
      } else if (!continuesFrom) {
        contentFragments.push(...collectFlowTableCellContents(
          cellBox,
          tableNode,
          measurer,
          cursor.pageIndex,
          cellPageY,
          wordBreaker,
          cursor.pageNumberOffset,
          listNumbering,
        ))
      }
    }
  }

  for (const cellId of slice.continuedFromPreviousCellIds) {
    if (emittedCellIds.has(cellId)) continue
    const spanningCell = spanningCellById.get(cellId)
    if (!spanningCell) continue
    const originCellBox = flowTableRowspanCellOriginBox(rowBoxes, cellId, spanningCell.rowIndex)
    if (!originCellBox) continue
    const cellNode = tableNode.nodes[cellId]
    const boxRenderProps = cellNode?.type === "flow-table-cell"
      ? resolveFlowTableCellBoxRenderProps(cellNode)
      : undefined
    const cellStartRowIndex = Math.max(spanningCell.rowIndex, slice.rowStartIndex)
    const cellEndRowIndex = Math.min(spanningCell.rowEndIndex, slice.rowEndIndex)
    const cellParentRowId = rowBoxes[cellStartRowIndex]?.nodeId ?? sliceTopRowBox.nodeId
    const cellPageY = cursor.cursorY + ((rowBoxes[cellStartRowIndex]?.y ?? sliceTopY) - sliceTopY)
    const cellHeight = flowTableRowspanSliceHeight(group, cellStartRowIndex, cellEndRowIndex)
    const isContinued = spanningCell.rowEndIndex > slice.rowEndIndex

    fragments.push({
      nodeId: cellId,
      nodeType: "flow-table-cell",
      parentNodeId: cellParentRowId,
      pageIndex: cursor.pageIndex,
      x: originCellBox.x,
      y: cellPageY,
      width: originCellBox.width,
      height: cellHeight,
      boxRenderProps,
      flowTableCellGridProps: flowTableCellGridPropsById.get(cellId),
      continuesFrom: true,
      isContinued,
    })
    emittedCellIds.add(cellId)
    collectSpanningCellContent(originCellBox, cellPageY, cellHeight, isContinued, cellParentRowId)
  }

  for (const fragment of fragments) {
    const warnings = sliceWarnings.get(fragment.nodeId)
    if (warnings) fragment.warnings = warnings
  }

  [...fragments, ...contentFragments]
    .sort(compareFlowTableRowspanFragments)
    .forEach((fragment) => pushFragment(pages, template, fragment))

  return { ...cursor, cursorY: cursor.cursorY + slice.height }
}

export function paginateFlowTableRowspanGroupSplit(
  group: FlowTableRowspanGroupPlan,
  rowBoxes: FlowBox[],
  tableNode: FlowTableNode,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  tableNodeId: string,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  flowTableGridProps: FlowTableGridRenderProps,
  flowTableCellGridPropsById: Map<string, FlowTableCellGridRenderProps>,
  repeatHeaders?: (cursor: PageFlowCursor) => PageFlowCursor,
  listNumbering?: ListNumberingPaginationContext,
): PageFlowCursor {
  let current = cursor
  let rowOffset = 0
  const rowspanContentSplits = new Map<string, SplitPoint>()
  const rowspanPageContentStarts = new Map<string, FlowTableRowspanPageContentStart>()
  for (const cell of group.spanningCells) {
    rowspanContentSplits.set(cell.cellId, { childIdx: 0, lineIdx: 0 })
  }

  while (rowOffset < group.rows.length) {
    if (shouldMoveToNextPage(current.cursorY, contentBottom) || contentBottom - current.cursorY < MINIMUM_ROW_SPLIT_HEIGHT) {
      current = advancePage(current, contentTop)
      current = repeatHeaders ? repeatHeaders(current) : current
    }

    const availableHeight = contentBottom - current.cursorY
    let sliceHeight = 0
    let endOffset = rowOffset

    while (endOffset < group.rows.length) {
      const nextRowHeight = group.rows[endOffset].height
      if (sliceHeight > 0 && sliceHeight + nextRowHeight > availableHeight) break
      sliceHeight += nextRowHeight
      endOffset += 1
      if (sliceHeight >= availableHeight) break
    }

    if (endOffset === rowOffset) {
      sliceHeight = group.rows[rowOffset].height
      endOffset = rowOffset + 1
    }

    const rowStartIndex = group.rows[rowOffset].rowIndex
    const rowEndIndex = group.rows[endOffset - 1].rowIndex
    const slice = planFlowTableRowspanGroupSlice(group, rowStartIndex, rowEndIndex)
    if (rowStartIndex === rowEndIndex && slice.height > availableHeight) {
      current = paginateFlowTableRowspanTallRowSlice(
        group,
        rowStartIndex,
        rowBoxes,
        tableNode,
        pages,
        template,
        contentTop,
        contentBottom,
        current,
        tableNodeId,
        measurer,
        wordBreaker,
        flowTableGridProps,
        flowTableCellGridPropsById,
        rowspanContentSplits,
        rowspanPageContentStarts,
        repeatHeaders,
        listNumbering,
      )
      rowOffset = endOffset
      continue
    }

    current = pushFlowTableRowspanGroupSlice(
      group,
      slice,
      rowBoxes,
      tableNode,
      pages,
      template,
      current,
      tableNodeId,
      measurer,
      wordBreaker,
      flowTableGridProps,
      flowTableCellGridPropsById,
      rowspanContentSplits,
      rowspanPageContentStarts,
      listNumbering,
    )
    rowOffset = endOffset
  }

  return current
}

