import { describe, expect, it } from "vitest"
import type { FlowTableCellNode, FlowTableNode, FlowTableRowNode } from "../schema"
import { pt } from "../schema"
import { FlowTableGridError, resolveFlowTableGrid } from "./flowTableGrid"

function cell(id: string, props: FlowTableCellNode["props"] = {}): FlowTableCellNode {
  return { id, type: "flow-table-cell", props, childIds: [] }
}

function row(id: string, cellIds: string[]): FlowTableRowNode {
  return { id, type: "flow-table-row", props: {}, cellIds }
}

function table(rowIds: string[], nodes: FlowTableNode["nodes"], columnCount = 3): FlowTableNode {
  return {
    id: "flow-table",
    type: "flow-table",
    props: {},
    columns: Array.from({ length: columnCount }, () => ({ width: pt(72) })),
    rowIds,
    nodes,
  }
}

describe("resolveFlowTableGrid", () => {
  it("resolves colspan and rowspan occupancy into deterministic slots", () => {
    const c1 = cell("c1", { colspan: 2, rowspan: 2 })
    const c2 = cell("c2")
    const c3 = cell("c3")
    const r1 = row("r1", ["c1", "c2"])
    const r2 = row("r2", ["c3"])

    const resolved = resolveFlowTableGrid(table(["r1", "r2"], { r1, r2, c1, c2, c3 }))

    expect(resolved.columnCount).toBe(3)
    expect(resolved.rowCount).toBe(2)
    expect(resolved.slots).toEqual([
      ["c1", "c1", "c2"],
      ["c1", "c1", "c3"],
    ])
    expect(resolved.placements).toEqual([
      { cellId: "c1", rowId: "r1", rowIndex: 0, columnIndex: 0, colspan: 2, rowspan: 2 },
      { cellId: "c2", rowId: "r1", rowIndex: 0, columnIndex: 2, colspan: 1, rowspan: 1 },
      { cellId: "c3", rowId: "r2", rowIndex: 1, columnIndex: 2, colspan: 1, rowspan: 1 },
    ])
  })

  it("rejects a row that cannot fill every column", () => {
    const c1 = cell("c1")
    const r1 = row("r1", ["c1"])

    expect(() => resolveFlowTableGrid(table(["r1"], { r1, c1 }, 2))).toThrow(FlowTableGridError)
    expect(() => resolveFlowTableGrid(table(["r1"], { r1, c1 }, 2))).toThrow("flow-table row \"r1\" must fill all 2 columns")
  })

  it("rejects spans that run beyond the authored row count", () => {
    const c1 = cell("c1", { rowspan: 2 })
    const r1 = row("r1", ["c1"])

    expect(() => resolveFlowTableGrid(table(["r1"], { r1, c1 }, 1))).toThrow("cell \"c1\" rowspan exceeds flow-table row count")
  })

  it("rejects cells that exceed columns after earlier rowspans occupy slots", () => {
    const c1 = cell("c1", { rowspan: 2 })
    const c2 = cell("c2")
    const c3 = cell("c3")
    const c4 = cell("c4")
    const r1 = row("r1", ["c1", "c2"])
    const r2 = row("r2", ["c3", "c4"])

    expect(() => resolveFlowTableGrid(table(["r1", "r2"], { r1, r2, c1, c2, c3, c4 }, 2))).toThrow("cell \"c4\" exceeds flow-table column count")
  })
})
