import {
  defaultWordBreaker,
  measureParagraph,
  toAbstractUnit,
} from "../../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { DocumentSection, TableNode } from "../../schema"
import type {
  PageFlowCursor,
  PageFragmentWarning,
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
  paragraphFragmentHeight,
  resolvePageNumbers,
} from "./paragraph"
import { buildTableCellRenderProps } from "./tableRenderProps"
import {
  splitPointProgressed,
  splitProgressKey,
  type SplitPoint,
} from "./cellSplit"
import {
  cellHasRemainingSplitContent,
  computeCellSplitPointFrom,
  forcedSplitUnitHeight,
  forceOneSplitUnitProgress,
} from "./cellSplitContent"
import { MINIMUM_ROW_SPLIT_HEIGHT } from "./constants"

function pushTableCellContents(
  cellBox: FlowBox,
  tableNode: TableNode,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  pageIndex: number,
  rowPageY: number,
  wordBreaker: WordBreaker = defaultWordBreaker,
  pageNumberOffset: number = 0,
): void {
  const offsetY = rowPageY - cellBox.y
  cellBox.children.forEach((child) => {
    const childPageY = child.y + offsetY
    let lines: PaginatedLine[] | undefined
    let renderProps: ParagraphRenderProps | undefined
    let lineStart: number | undefined
    let lineEnd: number | undefined
    let continuesFrom: boolean | undefined
    let isContinued: boolean | undefined

    if (child.nodeType === "paragraph") {
      const node = tableNode.nodes[child.nodeId]
      if (node?.type === "paragraph") {
        const measured = measureParagraph(node, child.width, measurer, wordBreaker)
        const rawLines = buildPositionedParagraphLines(measured, measured.lines, child.x, childPageY, 0, node.props.align)
        lines = resolvePageNumbers(rawLines, pageIndex + 1 + pageNumberOffset)
        renderProps = buildRenderProps(node, measured.lineHeight, measured.box)
        lineStart = 0
        lineEnd = measured.lines.length
        continuesFrom = false
        isContinued = false
      }
    }

    pushFragment(pages, template, {
      nodeId: child.nodeId,
      nodeType: toPageFragmentNodeType(child.nodeType),
      parentNodeId: cellBox.nodeId,
      pageIndex,
      x: child.x,
      y: childPageY,
      width: child.width,
      height: child.height,
      lines,
      renderProps,
      lineStart,
      lineEnd,
      continuesFrom,
      isContinued,
    })
  })
}

// วาง content ของ cell จาก split point `from` ถึง `to` (null = ถึงท้าย cell)
function pushCellSlice(
  cellBox: FlowBox,
  tableNode: TableNode,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  pageIndex: number,
  cellPageY: number,
  from: SplitPoint,
  to: SplitPoint | null,
  wordBreaker: WordBreaker,
  pageNumberOffset: number = 0,
): void {
  const cellNode = tableNode.nodes[cellBox.nodeId]
  const padding = cellNode?.type === "table-cell" && cellNode.props.padding
    ? toAbstractUnit(cellNode.props.padding.value, cellNode.props.padding.unit) : 0
  let curY = cellPageY + padding

  for (let ci = from.childIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (!child) continue

    const isAtTo = to !== null && ci === to.childIdx
    if (isAtTo && to!.lineIdx === 0) break

    const lineStart = ci === from.childIdx ? from.lineIdx : 0
    const lineEnd = isAtTo ? to!.lineIdx : undefined

    if (child.nodeType === "spacer") {
      if (!isAtTo) {
        pushFragment(pages, template, {
          nodeId: child.nodeId, nodeType: "spacer", parentNodeId: cellBox.nodeId,
          pageIndex, x: child.x, y: curY, width: child.width, height: child.height,
        })
        curY += child.height
      }
    } else if (child.nodeType === "paragraph") {
      const node = tableNode.nodes[child.nodeId]
      if (node?.type !== "paragraph") { if (isAtTo) break; continue }
      const measured = measureParagraph(node, child.width, measurer, wordBreaker)
      const lines = lineEnd !== undefined
        ? measured.lines.slice(lineStart, lineEnd)
        : measured.lines.slice(lineStart)

      if (lines.length > 0) {
        const resolvedLineEnd = lineStart + lines.length
        const isLastLines = lineEnd === undefined || lineEnd === measured.lines.length
        const paraH = paragraphFragmentHeight(measured, lines, lineStart, resolvedLineEnd)
        pushFragment(pages, template, {
          nodeId: child.nodeId, nodeType: "paragraph", parentNodeId: cellBox.nodeId,
          pageIndex, x: child.x, y: curY, width: child.width, height: paraH,
          lines: resolvePageNumbers(buildPositionedParagraphLines(measured, lines, child.x, curY, lineStart, node.props.align, isLastLines), pageIndex + 1 + pageNumberOffset),
          renderProps: buildRenderProps(node, measured.lineHeight, measured.box),
          lineStart,
          lineEnd: resolvedLineEnd,
          continuesFrom: lineStart > 0,
          isContinued: resolvedLineEnd < measured.lines.length,
        })
        curY += paraH
      }
    }

    if (isAtTo) break
  }
}

function paginateTableRowFull(
  rowBox: FlowBox,
  tableNode: TableNode,
  pages: PaginatedPage[],
  template: PaginatedPage,
  cursor: PageFlowCursor,
  tableNodeId: string,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
): PageFlowCursor {
  pushFragment(pages, template, {
    nodeId: rowBox.nodeId, nodeType: "row", parentNodeId: tableNodeId,
    pageIndex: cursor.pageIndex, x: rowBox.x, y: cursor.cursorY,
    width: rowBox.width, height: rowBox.height,
  })

  for (const cellBox of rowBox.children) {
    const cellNode = tableNode.nodes[cellBox.nodeId]
    const cellRenderProps = cellNode?.type === "table-cell"
      ? buildTableCellRenderProps(tableNode, cellNode) : undefined

    pushFragment(pages, template, {
      nodeId: cellBox.nodeId, nodeType: "table-cell", parentNodeId: rowBox.nodeId,
      pageIndex: cursor.pageIndex, x: cellBox.x, y: cursor.cursorY,
      width: cellBox.width, height: cellBox.height, cellRenderProps,
    })

    pushTableCellContents(cellBox, tableNode, measurer, pages, template, cursor.pageIndex, cursor.cursorY, wordBreaker, cursor.pageNumberOffset)
  }

  return { ...cursor, cursorY: cursor.cursorY + rowBox.height }
}

function paginateTableRowSplit(
  rowBox: FlowBox,
  tableNode: TableNode,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  tableNodeId: string,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  repeatHeaders?: (cursor: PageFlowCursor) => PageFlowCursor,
  repeatedHeaderHeight: number = 0,
): PageFlowCursor {
  // Track current split position (start of remaining content) for each cell
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
    const isLastSlice = sliceH >= totalHeight - heightPlaced
    const sliceWarnings = new Map<string, PageFragmentWarning[]>()

    // Compute per-cell end-split for this page
    const toSplits = new Map<string, SplitPoint | null>()
    if (!isLastSlice) {
      for (const cellBox of rowBox.children) {
        const from = fromSplits.get(cellBox.nodeId)!
        const cellNode = tableNode.nodes[cellBox.nodeId]
        const padding = cellNode?.type === "table-cell" && cellNode.props.padding
          ? toAbstractUnit(cellNode.props.padding.value, cellNode.props.padding.unit) : 0
        toSplits.set(cellBox.nodeId, computeCellSplitPointFrom(cellBox, tableNode, Math.max(0, sliceH - padding * 2), measurer, wordBreaker, from))
      }

      let hasRemainingContent = false
      let hasContentProgress = false
      for (const cellBox of rowBox.children) {
        const from = fromSplits.get(cellBox.nodeId)!
        const hasRemaining = cellHasRemainingSplitContent(cellBox, tableNode, measurer, wordBreaker, from)
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
          cellHasRemainingSplitContent(cellBox, tableNode, measurer, wordBreaker, fromSplits.get(cellBox.nodeId)!),
        )
        if (forcedCell) {
          const forcedSplit = forceOneSplitUnitProgress(
            forcedCell,
            tableNode,
            measurer,
            wordBreaker,
            fromSplits.get(forcedCell.nodeId)!,
          )
          if (forcedSplit) {
            // Explicit overflow-progress policy: when padding/headers leave less
            // than one line of capacity, render one unit anyway rather than
            // consuming an empty row slice and losing split progress.
            toSplits.set(forcedCell.nodeId, forcedSplit)
            const forcedCellNode = tableNode.nodes[forcedCell.nodeId]
            const forcedPadding = forcedCellNode?.type === "table-cell" && forcedCellNode.props.padding
              ? toAbstractUnit(forcedCellNode.props.padding.value, forcedCellNode.props.padding.unit) : 0
            const forcedContentHeight = forcedSplitUnitHeight(
              forcedCell,
              tableNode,
              measurer,
              wordBreaker,
              fromSplits.get(forcedCell.nodeId)!,
              forcedSplit,
            )
            const forcedSliceHeight = forcedContentHeight + forcedPadding * 2
            sliceH = Math.max(sliceH, Math.min(totalHeight - heightPlaced, forcedSliceHeight))
            const warning: PageFragmentWarning = {
              code: "forced-table-split-overflow",
              message: "table row split forced one content unit because the available slice could not fit normal progress",
            }
            sliceWarnings.set(rowBox.nodeId, [warning])
            sliceWarnings.set(forcedCell.nodeId, [warning])
          }
        }
      } else {
        retriedNoProgressKey = null
      }
    }

    // Row fragment for this slice
    pushFragment(pages, template, {
      nodeId: rowBox.nodeId, nodeType: "row", parentNodeId: tableNodeId,
      pageIndex: current.pageIndex, x: rowBox.x, y: current.cursorY,
      width: rowBox.width, height: sliceH,
      warnings: sliceWarnings.get(rowBox.nodeId),
    })

    // Cell fragments and content for this slice
    for (const cellBox of rowBox.children) {
      const from = fromSplits.get(cellBox.nodeId)!
      const to = isLastSlice ? null : (toSplits.get(cellBox.nodeId) ?? null)
      const cellNode = tableNode.nodes[cellBox.nodeId]
      const baseProps = cellNode?.type === "table-cell" ? buildTableCellRenderProps(tableNode, cellNode) : undefined

      pushFragment(pages, template, {
        nodeId: cellBox.nodeId, nodeType: "table-cell", parentNodeId: rowBox.nodeId,
        pageIndex: current.pageIndex, x: cellBox.x, y: current.cursorY,
        width: cellBox.width, height: sliceH,
        warnings: sliceWarnings.get(cellBox.nodeId),
        cellRenderProps: baseProps
          ? { ...baseProps, continuesOnNext: !isLastSlice, continuedFromPrev: heightPlaced > 0 }
          : undefined,
      })

      pushCellSlice(cellBox, tableNode, measurer, pages, template, current.pageIndex, current.cursorY, from, to, wordBreaker, current.pageNumberOffset)

      if (!isLastSlice) {
        fromSplits.set(cellBox.nodeId, to ?? { childIdx: cellBox.children.length, lineIdx: 0 })
      }
    }

    current = { ...current, cursorY: current.cursorY + sliceH }
    heightPlaced += sliceH

    if (!isLastSlice) {
      current = advancePage(current, contentTop)
      current = repeatHeaders ? repeatHeaders(current) : current
    }
  }

  return current
}

interface RowspanGroup {
  rowIndices: number[]
  totalHeight: number
}

// Group table rows that share rowspan cells using union-find.
// Rows in the same group must be paginated together (approach B).
function buildRowspanGroups(tableNode: TableNode, rowBoxes: FlowBox[]): RowspanGroup[] {
  const n = tableNode.rowIds.length
  const parent = Array.from({ length: n }, (_, i) => i)

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }
  function union(a: number, b: number): void {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  for (let rowIdx = 0; rowIdx < n; rowIdx++) {
    const rowId = tableNode.rowIds[rowIdx]
    const rowNode = tableNode.nodes[rowId]
    if (rowNode?.type !== "table-row") continue
    for (const cellId of rowNode.cellIds) {
      const cellNode = tableNode.nodes[cellId]
      if (cellNode?.type !== "table-cell") continue
      const rowspan = cellNode.props.rowspan ?? 1
      if (rowspan <= 1) continue
      for (let dr = 1; dr < rowspan && rowIdx + dr < n; dr++) {
        union(rowIdx, rowIdx + dr)
      }
    }
  }

  const groupMap = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groupMap.has(root)) groupMap.set(root, [])
    groupMap.get(root)!.push(i)
  }

  return Array.from(groupMap.values())
    .map((g) => g.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .map((rowIndices) => ({
      rowIndices,
      totalHeight: rowIndices.reduce((sum, i) => sum + (rowBoxes[i]?.height ?? 0), 0),
    }))
}

export function paginateTable(
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
  const tableNode = section.nodes[box.nodeId] as unknown as TableNode
  if (!tableNode || tableNode.type !== "table") return cursor

  let current = cursor

  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "table",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: box.height,
  })

  const groups = buildRowspanGroups(tableNode, box.children)

  // ─── Header row repetition ───────────────────────────────────────────────────
  // The first headerRowCount rows repeat at the top of every continuation page.
  const headerRowCount = tableNode.props.headerRowCount ?? 0
  const headerBoxes = box.children.slice(0, headerRowCount)
  const headerHeight = headerBoxes.reduce((s, r) => s + r.height, 0)

  const placeHeaders = (c: PageFlowCursor): PageFlowCursor => {
    for (const rowBox of headerBoxes) {
      c = paginateTableRowFull(rowBox, tableNode, pages, template, c, box.nodeId, measurer, wordBreaker)
    }
    return c
  }

  for (const { rowIndices, totalHeight } of groups) {
    // Header groups contain only header rows. They are placed normally on the first
    // page and do not trigger header re-insertion when advancing to a new page.
    const isHeaderGroup = rowIndices.every((i) => i < headerRowCount)

    if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
      current = advancePage(current, contentTop)
      if (!isHeaderGroup && headerRowCount > 0) current = placeHeaders(current)
    }

    if (rowIndices.length > 1) {
      // Multi-row rowspan group: decide page as a unit so all rows land together.
      if (shouldMoveBlockToNextPage(current.cursorY, totalHeight, contentTop, contentBottom)) {
        current = advancePage(current, contentTop)
        if (!isHeaderGroup && headerRowCount > 0) current = placeHeaders(current)
      }
      for (const rowIdx of rowIndices) {
        const rowBox = box.children[rowIdx]
        if (!rowBox) continue
        if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
          current = advancePage(current, contentTop)
          if (!isHeaderGroup && headerRowCount > 0) current = placeHeaders(current)
        }
        current = paginateTableRowFull(rowBox, tableNode, pages, template, current, box.nodeId, measurer, wordBreaker)
      }
    } else {
      // Single-row group: existing behavior with header insertion on page advance.
      const rowIdx = rowIndices[0]
      const rowBox = box.children[rowIdx]
      if (!rowBox) continue
      const rowNode = tableNode.nodes[rowBox.nodeId]
      const allowBreak = rowNode?.type === "table-row" ? (rowNode.props.allowBreak ?? true) : true
      const doesntFit = shouldMoveBlockToNextPage(current.cursorY, rowBox.height, contentTop, contentBottom)
      const tooTallForOnePage = rowBox.height > contentBottom - contentTop
      if (!doesntFit && !tooTallForOnePage) {
        current = paginateTableRowFull(rowBox, tableNode, pages, template, current, box.nodeId, measurer, wordBreaker)
      } else if (allowBreak && !isHeaderGroup) {
        current = paginateTableRowSplit(
          rowBox, tableNode, pages, template, contentTop, contentBottom, current, box.nodeId, measurer, wordBreaker,
          headerRowCount > 0 ? placeHeaders : undefined,
          headerRowCount > 0 ? headerHeight : 0,
        )
      } else {
        const nextPage = advancePage(current, contentTop)
        // Account for headers that will be placed before the row on the new page.
        const reservedForHeaders = isHeaderGroup ? 0 : headerHeight
        if (nextPage.cursorY + reservedForHeaders + rowBox.height <= contentBottom) {
          current = nextPage
          if (!isHeaderGroup && headerRowCount > 0) current = placeHeaders(current)
        }
        current = paginateTableRowFull(rowBox, tableNode, pages, template, current, box.nodeId, measurer, wordBreaker)
      }
    }
  }

  return current
}
