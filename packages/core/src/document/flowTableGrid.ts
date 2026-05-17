import type { FlowTableCellNode, FlowTableNode, FlowTableRowNode } from "../schema"

export class FlowTableGridError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FlowTableGridError"
  }
}

export interface FlowTableGridCellPlacement {
  cellId: string
  rowId: string
  rowIndex: number
  columnIndex: number
  colspan: number
  rowspan: number
  rowEndIndex: number
  columnEndIndex: number
  coveredSlots: FlowTableGridPosition[]
}

export interface FlowTableGridPosition {
  rowIndex: number
  columnIndex: number
}

export interface FlowTableGridSlot {
  cellId: string
  rowId: string
  rowIndex: number
  columnIndex: number
  originRowId: string
  originRowIndex: number
  originColumnIndex: number
  colspan: number
  rowspan: number
  isOrigin: boolean
}

export interface FlowTableGridResolution {
  columnCount: number
  rowCount: number
  slots: string[][]
  slotMatrix: FlowTableGridSlot[][]
  placements: FlowTableGridCellPlacement[]
  placementsByCellId: Map<string, FlowTableGridCellPlacement>
}

function fail(message: string): never {
  throw new FlowTableGridError(message)
}

function getFlowTableRow(table: FlowTableNode, rowId: string): FlowTableRowNode {
  const row = table.nodes[rowId]
  if (row == null) fail(`missing row "${rowId}"`)
  if (row.type !== "flow-table-row") {
    fail(`flow-table row id "${rowId}" must reference flow-table-row — got "${row.type}"`)
  }
  return row
}

function getFlowTableCell(table: FlowTableNode, cellId: string): FlowTableCellNode {
  const cell = table.nodes[cellId]
  if (cell == null) fail(`missing cell "${cellId}"`)
  if (cell.type !== "flow-table-cell") {
    fail(`flow-table row child "${cellId}" must be flow-table-cell — got "${cell.type}"`)
  }
  return cell
}

function resolveSpan(cellId: string, label: "colspan" | "rowspan", value: number | undefined): number {
  const span = value ?? 1
  if (!Number.isInteger(span) || span < 1) {
    fail(`cell "${cellId}" ${label} must be a positive integer`)
  }
  return span
}

export function resolveFlowTableGrid(table: FlowTableNode): FlowTableGridResolution {
  const columnCount = table.columns.length
  const rowCount = table.rowIds.length
  if (columnCount < 1) fail("flow-table must have at least one column")
  if (rowCount < 1) fail("flow-table must have at least one row")

  const slots = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ""))
  const slotMatrix: Array<Array<FlowTableGridSlot | null>> = Array.from(
    { length: rowCount },
    () => Array.from({ length: columnCount }, () => null),
  )
  const placements: FlowTableGridCellPlacement[] = []
  const placementsByCellId = new Map<string, FlowTableGridCellPlacement>()
  const seenCellIds = new Set<string>()

  table.rowIds.forEach((rowId, rowIndex) => {
    const row = getFlowTableRow(table, rowId)
    let columnIndex = 0

    row.cellIds.forEach((cellId) => {
      while (columnIndex < columnCount && slots[rowIndex][columnIndex] !== "") columnIndex++
      if (columnIndex >= columnCount) {
        fail(`cell "${cellId}" exceeds flow-table column count`)
      }

      if (seenCellIds.has(cellId)) {
        fail(`cell "${cellId}" is referenced by more than one flow-table row`)
      }
      seenCellIds.add(cellId)

      const cell = getFlowTableCell(table, cellId)
      const colspan = resolveSpan(cellId, "colspan", cell.props.colspan)
      const rowspan = resolveSpan(cellId, "rowspan", cell.props.rowspan)

      if (columnIndex + colspan > columnCount) {
        fail(`cell "${cellId}" colspan exceeds flow-table column count`)
      }
      if (rowIndex + rowspan > rowCount) {
        fail(`cell "${cellId}" rowspan exceeds flow-table row count`)
      }

      const coveredSlots: FlowTableGridPosition[] = []
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          const targetRow = rowIndex + dr
          const targetColumn = columnIndex + dc
          const targetRowId = table.rowIds[targetRow]
          const existingCellId = slots[targetRow][targetColumn]
          if (existingCellId !== "") {
            fail(`cell "${cellId}" overlaps cell "${existingCellId}" at row ${targetRow + 1}, column ${targetColumn + 1}`)
          }
          slots[targetRow][targetColumn] = cellId
          coveredSlots.push({ rowIndex: targetRow, columnIndex: targetColumn })
          slotMatrix[targetRow][targetColumn] = {
            cellId,
            rowId: targetRowId,
            rowIndex: targetRow,
            columnIndex: targetColumn,
            originRowId: rowId,
            originRowIndex: rowIndex,
            originColumnIndex: columnIndex,
            colspan,
            rowspan,
            isOrigin: dr === 0 && dc === 0,
          }
        }
      }

      const placement: FlowTableGridCellPlacement = {
        cellId,
        rowId,
        rowIndex,
        columnIndex,
        colspan,
        rowspan,
        rowEndIndex: rowIndex + rowspan - 1,
        columnEndIndex: columnIndex + colspan - 1,
        coveredSlots,
      }
      placements.push(placement)
      placementsByCellId.set(cellId, placement)

      columnIndex += colspan
    })

    while (columnIndex < columnCount && slots[rowIndex][columnIndex] !== "") columnIndex++
    if (columnIndex !== columnCount) {
      fail(`flow-table row "${rowId}" must fill all ${columnCount} columns`)
    }
  })

  const filledSlotMatrix = slotMatrix.map((row, rowIndex) =>
    row.map((slot, columnIndex) => {
      if (slot == null) fail(`flow-table has empty slot at row ${rowIndex + 1}, column ${columnIndex + 1}`)
      return slot
    }),
  )

  return { columnCount, rowCount, slots, slotMatrix: filledSlotMatrix, placements, placementsByCellId }
}

export function tryResolveFlowTableGrid(table: FlowTableNode):
  | { ok: true; grid: FlowTableGridResolution }
  | { ok: false; error: FlowTableGridError } {
  try {
    return { ok: true, grid: resolveFlowTableGrid(table) }
  } catch (error) {
    if (error instanceof FlowTableGridError) {
      return { ok: false, error }
    }
    throw error
  }
}
