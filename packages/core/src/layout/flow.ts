import type { BodyNode, DocumentSection, LayoutNode, RowNode, StackNode, TocNode } from "../schema"
import type { TableNode, TableCellNode } from "../schema"
import { DEFAULT_STACK_MIN_HEIGHT } from "../document/defaults"
import { measureParagraph, measureSpacer, toAbstractUnit } from "./measure"
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

function distributeRowWidths(section: DocumentSection, row: RowNode, availableWidth: number): number[] {
  const gap = Math.max(0, row.props.gap ?? 0)
  const totalGap = gap * Math.max(0, row.childIds.length - 1)
  const contentWidth = Math.max(0, availableWidth - totalGap)

  const scaledShares = row.childIds.map((childId) => {
    const child = section.nodes[childId]
    return child?.type === "stack" && typeof child.props.widthShare === "number"
      ? toScaledShare(child.props.widthShare)
      : 0
  })

  const totalScaled = scaledShares.reduce((sum, s) => sum + s, 0)
  if (totalScaled <= 0) {
    // fallback: equal distribution
    const equal = contentWidth / Math.max(1, row.childIds.length)
    return row.childIds.map(() => equal)
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
): FlowBox {
  switch (node.type) {
    case "body":
      return flowVerticalContainer(section, node, x, y, width, measurer, undefined, wordBreaker)
    case "stack":
      return flowVerticalContainer(section, node, x, y, width, measurer, stackRenderHeight, wordBreaker)
    case "row":
      return flowRow(section, node, x, y, width, measurer, wordBreaker)
    case "paragraph": {
      const measured = measureParagraph(node, width, measurer, wordBreaker)
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
    case "table": {
      return flowTable(section, node as unknown as TableNode, x, y, width, measurer, wordBreaker)
    }
    case "toc": {
      const toc = node as unknown as TocNode
      const maxLevel = toc.props.maxLevel ?? 3
      const headingCount = countHeadings(section, maxLevel)
      const titleH = TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER
      const entryH = TOC_ENTRY_FS * TOC_ENTRY_LH
      const height = titleH + Math.max(headingCount, 1) * entryH
      return { nodeId: node.id, nodeType: "toc", x, y, width, height, children: [] }
    }
  }
}

// ─── TOC Helpers ──────────────────────────────────────────────────────────────

const TOC_TITLE_FS = 14
const TOC_TITLE_LH = 1.5
const TOC_TITLE_AFTER = 8
export const TOC_ENTRY_FS = 11
export const TOC_ENTRY_LH = 1.5

function countHeadings(section: DocumentSection, maxLevel: number): number {
  let count = 0
  for (const node of Object.values(section.nodes)) {
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
    const childBox = flowNode(section, child, innerX, cursorY, innerWidth, measurer, undefined, wordBreaker)
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
): FlowBox {
  const gap = Math.max(0, node.props.gap ?? 0)
  const columnWidths = distributeRowWidths(section, node, width)

  const childNodes = node.childIds
    .map((id) => section.nodes[id])
    .filter((n): n is LayoutNode => n != null)

  const measuredHeights = childNodes.map((child, index) => {
    const colWidth = columnWidths[index] ?? 0
    const box = flowNode(section, child, 0, 0, colWidth, measurer, undefined, wordBreaker)
    return box.height
  })

  const rowHeight = Math.max(node.props.minHeight ?? 0, ...measuredHeights)

  let cursorX = x
  const children: FlowBox[] = []

  childNodes.forEach((child, index) => {
    const colWidth = columnWidths[index] ?? 0
    const childBox = flowNode(section, child, cursorX, y, colWidth, measurer, rowHeight, wordBreaker)
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

// ─── Table Layout ─────────────────────────────────────────────────────────────

// สร้าง map จาก cellId → { rowIdx, colStart }
// โดย resolve occupancy จาก rowspan ของ row ก่อนหน้า
function buildColStartMap(table: TableNode): Map<string, { rowIdx: number; colStart: number }> {
  const colCount = table.columns.length
  const occupiedCols: Set<number>[] = Array.from(
    { length: table.rowIds.length },
    () => new Set<number>(),
  )
  const result = new Map<string, { rowIdx: number; colStart: number }>()

  table.rowIds.forEach((rowId, rowIdx) => {
    const rowNode = table.nodes[rowId]
    if (rowNode?.type !== "table-row") return

    let colCursor = 0
    rowNode.cellIds.forEach((cellId) => {
      while (colCursor < colCount && occupiedCols[rowIdx].has(colCursor)) colCursor++
      if (colCursor >= colCount) return

      const cellNode = table.nodes[cellId]
      if (cellNode?.type !== "table-cell") return

      const colspan = cellNode.props.colspan ?? 1
      const rowspan = cellNode.props.rowspan ?? 1

      result.set(cellId, { rowIdx, colStart: colCursor })

      for (let dr = 1; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          if (rowIdx + dr < table.rowIds.length) {
            occupiedCols[rowIdx + dr].add(colCursor + dc)
          }
        }
      }

      colCursor += colspan
    })
  })

  return result
}

function resolveTableCellWidth(
  cellNode: TableCellNode,
  colStart: number,
  colWidths: number[],
): { cellWidth: number; padding: number; innerWidth: number } {
  const colspan = cellNode.props.colspan ?? 1
  const colEnd = Math.min(colStart + colspan - 1, colWidths.length - 1)
  const cellWidth = colWidths.slice(colStart, colEnd + 1).reduce((s, w) => s + w, 0)
  const padding = cellNode.props.padding
    ? toAbstractUnit(cellNode.props.padding.value, cellNode.props.padding.unit)
    : 0
  return { cellWidth, padding, innerWidth: Math.max(0, cellWidth - padding * 2) }
}

function measureTableCellHeight(
  cellNode: TableCellNode,
  table: TableNode,
  innerWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
): number {
  let h = 0
  cellNode.childIds.forEach((childId) => {
    const child = table.nodes[childId]
    if (!child) return
    if (child.type === "paragraph") h += measureParagraph(child, innerWidth, measurer, wordBreaker).totalHeight
    else if (child.type === "spacer") h += child.props.height
  })
  return h
}

function flowTable(
  section: DocumentSection,
  table: TableNode,
  x: number,
  y: number,
  width: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
): FlowBox {
  const colWidths = table.columns.map((col) =>
    toAbstractUnit(col.width.value, col.width.unit),
  )
  const cellPositions = buildColStartMap(table)

  // ─── Pass 1: measure row heights from rowspan=1 cells ────────────────────────

  const rowHeights: number[] = table.rowIds.map((rowId, rowIdx) => {
    const rowNode = table.nodes[rowId]
    if (rowNode?.type !== "table-row") return 0

    let rowHeight = rowNode.props.height
      ? toAbstractUnit(rowNode.props.height.value, rowNode.props.height.unit)
      : 0

    rowNode.cellIds.forEach((cellId) => {
      const pos = cellPositions.get(cellId)
      if (!pos || pos.rowIdx !== rowIdx) return

      const cellNode = table.nodes[cellId]
      if (cellNode?.type !== "table-cell") return
      if ((cellNode.props.rowspan ?? 1) > 1) return

      const { padding, innerWidth } = resolveTableCellWidth(cellNode, pos.colStart, colWidths)
      rowHeight = Math.max(rowHeight, measureTableCellHeight(cellNode, table, innerWidth, measurer, wordBreaker) + padding * 2)
    })

    return rowHeight
  })

  // ─── Pass 2: rowspan > 1 — distribute extra height to last row of span ───────

  for (const [cellId, pos] of cellPositions) {
    const cellNode = table.nodes[cellId]
    if (cellNode?.type !== "table-cell") continue
    const rowspan = cellNode.props.rowspan ?? 1
    if (rowspan <= 1) continue

    const { padding, innerWidth } = resolveTableCellWidth(cellNode, pos.colStart, colWidths)
    const cellNeedH = measureTableCellHeight(cellNode, table, innerWidth, measurer, wordBreaker) + padding * 2
    const spannedH = rowHeights.slice(pos.rowIdx, pos.rowIdx + rowspan).reduce((s, h) => s + h, 0)
    if (cellNeedH > spannedH) {
      rowHeights[pos.rowIdx + rowspan - 1] += cellNeedH - spannedH
    }
  }

  // ─── Pass 3: place rows and cells ────────────────────────────────────────────

  let cursorY = y
  const rowBoxes: FlowBox[] = []

  table.rowIds.forEach((rowId, rowIdx) => {
    const rowNode = table.nodes[rowId]
    if (rowNode?.type !== "table-row") return

    const rowHeight = rowHeights[rowIdx] ?? 0
    const cellBoxes: FlowBox[] = []

    rowNode.cellIds.forEach((cellId) => {
      const pos = cellPositions.get(cellId)
      if (!pos || pos.rowIdx !== rowIdx) return

      const cellNode = table.nodes[cellId]
      if (cellNode?.type !== "table-cell") return

      const rowspan = cellNode.props.rowspan ?? 1
      const { cellWidth, padding, innerWidth } = resolveTableCellWidth(cellNode, pos.colStart, colWidths)
      const cellHeight = rowHeights.slice(rowIdx, rowIdx + rowspan).reduce((s, h) => s + h, 0)
      const cellX = x + colWidths.slice(0, pos.colStart).reduce((s, w) => s + w, 0)

      let childCursorY = cursorY + padding
      const childBoxes: FlowBox[] = []

      cellNode.childIds.forEach((childId) => {
        const child = table.nodes[childId]
        if (!child) return
        const childBox = flowNode(
          section, child as LayoutNode,
          cellX + padding, childCursorY,
          innerWidth, measurer, undefined, wordBreaker,
        )
        childBoxes.push(childBox)
        childCursorY = childBox.y + childBox.height
      })

      cellBoxes.push({
        nodeId: cellId,
        nodeType: "stack",
        x: cellX,
        y: cursorY,
        width: cellWidth,
        height: cellHeight,
        children: childBoxes,
      })
    })

    rowBoxes.push({
      nodeId: rowId,
      nodeType: "row",
      x,
      y: cursorY,
      width,
      height: rowHeight,
      children: cellBoxes,
    })

    cursorY += rowHeight
  })

  return {
    nodeId: table.id,
    nodeType: "table",
    x,
    y,
    width,
    height: cursorY - y,
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
): FlowBox | null {
  if (rootId == null) return null
  const node = section.nodes[rootId]
  if (node == null) return null
  return flowNode(section, node, contentX, zoneY, contentWidth, measurer, undefined, wordBreaker)
}

export function flowSection(
  section: DocumentSection,
  contentX: number,
  availableWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
): FlowBox {
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error(`Section "${section.id}" has no valid body root`)
  }

  return flowNode(section, body, contentX, 0, availableWidth, measurer, undefined, wordBreaker)
}
