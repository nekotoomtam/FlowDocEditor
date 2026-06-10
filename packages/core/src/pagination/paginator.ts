import type { DocumentNode, DocumentSection, LayoutNode, TocNode } from "../schema"
import { resolveDocumentParagraphStyles } from "../document/paragraphStyles"
import { resolveListMarkers } from "../document/listNumbering"
import {
  createParagraphMeasurementCache,
  flowSection,
  flowZone,
  measureDivider,
  measureSpacer,
  paragraphBoxLeftInset,
  paragraphBoxTopInset,
} from "../layout"
import type { FlowBox, ParagraphMeasurementCache, TextMeasurer, WordBreaker } from "../layout"
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
import { measureParagraphWithPaginationProfile } from "./paginator/profiledMeasure"
import {
  collectPaginationDocumentCounts,
  countPaginatedPagesAndFragments,
  createCachedWordBreaker,
  createPaginationProfiler,
  isPaginationProfilerEnabled,
  measureWithPaginationProfile,
  profileTextMeasurer,
  profileWordBreaker,
  type PaginationProfile,
  type PaginationProfiler,
  type PaginationProfileSource,
} from "./profiler"

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

export type BodyBasicsIncrementalUnsupportedReason =
  | "invalid-body-root"
  | "unsupported-body-child"

export interface BodyBasicsIncrementalUnsupportedResult {
  status: "unsupported"
  reason: BodyBasicsIncrementalUnsupportedReason
  sectionId: string
  nodeId?: string
  nodeType?: string
}

export type TryPaginateDocumentBodyBasicsIncrementallyResult =
  | { status: "supported"; paginated: PaginatedDocument }
  | BodyBasicsIncrementalUnsupportedResult

export interface BodyBasicsVisibleWindowOptions {
  pageIndex: number
  marginPages?: number
}

export interface BodyBasicsVisibleWindowCoverage {
  startPageIndex: number
  endPageIndex: number
  requestedPageIndex: number
  completedDocument: boolean
}

export type TryPaginateDocumentBodyBasicsVisibleWindowResult =
  | {
      status: "supported"
      paginated: PaginatedDocument
      coverage: BodyBasicsVisibleWindowCoverage
    }
  | BodyBasicsIncrementalUnsupportedResult

interface BodyBasicsSectionPaginationOptions {
  stopAfterPageIndex?: number
}

type BodyBasicsSectionPaginationResult =
  | {
      status: "supported"
      section: PaginatedSection
      completedSection: boolean
    }
  | BodyBasicsIncrementalUnsupportedResult

const STREAMING_BODY_BASIC_NODE_TYPES = new Set(["paragraph", "spacer", "divider", "page-break"])

export interface PaginateDocumentOptions {
  profilePagination?: boolean
  paginationProfileSource?: PaginationProfileSource
  profiler?: PaginationProfiler
}

export interface PaginateDocumentWithProfileResult {
  paginated: PaginatedDocument
  paginationProfile: PaginationProfile
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
  listNumbering?: ListNumberingPaginationContext,
  profiler?: PaginationProfiler,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
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
  const measured = measureParagraphWithPaginationProfile(layoutNode, box.width, measurer, wordBreaker, profiler, paragraphMeasurementCache)
  const renderProps = buildRenderProps(layoutNode, measured.lineHeight, measured.box)
  const spacingBefore = measured.spacingBefore
  const paragraphContentX = box.x + paragraphBoxLeftInset(measured.box)
  const listMarker = toListMarkerRenderProps(resolvedListMarker, listNumbering, paragraphContentX)

  // Fast path: whole paragraph fits on the current page without splitting
  if (current.cursorY + measured.totalHeight <= contentBottom) {
    const lines = measureWithPaginationProfile(profiler, "line-layout", () => {
      const rawLines = buildPositionedParagraphLines(measured, measured.lines, box.x, current.cursorY, 0, layoutNode.props.align, true)
      return resolvePageNumbers(rawLines, current.pageIndex + 1 + current.pageNumberOffset)
    })
    measureWithPaginationProfile(profiler, "fragment-generation", () => pushFragment(pages, template, {
      nodeId: box.nodeId, nodeType: "paragraph", parentNodeId,
      pageIndex: current.pageIndex, x: box.x, y: current.cursorY,
      width: box.width, height: measured.totalHeight, lines, renderProps, nodeTextVersion: hashPageFragmentLines(lines),
      listMarker,
      fragmentIndex: 0, lineStart: 0, lineEnd: measured.lines.length,
      continuesFrom: false, isContinued: false,
    }))
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

    const positionedLines = measureWithPaginationProfile(profiler, "line-layout", () => {
      const rawPositioned = buildPositionedParagraphLines(measured, fragLines, box.x, current.cursorY, lineOffset, layoutNode.props.align, isLastFragment)
      return resolvePageNumbers(rawPositioned, current.pageIndex + 1 + current.pageNumberOffset)
    })
    measureWithPaginationProfile(profiler, "fragment-generation", () => pushFragment(pages, template, {
      nodeId: box.nodeId, nodeType: "paragraph", parentNodeId,
      pageIndex: current.pageIndex, x: box.x, y: current.cursorY,
      width: box.width, height: fragHeight, lines: positionedLines, renderProps, nodeTextVersion: hashPageFragmentLines(positionedLines),
      listMarker: lineOffset === 0 ? listMarker : undefined,
      fragmentIndex, lineStart: lineOffset, lineEnd: resolvedLineEnd,
      continuesFrom: !isFirstFragment, isContinued: !isLastFragment,
    }))
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

function shouldTocAdvanceAfter(children: FlowBox[], index: number): boolean {
  const nextChild = children[index + 1]
  if (!nextChild || nextChild.nodeType === "page-break") return false
  return true
}

function flowBodyBasicNode(
  node: LayoutNode,
  x: number,
  width: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  profiler?: PaginationProfiler,
): FlowBox | null {
  switch (node.type) {
    case "paragraph": {
      const measured = measureParagraphWithPaginationProfile(node, width, measurer, wordBreaker, profiler)
      return {
        nodeId: node.id,
        nodeType: "paragraph",
        x,
        y: 0,
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
        y: 0,
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
        y: 0,
        width,
        height: measured.height,
        children: [],
      }
    }
    case "page-break":
      return {
        nodeId: node.id,
        nodeType: "page-break",
        x,
        y: 0,
        width,
        height: 0,
        children: [],
      }
    default:
      return null
  }
}

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
  profiler?: PaginationProfiler,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): PageFlowCursor {
  let current = cursor
  const containerNode = section.nodes[box.nodeId]

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

    if (containerNode?.type === "body" && node?.type === "toc") {
      current = paginateTocPlaceholder(child, pages, template, contentTop, contentBottom, current, box.nodeId, {
        isolateBefore: true,
        isolateAfter: shouldTocAdvanceAfter(box.children, index),
        node,
      })
      return
    }

    current = paginateFlowBox(child, section, measurer, pages, template, contentTop, contentBottom, current, box.nodeId, wordBreaker, onSplitDecision, listNumbering, profiler, paragraphMeasurementCache)
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
  profiler?: PaginationProfiler,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): PageFlowCursor {
  switch (box.nodeType) {
    case "paragraph":
      return paginateParagraph(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, onSplitDecision, listNumbering, profiler, paragraphMeasurementCache)
    case "spacer":
      return paginateSpacer(box, pages, template, contentTop, contentBottom, cursor, parentNodeId)
    case "divider":
      return paginateDivider(box, section, pages, template, contentTop, contentBottom, cursor, parentNodeId)
    case "page-break":
      return paginatePageBreak(box, pages, template, contentTop, cursor, parentNodeId)
    case "row":
      return measureWithPaginationProfile(profiler, "flow-row-measure", () => paginateRow(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, listNumbering, paragraphMeasurementCache))
    case "flow-row":
      return measureWithPaginationProfile(profiler, "flow-row-measure", () => paginateFlowRow(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, listNumbering, paragraphMeasurementCache))
    case "flow-stack":
      throw new Error(`${box.nodeType} pagination is not implemented yet`)
    case "body":
      return paginateVerticalContainer(box, section, measurer, pages, template, contentTop, contentBottom, cursor, wordBreaker, onSplitDecision, listNumbering, profiler, paragraphMeasurementCache)
    case "stack":
      return measureWithPaginationProfile(profiler, "flow-stack-measure", () =>
        paginateVerticalContainer(box, section, measurer, pages, template, contentTop, contentBottom, cursor, wordBreaker, onSplitDecision, listNumbering, profiler, paragraphMeasurementCache),
      )
    case "flow-table":
      profiler?.count("measuredTables")
      profiler?.count("measuredTableRows", box.children.length)
      profiler?.count("measuredTableCells", box.children.reduce((sum, row) => sum + row.children.length, 0))
      return measureWithPaginationProfile(profiler, "table-measure", () => paginateFlowTable(box, section, measurer, pages, template, contentTop, contentBottom, cursor, parentNodeId, wordBreaker, listNumbering, profiler, paragraphMeasurementCache))
    case "flow-table-row":
    case "flow-table-cell":
      throw new Error(`${box.nodeType} pagination is owned by flow-table`)
    case "toc":
      return paginateTocPlaceholder(box, pages, template, contentTop, contentBottom, cursor, parentNodeId, {
        node: section.nodes[box.nodeId]?.type === "toc"
          ? section.nodes[box.nodeId] as unknown as TocNode
          : undefined,
      })
  }
}


function hashPageFragmentLines(lines?: { text: string }[]): number | undefined {
  if (!lines) return undefined;
  let hash = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    for (let j = 0; j < text.length; j++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(j);
      hash |= 0;
    }
  }
  return hash;
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
  profiler?: PaginationProfiler,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
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
  const flowBox = measureWithPaginationProfile(profiler, "flow-layout", () =>
    flowSection(section, contentX, contentWidth, measurer, wordBreaker, tocHeightOverrides, paragraphMeasurementCache),
  )
  // pageNumberOffset: when pageNumberStart is set, display number = globalPageIndex + 1 + offset
  const pageNumberOffset = section.page.pageNumberStart !== undefined
    ? section.page.pageNumberStart - startPageIndex - 1
    : 0
  const cursor: PageFlowCursor = { pageIndex: startPageIndex, cursorY: contentTop, pageNumberOffset }
  measureWithPaginationProfile(profiler, "page-packing", () =>
    paginateFlowBox(flowBox, section, measurer, pages, template, contentTop, contentBottom, cursor, undefined, wordBreaker, onSplitDecision, listNumbering, profiler, paragraphMeasurementCache),
  )

  if (pages.length === 0) pages.push(createEmptyPage(startPageIndex, metrics))

  // ─── Header / Footer ─────────────────────────────────────────────────────────
  const headerReserved = Math.max(0, section.page.headerReserved ?? 0)
  const footerReserved = Math.max(0, section.page.footerReserved ?? 0)
  const headerY = contentTop - headerReserved
  const footerY = contentBottom
  const headerZoneBox = { x: zoneHorizontalBox.x, y: headerY, width: zoneHorizontalBox.width, height: headerReserved }
  const footerZoneBox = { x: zoneHorizontalBox.x, y: footerY, width: zoneHorizontalBox.width, height: footerReserved }

  const defaultHeaderBox = flowZone(section, section.headerRootId, zoneHorizontalBox.x, headerY, zoneHorizontalBox.width, measurer, wordBreaker, paragraphMeasurementCache)
  const defaultFooterBox = flowZone(section, section.footerRootId, zoneHorizontalBox.x, footerY, zoneHorizontalBox.width, measurer, wordBreaker, paragraphMeasurementCache)

  // first page: undefined = ใช้ default, null = ไม่มี header/footer
  const hasFirstPageHeader = section.headerFirstPageRootId !== undefined
  const hasFirstPageFooter = section.footerFirstPageRootId !== undefined
  const firstPageHeaderBox = hasFirstPageHeader
    ? flowZone(section, section.headerFirstPageRootId, zoneHorizontalBox.x, headerY, zoneHorizontalBox.width, measurer, wordBreaker, paragraphMeasurementCache)
    : defaultHeaderBox
  const firstPageFooterBox = hasFirstPageFooter
    ? flowZone(section, section.footerFirstPageRootId, zoneHorizontalBox.x, footerY, zoneHorizontalBox.width, measurer, wordBreaker, paragraphMeasurementCache)
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

function tryPaginateSectionBodyBasicsIncrementally(
  section: DocumentSection,
  startPageIndex: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
  listNumbering?: ListNumberingPaginationContext,
  options: BodyBasicsSectionPaginationOptions = {},
  profiler?: PaginationProfiler,
): BodyBasicsSectionPaginationResult {
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    return {
      status: "unsupported",
      reason: "invalid-body-root",
      sectionId: section.id,
      nodeId: section.bodyRootId,
      nodeType: body?.type,
    }
  }

  for (const childId of body.childIds) {
    const node = section.nodes[childId]
    if (!node || !STREAMING_BODY_BASIC_NODE_TYPES.has(node.type)) {
      return {
        status: "unsupported",
        reason: "unsupported-body-child",
        sectionId: section.id,
        nodeId: childId,
        nodeType: node?.type ?? "missing",
      }
    }
  }

  const metrics = getPageMetrics(section.page)
  const template = createEmptyPage(startPageIndex, metrics)
  const pages: PaginatedPage[] = []
  const contentTop = metrics.contentBox.y
  const contentBottom = metrics.contentBox.y + metrics.contentBox.height
  const bodyPadding = Math.max(0, body.props.padding ?? 0)
  const contentX = metrics.contentBox.x + bodyPadding
  const contentWidth = Math.max(0, metrics.contentBox.width - bodyPadding * 2)
  const zoneHorizontalBox = resolveHeaderFooterHorizontalBox(section.page, metrics.contentBox, metrics.pageWidth)
  const pageNumberOffset = section.page.pageNumberStart !== undefined
    ? section.page.pageNumberStart - startPageIndex - 1
    : 0
  let cursor: PageFlowCursor = { pageIndex: startPageIndex, cursorY: contentTop, pageNumberOffset }
  const flowBoxes = body.childIds.map((childId) => {
    const node = section.nodes[childId]
    return node ? flowBodyBasicNode(node, contentX, contentWidth, measurer, wordBreaker) : null
  })
  let completedSection = true

  for (const [index, child] of flowBoxes.entries()) {
    if (!child) continue
    const node = section.nodes[child.nodeId]
    if (
      node?.type === "paragraph" &&
      (node.props.keepWithNext ?? false) &&
      index + 1 < flowBoxes.length
    ) {
      const nextChild = flowBoxes[index + 1]
      if (nextChild) {
        const combinedHeight = child.height + nextChild.height
        if (
          cursor.cursorY > contentTop + 1 &&
          shouldMoveBlockToNextPage(cursor.cursorY, combinedHeight, contentTop, contentBottom)
        ) {
          cursor = advancePage(cursor, contentTop)
        }
      }
    }

    cursor = paginateFlowBox(
      child,
      section,
      measurer,
      pages,
      template,
      contentTop,
      contentBottom,
      cursor,
      body.id,
      wordBreaker,
      onSplitDecision,
      listNumbering,
    )

    if (
      options.stopAfterPageIndex != null &&
      cursor.pageIndex > options.stopAfterPageIndex
    ) {
      completedSection = index === flowBoxes.length - 1
      break
    }
  }

  if (pages.length === 0) pages.push(createEmptyPage(startPageIndex, metrics))

  const headerReserved = Math.max(0, section.page.headerReserved ?? 0)
  const footerReserved = Math.max(0, section.page.footerReserved ?? 0)
  const headerY = contentTop - headerReserved
  const footerY = contentBottom
  const headerZoneBox = { x: zoneHorizontalBox.x, y: headerY, width: zoneHorizontalBox.width, height: headerReserved }
  const footerZoneBox = { x: zoneHorizontalBox.x, y: footerY, width: zoneHorizontalBox.width, height: footerReserved }

  const defaultHeaderBox = measureWithPaginationProfile(profiler, "flow-layout", () =>
    flowZone(section, section.headerRootId, zoneHorizontalBox.x, headerY, zoneHorizontalBox.width, measurer, wordBreaker),
  )
  const defaultFooterBox = measureWithPaginationProfile(profiler, "flow-layout", () =>
    flowZone(section, section.footerRootId, zoneHorizontalBox.x, footerY, zoneHorizontalBox.width, measurer, wordBreaker),
  )
  const hasFirstPageHeader = section.headerFirstPageRootId !== undefined
  const hasFirstPageFooter = section.footerFirstPageRootId !== undefined
  const firstPageHeaderBox = hasFirstPageHeader
    ? measureWithPaginationProfile(profiler, "flow-layout", () =>
        flowZone(section, section.headerFirstPageRootId, zoneHorizontalBox.x, headerY, zoneHorizontalBox.width, measurer, wordBreaker),
      )
    : defaultHeaderBox
  const firstPageFooterBox = hasFirstPageFooter
    ? measureWithPaginationProfile(profiler, "flow-layout", () =>
        flowZone(section, section.footerFirstPageRootId, zoneHorizontalBox.x, footerY, zoneHorizontalBox.width, measurer, wordBreaker),
      )
    : defaultFooterBox

  const defaultHeaderFragments = measureWithPaginationProfile(profiler, "fragment-generation", () =>
    buildZoneFragments(defaultHeaderBox, section, measurer, wordBreaker),
  )
  const defaultFooterFragments = measureWithPaginationProfile(profiler, "fragment-generation", () =>
    buildZoneFragments(defaultFooterBox, section, measurer, wordBreaker),
  )
  const firstPageHeaderFragments = hasFirstPageHeader
    ? measureWithPaginationProfile(profiler, "fragment-generation", () =>
        buildZoneFragments(firstPageHeaderBox, section, measurer, wordBreaker),
      )
    : defaultHeaderFragments
  const firstPageFooterFragments = hasFirstPageFooter
    ? measureWithPaginationProfile(profiler, "fragment-generation", () =>
        buildZoneFragments(firstPageFooterBox, section, measurer, wordBreaker),
      )
    : defaultFooterFragments

  const densePages = measureWithPaginationProfile(profiler, "fragment-generation", () =>
    pages.filter((p): p is PaginatedPage => p != null),
  )
  if (!completedSection) {
    while (densePages.length > 1 && densePages[densePages.length - 1].fragments.length === 0) {
      densePages.pop()
    }
  }

  densePages.forEach((page, idx) => {
    const isFirst = idx === 0
    const hFrags = isFirst ? firstPageHeaderFragments : defaultHeaderFragments
    const fFrags = isFirst ? firstPageFooterFragments : defaultFooterFragments
    page.headerFragments = measureWithPaginationProfile(profiler, "fragment-generation", () => cloneZoneFragmentsForPage(hFrags, page.index, pageNumberOffset))
    page.footerFragments = measureWithPaginationProfile(profiler, "fragment-generation", () => cloneZoneFragmentsForPage(fFrags, page.index, pageNumberOffset))
    page.headerZoneBox = { ...headerZoneBox }
    page.footerZoneBox = { ...footerZoneBox }
  })

  return {
    status: "supported",
    section: { sectionId: section.id, pages: densePages },
    completedSection,
  }
}

// ─── Document Entry ───────────────────────────────────────────────────────────

function runAllSections(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wb: WordBreaker,
  tocHeightOverrides?: Map<string, number>,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
  listNumbering?: ListNumberingPaginationContext,
  profiler?: PaginationProfiler,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): PaginatedSection[] {
  let pageIndex = 0
  const sections: PaginatedSection[] = []
  doc.document.sections.forEach((section, index) => {
    if (index > 0) pageIndex += 1
    const paginated = paginateSection(section, pageIndex, measurer, wb, tocHeightOverrides, onSplitDecision, listNumbering, profiler, paragraphMeasurementCache)
    sections.push(paginated)
    pageIndex += paginated.pages.length - 1
  })
  return sections
}

export function tryPaginateDocumentBodyBasicsIncrementally(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wordBreaker?: WordBreaker,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): TryPaginateDocumentBodyBasicsIncrementallyResult {
  const wb = wordBreaker ?? defaultWordBreaker
  const layoutDoc = resolveDocumentParagraphStyles(doc)
  const listNumbering: ListNumberingPaginationContext = {
    markers: resolveListMarkers(layoutDoc),
    styles: layoutDoc.document.listStyles ?? {},
  }
  let pageIndex = 0
  const sections: PaginatedSection[] = []

  for (const [index, section] of layoutDoc.document.sections.entries()) {
    if (index > 0) pageIndex += 1
    const result = tryPaginateSectionBodyBasicsIncrementally(
      section,
      pageIndex,
      measurer,
      wb,
      onSplitDecision,
      listNumbering,
    )
    if (result.status === "unsupported") return result
    sections.push(result.section)
    pageIndex += result.section.pages.length - 1
  }

  const tocEntries = collectTocEntries(sections, layoutDoc)
  return {
    status: "supported",
    paginated: { sections, tocEntries },
  }
}

export function tryPaginateDocumentBodyBasicsVisibleWindow(
  doc: DocumentNode,
  measurer: TextMeasurer,
  options: BodyBasicsVisibleWindowOptions,
  wordBreaker?: WordBreaker,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): TryPaginateDocumentBodyBasicsVisibleWindowResult {
  const requestedPageIndex = Math.max(0, Math.floor(options.pageIndex))
  const marginPages = Math.max(0, Math.floor(options.marginPages ?? 0))
  const stopAfterPageIndex = requestedPageIndex + marginPages
  const wb = wordBreaker ?? defaultWordBreaker
  const layoutDoc = resolveDocumentParagraphStyles(doc)
  const listNumbering: ListNumberingPaginationContext = {
    markers: resolveListMarkers(layoutDoc),
    styles: layoutDoc.document.listStyles ?? {},
  }
  let pageIndex = 0
  const sections: PaginatedSection[] = []
  let completedDocument = true

  for (const [index, section] of layoutDoc.document.sections.entries()) {
    if (index > 0) pageIndex += 1
    const result = tryPaginateSectionBodyBasicsIncrementally(
      section,
      pageIndex,
      measurer,
      wb,
      onSplitDecision,
      listNumbering,
      { stopAfterPageIndex },
    )
    if (result.status === "unsupported") return result
    sections.push(result.section)
    pageIndex += result.section.pages.length - 1
    const latestPageIndex = result.section.pages[result.section.pages.length - 1]?.index ?? pageIndex
    if (!result.completedSection || (latestPageIndex >= stopAfterPageIndex && index < layoutDoc.document.sections.length - 1)) {
      completedDocument = false
      break
    }
  }

  const tocEntries = collectTocEntries(sections, layoutDoc)
  const allPages = sections.flatMap((section) => section.pages)
  const endPageIndex = allPages.reduce((max, page) => Math.max(max, page.index), 0)

  return {
    status: "supported",
    paginated: { sections, tocEntries },
    coverage: {
      startPageIndex: 0,
      endPageIndex,
      requestedPageIndex,
      completedDocument,
    },
  }
}

function paginateDocumentUnprofiled(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wordBreaker?: WordBreaker,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
): PaginatedDocument {
  const wb = createCachedWordBreaker(wordBreaker ?? defaultWordBreaker)
  const paragraphMeasurementCache = createParagraphMeasurementCache()
  const layoutDoc = resolveDocumentParagraphStyles(doc)
  const listNumbering: ListNumberingPaginationContext = {
    markers: resolveListMarkers(layoutDoc),
    styles: layoutDoc.document.listStyles ?? {},
  }

  // Pass 1: paginate with estimated TOC heights
  const sections1 = runAllSections(layoutDoc, measurer, wb, undefined, onSplitDecision, listNumbering, undefined, paragraphMeasurementCache)
  const entries1 = collectTocEntries(sections1, layoutDoc)
  const overrides = computeTocOverrides(sections1, layoutDoc, entries1)

  if (overrides.size > 0) {
    // Pass 2: repaginate with corrected TOC heights; page numbers may shift
    const sections2 = runAllSections(layoutDoc, measurer, wb, overrides, onSplitDecision, listNumbering, undefined, paragraphMeasurementCache)
    const entries2 = collectTocEntries(sections2, layoutDoc)
    fillTocFragments(sections2, layoutDoc, entries2, measurer)
    return { sections: sections2, tocEntries: entries2 }
  }

  fillTocFragments(sections1, layoutDoc, entries1, measurer)
  return { sections: sections1, tocEntries: entries1 }
}

export function paginateDocument(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wordBreaker?: WordBreaker,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
  options: PaginateDocumentOptions = {},
): PaginatedDocument {
  const profiler = options.profiler ?? createPaginationProfiler({
    enabled: options.profilePagination === true,
    source: options.paginationProfileSource ?? "unknown",
  })
  if (!isPaginationProfilerEnabled(profiler)) {
    return paginateDocumentUnprofiled(doc, measurer, wordBreaker, onSplitDecision)
  }
  const measuredText = profileTextMeasurer(measurer, profiler)
  const wb = profileWordBreaker(createCachedWordBreaker(wordBreaker ?? defaultWordBreaker, profiler), profiler)
  const paragraphMeasurementCache = createParagraphMeasurementCache()
  profiler.note("style-resolve and list-state-preparation are isolated during document-prepare.")
  profiler.note("flow-layout includes the first flow-box construction pass, including paragraph and table cell measurement performed by the flow layer.")
  profiler.note("paragraph-measure covers paginator-side paragraph remeasurement; flow-layer paragraph measurement is visible through flow-layout, text-segmentation, and text-width-measure.")
  profiler.note("worker serialization/deserialization is approximated by the browser baseline as worker-overhead.")

  return measureWithPaginationProfile(profiler, "total", () => {
    let listNumbering: ListNumberingPaginationContext
    const layoutDoc = measureWithPaginationProfile(profiler, "document-prepare", () => {
      const resolved = measureWithPaginationProfile(profiler, "style-resolve", () => resolveDocumentParagraphStyles(doc))
      listNumbering = measureWithPaginationProfile(profiler, "list-state-preparation", () => ({
        markers: resolveListMarkers(resolved),
        styles: resolved.document.listStyles ?? {},
      }))
      return resolved
    })

    // Pass 1: paginate with estimated TOC heights
    const sections1 = runAllSections(layoutDoc, measuredText, wb, undefined, onSplitDecision, listNumbering!, profiler, paragraphMeasurementCache)
    const entries1 = measureWithPaginationProfile(profiler, "toc-heading-collection", () => collectTocEntries(sections1, layoutDoc))
    const overrides = measureWithPaginationProfile(profiler, "toc-heading-collection", () => computeTocOverrides(sections1, layoutDoc, entries1))

    if (overrides.size > 0) {
      // Pass 2: repaginate with corrected TOC heights; page numbers may shift
      const sections2 = runAllSections(layoutDoc, measuredText, wb, overrides, onSplitDecision, listNumbering!, profiler, paragraphMeasurementCache)
      const entries2 = measureWithPaginationProfile(profiler, "toc-heading-collection", () => collectTocEntries(sections2, layoutDoc))
      measureWithPaginationProfile(profiler, "fragment-generation", () => fillTocFragments(sections2, layoutDoc, entries2, measuredText))
      return { sections: sections2, tocEntries: entries2 }
    }

    measureWithPaginationProfile(profiler, "fragment-generation", () => fillTocFragments(sections1, layoutDoc, entries1, measuredText))
    return { sections: sections1, tocEntries: entries1 }
  })
}

export function paginateDocumentWithProfile(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wordBreaker?: WordBreaker,
  onSplitDecision?: (d: ParagraphSplitDecision) => void,
  options: Omit<PaginateDocumentOptions, "profilePagination"> = {},
): PaginateDocumentWithProfileResult {
  const profiler = options.profiler ?? createPaginationProfiler({
    enabled: true,
    source: options.paginationProfileSource ?? "unknown",
  })
  const paginated = paginateDocument(doc, measurer, wordBreaker, onSplitDecision, {
    ...options,
    profilePagination: true,
    profiler,
  })
  const summary = {
    ...collectPaginationDocumentCounts(doc),
    ...countPaginatedPagesAndFragments(paginated),
  }
  return {
    paginated,
    paginationProfile: profiler.flush(summary),
  }
}
