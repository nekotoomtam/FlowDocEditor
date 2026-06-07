import type { BodyNode, DocumentSection, FlowRowNode, FlowStackNode, FlowTableCellNode, FlowTableNode, LayoutNode, RowNode, StackNode, TocNode } from "../schema"
import { DEFAULT_STACK_MIN_HEIGHT } from "../document/defaults"
import { resolveFlowTableGrid } from "../document/flowTableGrid"
import {
  measureParagraphWithCache,
  measureDivider,
  measureSpacer,
  paragraphBoxBottomInset,
  paragraphBoxLeftInset,
  paragraphBoxTopInset,
  type ParagraphMeasurementCache,
  resolveParagraphBoxStyle,
  toAbstractUnit,
} from "./measure"
import type { FlowBox, TextMeasurer, WordBreaker } from "./types"
import { defaultWordBreaker } from "./types"

/**
 * flow layer — ตอบคำถามว่า "node นี้อยู่ตรงไหน relative to parent"
 *
 * กฎหลัก:
 * - ไม่รู้จัก page หรือ cursor
 * - ทำงานแบบ top-to-bottom, left-to-right
 * - คืน FlowBox tree ที่ครบทุก node
 * - pure function เสมอ
 */

// ─── Width Distribution ───────────────────────────────────────────────────────

// scale ขึ้น 10000x ก่อนคำนวณเพื่อลด floating point error
// เช่น 33.33% → 333300 แล้วค่อย /SHARE_PRECISION ตอนท้าย
const SHARE_PRECISION = 10000

function toScaledShare(share: number): number {
  return Math.max(0, Math.round(share * SHARE_PRECISION))
}

function distributeChildWidths(
  section: DocumentSection,
  childIds: string[],
  availableWidth: number,
  gap: number,
  childType: "stack" | "flow-stack",
): number[] {
  const totalGap = gap * Math.max(0, childIds.length - 1)
  const contentWidth = Math.max(0, availableWidth - totalGap)

  const scaledShares = childIds.map((childId) => {
    const child = section.nodes[childId]
    return child?.type === childType && typeof child.props.widthShare === "number"
      ? toScaledShare(child.props.widthShare)
      : 0
  })

  const totalScaled = scaledShares.reduce((sum, s) => sum + s, 0)
  if (totalScaled <= 0) {
    // fallback: equal distribution
    const equal = contentWidth / Math.max(1, childIds.length)
    return childIds.map(() => equal)
  }

  // deterministic: trailing stack absorbs remainder เพื่อไม่ให้มี rounding gap
  let assigned = 0
  return scaledShares.map((scaled, index) => {
    if (index === scaledShares.length - 1) return Math.max(0, contentWidth - assigned)
    const width = Math.max(0, contentWidth * (scaled / totalScaled))
    assigned += width
    return width
  })
}

function distributeRowWidths(section: DocumentSection, row: RowNode, availableWidth: number): number[] {
  return distributeChildWidths(section, row.childIds, availableWidth, Math.max(0, row.props.gap ?? 0), "stack")
}

function distributeFlowRowWidths(section: DocumentSection, row: FlowRowNode, availableWidth: number): number[] {
  return distributeChildWidths(section, row.childIds, availableWidth, Math.max(0, row.props.gap ?? 0), "flow-stack")
}

// ─── Stack Height Resolution ──────────────────────────────────────────────────

function resolveStackHeight(
  contentHeight: number,
  padding: number,
  authoredMinHeight: number,
  baseline: number,
  stackRenderHeight?: number,
): number {
  const innerHeight = contentHeight + padding * 2
  const effectiveMin = Math.max(authoredMinHeight, baseline)
  const measured = Math.max(innerHeight, effectiveMin)
  return Math.max(measured, stackRenderHeight ?? 0)
}

// ─── Flow Functions ───────────────────────────────────────────────────────────

function flowNode(
  section: DocumentSection,
  node: LayoutNode,
  x: number,
  y: number,
  width: number,
  measurer: TextMeasurer,
  stackRenderHeight?: number,
  wordBreaker: WordBreaker = defaultWordBreaker,
  tocHeightOverrides?: Map<string, number>,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowBox {
  switch (node.type) {
    case "body":
      return flowVerticalContainer(section, node, x, y, width, measurer, undefined, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    case "stack":
      return flowVerticalContainer(section, node, x, y, width, measurer, stackRenderHeight, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    case "row":
      return flowRow(section, node, x, y, width, measurer, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    case "flow-row":
      return flowFlowRow(section, node, x, y, width, measurer, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    case "flow-stack":
      return flowFlowStack(section, node, x, y, width, measurer, stackRenderHeight, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    case "paragraph": {
      const measured = measureParagraphWithCache(node, width, measurer, wordBreaker, paragraphMeasurementCache)
      return {
        nodeId: node.id,
        nodeType: "paragraph",
        x,
        y,
        width,
        height: measured.totalHeight,
        children: [],
      }
    }
    case "spacer": {
      const measured = measureSpacer(node, width)
      return {
        nodeId: node.id,
        nodeType: "spacer",
        x,
        y,
        width,
        height: measured.height,
        children: [],
      }
    }
    case "divider": {
      const measured = measureDivider(node, width)
      return {
        nodeId: node.id,
        nodeType: "divider",
        x,
        y,
        width,
        height: measured.height,
        children: [],
      }
    }
    case "page-break": {
      return {
        nodeId: node.id,
        nodeType: "page-break",
        x,
        y,
        width,
        height: 0,
        children: [],
      }
    }
    case "flow-table": {
      return flowFlowTable(section, node as unknown as FlowTableNode, x, y, width, measurer, wordBreaker, paragraphMeasurementCache)
    }
    case "toc": {
      const toc = node as unknown as TocNode
      const maxLevel = toc.props.maxLevel ?? 3
      const titleH = TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER
      const entryH = TOC_ENTRY_FS * TOC_ENTRY_LH
      const estimatedHeight = titleH + Math.max(countHeadings(section, maxLevel), 1) * entryH
      const height = tocHeightOverrides?.get(node.id) ?? estimatedHeight
      return { nodeId: node.id, nodeType: "toc", x, y, width, height, children: [] }
    }
  }
}

// ─── TOC Helpers ──────────────────────────────────────────────────────────────

export const TOC_TITLE_FS = 14
export const TOC_TITLE_LH = 1.5
export const TOC_TITLE_AFTER = 8
export const TOC_ENTRY_FS = 11
export const TOC_ENTRY_LH = 1.5

function countHeadings(section: DocumentSection, maxLevel: number): number {
  let count = 0
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") return count
  for (const nodeId of body.childIds) {
    const node = section.nodes[nodeId]
    if (node.type === "paragraph" && node.props.headingLevel && node.props.headingLevel <= maxLevel) {
      count++
    }
  }
  return count
}

function flowVerticalContainer(
  section: DocumentSection,
  node: BodyNode | StackNode,
  x: number,
  y: number,
  width: number,
  measurer: TextMeasurer,
  stackRenderHeight?: number,
  wordBreaker: WordBreaker = defaultWordBreaker,
  tocHeightOverrides?: Map<string, number>,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowBox {
  const padding = Math.max(0, node.props.padding ?? 0)
  const gap = Math.max(0, node.props.gap ?? 0)
  const innerX = x + padding
  const innerWidth = Math.max(0, width - padding * 2)
  const baseline = node.type === "stack" ? DEFAULT_STACK_MIN_HEIGHT : 0
  const authoredMinHeight = Math.max(0, node.props.minHeight ?? 0)

  let cursorY = y + padding
  const children: FlowBox[] = []

  const childNodes = node.childIds
    .map((id) => section.nodes[id])
    .filter((n): n is LayoutNode => n != null)

  childNodes.forEach((child, index) => {
    const childBox = flowNode(section, child, innerX, cursorY, innerWidth, measurer, undefined, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    children.push(childBox)
    cursorY = childBox.y + childBox.height
    if (gap > 0 && index < childNodes.length - 1) {
      cursorY += gap
    }
  })

  const contentHeight = cursorY - (y + padding)
  const resolvedHeight = resolveStackHeight(
    contentHeight,
    padding,
    authoredMinHeight,
    baseline,
    stackRenderHeight,
  )

  return {
    nodeId: node.id,
    nodeType: node.type,
    x,
    y,
    width,
    height: resolvedHeight,
    children,
  }
}

function flowRow(
  section: DocumentSection,
  node: RowNode,
  x: number,
  y: number,
  width: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
  tocHeightOverrides?: Map<string, number>,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowBox {
  const gap = Math.max(0, node.props.gap ?? 0)
  const columnWidths = distributeRowWidths(section, node, width)

  const childNodes = node.childIds
    .map((id) => section.nodes[id])
    .filter((n): n is LayoutNode => n != null)

  const measuredHeights = childNodes.map((child, index) => {
    const colWidth = columnWidths[index] ?? 0
    const box = flowNode(section, child, 0, 0, colWidth, measurer, undefined, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    return box.height
  })

  const rowHeight = Math.max(node.props.minHeight ?? 0, ...measuredHeights)

  let cursorX = x
  const children: FlowBox[] = []

  childNodes.forEach((child, index) => {
    const colWidth = columnWidths[index] ?? 0
    const childBox = flowNode(section, child, cursorX, y, colWidth, measurer, rowHeight, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    children.push(childBox)
    cursorX += colWidth + gap
  })

  return {
    nodeId: node.id,
    nodeType: "row",
    x,
    y,
    width,
    height: rowHeight,
    children,
  }
}

function flowFlowStack(
  section: DocumentSection,
  node: FlowStackNode,
  x: number,
  y: number,
  width: number,
  measurer: TextMeasurer,
  stackRenderHeight?: number,
  wordBreaker: WordBreaker = defaultWordBreaker,
  tocHeightOverrides?: Map<string, number>,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowBox {
  const measuredBox = resolveParagraphBoxStyle(node.props.box, width)
  const contentX = x + paragraphBoxLeftInset(measuredBox)
  const contentY = y + paragraphBoxTopInset(measuredBox)
  const contentWidth = measuredBox?.contentWidth ?? width
  let cursorY = contentY
  const children: FlowBox[] = []

  const childNodes = node.childIds
    .map((id) => section.nodes[id])
    .filter((n): n is LayoutNode => n != null)

  childNodes.forEach((child) => {
    const childBox = flowNode(section, child, contentX, cursorY, contentWidth, measurer, undefined, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    children.push(childBox)
    cursorY = childBox.y + childBox.height
  })

  const contentHeight = cursorY - contentY
  const boxHeight = contentHeight + paragraphBoxTopInset(measuredBox) + paragraphBoxBottomInset(measuredBox)
  const resolvedHeight = Math.max(boxHeight, Math.max(0, node.props.minHeight ?? 0), stackRenderHeight ?? 0)

  return {
    nodeId: node.id,
    nodeType: "flow-stack",
    x,
    y,
    width,
    height: resolvedHeight,
    children,
  }
}

function flowFlowRow(
  section: DocumentSection,
  node: FlowRowNode,
  x: number,
  y: number,
  width: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
  tocHeightOverrides?: Map<string, number>,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowBox {
  const gap = Math.max(0, node.props.gap ?? 0)
  const columnWidths = distributeFlowRowWidths(section, node, width)

  const childNodes = node.childIds
    .map((id) => section.nodes[id])
    .filter((n): n is LayoutNode => n != null)

  const measuredHeights = childNodes.map((child, index) => {
    const colWidth = columnWidths[index] ?? 0
    const box = flowNode(section, child, 0, 0, colWidth, measurer, undefined, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    return box.height
  })

  const rowHeight = Math.max(node.props.minHeight ?? 0, ...measuredHeights)

  let cursorX = x
  const children: FlowBox[] = []

  childNodes.forEach((child, index) => {
    const colWidth = columnWidths[index] ?? 0
    const childBox = flowNode(section, child, cursorX, y, colWidth, measurer, rowHeight, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
    children.push(childBox)
    cursorX += colWidth + gap
  })

  return {
    nodeId: node.id,
    nodeType: "flow-row",
    x,
    y,
    width,
    height: rowHeight,
    children,
  }
}

// ─── Table Layout ─────────────────────────────────────────────────────────────

function resolveTableColumnWidths(table: FlowTableNode, availableWidth: number): number[] {
  const rawWidths = table.columns.map((col) =>
    toAbstractUnit(col.width.value, col.width.unit),
  )
  const totalWidth = rawWidths.reduce((sum, width) => sum + width, 0)
  const safeAvailableWidth = Math.max(0, availableWidth)

  if (rawWidths.length === 0) return []
  if (totalWidth <= 0) {
    const equalWidth = safeAvailableWidth / rawWidths.length
    return rawWidths.map(() => equalWidth)
  }
  if (totalWidth <= safeAvailableWidth) return rawWidths

  let assigned = 0
  return rawWidths.map((rawWidth, index) => {
    if (index === rawWidths.length - 1) return Math.max(0, safeAvailableWidth - assigned)
    const width = safeAvailableWidth * (rawWidth / totalWidth)
    assigned += width
    return width
  })
}

function resolveFlowTableMargin(value: FlowTableNode["props"]["marginTop"]): number {
  return value ? Math.max(0, toAbstractUnit(value.value, value.unit)) : 0
}

function resolveFlowTableX(x: number, availableWidth: number, tableWidth: number, align: FlowTableNode["props"]["align"]): number {
  const offset = Math.max(0, availableWidth - tableWidth)
  if (align === "right") return x + offset
  if (align === "center") return x + offset / 2
  return x
}

function resolveFlowTableCellPadding(cellNode: FlowTableCellNode): { top: number; right: number; bottom: number; left: number } {
  const padding = cellNode.props.box?.padding
  return {
    top: padding ? toAbstractUnit(padding.top.value, padding.top.unit) : 0,
    right: padding ? toAbstractUnit(padding.right.value, padding.right.unit) : 0,
    bottom: padding ? toAbstractUnit(padding.bottom.value, padding.bottom.unit) : 0,
    left: padding ? toAbstractUnit(padding.left.value, padding.left.unit) : 0,
  }
}

function resolveFlowTableCellBox(
  cellNode: FlowTableCellNode,
  colStart: number,
  colWidths: number[],
): { cellWidth: number; padding: { top: number; right: number; bottom: number; left: number }; innerWidth: number } {
  const colspan = cellNode.props.colspan ?? 1
  const colEnd = Math.min(colStart + colspan - 1, colWidths.length - 1)
  const cellWidth = colWidths.slice(colStart, colEnd + 1).reduce((s, w) => s + w, 0)
  const padding = resolveFlowTableCellPadding(cellNode)
  return {
    cellWidth,
    padding,
    innerWidth: Math.max(0, cellWidth - padding.left - padding.right),
  }
}

function measureFlowTableCellHeight(
  cellNode: FlowTableCellNode,
  table: FlowTableNode,
  innerWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): number {
  let h = 0
  cellNode.childIds.forEach((childId) => {
    const child = table.nodes[childId]
    if (!child) return
    if (child.type === "paragraph") h += measureParagraphWithCache(child, innerWidth, measurer, wordBreaker, paragraphMeasurementCache).totalHeight
    else if (child.type === "spacer") h += child.props.height
  })
  return h
}

function flowFlowTable(
  section: DocumentSection,
  table: FlowTableNode,
  x: number,
  y: number,
  width: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowBox {
  const colWidths = resolveTableColumnWidths(table, width)
  const tableWidth = colWidths.reduce((sum, colWidth) => sum + colWidth, 0)
  const tableX = resolveFlowTableX(x, width, tableWidth, table.props.align)
  const marginTop = resolveFlowTableMargin(table.props.marginTop)
  const marginBottom = resolveFlowTableMargin(table.props.marginBottom)
  const grid = resolveFlowTableGrid(table)
  const placementByCellId = new Map(grid.placements.map((placement) => [placement.cellId, placement]))

  const rowHeights: number[] = table.rowIds.map((rowId, rowIndex) => {
    const rowNode = table.nodes[rowId]
    if (rowNode?.type !== "flow-table-row") return 0

    let rowHeight = rowNode.props.height
      ? toAbstractUnit(rowNode.props.height.value, rowNode.props.height.unit)
      : 0

    rowNode.cellIds.forEach((cellId) => {
      const placement = placementByCellId.get(cellId)
      if (!placement || placement.rowIndex !== rowIndex || placement.rowspan > 1) return

      const cellNode = table.nodes[cellId]
      if (cellNode?.type !== "flow-table-cell") return

      const { padding, innerWidth } = resolveFlowTableCellBox(cellNode, placement.columnIndex, colWidths)
      rowHeight = Math.max(
        rowHeight,
        measureFlowTableCellHeight(cellNode, table, innerWidth, measurer, wordBreaker, paragraphMeasurementCache) + padding.top + padding.bottom,
      )
    })

    return rowHeight
  })

  grid.placements.forEach((placement) => {
    if (placement.rowspan <= 1) return
    const cellNode = table.nodes[placement.cellId]
    if (cellNode?.type !== "flow-table-cell") return

    const { padding, innerWidth } = resolveFlowTableCellBox(cellNode, placement.columnIndex, colWidths)
    const cellNeedH = measureFlowTableCellHeight(cellNode, table, innerWidth, measurer, wordBreaker, paragraphMeasurementCache) + padding.top + padding.bottom
    const spannedH = rowHeights.slice(placement.rowIndex, placement.rowIndex + placement.rowspan).reduce((s, h) => s + h, 0)
    if (cellNeedH > spannedH) {
      rowHeights[placement.rowIndex + placement.rowspan - 1] += cellNeedH - spannedH
    }
  })

  let cursorY = y + marginTop
  const rowBoxes: FlowBox[] = []

  table.rowIds.forEach((rowId, rowIndex) => {
    const rowNode = table.nodes[rowId]
    if (rowNode?.type !== "flow-table-row") return

    const rowHeight = rowHeights[rowIndex] ?? 0
    const cellBoxes: FlowBox[] = []

    rowNode.cellIds.forEach((cellId) => {
      const placement = placementByCellId.get(cellId)
      if (!placement || placement.rowIndex !== rowIndex) return

      const cellNode = table.nodes[cellId]
      if (cellNode?.type !== "flow-table-cell") return

      const { cellWidth, padding, innerWidth } = resolveFlowTableCellBox(cellNode, placement.columnIndex, colWidths)
      const cellHeight = rowHeights.slice(rowIndex, rowIndex + placement.rowspan).reduce((s, h) => s + h, 0)
      const cellX = tableX + colWidths.slice(0, placement.columnIndex).reduce((s, w) => s + w, 0)

      let childCursorY = cursorY + padding.top
      const childBoxes: FlowBox[] = []

      cellNode.childIds.forEach((childId) => {
        const child = table.nodes[childId]
        if (!child) return
        const childBox = flowNode(
          section,
          child as LayoutNode,
          cellX + padding.left,
          childCursorY,
          innerWidth,
          measurer,
          undefined,
          wordBreaker,
          undefined,
          paragraphMeasurementCache,
        )
        childBoxes.push(childBox)
        childCursorY = childBox.y + childBox.height
      })

      cellBoxes.push({
        nodeId: cellId,
        nodeType: "flow-table-cell",
        x: cellX,
        y: cursorY,
        width: cellWidth,
        height: cellHeight,
        children: childBoxes,
      })
    })

    rowBoxes.push({
      nodeId: rowId,
      nodeType: "flow-table-row",
      x: tableX,
      y: cursorY,
      width: tableWidth,
      height: rowHeight,
      children: cellBoxes,
    })

    cursorY += rowHeight
  })

  return {
    nodeId: table.id,
    nodeType: "flow-table",
    x: tableX,
    y,
    width: tableWidth,
    height: cursorY - y + marginBottom,
    children: rowBoxes,
  }
}

// ─── Public Entry ─────────────────────────────────────────────────────────────

// flow header หรือ footer zone — คืน null ถ้าไม่มี rootId
export function flowZone(
  section: DocumentSection,
  rootId: string | null | undefined,
  contentX: number,
  zoneY: number,
  contentWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowBox | null {
  if (rootId == null) return null
  const node = section.nodes[rootId]
  if (node == null) return null
  return flowNode(section, node, contentX, zoneY, contentWidth, measurer, undefined, wordBreaker, undefined, paragraphMeasurementCache)
}

export function flowSection(
  section: DocumentSection,
  contentX: number,
  availableWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
  tocHeightOverrides?: Map<string, number>,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowBox {
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error(`Section "${section.id}" has no valid body root`)
  }

  return flowNode(section, body, contentX, 0, availableWidth, measurer, undefined, wordBreaker, tocHeightOverrides, paragraphMeasurementCache)
}
