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
}

export interface FlowTableGridResolution {
  columnCount: number
  rowCount: number
  slots: string[][]
  placements: FlowTableGridCellPlacement[]
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

export function resolveFlowTableGrid(table: FlowTableNode): FlowTableGridResolution {
  const columnCount = table.columns.length
  const rowCount = table.rowIds.length
  const slots = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ""))
  const placements: FlowTableGridCellPlacement[] = []

  table.rowIds.forEach((rowId, rowIndex) => {
    const row = getFlowTableRow(table, rowId)
    let columnIndex = 0

    row.cellIds.forEach((cellId) => {
      while (columnIndex < columnCount && slots[rowIndex][columnIndex] !== "") columnIndex++
      if (columnIndex >= columnCount) {
        fail(`cell "${cellId}" exceeds flow-table column count`)
      }

      const cell = getFlowTableCell(table, cellId)
      const colspan = cell.props.colspan ?? 1
      const rowspan = cell.props.rowspan ?? 1

      if (columnIndex + colspan > columnCount) {
        fail(`cell "${cellId}" colspan exceeds flow-table column count`)
      }
      if (rowIndex + rowspan > rowCount) {
        fail(`cell "${cellId}" rowspan exceeds flow-table row count`)
      }

      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          const targetRow = rowIndex + dr
          const targetColumn = columnIndex + dc
          const existingCellId = slots[targetRow][targetColumn]
          if (existingCellId !== "") {
            fail(`cell "${cellId}" overlaps cell "${existingCellId}" at row ${targetRow + 1}, column ${targetColumn + 1}`)
          }
          slots[targetRow][targetColumn] = cellId
        }
      }

      placements.push({
        cellId,
        rowId,
        rowIndex,
        columnIndex,
        colspan,
        rowspan,
      })

      columnIndex += colspan
    })

    while (columnIndex < columnCount && slots[rowIndex][columnIndex] !== "") columnIndex++
    if (columnIndex !== columnCount) {
      fail(`flow-table row "${rowId}" must fill all ${columnCount} columns`)
    }
  })

  return { columnCount, rowCount, slots, placements }
}
