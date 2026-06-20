import type {
  AuthoredNode,
  ColumnNode,
  ColumnsNode,
  DocumentNode,
  DocumentSection,
  InlineNode,
  TableRowNode,
  TextBlockNode,
  UnitValue,
  ZoneNode,
  ZoneRole,
} from "../schema/document.js"
import type { NodeId, SectionId } from "../graph/relationshipGraph.js"
import { buildRelationshipGraph } from "../graph/relationshipGraph.js"
import {
  buildVNextPaginationPlan,
  type VNextPageBox,
  type VNextPaginationPlan,
  type VNextPaginationSourceItem,
  type VNextPaginationSplitPolicy,
} from "./paginationPlan.js"
import {
  createApproximateVNextTextMeasurer,
  measureVNextText,
  type VNextTextMeasurement,
  type VNextTextMeasurementCache,
  type VNextTextMeasurer,
} from "./textMeasurement.js"

export {
  createApproximateVNextTextMeasurer,
  createVNextTextMeasurementCache,
  createVNextTextMeasurementCacheKey,
  measureVNextText,
  resolveVNextTextMeasurementInvalidation,
} from "./textMeasurement.js"
export type {
  VNextTextMeasurement,
  VNextTextMeasurementCache,
  VNextTextMeasurementInput,
  VNextTextMeasurementInvalidation,
  VNextTextMeasurementLineBox,
  VNextTextMeasurer,
} from "./textMeasurement.js"

type FieldValue = string | number | boolean | null

export interface VNextMeasuredPaginationOptions {
  textMeasurer?: VNextTextMeasurer
  measurementCache?: VNextTextMeasurementCache
  measurementProfileId?: string
  data?: Record<string, FieldValue>
}

export interface VNextMeasuredPaginationWarning {
  code:
    | "forced-overflow"
    | "missing-source-item"
    | "static-zone-overflow"
    | "page-break-in-static-zone-ignored"
    | "page-break-in-columns-ignored"
    | "toc-page-resolution-pending"
    | "table-atomic-skeleton"
  sectionId: SectionId
  nodeId: NodeId
  pageIndex?: number
  message: string
}

export type VNextMeasuredFragmentKind =
  | "text"
  | "block"
  | "generated"
  | "forced-break"
  | "container"

export interface VNextMeasuredFragment {
  id: string
  sourceItemId: string
  sectionId: SectionId
  zoneId: NodeId
  zoneRole: ZoneRole
  nodeId: NodeId
  nodeType: AuthoredNode["type"]
  kind: VNextMeasuredFragmentKind
  pageIndex: number
  pageNumber: number
  xPt: number
  yPt: number
  widthPt: number
  heightPt: number
  sourceOrder: number
  splitPolicy: VNextPaginationSplitPolicy
  text?: string
  lineStart?: number
  lineEnd?: number
  continuesFromPreviousPage?: boolean
  continuesOnNextPage?: boolean
  metadata?: Record<string, string | number | boolean | null>
}

export interface VNextMeasuredPage {
  pageIndex: number
  sectionId: SectionId
  sectionPageIndex: number
  pageNumber: number
  pageBox: VNextPageBox
  fragments: VNextMeasuredFragment[]
  bodyFragmentIds: string[]
  headerFooterFragmentIds: string[]
}

export interface VNextMeasuredPagination {
  documentId: string
  source: "vnext-pagination-plan"
  status: "measured-skeleton"
  measurementStatus: "measured"
  paginationPlan: VNextPaginationPlan
  pages: VNextMeasuredPage[]
  pageCount: number
  warnings: VNextMeasuredPaginationWarning[]
}

interface LayoutState {
  page: VNextMeasuredPage
  yPt: number
}

interface LayoutArea {
  xPt: number
  widthPt: number
}

interface ColumnLayoutArea extends LayoutArea {
  columnsId: NodeId
  columnId: NodeId
  columnIndex: number
  columnCount: number
}

interface MeasurementContext {
  documentId: string
  textMeasurer: VNextTextMeasurer
  measurementCache?: VNextTextMeasurementCache
  measurementProfileId?: string
  data: Record<string, FieldValue>
}

function unitToPt(value: UnitValue): number {
  if (value.unit === "pt") return value.value
  return Number(((value.value * 72) / 25.4).toFixed(2))
}

function inlineText(inlines: readonly InlineNode[], data: Record<string, FieldValue>, pageNumber: number): string {
  return inlines.map((inline) => {
    if (inline.type === "text") return inline.text
    if (inline.type === "line-break") return "\n"
    if (inline.type === "page-number") return String(pageNumber)

    const value = data[inline.key]
    if (value != null) return String(value)
    return inline.fallback ?? inline.label ?? inline.key
  }).join("")
}

function sourceKey(sectionId: SectionId, nodeId: NodeId): string {
  return `${sectionId}:${nodeId}`
}

function bodyBottom(pageBox: VNextPageBox): number {
  return pageBox.contentYPt + pageBox.contentHeightPt
}

function remainingBodyHeight(state: LayoutState): number {
  return bodyBottom(state.page.pageBox) - state.yPt
}

function fragmentAreaForStaticZone(pageBox: VNextPageBox, zoneRole: ZoneRole): {
  xPt: number
  yPt: number
  widthPt: number
  maxHeightPt: number
} {
  const fullWidth = pageBox.headerFooterHorizontalMode === "full"
  const xPt = fullWidth ? 0 : pageBox.contentXPt
  const widthPt = fullWidth ? pageBox.widthPt : pageBox.contentWidthPt

  if (zoneRole === "footer" || zoneRole === "first-page-footer") {
    return {
      xPt,
      yPt: pageBox.heightPt - pageBox.marginPt.bottom - pageBox.footerReservedPt,
      widthPt,
      maxHeightPt: pageBox.footerReservedPt,
    }
  }

  return {
    xPt,
    yPt: pageBox.marginPt.top,
    widthPt,
    maxHeightPt: pageBox.headerReservedPt,
  }
}

function columnLayoutAreas(
  section: DocumentSection,
  columns: ColumnsNode,
  area: LayoutArea,
): ColumnLayoutArea[] {
  const columnCount = columns.columnIds.length
  const gapPt = columns.props.gap ?? 0
  const availableWidthPt = Math.max(1, area.widthPt - gapPt * Math.max(0, columnCount - 1))
  const shares = columns.columnIds.map((columnId) => {
    const column = section.nodes[columnId]
    return column?.type === "column" ? column.props.widthShare ?? 100 / columnCount : 100 / columnCount
  })
  const totalShare = shares.reduce((sum, share) => sum + share, 0) || 100
  let xPt = area.xPt

  return columns.columnIds.map((columnId, columnIndex) => {
    const widthPt = columnIndex === columnCount - 1
      ? Math.max(1, area.xPt + area.widthPt - xPt)
      : Math.max(1, Number(((availableWidthPt * shares[columnIndex]) / totalShare).toFixed(2)))
    const columnArea: ColumnLayoutArea = {
      xPt,
      widthPt,
      columnsId: columns.id,
      columnId,
      columnIndex,
      columnCount,
    }
    xPt += widthPt + gapPt
    return columnArea
  })
}

function textBlockText(
  node: TextBlockNode,
  data: Record<string, FieldValue>,
  pageNumber: number,
): string {
  return inlineText(node.children, data, pageNumber)
}

function textStyleKeyForNode(node: AuthoredNode): string {
  if (node.type !== "text-block") return `${node.type}:default`
  const roleKey = node.role.role === "heading" ? `heading:${node.role.level}` : node.role.role
  return node.props.textStyleId ?? `text-block:${roleKey}`
}

function measurementMetadata(measurement: VNextTextMeasurement): Record<string, string | number | boolean | null> {
  return {
    measurementCacheKey: measurement.cacheKey,
    measurementCacheStatus: measurement.cacheStatus,
    measurementProfileId: measurement.measurementProfileId,
    lineCount: measurement.lines.length,
  }
}

function measureNodeText(
  context: MeasurementContext,
  sectionId: SectionId,
  node: AuthoredNode,
  text: string,
  availableWidthPt: number,
): VNextTextMeasurement {
  return measureVNextText({
    documentId: context.documentId,
    sectionId,
    nodeId: node.id,
    text,
    availableWidthPt,
    styleKey: textStyleKeyForNode(node),
    measurementProfileId: context.measurementProfileId,
  }, context.textMeasurer, context.measurementCache)
}

function tocText(document: DocumentNode, node: Extract<AuthoredNode, { type: "toc" }>): string {
  const title = node.props.title ?? "Contents"
  const maxLevel = node.props.maxLevel ?? 6
  const headings = document.document.sections.flatMap((section) => (
    Object.values(section.nodes)
      .filter((candidate): candidate is TextBlockNode => (
        candidate.type === "text-block" &&
        candidate.role.role === "heading" &&
        candidate.role.level <= maxLevel
      ))
      .map((heading) => inlineText(heading.children, {}, 0).replace(/\n/g, " "))
  ))

  return [title, ...headings.map((heading) => `${heading} .... ?`)].join("\n")
}

function estimateChildrenHeight(
  document: DocumentNode,
  section: DocumentSection,
  childIds: readonly NodeId[],
  availableWidthPt: number,
  pageNumber: number,
  context: MeasurementContext,
): number {
  return childIds.reduce((total, childId) => {
    const child = section.nodes[childId]
    return total + (child == null ? 0 : estimateNodeHeight(document, section, child, availableWidthPt, pageNumber, context))
  }, 0)
}

function estimateTableRowHeight(
  document: DocumentNode,
  section: DocumentSection,
  row: TableRowNode,
  availableWidthPt: number,
  pageNumber: number,
  context: MeasurementContext,
): number {
  if (row.props.height != null) return unitToPt(row.props.height)

  const cellWidthPt = Math.max(1, availableWidthPt / row.cellIds.length)
  const cellContentHeight = row.cellIds.reduce((maxHeight, cellId) => {
    const cell = section.nodes[cellId]
    if (cell?.type !== "table-cell") return maxHeight
    const height = estimateNodeHeight(document, section, cell, cellWidthPt, pageNumber, context)
    return Math.max(maxHeight, height)
  }, 0)

  return Math.max(24, cellContentHeight + 8)
}

function estimateNodeHeight(
  document: DocumentNode,
  section: DocumentSection,
  node: AuthoredNode,
  availableWidthPt: number,
  pageNumber: number,
  context: MeasurementContext,
): number {
  if (node.type === "text-block") {
    return measureNodeText(context, section.id, node, textBlockText(node, context.data, pageNumber), availableWidthPt).heightPt
  }

  if (node.type === "divider") {
    return unitToPt(node.props.marginBefore) + unitToPt(node.props.thickness) + unitToPt(node.props.marginAfter)
  }

  if (node.type === "spacer") return node.props.height
  if (node.type === "page-break") return 0

  if (node.type === "toc") {
    return measureNodeText(context, section.id, node, tocText(document, node), availableWidthPt).heightPt
  }

  if (node.type === "zone" || node.type === "column" || node.type === "table-cell") {
    return estimateChildrenHeight(document, section, node.childIds, availableWidthPt, pageNumber, context)
  }

  if (node.type === "columns") {
    const columnHeights = columnLayoutAreas(section, node, { xPt: 0, widthPt: availableWidthPt }).map((columnArea) => {
      const column = section.nodes[columnArea.columnId]
      if (column?.type !== "column") return 0
      return Math.max(
        column.props.minHeight ?? 0,
        estimateNodeHeight(document, section, column, columnArea.widthPt, pageNumber, context),
      )
    })

    return Math.max(node.props.minHeight ?? 0, ...columnHeights, 0)
  }

  if (node.type === "table") {
    const marginTopPt = node.props.marginTop == null ? 0 : unitToPt(node.props.marginTop)
    const marginBottomPt = node.props.marginBottom == null ? 0 : unitToPt(node.props.marginBottom)
    const rowHeight = node.rowIds.reduce((total, rowId) => {
      const row = section.nodes[rowId]
      return total + (row?.type === "table-row"
        ? estimateTableRowHeight(document, section, row, availableWidthPt, pageNumber, context)
        : 0)
    }, 0)

    return marginTopPt + rowHeight + marginBottomPt
  }

  if (node.type === "table-row") {
    return estimateTableRowHeight(document, section, node, availableWidthPt, pageNumber, context)
  }

  return 0
}

function staticZoneForPage(section: DocumentSection, page: VNextMeasuredPage, header: boolean): ZoneNode | null {
  const firstPageRole: ZoneRole = header ? "first-page-header" : "first-page-footer"
  const regularRole: ZoneRole = header ? "header" : "footer"
  const firstPageZone = page.sectionPageIndex === 0
    ? section.zoneIds.map((zoneId) => section.nodes[zoneId]).find((node): node is ZoneNode => node?.type === "zone" && node.role === firstPageRole)
    : null

  if (firstPageZone != null) return firstPageZone

  return section.zoneIds.map((zoneId) => section.nodes[zoneId]).find((node): node is ZoneNode => (
    node?.type === "zone" && node.role === regularRole
  )) ?? null
}

export function paginateVNextDocument(
  document: DocumentNode,
  options: VNextMeasuredPaginationOptions = {},
): VNextMeasuredPagination {
  buildRelationshipGraph(document)
  const paginationPlan = buildVNextPaginationPlan(document)
  const textMeasurer = options.textMeasurer ?? createApproximateVNextTextMeasurer()
  const data = options.data ?? {}
  const measurementContext: MeasurementContext = {
    documentId: document.document.id,
    textMeasurer,
    measurementCache: options.measurementCache,
    measurementProfileId: options.measurementProfileId,
    data,
  }
  const sourceItemsByKey = new Map<string, VNextPaginationSourceItem>()
  const pages: VNextMeasuredPage[] = []
  const warnings: VNextMeasuredPaginationWarning[] = []
  let nextAutoPageNumber = 1
  let fragmentSequence = 0

  paginationPlan.sourceItems.forEach((sourceItem) => {
    sourceItemsByKey.set(sourceKey(sourceItem.sectionId, sourceItem.nodeId), sourceItem)
  })

  const addWarning = (warning: VNextMeasuredPaginationWarning): void => {
    warnings.push(warning)
  }

  const addFragment = (
    page: VNextMeasuredPage,
    zone: ZoneNode,
    node: AuthoredNode,
    kind: VNextMeasuredFragmentKind,
    geometry: { xPt: number; yPt: number; widthPt: number; heightPt: number },
    extra: Partial<Pick<
      VNextMeasuredFragment,
      "text" | "lineStart" | "lineEnd" | "continuesFromPreviousPage" | "continuesOnNextPage" | "metadata"
    >> = {},
  ): VNextMeasuredFragment => {
    const sourceItem = sourceItemsByKey.get(sourceKey(page.sectionId, node.id))
    if (sourceItem == null) {
      addWarning({
        code: "missing-source-item",
        sectionId: page.sectionId,
        nodeId: node.id,
        pageIndex: page.pageIndex,
        message: `No pagination source item found for node "${node.id}".`,
      })
    }

    const fragment: VNextMeasuredFragment = {
      id: `${page.sectionId}:${node.id}:fragment-${fragmentSequence}`,
      sourceItemId: sourceItem?.id ?? sourceKey(page.sectionId, node.id),
      sectionId: page.sectionId,
      zoneId: zone.id,
      zoneRole: zone.role,
      nodeId: node.id,
      nodeType: node.type,
      kind,
      pageIndex: page.pageIndex,
      pageNumber: page.pageNumber,
      xPt: Number(geometry.xPt.toFixed(2)),
      yPt: Number(geometry.yPt.toFixed(2)),
      widthPt: Number(geometry.widthPt.toFixed(2)),
      heightPt: Number(geometry.heightPt.toFixed(2)),
      sourceOrder: sourceItem?.order ?? Number.MAX_SAFE_INTEGER,
      splitPolicy: sourceItem?.splitPolicy ?? "atomic",
      ...extra,
    }
    fragmentSequence += 1
    page.fragments.push(fragment)

    if (zone.role === "body") {
      page.bodyFragmentIds.push(fragment.id)
    } else {
      page.headerFooterFragmentIds.push(fragment.id)
    }

    return fragment
  }

  document.document.sections.forEach((section) => {
    const planSection = paginationPlan.sections.find((candidate) => candidate.sectionId === section.id)
    if (planSection == null) return

    const pageBox = planSection.pageBox
    const sectionPages: VNextMeasuredPage[] = []
    const displayStart = section.page.pageNumberStart ?? nextAutoPageNumber
    let sectionPageIndex = 0

    const createPage = (): VNextMeasuredPage => {
      const page: VNextMeasuredPage = {
        pageIndex: pages.length,
        sectionId: section.id,
        sectionPageIndex,
        pageNumber: displayStart + sectionPageIndex,
        pageBox,
        fragments: [],
        bodyFragmentIds: [],
        headerFooterFragmentIds: [],
      }
      sectionPageIndex += 1
      pages.push(page)
      sectionPages.push(page)
      return page
    }

    let state: LayoutState = {
      page: createPage(),
      yPt: pageBox.contentYPt,
    }

    const moveToNextPage = (): void => {
      state = {
        page: createPage(),
        yPt: pageBox.contentYPt,
      }
    }

    const ensureBlockSpace = (node: AuthoredNode, heightPt: number): void => {
      if (heightPt > pageBox.contentHeightPt) {
        addWarning({
          code: "forced-overflow",
          sectionId: section.id,
          nodeId: node.id,
          pageIndex: state.page.pageIndex,
          message: `Node "${node.id}" is taller than the body content area.`,
        })
      }

      if (heightPt > remainingBodyHeight(state) && state.page.bodyFragmentIds.length > 0) {
        moveToNextPage()
      }
    }

    const bodyLayoutArea = (): LayoutArea => ({
      xPt: pageBox.contentXPt,
      widthPt: pageBox.contentWidthPt,
    })

    const placeBlock = (
      zone: ZoneNode,
      node: AuthoredNode,
      kind: VNextMeasuredFragmentKind,
      heightPt: number,
      metadata?: Record<string, string | number | boolean | null>,
      area: LayoutArea = bodyLayoutArea(),
    ): void => {
      ensureBlockSpace(node, heightPt)
      addFragment(
        state.page,
        zone,
        node,
        kind,
        {
          xPt: area.xPt,
          yPt: state.yPt,
          widthPt: area.widthPt,
          heightPt,
        },
        metadata == null ? {} : { metadata },
      )
      state.yPt += heightPt
    }

    const layoutTextBlock = (zone: ZoneNode, node: TextBlockNode, area: LayoutArea = bodyLayoutArea()): void => {
      const measurement = measureNodeText(
        measurementContext,
        section.id,
        node,
        textBlockText(node, data, state.page.pageNumber),
        area.widthPt,
      )
      const lines = measurement.lines.length > 0 ? measurement.lines : [""]
      let lineIndex = 0

      while (lineIndex < lines.length) {
        if (remainingBodyHeight(state) < measurement.lineHeightPt && state.page.bodyFragmentIds.length > 0) {
          moveToNextPage()
        }

        const capacity = Math.max(1, Math.floor(remainingBodyHeight(state) / measurement.lineHeightPt))
        const take = Math.min(capacity, lines.length - lineIndex)
        const heightPt = take * measurement.lineHeightPt

        if (heightPt > pageBox.contentHeightPt) {
          addWarning({
            code: "forced-overflow",
            sectionId: section.id,
            nodeId: node.id,
            pageIndex: state.page.pageIndex,
            message: `Text line for "${node.id}" is taller than the body content area.`,
          })
        }

        addFragment(
          state.page,
          zone,
          node,
          "text",
          {
            xPt: area.xPt,
            yPt: state.yPt,
            widthPt: area.widthPt,
            heightPt,
          },
          {
            text: lines.slice(lineIndex, lineIndex + take).join("\n"),
            lineStart: lineIndex,
            lineEnd: lineIndex + take,
            continuesFromPreviousPage: lineIndex > 0,
            continuesOnNextPage: lineIndex + take < lines.length,
            metadata: measurementMetadata(measurement),
          },
        )

        state.yPt += heightPt
        lineIndex += take

        if (lineIndex < lines.length) moveToNextPage()
      }
    }

    const addColumnBlockFragment = (
      zone: ZoneNode,
      node: AuthoredNode,
      area: ColumnLayoutArea,
      yPt: number,
      heightPt: number,
      kind: VNextMeasuredFragmentKind,
      metadata: Record<string, string | number | boolean | null> = {},
    ): void => {
      addFragment(
        state.page,
        zone,
        node,
        kind,
        {
          xPt: area.xPt,
          yPt,
          widthPt: area.widthPt,
          heightPt,
        },
        {
          metadata: {
            ...metadata,
            columnsId: area.columnsId,
            columnId: area.columnId,
            columnIndex: area.columnIndex,
            columnCount: area.columnCount,
          },
        },
      )
    }

    const layoutColumnTextBlock = (
      zone: ZoneNode,
      node: TextBlockNode,
      area: ColumnLayoutArea,
      cursor: { yPt: number },
    ): void => {
      const measurement = measureNodeText(
        measurementContext,
        section.id,
        node,
        textBlockText(node, data, state.page.pageNumber),
        area.widthPt,
      )
      addColumnBlockFragment(
        zone,
        node,
        area,
        cursor.yPt,
        measurement.heightPt,
        "text",
        {
          ...measurementMetadata(measurement),
          lineStart: 0,
          lineEnd: measurement.lines.length,
        },
      )
      const fragment = state.page.fragments.at(-1)
      if (fragment != null && fragment.nodeId === node.id) {
        fragment.text = measurement.lines.join("\n")
        fragment.lineStart = 0
        fragment.lineEnd = measurement.lines.length
      }
      cursor.yPt += measurement.heightPt
    }

    const layoutColumnNode = (
      zone: ZoneNode,
      nodeId: NodeId,
      area: ColumnLayoutArea,
      cursor: { yPt: number },
    ): void => {
      const node = section.nodes[nodeId]
      if (node == null) return

      if (node.type === "text-block") {
        layoutColumnTextBlock(zone, node, area, cursor)
        return
      }

      if (node.type === "page-break") {
        addWarning({
          code: "page-break-in-columns-ignored",
          sectionId: section.id,
          nodeId: node.id,
          pageIndex: state.page.pageIndex,
          message: `Page break "${node.id}" in columns "${area.columnsId}" is ignored.`,
        })
        return
      }

      if (node.type === "column" || node.type === "table-cell" || node.type === "zone") {
        node.childIds.forEach((childId) => layoutColumnNode(zone, childId, area, cursor))
        return
      }

      const heightPt = estimateNodeHeight(document, section, node, area.widthPt, state.page.pageNumber, measurementContext)
      const kind: VNextMeasuredFragmentKind = node.type === "toc"
        ? "generated"
        : node.type === "table" || node.type === "columns"
          ? "container"
          : "block"
      addColumnBlockFragment(zone, node, area, cursor.yPt, heightPt, kind)
      cursor.yPt += heightPt
    }

    const layoutColumns = (zone: ZoneNode, node: ColumnsNode): void => {
      const bodyArea = bodyLayoutArea()
      const areas = columnLayoutAreas(section, node, bodyArea)
      const columnHeights = areas.map((area) => {
        const column = section.nodes[area.columnId]
        if (column?.type !== "column") return 0
        return Math.max(
          column.props.minHeight ?? 0,
          estimateNodeHeight(document, section, column, area.widthPt, state.page.pageNumber, measurementContext),
        )
      })
      const heightPt = Math.max(node.props.minHeight ?? 0, ...columnHeights, 0)
      ensureBlockSpace(node, heightPt)
      const topYPt = state.yPt

      addFragment(
        state.page,
        zone,
        node,
        "container",
        {
          xPt: bodyArea.xPt,
          yPt: topYPt,
          widthPt: bodyArea.widthPt,
          heightPt,
        },
        {
          metadata: {
            columnCount: areas.length,
            gapPt: node.props.gap ?? 0,
            measuredAs: "columns-fragments",
          },
        },
      )

      areas.forEach((area) => {
        const column = section.nodes[area.columnId]
        if (column?.type !== "column") return
        const cursor = { yPt: topYPt }
        addColumnBlockFragment(zone, column, area, cursor.yPt, columnHeights[area.columnIndex], "container", {
          measuredAs: "column-container",
        })
        column.childIds.forEach((childId) => layoutColumnNode(zone, childId, area, cursor))
      })

      state.yPt = topYPt + heightPt
    }

    const layoutNode = (zone: ZoneNode, nodeId: NodeId): void => {
      const node = section.nodes[nodeId]
      if (node == null) return

      if (node.type === "text-block") {
        layoutTextBlock(zone, node)
        return
      }

      if (node.type === "page-break") {
        addFragment(
          state.page,
          zone,
          node,
          "forced-break",
          {
            xPt: pageBox.contentXPt,
            yPt: state.yPt,
            widthPt: pageBox.contentWidthPt,
            heightPt: 0,
          },
        )
        moveToNextPage()
        return
      }

      if (node.type === "zone" || node.type === "column" || node.type === "table-cell") {
        node.childIds.forEach((childId) => layoutNode(zone, childId))
        return
      }

      if (node.type === "columns") {
        layoutColumns(zone, node)
        return
      }

      if (node.type === "table") {
        addWarning({
          code: "table-atomic-skeleton",
          sectionId: section.id,
          nodeId: node.id,
          pageIndex: state.page.pageIndex,
          message: `Table node "${node.id}" is measured as one fragment in this skeleton.`,
        })
        placeBlock(zone, node, "container", estimateNodeHeight(document, section, node, pageBox.contentWidthPt, state.page.pageNumber, measurementContext), {
          rowCount: node.rowIds.length,
        })
        return
      }

      if (node.type === "toc") {
        addWarning({
          code: "toc-page-resolution-pending",
          sectionId: section.id,
          nodeId: node.id,
          pageIndex: state.page.pageIndex,
          message: `TOC node "${node.id}" uses placeholder page numbers in this skeleton.`,
        })
        const measurement = measureNodeText(measurementContext, section.id, node, tocText(document, node), pageBox.contentWidthPt)
        placeBlock(zone, node, "generated", measurement.heightPt, measurementMetadata(measurement))
        return
      }

      placeBlock(
        zone,
        node,
        "block",
        estimateNodeHeight(document, section, node, pageBox.contentWidthPt, state.page.pageNumber, measurementContext),
      )
    }

    section.zoneIds.forEach((zoneId) => {
      const zone = section.nodes[zoneId]
      if (zone?.type !== "zone" || zone.role !== "body") return
      zone.childIds.forEach((childId) => layoutNode(zone, childId))
    })

    const placeStaticNode = (page: VNextMeasuredPage, zone: ZoneNode, node: AuthoredNode, cursor: { yPt: number }, area: ReturnType<typeof fragmentAreaForStaticZone>): void => {
      if (node.type === "page-break") {
        addWarning({
          code: "page-break-in-static-zone-ignored",
          sectionId: section.id,
          nodeId: node.id,
          pageIndex: page.pageIndex,
          message: `Page break "${node.id}" in static zone "${zone.id}" is ignored.`,
        })
        return
      }

      const heightPt = estimateNodeHeight(document, section, node, area.widthPt, page.pageNumber, measurementContext)
      const commonGeometry = {
        xPt: area.xPt,
        yPt: cursor.yPt,
        widthPt: area.widthPt,
        heightPt,
      }

      if (node.type === "text-block") {
        const text = textBlockText(node, data, page.pageNumber)
        const measurement = measureNodeText(measurementContext, section.id, node, text, area.widthPt)
        addFragment(page, zone, node, "text", commonGeometry, {
          text: measurement.lines.join("\n"),
          lineStart: 0,
          lineEnd: measurement.lines.length,
          metadata: measurementMetadata(measurement),
        })
      } else if (node.type === "toc") {
        addFragment(page, zone, node, "generated", commonGeometry, { metadata: { generated: true } })
      } else if (node.type === "zone" || node.type === "column" || node.type === "table-cell") {
        node.childIds.forEach((childId) => {
          const child = section.nodes[childId]
          if (child != null) placeStaticNode(page, zone, child, cursor, area)
        })
        return
      } else {
        addFragment(page, zone, node, "block", commonGeometry)
      }

      cursor.yPt += heightPt
      if (cursor.yPt > area.yPt + area.maxHeightPt) {
        addWarning({
          code: "static-zone-overflow",
          sectionId: section.id,
          nodeId: node.id,
          pageIndex: page.pageIndex,
          message: `Static zone "${zone.id}" content exceeds its reserved area.`,
        })
      }
    }

    const decorateStaticZone = (page: VNextMeasuredPage, zone: ZoneNode | null): void => {
      if (zone == null) return
      const area = fragmentAreaForStaticZone(page.pageBox, zone.role)
      const cursor = { yPt: area.yPt }
      zone.childIds.forEach((childId) => {
        const child = section.nodes[childId]
        if (child != null) placeStaticNode(page, zone, child, cursor, area)
      })
    }

    sectionPages.forEach((page) => {
      decorateStaticZone(page, staticZoneForPage(section, page, true))
      decorateStaticZone(page, staticZoneForPage(section, page, false))
      page.fragments.sort((left, right) => (
        left.yPt - right.yPt ||
        left.sourceOrder - right.sourceOrder ||
        left.id.localeCompare(right.id)
      ))
    })

    const lastPage = sectionPages.at(-1)
    nextAutoPageNumber = lastPage == null ? displayStart : lastPage.pageNumber + 1
  })

  return {
    documentId: document.document.id,
    source: "vnext-pagination-plan",
    status: "measured-skeleton",
    measurementStatus: "measured",
    paginationPlan,
    pages,
    pageCount: pages.length,
    warnings,
  }
}
