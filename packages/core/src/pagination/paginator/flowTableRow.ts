import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { FlowTableNode } from "../../schema"
import type {
  FlowTableCellGridRenderProps,
  FlowTableGridRenderProps,
  PageFlowCursor,
  PageFragment,
  PageFragmentWarning,
  PaginatedPage,
} from "../types"
import {
  advancePage,
  pushFragment,
} from "./cursor"
import { resolveFlowTableCellBoxRenderProps } from "./tableRenderProps"
import {
  splitPointProgressed,
  splitProgressKey,
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
import type { PaginationProfiler } from "../profiler"
import { measureWithPaginationProfile } from "../profiler"

export function paginateFlowTableRowFull(
  rowBox: FlowBox,
  tableNode: FlowTableNode,
  pages: PaginatedPage[],
  template: PaginatedPage,
  cursor: PageFlowCursor,
  tableNodeId: string,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  flowTableGridProps: FlowTableGridRenderProps,
  flowTableCellGridPropsById: Map<string, FlowTableCellGridRenderProps>,
  listNumbering?: ListNumberingPaginationContext,
  profiler?: PaginationProfiler,
): PageFlowCursor {
  pushFragment(pages, template, {
    nodeId: rowBox.nodeId,
    nodeType: "flow-table-row",
    parentNodeId: tableNodeId,
    pageIndex: cursor.pageIndex,
    x: rowBox.x,
    y: cursor.cursorY,
    width: rowBox.width,
    height: rowBox.height,
    flowTableGridProps,
  })

  const cellBoxes: FlowBox[] = []
  for (const cellBox of rowBox.children) {
    const cellNode = tableNode.nodes[cellBox.nodeId]
    const boxRenderProps = cellNode?.type === "flow-table-cell"
      ? resolveFlowTableCellBoxRenderProps(cellNode)
      : undefined
    cellBoxes.push(cellBox)

    pushFragment(pages, template, {
      nodeId: cellBox.nodeId,
      nodeType: "flow-table-cell",
      parentNodeId: rowBox.nodeId,
      pageIndex: cursor.pageIndex,
      x: cellBox.x,
      y: cursor.cursorY,
      width: cellBox.width,
      height: cellBox.height,
      boxRenderProps,
      flowTableCellGridProps: flowTableCellGridPropsById.get(cellBox.nodeId),
    })
  }

  cellBoxes
    .flatMap((cellBox) => measureWithPaginationProfile(profiler, "table-cell-measure", () =>
      collectFlowTableCellContents(cellBox, tableNode, measurer, cursor.pageIndex, cursor.cursorY, wordBreaker, cursor.pageNumberOffset, listNumbering),
    ))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.nodeId.localeCompare(b.nodeId))
    .forEach((fragment) => pushFragment(pages, template, fragment))

  return { ...cursor, cursorY: cursor.cursorY + rowBox.height }
}

export function paginateFlowTableRowSplit(
  rowBox: FlowBox,
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
  repeatedHeaderHeight: number = 0,
  listNumbering?: ListNumberingPaginationContext,
  profiler?: PaginationProfiler,
): PageFlowCursor {
  const fromSplits = new Map<string, SplitPoint>()
  for (const cellBox of rowBox.children) fromSplits.set(cellBox.nodeId, { childIdx: 0, lineIdx: 0 })

  let current = cursor
  let heightPlaced = 0
  const totalHeight = rowBox.height
  let retriedNoProgressKey: string | null = null

  while (heightPlaced < totalHeight) {
    const availH = contentBottom - current.cursorY

    if (availH < MINIMUM_ROW_SPLIT_HEIGHT) {
      current = advancePage(current, contentTop)
      current = repeatHeaders ? repeatHeaders(current) : current
      continue
    }

    let sliceH = Math.min(availH, totalHeight - heightPlaced)
    let sliceIsLast = sliceH >= totalHeight - heightPlaced
    const sliceWarnings = new Map<string, PageFragmentWarning[]>()
    const toSplits = new Map<string, SplitPoint | null>()

    if (!sliceIsLast) {
      for (const cellBox of rowBox.children) {
        const from = fromSplits.get(cellBox.nodeId)!
        toSplits.set(cellBox.nodeId, computeFlowTableSplitPointFrom(cellBox, tableNode, Math.max(0, sliceH), measurer, wordBreaker, from, listNumbering))
      }

      let hasRemainingContent = false
      let hasContentProgress = false
      for (const cellBox of rowBox.children) {
        const from = fromSplits.get(cellBox.nodeId)!
        const hasRemaining = cellHasRemainingSplitContent(cellBox, tableNode, measurer, wordBreaker, from, listNumbering)
        hasRemainingContent = hasRemainingContent || hasRemaining
        hasContentProgress = hasContentProgress ||
          (hasRemaining && splitPointProgressed(from, toSplits.get(cellBox.nodeId) ?? null, cellBox))
      }

      if (hasRemainingContent && !hasContentProgress) {
        const progressKey = splitProgressKey(rowBox, fromSplits)
        const cleanContinuationY = contentTop + repeatedHeaderHeight
        if (current.cursorY > cleanContinuationY && retriedNoProgressKey !== progressKey) {
          retriedNoProgressKey = progressKey
          current = advancePage(current, contentTop)
          current = repeatHeaders ? repeatHeaders(current) : current
          continue
        }

        const forcedCell = rowBox.children.find((cellBox) =>
          cellHasRemainingSplitContent(cellBox, tableNode, measurer, wordBreaker, fromSplits.get(cellBox.nodeId)!, listNumbering),
        )
        if (forcedCell) {
          const from = fromSplits.get(forcedCell.nodeId)!
          const forcedSplit = forceOneSplitUnitProgress(
            forcedCell,
            tableNode,
            measurer,
            wordBreaker,
            from,
            listNumbering,
          )
          if (forcedSplit) {
            toSplits.set(forcedCell.nodeId, forcedSplit)
            const forcedCellNode = tableNode.nodes[forcedCell.nodeId]
            const forcedTopInset = forcedCellNode?.type === "flow-table-cell"
              ? flowTableCellSliceTopInset(forcedCellNode, from)
              : 0
            const forcedContentHeight = forcedSplitUnitHeight(
              forcedCell,
              tableNode,
              measurer,
              wordBreaker,
              from,
              forcedSplit,
              listNumbering,
            )
            const forcedSliceHeight = forcedTopInset + forcedContentHeight
            sliceH = Math.max(sliceH, Math.min(totalHeight - heightPlaced, forcedSliceHeight))
            sliceIsLast = sliceH >= totalHeight - heightPlaced
            const warning: PageFragmentWarning = {
              code: "forced-flow-table-split-overflow",
              message: "flow-table row split forced one content unit because the available slice could not fit normal progress",
            }
            sliceWarnings.set(rowBox.nodeId, [warning])
            sliceWarnings.set(forcedCell.nodeId, [warning])
          }
        }
      } else {
        retriedNoProgressKey = null
      }
    }

    let renderedSliceH = 0
    const cellFragments: PageFragment[] = []
    const contentFragments: PageFragment[] = []
    for (const cellBox of rowBox.children) {
      const from = fromSplits.get(cellBox.nodeId)!
      const to = sliceIsLast ? null : (toSplits.get(cellBox.nodeId) ?? null)
      const cellNode = tableNode.nodes[cellBox.nodeId]
      const boxRenderProps = cellNode?.type === "flow-table-cell"
        ? resolveFlowTableCellBoxRenderProps(cellNode)
        : undefined

      cellFragments.push({
        nodeId: cellBox.nodeId,
        nodeType: "flow-table-cell",
        parentNodeId: rowBox.nodeId,
        pageIndex: current.pageIndex,
        x: cellBox.x,
        y: current.cursorY,
        width: cellBox.width,
        height: sliceH,
        boxRenderProps,
        flowTableCellGridProps: flowTableCellGridPropsById.get(cellBox.nodeId),
        continuesFrom: heightPlaced > 0,
        isContinued: !sliceIsLast,
        warnings: sliceWarnings.get(cellBox.nodeId),
      })

      const cellContentFragments = measureWithPaginationProfile(profiler, "table-cell-measure", () =>
        collectFlowTableCellSlice(
          cellBox,
          tableNode,
          measurer,
          current.pageIndex,
          current.cursorY,
          from,
          to,
          wordBreaker,
          current.pageNumberOffset,
          listNumbering,
        ),
      )
      for (const fragment of cellContentFragments) {
        renderedSliceH = Math.max(renderedSliceH, fragment.y + fragment.height - current.cursorY)
      }
      contentFragments.push(...cellContentFragments)

      if (!sliceIsLast) {
        fromSplits.set(cellBox.nodeId, to ?? { childIdx: cellBox.children.length, lineIdx: 0 })
      }
    }
    if (renderedSliceH <= 0) renderedSliceH = sliceH

    pushFragment(pages, template, {
      nodeId: rowBox.nodeId,
      nodeType: "flow-table-row",
      parentNodeId: tableNodeId,
      pageIndex: current.pageIndex,
      x: rowBox.x,
      y: current.cursorY,
      width: rowBox.width,
      height: renderedSliceH,
      continuesFrom: heightPlaced > 0,
      isContinued: !sliceIsLast,
      warnings: sliceWarnings.get(rowBox.nodeId),
      flowTableGridProps,
    })

    cellFragments
      .forEach((fragment) => pushFragment(pages, template, { ...fragment, height: renderedSliceH }))

    contentFragments
      .sort((a, b) => a.y - b.y || a.x - b.x || a.nodeId.localeCompare(b.nodeId))
      .forEach((fragment) => pushFragment(pages, template, fragment))

    current = { ...current, cursorY: current.cursorY + renderedSliceH }
    heightPlaced += sliceH

    if (!sliceIsLast) {
      current = advancePage(current, contentTop)
      current = repeatHeaders ? repeatHeaders(current) : current
    }
  }

  return current
}
