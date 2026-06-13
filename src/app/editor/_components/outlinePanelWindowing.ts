import type {
  OutlineItem,
  OutlineListGroupRunItem,
  OutlineNodeItem,
  OutlineSectionModel,
} from "./outlineModel"

export const OUTLINE_NODE_ROW_HEIGHT = 26
export const OUTLINE_LIST_GROUP_ROW_HEIGHT = 28
export const OUTLINE_SECTION_HEADING_ROW_HEIGHT = 22
export const OUTLINE_VIRTUALIZATION_MIN_ROW_COUNT = 80
export const OUTLINE_VIRTUALIZATION_OVERSCAN_ROWS = 8

export type OutlineFlatRow =
  | {
    kind: "section-heading"
    key: string
    sectionId: string
    sectionIndex: number
    depth: 0
    height: typeof OUTLINE_SECTION_HEADING_ROW_HEIGHT
  }
  | {
    kind: "list-group-run"
    key: string
    item: OutlineListGroupRunItem
    depth: number
    expandable: boolean
    expanded: boolean
    height: typeof OUTLINE_LIST_GROUP_ROW_HEIGHT
  }
  | {
    kind: "node"
    key: string
    item: OutlineNodeItem
    depth: number
    expandable: boolean
    expanded: boolean
    height: typeof OUTLINE_NODE_ROW_HEIGHT
  }

export interface OutlineVisibleRow {
  row: OutlineFlatRow
  index: number
  top: number
}

export interface OutlineVisibleWindow {
  virtualized: boolean
  totalHeight: number
  visibleRows: OutlineVisibleRow[]
}

export function isOutlineRowExpanded(
  expandedRowKeys: ReadonlyMap<string, boolean>,
  rowKey: string,
): boolean {
  return expandedRowKeys.get(rowKey) ?? true
}

export function toggleOutlineRowExpanded(
  expandedRowKeys: ReadonlyMap<string, boolean>,
  rowKey: string,
): Map<string, boolean> {
  const expanded = isOutlineRowExpanded(expandedRowKeys, rowKey)
  const next = new Map(expandedRowKeys)
  if (expanded) {
    next.set(rowKey, false)
  } else {
    next.delete(rowKey)
  }
  return next
}

function appendOutlineItems(
  rows: OutlineFlatRow[],
  items: OutlineItem[],
  depth: number,
  expandedRowKeys: ReadonlyMap<string, boolean>,
): void {
  for (const item of items) {
    const expandable = item.children.length > 0
    const expanded = expandable ? isOutlineRowExpanded(expandedRowKeys, item.key) : false

    if (item.kind === "list-group-run") {
      rows.push({
        kind: "list-group-run",
        key: item.key,
        item,
        depth,
        expandable,
        expanded,
        height: OUTLINE_LIST_GROUP_ROW_HEIGHT,
      })
    } else {
      rows.push({
        kind: "node",
        key: item.key,
        item,
        depth,
        expandable,
        expanded,
        height: OUTLINE_NODE_ROW_HEIGHT,
      })
    }

    if (expandable && expanded) {
      appendOutlineItems(rows, item.children as OutlineItem[], depth + 1, expandedRowKeys)
    }
  }
}

export function flattenOutlinePanelRows(
  outlineSections: OutlineSectionModel[],
  options: {
    showSectionHeadings: boolean
    expandedRowKeys: ReadonlyMap<string, boolean>
  },
): OutlineFlatRow[] {
  const rows: OutlineFlatRow[] = []

  outlineSections.forEach((sectionModel, sectionIndex) => {
    if (options.showSectionHeadings) {
      rows.push({
        kind: "section-heading",
        key: `section-heading:${sectionModel.sectionId}`,
        sectionId: sectionModel.sectionId,
        sectionIndex,
        depth: 0,
        height: OUTLINE_SECTION_HEADING_ROW_HEIGHT,
      })
    }
    appendOutlineItems(rows, sectionModel.items, 0, options.expandedRowKeys)
  })

  return rows
}

export function resolveOutlineVisibleWindow(
  rows: OutlineFlatRow[],
  options: {
    virtualized: boolean
    scrollTop: number
    viewportHeight: number
    overscanRows?: number
  },
): OutlineVisibleWindow {
  let totalHeight = 0
  const offsets = rows.map((row) => {
    const top = totalHeight
    totalHeight += row.height
    return top
  })

  if (!options.virtualized || options.viewportHeight <= 0) {
    return {
      virtualized: false,
      totalHeight,
      visibleRows: rows.map((row, index) => ({ row, index, top: offsets[index] })),
    }
  }

  const overscanPx = (options.overscanRows ?? OUTLINE_VIRTUALIZATION_OVERSCAN_ROWS) * OUTLINE_NODE_ROW_HEIGHT
  const startY = Math.max(0, options.scrollTop - overscanPx)
  const endY = Math.min(totalHeight, options.scrollTop + options.viewportHeight + overscanPx)
  const visibleRows: OutlineVisibleRow[] = []

  rows.forEach((row, index) => {
    const top = offsets[index]
    const bottom = top + row.height
    if (bottom < startY || top > endY) return
    visibleRows.push({ row, index, top })
  })

  return {
    virtualized: true,
    totalHeight,
    visibleRows,
  }
}
