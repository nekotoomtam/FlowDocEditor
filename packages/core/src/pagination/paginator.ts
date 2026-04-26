import type { DocumentNode, DocumentSection, ParagraphNode, TableNode, TableCellNode, CellBorder, BorderSide } from "../schema"
import { flowSection, flowZone, measureParagraph, toAbstractUnit } from "../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../layout"
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
  lines: { text: string; width: number; height: number }[],
  fragmentX: number,
  fragmentY: number,
  spacingBefore: number,
): PaginatedLine[] {
  let lineY = fragmentY + spacingBefore
  return lines.map((line) => {
    const result: PaginatedLine = { text: line.text, x: fragmentX, y: lineY, width: line.width, height: line.height }
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

    if (!allowBreak && shouldMoveBlockToNextPage(current.cursorY, rowBox.height, contentTop, contentBottom)) {
      const nextPage = advancePage(current, contentTop)
      if (nextPage.cursorY + rowBox.height <= contentBottom) current = nextPage
    }

    pushFragment(pages, template, {
      nodeId: rowBox.nodeId,
      nodeType: "row",
      parentNodeId: box.nodeId,
      pageIndex: current.pageIndex,
      x: rowBox.x,
      y: current.cursorY,
      width: rowBox.width,
      height: rowBox.height,
    })

    for (const cellBox of rowBox.children) {
      const cellNode = tableNode.nodes[cellBox.nodeId]
      const cellRenderProps = cellNode?.type === "table-cell"
        ? buildTableCellRenderProps(tableNode, cellNode)
        : undefined

      pushFragment(pages, template, {
        nodeId: cellBox.nodeId,
        nodeType: "stack",
        parentNodeId: rowBox.nodeId,
        pageIndex: current.pageIndex,
        x: cellBox.x,
        y: current.cursorY,
        width: cellBox.width,
        height: cellBox.height,
        cellRenderProps,
      })

      pushTableCellContents(cellBox, tableNode, measurer, pages, template, current.pageIndex, current.cursorY, wordBreaker)
    }

    current = { ...current, cursorY: current.cursorY + rowBox.height }
  }

  return current
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

  return { sections }
}
