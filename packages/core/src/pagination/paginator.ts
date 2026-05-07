import type { DocumentNode, DocumentSection, ParagraphNode, TableNode, TableCellNode, CellBorder, BorderSide, TocNode } from "../schema"
import { flowSection, flowZone, measureParagraph, toAbstractUnit, TOC_ENTRY_FS, TOC_ENTRY_LH } from "../layout"
import type { FlowBox, MeasuredLine, TextMeasurer, WordBreaker } from "../layout"
import { defaultWordBreaker } from "../layout"
import type {
  PageFlowCursor,
  PageFragment,
  PaginatedDocument,
  PaginatedLine,
  PaginatedPage,
  PaginatedSection,
  ParagraphRenderProps,
  ResolvedBorderSide,
  ResolvedCellBorder,
  TableCellRenderProps,
  TocEntry,
} from "./types"
import { createEmptyPage, getPageMetrics } from "./metrics"

/**
 * paginator — รับ FlowBox จาก layout แล้วตัดเป็น pages
 *
 * กฎหลัก:
 * - รู้จัก page และ cursor
 * - ไม่รู้จัก document schema โดยตรง — รับ FlowBox เท่านั้น
 * - row พยายาม move ทั้งก้อนไปหน้าถัดไปก่อน
 * - paragraph แตกข้าม page ได้ระดับ line
 * - spacer ไม่แตก — move ทั้งก้อน
 */

// ─── Cursor Helpers ───────────────────────────────────────────────────────────

function shouldMoveToNextPage(cursorY: number, contentBottom: number): boolean {
  return cursorY >= contentBottom
}

function shouldMoveBlockToNextPage(
  cursorY: number,
  blockHeight: number,
  contentTop: number,
  contentBottom: number,
): boolean {
  if (cursorY <= contentTop) return false
  return cursorY + blockHeight > contentBottom
}

function advancePage(cursor: PageFlowCursor, contentTop: number): PageFlowCursor {
  return { pageIndex: cursor.pageIndex + 1, cursorY: contentTop }
}

// ─── Page Management ──────────────────────────────────────────────────────────

function ensurePage(pages: PaginatedPage[], index: number, template: ReturnType<typeof createEmptyPage>): PaginatedPage {
  if (pages[index] == null) {
    pages[index] = createEmptyPage(index, {
      pageWidth: template.width,
      pageHeight: template.height,
      contentBox: { ...template.contentBox },
    })
  }
  return pages[index]
}

function pushFragment(pages: PaginatedPage[], template: PaginatedPage, fragment: PageFragment): void {
  ensurePage(pages, fragment.pageIndex, template).fragments.push(fragment)
}

// ─── Paragraph Helpers ────────────────────────────────────────────────────────

function buildRenderProps(node: ParagraphNode, lineHeight: number): ParagraphRenderProps {
  return {
    fontSize: toAbstractUnit(node.props.fontSize.value, node.props.fontSize.unit),
    fontFamilyKey: node.props.fontFamilyKey ?? "default",
    align: node.props.align,
    lineHeight,
    spacingBefore: toAbstractUnit(node.props.spacingBefore.value, node.props.spacingBefore.unit),
    spacingAfter: toAbstractUnit(node.props.spacingAfter.value, node.props.spacingAfter.unit),
    textIndent: toAbstractUnit(node.props.textIndent.value, node.props.textIndent.unit),
    indentLeft: toAbstractUnit(node.props.indentLeft.value, node.props.indentLeft.unit),
    indentRight: toAbstractUnit(node.props.indentRight.value, node.props.indentRight.unit),
  }
}

function buildPaginatedLines(
  lines: MeasuredLine[],
  fragmentX: number,
  fragmentY: number,
  spacingBefore: number,
): PaginatedLine[] {
  let lineY = fragmentY + spacingBefore
  return lines.map((line) => {
    const result: PaginatedLine = { text: line.text, x: fragmentX, y: lineY, width: line.width, height: line.height, segments: line.segments }
    lineY += line.height
    return result
  })
}

function measureParagraphFragment(
  box: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
): { lines: PaginatedLine[]; renderProps: ParagraphRenderProps } | null {
  const node = section.nodes[box.nodeId]
  if (node?.type !== "paragraph") return null
  const measured = measureParagraph(node, box.width, measurer, wordBreaker)
  return {
    lines: buildPaginatedLines(measured.lines, box.x, 0, measured.spacingBefore),
    renderProps: buildRenderProps(node, measured.lineHeight),
  }
}

// ─── Paragraph Pagination ─────────────────────────────────────────────────────

function paginateParagraph(
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
    current = advancePage(current, contentTop)
  }

  const paragraphData = measureParagraphFragment(box, section, measurer, wordBreaker)
  const lines = paragraphData?.lines.map((l) => ({ ...l, y: l.y + current.cursorY }))

  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "paragraph",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: box.height,
    lines,
    renderProps: paragraphData?.renderProps,
  })

  return { ...current, cursorY: current.cursorY + box.height }
}

// ─── Spacer Pagination ────────────────────────────────────────────────────────

function paginateSpacer(
  box: FlowBox,
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

  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "spacer",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: box.height,
  })

  return { ...current, cursorY: current.cursorY + box.height }
}

// ─── Stack Content Placement ──────────────────────────────────────────────────

function pushStackContents(
  stackBox: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  pageIndex: number,
  pageY: number,
  wordBreaker: WordBreaker = defaultWordBreaker,
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
        lines = buildPaginatedLines(measured.lines, child.x, childPageY, measured.spacingBefore)
        renderProps = buildRenderProps(node, measured.lineHeight)
      }
    }

    pushFragment(pages, template, {
      nodeId: child.nodeId,
      nodeType: child.nodeType,
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

// ─── Row Pagination ───────────────────────────────────────────────────────────

function paginateRow(
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
    pushStackContents(stackBox, section, measurer, pages, template, current.pageIndex, current.cursorY, wordBreaker)
  })

  return { ...current, cursorY: current.cursorY + box.height }
}

// ─── Vertical Container Pagination ───────────────────────────────────────────

function paginateVerticalContainer(
  box: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  wordBreaker: WordBreaker = defaultWordBreaker,
): PageFlowCursor {
  let current = cursor

  box.children.forEach((child) => {
    current = paginateFlowBox(child, section, measurer, pages, template, contentTop, contentBottom, current, box.nodeId, wordBreaker)
  })

  return current
}

// ─── Table Pagination ─────────────────────────────────────────────────────────

function resolveBorderSide(
  tableDefault: BorderSide | undefined,
  cellOverride: BorderSide | undefined,
): ResolvedBorderSide | undefined {
  const side = cellOverride ?? tableDefault
  if (!side) return undefined
  return {
    style: side.style,
    width: toAbstractUnit(side.width.value, side.width.unit),
    color: side.color,
  }
}

function resolveCellBorder(
  tableBorder: CellBorder | undefined,
  cellBorder: CellBorder | undefined,
): ResolvedCellBorder {
  return {
    top: resolveBorderSide(tableBorder?.top, cellBorder?.top),
    right: resolveBorderSide(tableBorder?.right, cellBorder?.right),
    bottom: resolveBorderSide(tableBorder?.bottom, cellBorder?.bottom),
    left: resolveBorderSide(tableBorder?.left, cellBorder?.left),
  }
}

function buildTableCellRenderProps(
  tableNode: TableNode,
  cellNode: TableCellNode,
): TableCellRenderProps {
  return {
    colspan: cellNode.props.colspan ?? 1,
    rowspan: cellNode.props.rowspan ?? 1,
    border: resolveCellBorder(tableNode.props.border, cellNode.props.border),
    background: cellNode.props.background,
    padding: cellNode.props.padding
      ? toAbstractUnit(cellNode.props.padding.value, cellNode.props.padding.unit)
      : 0,
    verticalAlign: cellNode.props.verticalAlign ?? "top",
  }
}

function pushTableCellContents(
  cellBox: FlowBox,
  tableNode: TableNode,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  pageIndex: number,
  rowPageY: number,
  wordBreaker: WordBreaker = defaultWordBreaker,
): void {
  const offsetY = rowPageY - cellBox.y
  cellBox.children.forEach((child) => {
    const childPageY = child.y + offsetY
    let lines: PaginatedLine[] | undefined
    let renderProps: ParagraphRenderProps | undefined

    if (child.nodeType === "paragraph") {
      const node = tableNode.nodes[child.nodeId]
      if (node?.type === "paragraph") {
        const measured = measureParagraph(node, child.width, measurer, wordBreaker)
        lines = buildPaginatedLines(measured.lines, child.x, childPageY, measured.spacingBefore)
        renderProps = buildRenderProps(node, measured.lineHeight)
      }
    }

    pushFragment(pages, template, {
      nodeId: child.nodeId,
      nodeType: child.nodeType,
      parentNodeId: cellBox.nodeId,
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

// ─── Row Split Helpers ────────────────────────────────────────────────────────

interface SplitPoint {
  childIdx: number  // index ใน cellBox.children ที่ content เริ่ม overflow
  lineIdx: number   // line index ภายใน child นั้น (0 = ทั้ง child ไปหน้าถัดไป)
}

function computeSplitPoint(
  cellBox: FlowBox,
  tableNode: TableNode,
  innerAvailH: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
): SplitPoint {
  let heightUsed = 0

  for (let ci = 0; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (heightUsed >= innerAvailH) return { childIdx: ci, lineIdx: 0 }

    if (child.nodeType === "spacer") {
      if (heightUsed + child.height <= innerAvailH) heightUsed += child.height
      else return { childIdx: ci, lineIdx: 0 }
    } else if (child.nodeType === "paragraph") {
      if (heightUsed + child.height <= innerAvailH) {
        heightUsed += child.height
      } else {
        const node = tableNode.nodes[child.nodeId]
        if (node?.type !== "paragraph") return { childIdx: ci, lineIdx: 0 }
        const measured = measureParagraph(node, child.width, measurer, wordBreaker)
        const availForLines = innerAvailH - heightUsed - measured.spacingBefore
        if (availForLines <= 0) return { childIdx: ci, lineIdx: 0 }
        let lineAccum = 0
        for (let li = 0; li < measured.lines.length; li++) {
          if (lineAccum + measured.lines[li].height > availForLines) return { childIdx: ci, lineIdx: li }
          lineAccum += measured.lines[li].height
        }
        heightUsed += child.height
      }
    }
  }

  return { childIdx: cellBox.children.length, lineIdx: 0 }
}

function pushCellFirstSlice(
  cellBox: FlowBox,
  tableNode: TableNode,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  pageIndex: number,
  cellPageY: number,
  split: SplitPoint,
  wordBreaker: WordBreaker,
): void {
  const cellNode = tableNode.nodes[cellBox.nodeId]
  const padding = cellNode?.type === "table-cell" && cellNode.props.padding
    ? toAbstractUnit(cellNode.props.padding.value, cellNode.props.padding.unit) : 0
  let curY = cellPageY + padding

  for (let ci = 0; ci < split.childIdx && ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (!child) continue
    if (child.nodeType === "spacer") {
      pushFragment(pages, template, {
        nodeId: child.nodeId, nodeType: "spacer", parentNodeId: cellBox.nodeId,
        pageIndex, x: child.x, y: curY, width: child.width, height: child.height,
      })
      curY += child.height
    } else if (child.nodeType === "paragraph") {
      const node = tableNode.nodes[child.nodeId]
      if (node?.type !== "paragraph") continue
      const measured = measureParagraph(node, child.width, measurer, wordBreaker)
      const lines = buildPaginatedLines(measured.lines, child.x, curY, measured.spacingBefore)
      pushFragment(pages, template, {
        nodeId: child.nodeId, nodeType: "paragraph", parentNodeId: cellBox.nodeId,
        pageIndex, x: child.x, y: curY, width: child.width, height: child.height,
        lines, renderProps: buildRenderProps(node, measured.lineHeight),
      })
      curY += child.height
    }
  }

  // partial paragraph ที่จุด split (บางบรรทัดอยู่หน้า 1)
  const splitChild = cellBox.children[split.childIdx]
  if (splitChild?.nodeType === "paragraph" && split.lineIdx > 0) {
    const node = tableNode.nodes[splitChild.nodeId]
    if (node?.type === "paragraph") {
      const measured = measureParagraph(node, splitChild.width, measurer, wordBreaker)
      const p1Lines = measured.lines.slice(0, split.lineIdx)
      const paraH = measured.spacingBefore + p1Lines.reduce((s, l) => s + l.height, 0)
      pushFragment(pages, template, {
        nodeId: splitChild.nodeId, nodeType: "paragraph", parentNodeId: cellBox.nodeId,
        pageIndex, x: splitChild.x, y: curY, width: splitChild.width, height: paraH,
        lines: buildPaginatedLines(p1Lines, splitChild.x, curY, measured.spacingBefore),
        renderProps: buildRenderProps(node, measured.lineHeight),
      })
    }
  }
}

function pushCellSecondSlice(
  cellBox: FlowBox,
  tableNode: TableNode,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  pageIndex: number,
  cellPageY: number,
  split: SplitPoint,
  wordBreaker: WordBreaker,
): void {
  const cellNode = tableNode.nodes[cellBox.nodeId]
  const padding = cellNode?.type === "table-cell" && cellNode.props.padding
    ? toAbstractUnit(cellNode.props.padding.value, cellNode.props.padding.unit) : 0
  let curY = cellPageY + padding

  // remaining lines ของ paragraph ที่ถูกตัด
  const splitChild = cellBox.children[split.childIdx]
  if (splitChild?.nodeType === "paragraph" && split.lineIdx > 0) {
    const node = tableNode.nodes[splitChild.nodeId]
    if (node?.type === "paragraph") {
      const measured = measureParagraph(node, splitChild.width, measurer, wordBreaker)
      const p2Lines = measured.lines.slice(split.lineIdx)
      if (p2Lines.length > 0) {
        const spacingAfter = toAbstractUnit(node.props.spacingAfter.value, node.props.spacingAfter.unit)
        const paraH = p2Lines.reduce((s, l) => s + l.height, 0) + spacingAfter
        pushFragment(pages, template, {
          nodeId: splitChild.nodeId, nodeType: "paragraph", parentNodeId: cellBox.nodeId,
          pageIndex, x: splitChild.x, y: curY, width: splitChild.width, height: paraH,
          lines: buildPaginatedLines(p2Lines, splitChild.x, curY, 0),
          renderProps: buildRenderProps(node, measured.lineHeight),
        })
        curY += paraH
      }
    }
  }

  // children ที่เหลือหลังจุด split
  const startIdx = split.lineIdx > 0 ? split.childIdx + 1 : split.childIdx
  for (let ci = startIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (!child) continue
    if (child.nodeType === "spacer") {
      pushFragment(pages, template, {
        nodeId: child.nodeId, nodeType: "spacer", parentNodeId: cellBox.nodeId,
        pageIndex, x: child.x, y: curY, width: child.width, height: child.height,
      })
      curY += child.height
    } else if (child.nodeType === "paragraph") {
      const node = tableNode.nodes[child.nodeId]
      if (node?.type !== "paragraph") continue
      const measured = measureParagraph(node, child.width, measurer, wordBreaker)
      pushFragment(pages, template, {
        nodeId: child.nodeId, nodeType: "paragraph", parentNodeId: cellBox.nodeId,
        pageIndex, x: child.x, y: curY, width: child.width, height: child.height,
        lines: buildPaginatedLines(measured.lines, child.x, curY, measured.spacingBefore),
        renderProps: buildRenderProps(node, measured.lineHeight),
      })
      curY += child.height
    }
  }
}

const MINIMUM_ROW_SPLIT_HEIGHT = 20  // pt — ขั้นต่ำพื้นที่หน้าแรกก่อนจะ split

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
      nodeId: cellBox.nodeId, nodeType: "stack", parentNodeId: rowBox.nodeId,
      pageIndex: cursor.pageIndex, x: cellBox.x, y: cursor.cursorY,
      width: cellBox.width, height: cellBox.height, cellRenderProps,
    })

    pushTableCellContents(cellBox, tableNode, measurer, pages, template, cursor.pageIndex, cursor.cursorY, wordBreaker)
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
): PageFlowCursor {
  const availH = contentBottom - cursor.cursorY

  if (availH < MINIMUM_ROW_SPLIT_HEIGHT) {
    return paginateTableRowFull(rowBox, tableNode, pages, template, advancePage(cursor, contentTop), tableNodeId, measurer, wordBreaker)
  }

  // คำนวณ split point สำหรับแต่ละ cell
  const splits = new Map<string, SplitPoint>()
  for (const cellBox of rowBox.children) {
    const cellNode = tableNode.nodes[cellBox.nodeId]
    const padding = cellNode?.type === "table-cell" && cellNode.props.padding
      ? toAbstractUnit(cellNode.props.padding.value, cellNode.props.padding.unit) : 0
    splits.set(cellBox.nodeId, computeSplitPoint(cellBox, tableNode, Math.max(0, availH - padding * 2), measurer, wordBreaker))
  }

  // ─── หน้า 1: partial row ──────────────────────────────────────────────────

  pushFragment(pages, template, {
    nodeId: rowBox.nodeId, nodeType: "row", parentNodeId: tableNodeId,
    pageIndex: cursor.pageIndex, x: rowBox.x, y: cursor.cursorY,
    width: rowBox.width, height: availH,
  })

  for (const cellBox of rowBox.children) {
    const cellNode = tableNode.nodes[cellBox.nodeId]
    const baseProps = cellNode?.type === "table-cell" ? buildTableCellRenderProps(tableNode, cellNode) : undefined
    pushFragment(pages, template, {
      nodeId: cellBox.nodeId, nodeType: "stack", parentNodeId: rowBox.nodeId,
      pageIndex: cursor.pageIndex, x: cellBox.x, y: cursor.cursorY,
      width: cellBox.width, height: availH,
      cellRenderProps: baseProps ? { ...baseProps, continuesOnNext: true } : undefined,
    })
    const split = splits.get(cellBox.nodeId)
    if (split) pushCellFirstSlice(cellBox, tableNode, measurer, pages, template, cursor.pageIndex, cursor.cursorY, split, wordBreaker)
  }

  // ─── หน้า 2: remaining row ───────────────────────────────────────────────

  const nextCursor = advancePage(cursor, contentTop)
  const remainH = rowBox.height - availH

  pushFragment(pages, template, {
    nodeId: rowBox.nodeId, nodeType: "row", parentNodeId: tableNodeId,
    pageIndex: nextCursor.pageIndex, x: rowBox.x, y: nextCursor.cursorY,
    width: rowBox.width, height: remainH,
  })

  for (const cellBox of rowBox.children) {
    const cellNode = tableNode.nodes[cellBox.nodeId]
    const baseProps = cellNode?.type === "table-cell" ? buildTableCellRenderProps(tableNode, cellNode) : undefined
    pushFragment(pages, template, {
      nodeId: cellBox.nodeId, nodeType: "stack", parentNodeId: rowBox.nodeId,
      pageIndex: nextCursor.pageIndex, x: cellBox.x, y: nextCursor.cursorY,
      width: cellBox.width, height: remainH,
      cellRenderProps: baseProps ? { ...baseProps, continuedFromPrev: true } : undefined,
    })
    const split = splits.get(cellBox.nodeId)
    if (split) pushCellSecondSlice(cellBox, tableNode, measurer, pages, template, nextCursor.pageIndex, nextCursor.cursorY, split, wordBreaker)
  }

  return { ...nextCursor, cursorY: nextCursor.cursorY + remainH }
}

function paginateTable(
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

  for (const rowBox of box.children) {
    if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
      current = advancePage(current, contentTop)
    }

    const rowNode = tableNode.nodes[rowBox.nodeId]
    const allowBreak = rowNode?.type === "table-row" ? (rowNode.props.allowBreak ?? false) : false
    const doesntFit = shouldMoveBlockToNextPage(current.cursorY, rowBox.height, contentTop, contentBottom)

    if (!doesntFit) {
      current = paginateTableRowFull(rowBox, tableNode, pages, template, current, box.nodeId, measurer, wordBreaker)
    } else if (allowBreak) {
      current = paginateTableRowSplit(rowBox, tableNode, pages, template, contentTop, contentBottom, current, box.nodeId, measurer, wordBreaker)
    } else {
      const nextPage = advancePage(current, contentTop)
      if (nextPage.cursorY + rowBox.height <= contentBottom) current = nextPage
      current = paginateTableRowFull(rowBox, tableNode, pages, template, current, box.nodeId, measurer, wordBreaker)
    }
  }

  return current
}

// ─── TOC Placeholder ──────────────────────────────────────────────────────────

function paginateTocPlaceholder(
  box: FlowBox,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  parentNodeId?: string,
): PageFlowCursor {
  let current = cursor
  if (shouldMoveToNextPage(current.cursorY, contentBottom) ||
    shouldMoveBlockToNextPage(current.cursorY, box.height, contentTop, contentBottom)) {
    current = advancePage(current, contentTop)
  }
  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "toc",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: box.height,
    lines: [],
  })
  return { ...current, cursorY: current.cursorY + box.height }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

function paginateFlowBox(
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
  switch (box.nodeType) {
    case "paragraph":
      return paginateParagraph(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker)
    case "spacer":
      return paginateSpacer(box, pages, template, contentTop, contentBottom, cursor, parentNodeId)
    case "row":
      return paginateRow(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker)
    case "body":
    case "stack":
      return paginateVerticalContainer(box, section, measurer, pages, template, contentTop, contentBottom, cursor, wordBreaker)
    case "table":
      return paginateTable(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker)
    case "toc":
      return paginateTocPlaceholder(box, pages, template, contentTop, contentBottom, cursor, parentNodeId)
  }
}

// ─── Header / Footer ──────────────────────────────────────────────────────────

function collectZoneFragments(
  box: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  parentNodeId?: string,
  wordBreaker: WordBreaker = defaultWordBreaker,
): PageFragment[] {
  const fragments: PageFragment[] = []

  const fragment: PageFragment = {
    nodeId: box.nodeId,
    nodeType: box.nodeType,
    parentNodeId,
    pageIndex: 0,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  }

  if (box.nodeType === "paragraph") {
    const node = section.nodes[box.nodeId]
    if (node?.type === "paragraph") {
      const measured = measureParagraph(node, box.width, measurer, wordBreaker)
      fragment.lines = buildPaginatedLines(measured.lines, box.x, box.y, measured.spacingBefore)
      fragment.renderProps = buildRenderProps(node, measured.lineHeight)
    }
  }

  fragments.push(fragment)
  box.children.forEach((child) => {
    fragments.push(...collectZoneFragments(child, section, measurer, box.nodeId, wordBreaker))
  })

  return fragments
}

function buildZoneFragments(
  box: FlowBox | null,
  section: DocumentSection,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
): PageFragment[] {
  return box ? collectZoneFragments(box, section, measurer, undefined, wordBreaker) : []
}

// ─── Section Entry ────────────────────────────────────────────────────────────

function paginateSection(
  section: DocumentSection,
  startPageIndex: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
): PaginatedSection {
  const metrics = getPageMetrics(section.page)
  const template = createEmptyPage(startPageIndex, metrics)
  const pages: PaginatedPage[] = []
  const contentTop = metrics.contentBox.y
  const contentBottom = metrics.contentBox.y + metrics.contentBox.height
  const contentX = metrics.contentBox.x
  const contentWidth = metrics.contentBox.width

  // ─── Body ────────────────────────────────────────────────────────────────────
  const flowBox = flowSection(section, contentX, contentWidth, measurer, wordBreaker)
  const cursor: PageFlowCursor = { pageIndex: startPageIndex, cursorY: contentTop }
  paginateFlowBox(flowBox, section, measurer, pages, template, contentTop, contentBottom, cursor, undefined, wordBreaker)

  if (pages.length === 0) pages.push(createEmptyPage(startPageIndex, metrics))

  // ─── Header / Footer ─────────────────────────────────────────────────────────
  const headerY = contentTop - Math.max(0, section.page.headerReserved ?? 0)
  const footerY = contentBottom

  const defaultHeaderBox = flowZone(section, section.headerRootId, contentX, headerY, contentWidth, measurer, wordBreaker)
  const defaultFooterBox = flowZone(section, section.footerRootId, contentX, footerY, contentWidth, measurer, wordBreaker)

  // first page: undefined = ใช้ default, null = ไม่มี header/footer
  const hasFirstPageHeader = section.headerFirstPageRootId !== undefined
  const hasFirstPageFooter = section.footerFirstPageRootId !== undefined
  const firstPageHeaderBox = hasFirstPageHeader
    ? flowZone(section, section.headerFirstPageRootId, contentX, headerY, contentWidth, measurer, wordBreaker)
    : defaultHeaderBox
  const firstPageFooterBox = hasFirstPageFooter
    ? flowZone(section, section.footerFirstPageRootId, contentX, footerY, contentWidth, measurer, wordBreaker)
    : defaultFooterBox

  const defaultHeaderFragments = buildZoneFragments(defaultHeaderBox, section, measurer, wordBreaker)
  const defaultFooterFragments = buildZoneFragments(defaultFooterBox, section, measurer, wordBreaker)
  const firstPageHeaderFragments = hasFirstPageHeader
    ? buildZoneFragments(firstPageHeaderBox, section, measurer, wordBreaker)
    : defaultHeaderFragments
  const firstPageFooterFragments = hasFirstPageFooter
    ? buildZoneFragments(firstPageFooterBox, section, measurer, wordBreaker)
    : defaultFooterFragments

  pages.forEach((page, idx) => {
    const isFirst = idx === 0
    const hFrags = isFirst ? firstPageHeaderFragments : defaultHeaderFragments
    const fFrags = isFirst ? firstPageFooterFragments : defaultFooterFragments
    page.headerFragments = hFrags.map((f) => ({ ...f, pageIndex: page.index }))
    page.footerFragments = fFrags.map((f) => ({ ...f, pageIndex: page.index }))
  })

  return { sectionId: section.id, pages }
}

// ─── TOC Post-Processing ──────────────────────────────────────────────────────

function getParagraphText(node: ParagraphNode): string {
  return node.children
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("")
}

function collectTocEntries(sections: PaginatedSection[], doc: DocumentNode): TocEntry[] {
  const entries: TocEntry[] = []
  sections.forEach((ps, si) => {
    const section = doc.document.sections[si]
    if (!section) return
    ps.pages.forEach((page) => {
      page.fragments.forEach((frag) => {
        if (frag.nodeType !== "paragraph") return
        const node = section.nodes[frag.nodeId]
        if (node?.type !== "paragraph" || !node.props.headingLevel) return
        entries.push({
          nodeId: frag.nodeId,
          text: getParagraphText(node),
          level: node.props.headingLevel as 1 | 2 | 3,
          pageNumber: frag.pageIndex + 1,
        })
      })
    })
  })
  return entries
}

function fillTocFragments(sections: PaginatedSection[], doc: DocumentNode, tocEntries: TocEntry[]): void {
  const TOC_TITLE_FS = 14
  const TOC_TITLE_LH = 1.5
  const TOC_TITLE_AFTER = 8
  const entryH = TOC_ENTRY_FS * TOC_ENTRY_LH
  const INDENT_PER_LEVEL = 12

  sections.forEach((ps, si) => {
    const section = doc.document.sections[si]
    if (!section) return
    ps.pages.forEach((page) => {
      page.fragments.forEach((frag) => {
        if (frag.nodeType !== "toc") return
        const node = section.nodes[frag.nodeId] as unknown as TocNode | undefined
        if (node?.type !== "toc") return

        const maxLevel = node.props.maxLevel ?? 3
        const title = node.props.title !== undefined ? node.props.title : "สารบัญ"
        const filtered = tocEntries.filter((e) => e.level <= maxLevel)

        const lines: PaginatedLine[] = []
        let lineY = frag.y

        if (title) {
          const titleH = TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER
          lines.push({ text: title, x: frag.x, y: lineY, width: frag.width, height: titleH, fontSize: TOC_TITLE_FS })
          lineY += titleH
        }

        for (const entry of filtered) {
          const indent = (entry.level - 1) * INDENT_PER_LEVEL
          const availW = frag.width - indent
          const pageStr = String(entry.pageNumber)
          const approxCharsAvail = Math.floor(availW / (TOC_ENTRY_FS * 0.5))
          const dotCount = Math.max(3, approxCharsAvail - entry.text.length - pageStr.length - 2)
          const lineText = entry.text + " " + "·".repeat(dotCount) + " " + pageStr
          lines.push({ text: lineText, x: frag.x + indent, y: lineY, width: availW, height: entryH, fontSize: TOC_ENTRY_FS })
          lineY += entryH
        }

        frag.lines = lines
        frag.renderProps = {
          fontSize: TOC_ENTRY_FS, fontFamilyKey: "default", align: "left",
          lineHeight: TOC_ENTRY_LH, spacingBefore: 0, spacingAfter: 0,
          textIndent: 0, indentLeft: 0, indentRight: 0,
        }
      })
    })
  })
}

// ─── Document Entry ───────────────────────────────────────────────────────────

export function paginateDocument(doc: DocumentNode, measurer: TextMeasurer, wordBreaker?: WordBreaker): PaginatedDocument {
  const wb = wordBreaker ?? defaultWordBreaker
  let pageIndex = 0
  const sections: PaginatedSection[] = []

  doc.document.sections.forEach((section, index) => {
    if (index > 0) pageIndex += 1
    const paginated = paginateSection(section, pageIndex, measurer, wb)
    sections.push(paginated)
    pageIndex += paginated.pages.length - 1
  })

  const tocEntries = collectTocEntries(sections, doc)
  fillTocFragments(sections, doc, tocEntries)

  return { sections, tocEntries }
}
