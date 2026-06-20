import type { VNextMeasuredFragment, VNextMeasuredPagination } from "./measuredPagination.js"

type MetadataValue = string | number | boolean | null

export type VNextMeasuredRendererConsumptionIssueCode =
  | "invalid-fragment-geometry"
  | "table-fragment-missing-metadata"
  | "table-row-without-table-segment"
  | "table-cell-without-row"
  | "table-child-without-cell"
  | "table-text-missing-line-range"

export interface VNextMeasuredRendererConsumptionIssue {
  severity: "blocking" | "warning"
  code: VNextMeasuredRendererConsumptionIssueCode
  sectionId: string
  nodeId: string
  fragmentId: string
  pageIndex: number
  message: string
}

export interface VNextMeasuredTableRenderMetadata {
  tableId: string
  tableSegmentIndex?: number
  rowId?: string
  cellId?: string
  rowIndex?: number
  cellIndex?: number
  columnIndex?: number
  columnCount?: number
  isHeaderRow?: boolean
  isRepeatedHeader?: boolean
  isSplitRow?: boolean
  rowSplitIndex?: number
  continuesFromPreviousPage?: boolean
  continuesOnNextPage?: boolean
  cellChildPolicy?: string
}

export interface VNextMeasuredRenderCommand {
  id: string
  fragmentId: string
  sourceItemId: string
  pageIndex: number
  pageNumber: number
  sectionId: string
  zoneId: string
  zoneRole: VNextMeasuredFragment["zoneRole"]
  nodeId: string
  nodeType: VNextMeasuredFragment["nodeType"]
  kind: VNextMeasuredFragment["kind"]
  bounds: {
    xPt: number
    yPt: number
    widthPt: number
    heightPt: number
  }
  text?: string
  lineStart?: number
  lineEnd?: number
  continuesFromPreviousPage?: boolean
  continuesOnNextPage?: boolean
  table?: VNextMeasuredTableRenderMetadata
}

export interface VNextMeasuredRendererConsumption {
  source: "vnext-measured-pagination"
  status: "consumable" | "blocked"
  pageCount: number
  commandCount: number
  rendererContract: {
    consumes: "measured-pagination-fragments"
    requiresAuthoredDocumentForLayout: false
    mayRelayout: false
  }
  commands: VNextMeasuredRenderCommand[]
  blockingIssues: VNextMeasuredRendererConsumptionIssue[]
  warningIssues: VNextMeasuredRendererConsumptionIssue[]
}

function metadataValue(
  fragment: VNextMeasuredFragment,
  key: string,
): MetadataValue | undefined {
  return fragment.metadata?.[key]
}

function metadataString(fragment: VNextMeasuredFragment, key: string): string | undefined {
  const value = metadataValue(fragment, key)
  return typeof value === "string" ? value : undefined
}

function metadataNumber(fragment: VNextMeasuredFragment, key: string): number | undefined {
  const value = metadataValue(fragment, key)
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function metadataBoolean(fragment: VNextMeasuredFragment, key: string): boolean | undefined {
  const value = metadataValue(fragment, key)
  return typeof value === "boolean" ? value : undefined
}

function tableMetadata(fragment: VNextMeasuredFragment): VNextMeasuredTableRenderMetadata | undefined {
  const tableId = metadataString(fragment, "tableId")
  if (tableId == null) return undefined

  return {
    tableId,
    tableSegmentIndex: metadataNumber(fragment, "tableSegmentIndex"),
    rowId: metadataString(fragment, "rowId"),
    cellId: metadataString(fragment, "cellId"),
    rowIndex: metadataNumber(fragment, "rowIndex"),
    cellIndex: metadataNumber(fragment, "cellIndex"),
    columnIndex: metadataNumber(fragment, "columnIndex"),
    columnCount: metadataNumber(fragment, "columnCount"),
    isHeaderRow: metadataBoolean(fragment, "isHeaderRow"),
    isRepeatedHeader: metadataBoolean(fragment, "isRepeatedHeader"),
    isSplitRow: metadataBoolean(fragment, "isSplitRow"),
    rowSplitIndex: metadataNumber(fragment, "rowSplitIndex"),
    continuesFromPreviousPage: metadataBoolean(fragment, "continuesFromPreviousPage"),
    continuesOnNextPage: metadataBoolean(fragment, "continuesOnNextPage"),
    cellChildPolicy: metadataString(fragment, "cellChildPolicy"),
  }
}

function rowInstanceKey(command: VNextMeasuredRenderCommand): string | null {
  if (command.table?.rowId == null) return null
  return [
    command.pageIndex,
    command.table.tableId,
    command.table.rowId,
    command.table.rowSplitIndex ?? "whole",
  ].join(":")
}

function cellInstanceKey(command: VNextMeasuredRenderCommand): string | null {
  const rowKey = rowInstanceKey(command)
  if (rowKey == null || command.table?.cellId == null) return null
  return `${rowKey}:${command.table.cellId}`
}

function geometryIsValid(fragment: VNextMeasuredFragment): boolean {
  return [fragment.xPt, fragment.yPt, fragment.widthPt, fragment.heightPt].every(Number.isFinite) &&
    fragment.widthPt >= 0 &&
    fragment.heightPt >= 0
}

function commandFromFragment(fragment: VNextMeasuredFragment): VNextMeasuredRenderCommand {
  return {
    id: `render:${fragment.id}`,
    fragmentId: fragment.id,
    sourceItemId: fragment.sourceItemId,
    pageIndex: fragment.pageIndex,
    pageNumber: fragment.pageNumber,
    sectionId: fragment.sectionId,
    zoneId: fragment.zoneId,
    zoneRole: fragment.zoneRole,
    nodeId: fragment.nodeId,
    nodeType: fragment.nodeType,
    kind: fragment.kind,
    bounds: {
      xPt: fragment.xPt,
      yPt: fragment.yPt,
      widthPt: fragment.widthPt,
      heightPt: fragment.heightPt,
    },
    text: fragment.text,
    lineStart: fragment.lineStart,
    lineEnd: fragment.lineEnd,
    continuesFromPreviousPage: fragment.continuesFromPreviousPage,
    continuesOnNextPage: fragment.continuesOnNextPage,
    table: tableMetadata(fragment),
  }
}

function addIssue(
  issues: VNextMeasuredRendererConsumptionIssue[],
  fragment: VNextMeasuredFragment,
  code: VNextMeasuredRendererConsumptionIssueCode,
  message: string,
): void {
  issues.push({
    severity: "blocking",
    code,
    sectionId: fragment.sectionId,
    nodeId: fragment.nodeId,
    fragmentId: fragment.id,
    pageIndex: fragment.pageIndex,
    message,
  })
}

function auditTableMetadata(
  issues: VNextMeasuredRendererConsumptionIssue[],
  fragment: VNextMeasuredFragment,
  command: VNextMeasuredRenderCommand,
): void {
  const table = command.table
  const isTableAuthoredFragment = fragment.nodeType === "table" ||
    fragment.nodeType === "table-row" ||
    fragment.nodeType === "table-cell"

  if (isTableAuthoredFragment && table == null) {
    addIssue(
      issues,
      fragment,
      "table-fragment-missing-metadata",
      `Table fragment "${fragment.id}" is missing renderer table metadata.`,
    )
    return
  }

  if (table == null) return

  if (fragment.nodeType === "table" && (
    table.tableSegmentIndex == null ||
    table.columnCount == null
  )) {
    addIssue(
      issues,
      fragment,
      "table-fragment-missing-metadata",
      `Table segment fragment "${fragment.id}" is missing segment metadata.`,
    )
  }

  if (fragment.nodeType === "table-row" && (
    table.rowId == null ||
    table.rowIndex == null
  )) {
    addIssue(
      issues,
      fragment,
      "table-fragment-missing-metadata",
      `Table row fragment "${fragment.id}" is missing row metadata.`,
    )
  }

  if (fragment.nodeType === "table-cell" && (
    table.rowId == null ||
    table.cellId == null ||
    table.rowIndex == null ||
    table.cellIndex == null ||
    table.columnIndex == null
  )) {
    addIssue(
      issues,
      fragment,
      "table-fragment-missing-metadata",
      `Table cell fragment "${fragment.id}" is missing cell metadata.`,
    )
  }

  if (
    fragment.nodeType !== "table" &&
    fragment.nodeType !== "table-row" &&
    fragment.nodeType !== "table-cell" &&
    (
      table.rowId == null ||
      table.cellId == null
    )
  ) {
    addIssue(
      issues,
      fragment,
      "table-fragment-missing-metadata",
      `Table child fragment "${fragment.id}" is missing row or cell metadata.`,
    )
  }

  if (fragment.kind === "text" && table.cellId != null) {
    const hasLineRange = typeof fragment.lineStart === "number" &&
      typeof fragment.lineEnd === "number" &&
      fragment.lineEnd > fragment.lineStart
    if (!hasLineRange) {
      addIssue(
        issues,
        fragment,
        "table-text-missing-line-range",
        `Table text fragment "${fragment.id}" is missing a measured line range.`,
      )
    }
  }
}

function auditTableRelationships(
  issues: VNextMeasuredRendererConsumptionIssue[],
  fragmentsById: Map<string, VNextMeasuredFragment>,
  commands: readonly VNextMeasuredRenderCommand[],
): void {
  const tableSegments = new Set<string>()
  const rows = new Set<string>()
  const cells = new Set<string>()

  commands.forEach((command) => {
    if (command.table == null) return

    if (command.nodeType === "table") {
      tableSegments.add(`${command.pageIndex}:${command.table.tableId}`)
    }

    if (command.nodeType === "table-row") {
      const key = rowInstanceKey(command)
      if (key != null) rows.add(key)
    }

    if (command.nodeType === "table-cell") {
      const key = cellInstanceKey(command)
      if (key != null) cells.add(key)
    }
  })

  commands.forEach((command) => {
    const fragment = fragmentsById.get(command.fragmentId)
    if (command.table == null || fragment == null) return

    const tableSegmentKey = `${command.pageIndex}:${command.table.tableId}`
    if (command.nodeType === "table-row" && !tableSegments.has(tableSegmentKey)) {
      addIssue(
        issues,
        fragment,
        "table-row-without-table-segment",
        `Table row fragment "${command.fragmentId}" has no table segment on the same page.`,
      )
    }

    if (command.nodeType === "table-cell") {
      const rowKey = rowInstanceKey(command)
      if (rowKey == null || !rows.has(rowKey)) {
        addIssue(
          issues,
          fragment,
          "table-cell-without-row",
          `Table cell fragment "${command.fragmentId}" has no matching row fragment on the same page.`,
        )
      }
    }

    if (
      command.nodeType !== "table" &&
      command.nodeType !== "table-row" &&
      command.nodeType !== "table-cell"
    ) {
      const cellKey = cellInstanceKey(command)
      if (cellKey == null || !cells.has(cellKey)) {
        addIssue(
          issues,
          fragment,
          "table-child-without-cell",
          `Table child fragment "${command.fragmentId}" has no matching cell fragment on the same page.`,
        )
      }
    }
  })
}

export function buildVNextMeasuredRendererConsumption(
  pagination: VNextMeasuredPagination,
): VNextMeasuredRendererConsumption {
  const commands: VNextMeasuredRenderCommand[] = []
  const issues: VNextMeasuredRendererConsumptionIssue[] = []
  const fragmentsById = new Map<string, VNextMeasuredFragment>()

  pagination.pages.forEach((page) => {
    page.fragments.forEach((fragment) => {
      fragmentsById.set(fragment.id, fragment)
      const command = commandFromFragment(fragment)
      commands.push(command)

      if (!geometryIsValid(fragment)) {
        addIssue(
          issues,
          fragment,
          "invalid-fragment-geometry",
          `Fragment "${fragment.id}" has invalid renderer geometry.`,
        )
      }

      auditTableMetadata(issues, fragment, command)
    })
  })

  auditTableRelationships(issues, fragmentsById, commands)

  const blockingIssues = issues.filter((issue) => issue.severity === "blocking")
  const warningIssues = issues.filter((issue) => issue.severity === "warning")

  return {
    source: "vnext-measured-pagination",
    status: blockingIssues.length > 0 ? "blocked" : "consumable",
    pageCount: pagination.pageCount,
    commandCount: commands.length,
    rendererContract: {
      consumes: "measured-pagination-fragments",
      requiresAuthoredDocumentForLayout: false,
      mayRelayout: false,
    },
    commands,
    blockingIssues,
    warningIssues,
  }
}
