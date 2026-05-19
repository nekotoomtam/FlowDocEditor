import { resolveFlowTableGrid } from "../document/flowTableGrid"
import type { FlowBox } from "../layout"
import type { FlowTableNode } from "../schema"

export interface FlowTableRowspanRowPlan {
  rowId: string
  rowIndex: number
  y: number
  height: number
}

export interface FlowTableRowspanCellPlan {
  cellId: string
  rowId: string
  rowIndex: number
  columnIndex: number
  rowEndIndex: number
  columnEndIndex: number
  colspan: number
  rowspan: number
  coveredSlots: Array<{ rowIndex: number; columnIndex: number }>
}

export interface FlowTableRowspanGroupPlan {
  rowIndices: number[]
  rowIds: string[]
  rows: FlowTableRowspanRowPlan[]
  totalHeight: number
  spanningCells: FlowTableRowspanCellPlan[]
}

export interface FlowTableRowspanSlicePlan {
  rowStartIndex: number
  rowEndIndex: number
  rowIndices: number[]
  rowIds: string[]
  height: number
  continuesFromPreviousGroupSlice: boolean
  continuesOnNextGroupSlice: boolean
  continuedFromPreviousCellIds: string[]
  continuesOnNextCellIds: string[]
  carriedCellIds: string[]
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function cellIntersectsRows(cell: FlowTableRowspanCellPlan, rowStartIndex: number, rowEndIndex: number): boolean {
  return cell.rowIndex <= rowEndIndex && cell.rowEndIndex >= rowStartIndex
}

export function planFlowTableRowspanGroupSlice(
  group: FlowTableRowspanGroupPlan,
  rowStartIndex: number,
  rowEndIndex: number,
): FlowTableRowspanSlicePlan {
  if (rowStartIndex > rowEndIndex) {
    throw new Error("rowStartIndex must be less than or equal to rowEndIndex")
  }
  if (!group.rowIndices.includes(rowStartIndex) || !group.rowIndices.includes(rowEndIndex)) {
    throw new Error("slice row boundaries must belong to the rowspan group")
  }

  const rows = group.rows.filter((row) => row.rowIndex >= rowStartIndex && row.rowIndex <= rowEndIndex)
  const continuedFromPreviousCellIds = group.spanningCells
    .filter((cell) => cellIntersectsRows(cell, rowStartIndex, rowEndIndex) && cell.rowIndex < rowStartIndex)
    .map((cell) => cell.cellId)
  const continuesOnNextCellIds = group.spanningCells
    .filter((cell) => cellIntersectsRows(cell, rowStartIndex, rowEndIndex) && cell.rowEndIndex > rowEndIndex)
    .map((cell) => cell.cellId)

  return {
    rowStartIndex,
    rowEndIndex,
    rowIndices: rows.map((row) => row.rowIndex),
    rowIds: rows.map((row) => row.rowId),
    height: rows.reduce((sum, row) => sum + row.height, 0),
    continuesFromPreviousGroupSlice: rowStartIndex > group.rowIndices[0],
    continuesOnNextGroupSlice: rowEndIndex < group.rowIndices[group.rowIndices.length - 1],
    continuedFromPreviousCellIds: uniqueSorted(continuedFromPreviousCellIds),
    continuesOnNextCellIds: uniqueSorted(continuesOnNextCellIds),
    carriedCellIds: uniqueSorted([...continuedFromPreviousCellIds, ...continuesOnNextCellIds]),
  }
}

export function planFlowTableRowspanGroups(
  tableNode: FlowTableNode,
  rowBoxes: FlowBox[],
): FlowTableRowspanGroupPlan[] {
  const rowCount = tableNode.rowIds.length
  const parent = Array.from({ length: rowCount }, (_, index) => index)
  const grid = resolveFlowTableGrid(tableNode)

  function find(index: number): number {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }

  function union(a: number, b: number): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootA] = rootB
  }

  for (const placement of grid.placements) {
    if (placement.rowspan <= 1) continue
    for (let rowIndex = placement.rowIndex + 1; rowIndex <= placement.rowEndIndex; rowIndex += 1) {
      union(placement.rowIndex, rowIndex)
    }
  }

  const rowIndicesByRoot = new Map<number, number[]>()
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const root = find(rowIndex)
    const rowIndices = rowIndicesByRoot.get(root) ?? []
    rowIndices.push(rowIndex)
    rowIndicesByRoot.set(root, rowIndices)
  }

  return Array.from(rowIndicesByRoot.values())
    .map((rowIndices) => rowIndices.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .map((rowIndices): FlowTableRowspanGroupPlan => {
      const rows = rowIndices.map((rowIndex) => {
        const rowBox = rowBoxes[rowIndex]
        return {
          rowId: tableNode.rowIds[rowIndex],
          rowIndex,
          y: rowBox?.y ?? 0,
          height: rowBox?.height ?? 0,
        }
      })
      const firstRowIndex = rowIndices[0]
      const lastRowIndex = rowIndices[rowIndices.length - 1]
      const spanningCells = grid.placements
        .filter((placement) => placement.rowspan > 1 && placement.rowIndex <= lastRowIndex && placement.rowEndIndex >= firstRowIndex)
        .map((placement): FlowTableRowspanCellPlan => ({
          cellId: placement.cellId,
          rowId: placement.rowId,
          rowIndex: placement.rowIndex,
          columnIndex: placement.columnIndex,
          rowEndIndex: placement.rowEndIndex,
          columnEndIndex: placement.columnEndIndex,
          colspan: placement.colspan,
          rowspan: placement.rowspan,
          coveredSlots: placement.coveredSlots.map((slot) => ({ ...slot })),
        }))

      return {
        rowIndices,
        rowIds: rows.map((row) => row.rowId),
        rows,
        totalHeight: rows.reduce((sum, row) => sum + row.height, 0),
        spanningCells,
      }
    })
}

export function planFlowTableRowspanGroupSlices(
  group: FlowTableRowspanGroupPlan,
  maxSliceHeight: number,
): FlowTableRowspanSlicePlan[] {
  if (!Number.isFinite(maxSliceHeight) || maxSliceHeight <= 0) {
    throw new Error("maxSliceHeight must be a positive finite number")
  }
  if (group.rows.length === 0) return []

  const slices: FlowTableRowspanSlicePlan[] = []
  let sliceStartRowIndex = group.rows[0].rowIndex
  let sliceEndRowIndex = sliceStartRowIndex
  let sliceHeight = 0

  for (const row of group.rows) {
    const wouldOverflow = sliceHeight > 0 && sliceHeight + row.height > maxSliceHeight
    if (wouldOverflow) {
      slices.push(planFlowTableRowspanGroupSlice(group, sliceStartRowIndex, sliceEndRowIndex))
      sliceStartRowIndex = row.rowIndex
      sliceHeight = 0
    }

    sliceEndRowIndex = row.rowIndex
    sliceHeight += row.height
  }

  slices.push(planFlowTableRowspanGroupSlice(group, sliceStartRowIndex, sliceEndRowIndex))
  return slices
}
