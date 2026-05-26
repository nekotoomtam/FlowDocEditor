import type { DocumentNode, DocumentSection } from "../schema"
import { resolveDocumentParagraphStyles } from "../document/paragraphStyles"
import { resolveListMarkers } from "../document/listNumbering"
import {
  flowSection,
  flowZone,
  measureParagraph,
  paragraphBoxLeftInset,
  paragraphBoxTopInset,
} from "../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../layout"
import { defaultWordBreaker } from "../layout"
import type {
  PageFlowCursor,
  PaginatedDocument,
  PaginatedPage,
  PaginatedSection,
  ParagraphSplitDecision,
} from "./types"
import { createEmptyPage, getPageMetrics, resolveHeaderFooterHorizontalBox } from "./metrics"
import {
  advancePage,
  pushFragment,
  shouldMoveBlockToNextPage,
  shouldMoveToNextPage,
} from "./paginator/cursor"
import {
  buildPositionedParagraphLines,
  buildRenderProps,
  paragraphEndInset,
  paragraphFragmentHeight,
  resolvePageNumbers,
} from "./paginator/paragraph"
import { collectTocEntries, computeTocOverrides, fillTocFragments, paginateTocPlaceholder } from "./paginator/toc"
import { buildZoneFragments, cloneZoneFragmentsForPage } from "./paginator/zone"
import { paginateSpacer } from "./paginator/spacer"
import { paginateDivider } from "./paginator/divider"
import { paginatePageBreak } from "./paginator/pageBreak"
import { paginateRow } from "./paginator/row"
import { paginateFlowRow } from "./paginator/flowRow"
import { paginateFlowTable } from "./paginator/flowTable"
import { toListMarkerRenderProps, withListBodyIndent, type ListNumberingPaginationContext } from "./paginator/listMarker"

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

export { buildPaginatedLines, buildPositionedParagraphLines } from "./paginator/paragraph"

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
  listNumbering?: ListNumberingPaginationContext,
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

  const resolvedListMarker = listNumbering?.markers.get(node.id)
  const layoutNode = withListBodyIndent(node, resolvedListMarker, listNumbering)
  const measured = measureParagraph(layoutNode, box.width, measurer, wordBreaker)
  const renderProps = buildRenderProps(layoutNode, measured.lineHeight, measured.box)
  const spacingBefore = measured.spacingBefore
  const paragraphContentX = box.x + paragraphBoxLeftInset(measured.box)
  const listMarker = toListMarkerRenderProps(resolvedListMarker, listNumbering, paragraphContentX)

  // Fast path: whole paragraph fits on the current page without splitting
  if (current.cursorY + measured.totalHeight <= contentBottom) {
    const rawLines = buildPositionedParagraphLines(measured, measured.lines, box.x, current.cursorY, 0, layoutNode.props.align, true)
    const lines = resolvePageNumbers(rawLines, current.pageIndex + 1 + current.pageNumberOffset)
    pushFragment(pages, template, {
      nodeId: box.nodeId, nodeType: "paragraph", parentNodeId,
      pageIndex: current.pageIndex, x: box.x, y: current.cursorY,
      width: box.width, height: measured.totalHeight, lines, renderProps,
      listMarker,
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
    const currTopInset = isFirstFragment ? paragraphBoxTopInset(measured.box) : 0
    const availableForLines = contentBottom - current.cursorY - currSpacingBefore - currTopInset

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
    const fragLines = remainingLines.slice(0, count)
    const resolvedLineEnd = lineOffset + fragLines.length
    const fragHeight = paragraphFragmentHeight(measured, fragLines, lineOffset, resolvedLineEnd)

    const rawPositioned = buildPositionedParagraphLines(measured, fragLines, box.x, current.cursorY, lineOffset, layoutNode.props.align, isLastFragment)
    const positionedLines = resolvePageNumbers(rawPositioned, current.pageIndex + 1 + current.pageNumberOffset)
    pushFragment(pages, template, {
      nodeId: box.nodeId, nodeType: "paragraph", parentNodeId,
      pageIndex: current.pageIndex, x: box.x, y: current.cursorY,
      width: box.width, height: fragHeight, lines: positionedLines, renderProps,
      listMarker: lineOffset === 0 ? listMarker : undefined,
      fragmentIndex, lineStart: lineOffset, lineEnd: resolvedLineEnd,
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
  listNumbering?: ListNumberingPaginationContext,
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

    current = paginateFlowBox(child, section, measurer, pages, template, contentTop, contentBottom, current, box.nodeId, wordBreaker, onSplitDecision, listNumbering)
  })

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
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
  listNumbering?: ListNumberingPaginationContext,
): PageFlowCursor {
  switch (box.nodeType) {
    case "paragraph":
      return paginateParagraph(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, onSplitDecision, listNumbering)
    case "spacer":
      return paginateSpacer(box, pages, template, contentTop, contentBottom, cursor, parentNodeId)
    case "divider":
      return paginateDivider(box, section, pages, template, contentTop, contentBottom, cursor, parentNodeId)
    case "page-break":
      return paginatePageBreak(box, pages, template, contentTop, cursor, parentNodeId)
    case "row":
      return paginateRow(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, listNumbering)
    case "flow-row":
      return paginateFlowRow(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, listNumbering)
    case "flow-stack":
      throw new Error(`${box.nodeType} pagination is not implemented yet`)
    case "body":
    case "stack":
      return paginateVerticalContainer(box, section, measurer, pages, template, contentTop, contentBottom, cursor, wordBreaker, onSplitDecision, listNumbering)
    case "flow-table":
      return paginateFlowTable(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, listNumbering)
    case "flow-table-row":
    case "flow-table-cell":
      throw new Error(`${box.nodeType} pagination is owned by flow-table`)
    case "toc":
      return paginateTocPlaceholder(box, pages, template, contentTop, contentBottom, cursor, parentNodeId)
  }
}

// ─── Section Entry ────────────────────────────────────────────────────────────

function paginateSection(
  section: DocumentSection,
  startPageIndex: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker = defaultWordBreaker,
  tocHeightOverrides?: Map<string, number>,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
  listNumbering?: ListNumberingPaginationContext,
): PaginatedSection {
  const metrics = getPageMetrics(section.page)
  const template = createEmptyPage(startPageIndex, metrics)
  const pages: PaginatedPage[] = []
  const contentTop = metrics.contentBox.y
  const contentBottom = metrics.contentBox.y + metrics.contentBox.height
  const contentX = metrics.contentBox.x
  const contentWidth = metrics.contentBox.width
  const zoneHorizontalBox = resolveHeaderFooterHorizontalBox(section.page, metrics.contentBox, metrics.pageWidth)

  // ─── Body ────────────────────────────────────────────────────────────────────
  const flowBox = flowSection(section, contentX, contentWidth, measurer, wordBreaker, tocHeightOverrides)
  // pageNumberOffset: when pageNumberStart is set, display number = globalPageIndex + 1 + offset
  const pageNumberOffset = section.page.pageNumberStart !== undefined
    ? section.page.pageNumberStart - startPageIndex - 1
    : 0
  const cursor: PageFlowCursor = { pageIndex: startPageIndex, cursorY: contentTop, pageNumberOffset }
  paginateFlowBox(flowBox, section, measurer, pages, template, contentTop, contentBottom, cursor, undefined, wordBreaker, onSplitDecision, listNumbering)

  if (pages.length === 0) pages.push(createEmptyPage(startPageIndex, metrics))

  // ─── Header / Footer ─────────────────────────────────────────────────────────
  const headerReserved = Math.max(0, section.page.headerReserved ?? 0)
  const footerReserved = Math.max(0, section.page.footerReserved ?? 0)
  const headerY = contentTop - headerReserved
  const footerY = contentBottom
  const headerZoneBox = { x: zoneHorizontalBox.x, y: headerY, width: zoneHorizontalBox.width, height: headerReserved }
  const footerZoneBox = { x: zoneHorizontalBox.x, y: footerY, width: zoneHorizontalBox.width, height: footerReserved }

  const defaultHeaderBox = flowZone(section, section.headerRootId, zoneHorizontalBox.x, headerY, zoneHorizontalBox.width, measurer, wordBreaker)
  const defaultFooterBox = flowZone(section, section.footerRootId, zoneHorizontalBox.x, footerY, zoneHorizontalBox.width, measurer, wordBreaker)

  // first page: undefined = ใช้ default, null = ไม่มี header/footer
  const hasFirstPageHeader = section.headerFirstPageRootId !== undefined
  const hasFirstPageFooter = section.footerFirstPageRootId !== undefined
  const firstPageHeaderBox = hasFirstPageHeader
    ? flowZone(section, section.headerFirstPageRootId, zoneHorizontalBox.x, headerY, zoneHorizontalBox.width, measurer, wordBreaker)
    : defaultHeaderBox
  const firstPageFooterBox = hasFirstPageFooter
    ? flowZone(section, section.footerFirstPageRootId, zoneHorizontalBox.x, footerY, zoneHorizontalBox.width, measurer, wordBreaker)
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
    page.headerZoneBox = { ...headerZoneBox }
    page.footerZoneBox = { ...footerZoneBox }
  })

  return { sectionId: section.id, pages: densePages }
}

// ─── Document Entry ───────────────────────────────────────────────────────────

function runAllSections(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wb: WordBreaker,
  tocHeightOverrides?: Map<string, number>,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
  listNumbering?: ListNumberingPaginationContext,
): PaginatedSection[] {
  let pageIndex = 0
  const sections: PaginatedSection[] = []
  doc.document.sections.forEach((section, index) => {
    if (index > 0) pageIndex += 1
    const paginated = paginateSection(section, pageIndex, measurer, wb, tocHeightOverrides, onSplitDecision, listNumbering)
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
  const layoutDoc = resolveDocumentParagraphStyles(doc)
  const listNumbering: ListNumberingPaginationContext = {
    markers: resolveListMarkers(layoutDoc),
    styles: layoutDoc.document.listStyles ?? {},
  }

  // Pass 1: paginate with estimated TOC heights
  const sections1 = runAllSections(layoutDoc, measurer, wb, undefined, onSplitDecision, listNumbering)
  const entries1 = collectTocEntries(sections1, layoutDoc)
  const overrides = computeTocOverrides(sections1, layoutDoc, entries1)

  if (overrides.size > 0) {
    // Pass 2: repaginate with corrected TOC heights; page numbers may shift
    const sections2 = runAllSections(layoutDoc, measurer, wb, overrides, onSplitDecision, listNumbering)
    const entries2 = collectTocEntries(sections2, layoutDoc)
    fillTocFragments(sections2, layoutDoc, entries2)
    return { sections: sections2, tocEntries: entries2 }
  }

  fillTocFragments(sections1, layoutDoc, entries1)
  return { sections: sections1, tocEntries: entries1 }
}
