import {
  defaultWordBreaker,
  measureParagraph,
  paragraphBoxLeftInset,
} from "../../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { FlowTableCellNode, FlowTableNode } from "../../schema"
import type {
  PageFragment,
  PaginatedLine,
  ParagraphRenderProps,
} from "../types"
import { toPageFragmentNodeType } from "./cursor"
import {
  buildPositionedParagraphLines,
  buildRenderProps,
  paragraphFragmentHeight,
  resolvePageNumbers,
} from "./paragraph"
import { resolveFlowTableCellPadding } from "./tableRenderProps"
import {
  splitPointIsAtStart,
  type SplitPoint,
} from "./cellSplit"
import { computeCellSplitPointFrom } from "./cellSplitContent"
import { toListMarkerRenderProps, withListBodyIndent, type ListNumberingPaginationContext } from "./listMarker"

function measureFlowTableCellParagraph(
  child: FlowBox,
  tableNode: FlowTableNode,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  listNumbering: ListNumberingPaginationContext | undefined,
) {
  const node = tableNode.nodes[child.nodeId]
  if (node?.type !== "paragraph") return null
  const marker = listNumbering?.markers.get(node.id)
  const layoutNode = withListBodyIndent(node, marker, listNumbering)
  const measured = measureParagraph(layoutNode, child.width, measurer, wordBreaker)
  return { node, layoutNode, measured, marker }
}

export function collectFlowTableCellContents(
  cellBox: FlowBox,
  tableNode: FlowTableNode,
  measurer: TextMeasurer,
  pageIndex: number,
  cellPageY: number,
  wordBreaker: WordBreaker = defaultWordBreaker,
  pageNumberOffset: number = 0,
  listNumbering?: ListNumberingPaginationContext,
): PageFragment[] {
  const fragments: PageFragment[] = []
  const offsetY = cellPageY - cellBox.y
  cellBox.children.forEach((child) => {
    const childPageY = child.y + offsetY
    let lines: PaginatedLine[] | undefined
    let renderProps: ParagraphRenderProps | undefined
    let lineStart: number | undefined
    let lineEnd: number | undefined
    let continuesFrom: boolean | undefined
    let isContinued: boolean | undefined
    let listMarker: PageFragment["listMarker"]

    if (child.nodeType === "paragraph") {
      const paragraph = measureFlowTableCellParagraph(child, tableNode, measurer, wordBreaker, listNumbering)
      if (paragraph) {
        const { layoutNode, measured, marker } = paragraph
        const rawLines = buildPositionedParagraphLines(measured, measured.lines, child.x, childPageY, 0, layoutNode.props.align)
        lines = resolvePageNumbers(rawLines, pageIndex + 1 + pageNumberOffset)
        renderProps = buildRenderProps(layoutNode, measured.lineHeight, measured.box)
        listMarker = toListMarkerRenderProps(marker, listNumbering, child.x + paragraphBoxLeftInset(measured.box))
        lineStart = 0
        lineEnd = measured.lines.length
        continuesFrom = false
        isContinued = false
      }
    }

    fragments.push({
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
      listMarker,
      lineStart,
      lineEnd,
      continuesFrom,
      isContinued,
    })
  })
  return fragments
}

export function flowTableCellSliceTopInset(cellNode: FlowTableCellNode | undefined, from: SplitPoint): number {
  return cellNode && splitPointIsAtStart(from) ? resolveFlowTableCellPadding(cellNode).top : 0
}

export function computeFlowTableSplitPointFrom(
  cellBox: FlowBox,
  tableNode: FlowTableNode,
  availH: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
  listNumbering?: ListNumberingPaginationContext,
): SplitPoint | null {
  const cellNode = tableNode.nodes[cellBox.nodeId]
  const heightUsed = cellNode?.type === "flow-table-cell"
    ? flowTableCellSliceTopInset(cellNode, from)
    : 0
  return computeCellSplitPointFrom(cellBox, tableNode, availH, measurer, wordBreaker, from, heightUsed, listNumbering)
}

export function collectFlowTableCellSlice(
  cellBox: FlowBox,
  tableNode: FlowTableNode,
  measurer: TextMeasurer,
  pageIndex: number,
  cellPageY: number,
  from: SplitPoint,
  to: SplitPoint | null,
  wordBreaker: WordBreaker,
  pageNumberOffset: number = 0,
  listNumbering?: ListNumberingPaginationContext,
): PageFragment[] {
  const fragments: PageFragment[] = []
  const cellNode = tableNode.nodes[cellBox.nodeId]
  const topInset = cellNode?.type === "flow-table-cell" ? flowTableCellSliceTopInset(cellNode, from) : 0
  let curY = cellPageY + topInset

  for (let ci = from.childIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (!child) continue

    const isAtTo = to !== null && ci === to.childIdx
    if (isAtTo && to!.lineIdx === 0) break

    const lineStart = ci === from.childIdx ? from.lineIdx : 0
    const lineEnd = isAtTo ? to!.lineIdx : undefined

    if (child.nodeType === "spacer") {
      if (!isAtTo) {
        fragments.push({
          nodeId: child.nodeId,
          nodeType: "spacer",
          parentNodeId: cellBox.nodeId,
          pageIndex,
          x: child.x,
          y: curY,
          width: child.width,
          height: child.height,
        })
        curY += child.height
      }
    } else if (child.nodeType === "paragraph") {
      const paragraph = measureFlowTableCellParagraph(child, tableNode, measurer, wordBreaker, listNumbering)
      if (!paragraph) { if (isAtTo) break; continue }
      const { layoutNode, measured, marker } = paragraph
      const lines = lineEnd !== undefined
        ? measured.lines.slice(lineStart, lineEnd)
        : measured.lines.slice(lineStart)

      if (lines.length > 0) {
        const resolvedLineEnd = lineStart + lines.length
        const isLastLines = lineEnd === undefined || lineEnd === measured.lines.length
        const paraH = paragraphFragmentHeight(measured, lines, lineStart, resolvedLineEnd)
        fragments.push({
          nodeId: child.nodeId,
          nodeType: "paragraph",
          parentNodeId: cellBox.nodeId,
          pageIndex,
          x: child.x,
          y: curY,
          width: child.width,
          height: paraH,
          lines: resolvePageNumbers(buildPositionedParagraphLines(measured, lines, child.x, curY, lineStart, layoutNode.props.align, isLastLines), pageIndex + 1 + pageNumberOffset),
          renderProps: buildRenderProps(layoutNode, measured.lineHeight, measured.box),
          listMarker: lineStart === 0
            ? toListMarkerRenderProps(marker, listNumbering, child.x + paragraphBoxLeftInset(measured.box))
            : undefined,
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

  return fragments
}
