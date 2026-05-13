import type { DocumentNode, DocumentSection, ParagraphNode, TableNode, TableCellNode, CellBorder, BorderSide, TocNode } from "../schema"
import { flowSection, flowZone, measureParagraph, toAbstractUnit, TOC_ENTRY_FS, TOC_ENTRY_LH, TOC_TITLE_FS, TOC_TITLE_LH, TOC_TITLE_AFTER } from "../layout"
import type { FlowBox, LineSegment, MeasuredLine, TextMeasurer, WordBreaker } from "../layout"
import { defaultWordBreaker } from "../layout"
import type {
  PageFlowCursor,
  PageFragment,
  PaginatedDocument,
  PaginatedLine,
  PaginatedPage,
  PaginatedSection,
  ParagraphRenderProps,
  ParagraphSplitDecision,
  PageFragmentWarning,
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
  return { pageIndex: cursor.pageIndex + 1, cursorY: contentTop, pageNumberOffset: cursor.pageNumberOffset }
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

function justifySegments(
  segments: LineSegment[],
  lineWidth: number,
  fragmentWidth: number,
): LineSegment[] {
  const spaceCount = segments.filter((s) => s.kind === "space").length
  if (spaceCount === 0) return segments
  const extra = (fragmentWidth - lineWidth) / spaceCount
  if (extra <= 0.01) return segments
  let cumulativeExtra = 0
  return segments.map((s) => {
    const adjusted = { ...s, x: s.x + cumulativeExtra }
    if (s.kind === "space") {
      cumulativeExtra += extra
      return { ...adjusted, width: s.width + extra }
    }
    return adjusted
  })
}

export function buildPaginatedLines(
  lines: MeasuredLine[],
  fragmentX: number,
  fragmentY: number,
  spacingBefore: number,
  align: "left" | "center" | "right" | "justify" = "left",
  fragmentWidth: number = 0,
  isLastFragment: boolean = true,
): PaginatedLine[] {
  let lineY = fragmentY + spacingBefore
  return lines.map((line, lineIndex) => {
    const isLastLine = isLastFragment && lineIndex === lines.length - 1
    let x = fragmentX
    let segments = line.segments
    if (align === "center") x = fragmentX + (fragmentWidth - line.width) / 2
    else if (align === "right") x = fragmentX + fragmentWidth - line.width
    else if (align === "justify" && !isLastLine && segments?.length) {
      segments = justifySegments(segments, line.width, fragmentWidth)
    }
    const result: PaginatedLine = { text: line.text, x, y: lineY, width: line.width, height: line.height, segments }
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
    lines: buildPaginatedLines(measured.lines, box.x, 0, measured.spacingBefore, node.props.align, box.width),
    renderProps: buildRenderProps(node, measured.lineHeight),
  }
}

// ─── Page Number Resolution ───────────────────────────────────────────────────

// Replace page-number placeholder segments ("00") with the actual page number.
// Called after a fragment's pageIndex is known.
function resolvePageNumbers(lines: PaginatedLine[], pageNumber: number): PaginatedLine[] {
  const pageStr = String(pageNumber)
  return lines.map((line) => {
    if (!line.segments?.some((s) => s.kind === "pageNumber")) return line
    const newSegments = line.segments.map((s) =>
      s.kind === "pageNumber" ? { ...s, text: pageStr } : s,
    )
    return { ...line, text: newSegments.map((s) => s.text).join(""), segments: newSegments }
  })
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
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): PageFlowCursor {
  let current = cursor

  if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
    current = advancePage(current, contentTop)
  }

  const node = section.nodes[box.nodeId]
  if (node?.type !== "paragraph") {
    pushFragment(pages, template, {
      nodeId: box.nodeId, nodeType: "paragraph", parentNodeId,
      pageIndex: current.pageIndex, x: box.x, y: current.cursorY,
      width: box.width, height: box.height,
    })
    return { ...current, cursorY: current.cursorY + box.height }
  }

  const measured = measureParagraph(node, box.width, measurer, wordBreaker)
  const renderProps = buildRenderProps(node, measured.lineHeight)
  const spacingBefore = measured.spacingBefore
  const spacingAfter = measured.spacingAfter

  // Fast path: whole paragraph fits on the current page without splitting
  if (current.cursorY + measured.totalHeight <= contentBottom) {
    const rawLines = buildPaginatedLines(measured.lines, box.x, current.cursorY, spacingBefore, node.props.align, box.width, true)
    const lines = resolvePageNumbers(rawLines, current.pageIndex + 1 + current.pageNumberOffset)
    pushFragment(pages, template, {
      nodeId: box.nodeId, nodeType: "paragraph", parentNodeId,
      pageIndex: current.pageIndex, x: box.x, y: current.cursorY,
      width: box.width, height: measured.totalHeight, lines, renderProps,
      fragmentIndex: 0, lineStart: 0, lineEnd: measured.lines.length,
      continuesFrom: false, isContinued: false,
    })
    onSplitDecision?.({
      nodeId: box.nodeId, pageIndex: current.pageIndex, fragmentIndex: 0,
      lineCount: measured.lines.length,
      availableHeight: contentBottom - current.cursorY,
      fragmentHeight: measured.totalHeight,
      isSplit: false, forcedProgress: false, orphanPrevented: false, widowPrevented: false,
    })
    return { ...current, cursorY: current.cursorY + measured.totalHeight }
  }

  // Split path: paragraph crosses one or more page boundaries.
  // spacingBefore goes on the first fragment only; spacingAfter on the last.
  let remainingLines = [...measured.lines]
  let isFirstFragment = true
  let fragmentIndex = 0
  let lineOffset = 0
  let orphanPrevented = false
  let widowPrevented = false

  while (remainingLines.length > 0) {
    if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
      current = advancePage(current, contentTop)
    }

    const currSpacingBefore = isFirstFragment ? spacingBefore : 0
    const availableForLines = contentBottom - current.cursorY - currSpacingBefore

    let count = 0
    let used = 0
    for (const line of remainingLines) {
      if (used + line.height > availableForLines) break
      used += line.height
      count++
    }

    let forcedProgress = false
    if (count === 0) {
      if (current.cursorY > contentTop + 1) {
        // No lines fit in the remaining space — advance to the next page and retry
        current = advancePage(current, contentTop)
        continue
      }
      // At page top and still no room (line is taller than the page) — force one line
      // to prevent an infinite loop. This is the documented overflow case.
      count = 1
      forcedProgress = true
    }

    // ── Orphan prevention ────────────────────────────────────────────────────
    // Avoid placing a single line at the bottom of a page when more lines follow.
    // Guard: skip when already at contentTop — content box too small to improve,
    // and advancing would loop forever.
    if (count === 1 && count < remainingLines.length && current.cursorY > contentTop + 1) {
      orphanPrevented = true
      current = advancePage(current, contentTop)
      continue
    }

    // ── Widow prevention ─────────────────────────────────────────────────────
    // Avoid leaving a single line alone at the top of the next page.
    // Reduce count by 1 so the next page receives at least 2 lines.
    // Guards: count >= 2 (no orphan side-effect), not at contentTop (nowhere to push).
    const appliedWidow = remainingLines.length - count === 1 && count >= 2 && current.cursorY > contentTop + 1
    if (appliedWidow) {
      widowPrevented = true
      count -= 1
    }

    const isLastFragment = count >= remainingLines.length
    const currSpacingAfter = isLastFragment ? spacingAfter : 0
    const fragLines = remainingLines.slice(0, count)
    const fragHeight = currSpacingBefore + fragLines.reduce((s, l) => s + l.height, 0) + currSpacingAfter

    const rawPositioned = buildPaginatedLines(fragLines, box.x, current.cursorY, currSpacingBefore, node.props.align, box.width, isLastFragment)
    const positionedLines = resolvePageNumbers(rawPositioned, current.pageIndex + 1 + current.pageNumberOffset)
    pushFragment(pages, template, {
      nodeId: box.nodeId, nodeType: "paragraph", parentNodeId,
      pageIndex: current.pageIndex, x: box.x, y: current.cursorY,
      width: box.width, height: fragHeight, lines: positionedLines, renderProps,
      fragmentIndex, lineStart: lineOffset, lineEnd: lineOffset + fragLines.length,
      continuesFrom: !isFirstFragment, isContinued: !isLastFragment,
    })
    onSplitDecision?.({
      nodeId: box.nodeId, pageIndex: current.pageIndex, fragmentIndex,
      lineCount: count, availableHeight: availableForLines,
      fragmentHeight: fragHeight, isSplit: true,
      forcedProgress, orphanPrevented, widowPrevented: appliedWidow,
    })

    current = { ...current, cursorY: current.cursorY + fragHeight }
    remainingLines = remainingLines.slice(count)
    lineOffset += fragLines.length
    fragmentIndex += 1
    isFirstFragment = false
    // Reset per-fragment flags after emitting
    orphanPrevented = false
    widowPrevented = false
  }

  return current
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
        const rawLines = buildPaginatedLines(measured.lines, child.x, childPageY, measured.spacingBefore, node.props.align, child.width)
        lines = resolvePageNumbers(rawLines, pageIndex + 1 + pageNumberOffset)
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
    pushStackContents(stackBox, section, measurer, pages, template, current.pageIndex, current.cursorY, wordBreaker, current.pageNumberOffset)
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
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): PageFlowCursor {
  let current = cursor

  box.children.forEach((child, index) => {
    // keepWithNext: if this paragraph must stay with the next sibling, advance the
    // page before placing it when the combined height wouldn't fit on the current page.
    const node = section.nodes[child.nodeId]
    if (
      node?.type === "paragraph" &&
      (node.props.keepWithNext ?? false) &&
      index + 1 < box.children.length
    ) {
      const nextChild = box.children[index + 1]
      const combinedHeight = child.height + nextChild.height
      if (
        current.cursorY > contentTop + 1 &&
        shouldMoveBlockToNextPage(current.cursorY, combinedHeight, contentTop, contentBottom)
      ) {
        current = advancePage(current, contentTop)
      }
    }

    current = paginateFlowBox(child, section, measurer, pages, template, contentTop, contentBottom, current, box.nodeId, wordBreaker, onSplitDecision)
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
        const rawLines = buildPaginatedLines(measured.lines, child.x, childPageY, measured.spacingBefore, node.props.align, child.width)
        lines = resolvePageNumbers(rawLines, pageIndex + 1 + pageNumberOffset)
        renderProps = buildRenderProps(node, measured.lineHeight)
        lineStart = 0
        lineEnd = measured.lines.length
        continuesFrom = false
        isContinued = false
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
      lineStart,
      lineEnd,
      continuesFrom,
      isContinued,
    })
  })
}

// ─── Row Split Helpers ────────────────────────────────────────────────────────

interface SplitPoint {
  childIdx: number  // index ใน cellBox.children ที่ content เริ่ม overflow
  lineIdx: number   // line index ภายใน child นั้น (0 = ทั้ง child ไปหน้าถัดไป)
}

function endSplitPoint(cellBox: FlowBox, to: SplitPoint | null): SplitPoint {
  return to ?? { childIdx: cellBox.children.length, lineIdx: 0 }
}

function splitPointProgressed(from: SplitPoint, to: SplitPoint | null, cellBox: FlowBox): boolean {
  const end = endSplitPoint(cellBox, to)
  return end.childIdx > from.childIdx ||
    (end.childIdx === from.childIdx && end.lineIdx > from.lineIdx)
}

function splitProgressKey(rowBox: FlowBox, splits: Map<string, SplitPoint>): string {
  return rowBox.children
    .map((cellBox) => {
      const split = splits.get(cellBox.nodeId) ?? { childIdx: 0, lineIdx: 0 }
      return `${cellBox.nodeId}:${split.childIdx}:${split.lineIdx}`
    })
    .join("|")
}

function cellHasRemainingSplitContent(
  cellBox: FlowBox,
  tableNode: TableNode,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
): boolean {
  for (let ci = from.childIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (!child) continue
    if (child.nodeType === "spacer") return true
    if (child.nodeType !== "paragraph") continue

    const node = tableNode.nodes[child.nodeId]
    if (node?.type !== "paragraph") continue
    const lineStart = ci === from.childIdx ? from.lineIdx : 0
    const measured = measureParagraph(node, child.width, measurer, wordBreaker)
    if (lineStart < measured.lines.length) return true
  }

  return false
}

function forceOneSplitUnitProgress(
  cellBox: FlowBox,
  tableNode: TableNode,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
): SplitPoint | null {
  for (let ci = from.childIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (!child) continue
    if (child.nodeType === "spacer") return { childIdx: ci + 1, lineIdx: 0 }
    if (child.nodeType !== "paragraph") continue

    const node = tableNode.nodes[child.nodeId]
    if (node?.type !== "paragraph") continue
    const lineStart = ci === from.childIdx ? from.lineIdx : 0
    const measured = measureParagraph(node, child.width, measurer, wordBreaker)
    if (lineStart < measured.lines.length) return { childIdx: ci, lineIdx: lineStart + 1 }
  }

  return null
}

function forcedSplitUnitHeight(
  cellBox: FlowBox,
  tableNode: TableNode,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
  to: SplitPoint,
): number {
  const child = cellBox.children[from.childIdx]
  if (!child) return 0
  if (child.nodeType === "spacer") return child.height
  if (child.nodeType !== "paragraph") return 0

  const node = tableNode.nodes[child.nodeId]
  if (node?.type !== "paragraph") return 0

  const measured = measureParagraph(node, child.width, measurer, wordBreaker)
  const lineStart = from.lineIdx
  const lineEnd = to.childIdx === from.childIdx ? to.lineIdx : measured.lines.length
  const lines = measured.lines.slice(lineStart, lineEnd)
  const spacingBefore = lineStart === 0 ? measured.spacingBefore : 0
  const spacingAfter = lineEnd >= measured.lines.length
    ? toAbstractUnit(node.props.spacingAfter.value, node.props.spacingAfter.unit)
    : 0

  return spacingBefore + lines.reduce((sum, line) => sum + line.height, 0) + spacingAfter
}

// คำนวณ split point โดยเริ่มจาก `from` เพื่อหาว่า content สิ้นสุดที่ไหนเมื่อใส่ใน availH
// คืน null ถ้า content ที่เหลือทั้งหมดใส่ใน availH ได้พอดี
function computeSplitPointFrom(
  cellBox: FlowBox,
  tableNode: TableNode,
  availH: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
): SplitPoint | null {
  let heightUsed = 0

  for (let ci = from.childIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (heightUsed >= availH) return { childIdx: ci, lineIdx: 0 }

    if (child.nodeType === "spacer") {
      if (heightUsed + child.height <= availH) heightUsed += child.height
      else return { childIdx: ci, lineIdx: 0 }
    } else if (child.nodeType === "paragraph") {
      const node = tableNode.nodes[child.nodeId]
      if (node?.type !== "paragraph") continue
      const measured = measureParagraph(node, child.width, measurer, wordBreaker)
      const lineStart = ci === from.childIdx ? from.lineIdx : 0
      const spacingBefore = lineStart === 0 ? measured.spacingBefore : 0
      const remainingLines = measured.lines.slice(lineStart)
      const remainH = spacingBefore + remainingLines.reduce((s, l) => s + l.height, 0)

      if (heightUsed + remainH <= availH) {
        heightUsed += remainH
      } else {
        const availForLines = availH - heightUsed - spacingBefore
        if (availForLines <= 0) return { childIdx: ci, lineIdx: lineStart }
        let lineAccum = 0
        for (let li = lineStart; li < measured.lines.length; li++) {
          if (lineAccum + measured.lines[li].height > availForLines) return { childIdx: ci, lineIdx: li }
          lineAccum += measured.lines[li].height
        }
        heightUsed += remainH
      }
    }
  }

  return null
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
        const spacingBefore = lineStart === 0 ? measured.spacingBefore : 0
        const resolvedLineEnd = lineStart + lines.length
        const isLastLines = lineEnd === undefined || lineEnd === measured.lines.length
        const spacingAfter = isLastLines
          ? toAbstractUnit(node.props.spacingAfter.value, node.props.spacingAfter.unit) : 0
        const paraH = spacingBefore + lines.reduce((s, l) => s + l.height, 0) + spacingAfter
        pushFragment(pages, template, {
          nodeId: child.nodeId, nodeType: "paragraph", parentNodeId: cellBox.nodeId,
          pageIndex, x: child.x, y: curY, width: child.width, height: paraH,
          lines: resolvePageNumbers(buildPaginatedLines(lines, child.x, curY, spacingBefore, node.props.align, child.width), pageIndex + 1 + pageNumberOffset),
          renderProps: buildRenderProps(node, measured.lineHeight),
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
        toSplits.set(cellBox.nodeId, computeSplitPointFrom(cellBox, tableNode, Math.max(0, sliceH - padding * 2), measurer, wordBreaker, from))
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

// ─── Rowspan Group Detection ─────────────────────────────────────────────────

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

// ─── Table Pagination ─────────────────────────────────────────────────────────

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
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): PageFlowCursor {
  switch (box.nodeType) {
    case "paragraph":
      return paginateParagraph(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, onSplitDecision)
    case "spacer":
      return paginateSpacer(box, pages, template, contentTop, contentBottom, cursor, parentNodeId)
    case "row":
      return paginateRow(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker)
    case "body":
    case "stack":
      return paginateVerticalContainer(box, section, measurer, pages, template, contentTop, contentBottom, cursor, wordBreaker, onSplitDecision)
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
      fragment.lines = buildPaginatedLines(measured.lines, box.x, box.y, measured.spacingBefore, node.props.align, box.width)
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

function cloneZoneFragmentsForPage(
  fragments: PageFragment[],
  pageIndex: number,
  pageNumberOffset: number,
): PageFragment[] {
  return fragments.map((fragment) => ({
    ...fragment,
    pageIndex,
    lines: fragment.lines
      ? resolvePageNumbers(fragment.lines, pageIndex + 1 + pageNumberOffset)
      : fragment.lines,
  }))
}

// ─── Section Entry ────────────────────────────────────────────────────────────

function paginateSection(
  section: DocumentSection,
  startPageIndex: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
  tocHeightOverrides?: Map<string, number>,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): PaginatedSection {
  const metrics = getPageMetrics(section.page)
  const template = createEmptyPage(startPageIndex, metrics)
  const pages: PaginatedPage[] = []
  const contentTop = metrics.contentBox.y
  const contentBottom = metrics.contentBox.y + metrics.contentBox.height
  const contentX = metrics.contentBox.x
  const contentWidth = metrics.contentBox.width

  // ─── Body ────────────────────────────────────────────────────────────────────
  const flowBox = flowSection(section, contentX, contentWidth, measurer, wordBreaker, tocHeightOverrides)
  // pageNumberOffset: when pageNumberStart is set, display number = globalPageIndex + 1 + offset
  const pageNumberOffset = section.page.pageNumberStart !== undefined
    ? section.page.pageNumberStart - startPageIndex - 1
    : 0
  const cursor: PageFlowCursor = { pageIndex: startPageIndex, cursorY: contentTop, pageNumberOffset }
  paginateFlowBox(flowBox, section, measurer, pages, template, contentTop, contentBottom, cursor, undefined, wordBreaker, onSplitDecision)

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

  // Densify: pages array uses global pageIndex as array index internally which leaves
  // sparse holes for non-first sections. Filter to a dense array before returning.
  const densePages = pages.filter((p): p is PaginatedPage => p != null)

  densePages.forEach((page, idx) => {
    const isFirst = idx === 0  // local section index — correct first-page header detection
    const hFrags = isFirst ? firstPageHeaderFragments : defaultHeaderFragments
    const fFrags = isFirst ? firstPageFooterFragments : defaultFooterFragments
    page.headerFragments = cloneZoneFragmentsForPage(hFrags, page.index, pageNumberOffset)
    page.footerFragments = cloneZoneFragmentsForPage(fFrags, page.index, pageNumberOffset)
  })

  return { sectionId: section.id, pages: densePages }
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
    const sectionStartPageIndex = ps.pages[0]?.index ?? 0
    const pageNumberOffset = section.page.pageNumberStart !== undefined
      ? section.page.pageNumberStart - sectionStartPageIndex - 1
      : 0
    ps.pages.forEach((page) => {
      page.fragments.forEach((frag) => {
        if (frag.nodeType !== "paragraph") return
        const node = section.nodes[frag.nodeId]
        if (node?.type !== "paragraph" || !node.props.headingLevel) return
        entries.push({
          nodeId: frag.nodeId,
          text: getParagraphText(node),
          level: node.props.headingLevel as 1 | 2 | 3,
          pageNumber: frag.pageIndex + 1 + pageNumberOffset,
        })
      })
    })
  })
  return entries
}

function fillTocFragments(sections: PaginatedSection[], doc: DocumentNode, tocEntries: TocEntry[]): void {
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

function computeTocActualHeight(entries: TocEntry[], node: TocNode): number {
  const maxLevel = node.props.maxLevel ?? 3
  const filtered = entries.filter((e) => e.level <= maxLevel)
  const title = node.props.title !== undefined ? node.props.title : "สารบัญ"
  const titleH = title ? TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER : 0
  const entryH = TOC_ENTRY_FS * TOC_ENTRY_LH
  return titleH + filtered.length * entryH
}

function computeTocOverrides(
  sections: PaginatedSection[],
  doc: DocumentNode,
  entries: TocEntry[],
): Map<string, number> {
  const overrides = new Map<string, number>()
  sections.forEach((ps, si) => {
    const section = doc.document.sections[si]
    if (!section) return
    ps.pages.forEach((page) => {
      page.fragments.forEach((frag) => {
        if (frag.nodeType !== "toc") return
        const node = section.nodes[frag.nodeId] as unknown as TocNode | undefined
        if (node?.type !== "toc") return
        const actual = computeTocActualHeight(entries, node)
        if (actual > frag.height) overrides.set(node.id, actual)
      })
    })
  })
  return overrides
}

function runAllSections(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wb: WordBreaker,
  tocHeightOverrides?: Map<string, number>,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): PaginatedSection[] {
  let pageIndex = 0
  const sections: PaginatedSection[] = []
  doc.document.sections.forEach((section, index) => {
    if (index > 0) pageIndex += 1
    const paginated = paginateSection(section, pageIndex, measurer, wb, tocHeightOverrides, onSplitDecision)
    sections.push(paginated)
    pageIndex += paginated.pages.length - 1
  })
  return sections
}

export function paginateDocument(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wordBreaker?: WordBreaker,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): PaginatedDocument {
  const wb = wordBreaker ?? defaultWordBreaker

  // Pass 1: paginate with estimated TOC heights
  const sections1 = runAllSections(doc, measurer, wb, undefined, onSplitDecision)
  const entries1 = collectTocEntries(sections1, doc)
  const overrides = computeTocOverrides(sections1, doc, entries1)

  if (overrides.size > 0) {
    // Pass 2: repaginate with corrected TOC heights; page numbers may shift
    const sections2 = runAllSections(doc, measurer, wb, overrides, onSplitDecision)
    const entries2 = collectTocEntries(sections2, doc)
    fillTocFragments(sections2, doc, entries2)
    return { sections: sections2, tocEntries: entries2 }
  }

  fillTocFragments(sections1, doc, entries1)
  return { sections: sections1, tocEntries: entries1 }
}
