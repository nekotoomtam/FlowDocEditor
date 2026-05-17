import { describe, expect, it } from "vitest"
import type { FlowTableCellNode, FlowTableNode, FlowTableRowNode } from "../schema"
import { pt } from "../schema"
import { FlowTableGridError, resolveFlowTableGrid, tryResolveFlowTableGrid } from "./flowTableGrid"

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
      {
        cellId: "c1",
        rowId: "r1",
        rowIndex: 0,
        columnIndex: 0,
        colspan: 2,
        rowspan: 2,
        rowEndIndex: 1,
        columnEndIndex: 1,
        coveredSlots: [
          { rowIndex: 0, columnIndex: 0 },
          { rowIndex: 0, columnIndex: 1 },
          { rowIndex: 1, columnIndex: 0 },
          { rowIndex: 1, columnIndex: 1 },
        ],
      },
      {
        cellId: "c2",
        rowId: "r1",
        rowIndex: 0,
        columnIndex: 2,
        colspan: 1,
        rowspan: 1,
        rowEndIndex: 0,
        columnEndIndex: 2,
        coveredSlots: [{ rowIndex: 0, columnIndex: 2 }],
      },
      {
        cellId: "c3",
        rowId: "r2",
        rowIndex: 1,
        columnIndex: 2,
        colspan: 1,
        rowspan: 1,
        rowEndIndex: 1,
        columnEndIndex: 2,
        coveredSlots: [{ rowIndex: 1, columnIndex: 2 }],
      },
    ])
    expect(resolved.placementsByCellId.get("c1")).toBe(resolved.placements[0])
    expect(resolved.slotMatrix[1][1]).toMatchObject({
      cellId: "c1",
      rowId: "r2",
      rowIndex: 1,
      columnIndex: 1,
      originRowId: "r1",
      originRowIndex: 0,
      originColumnIndex: 0,
      colspan: 2,
      rowspan: 2,
      isOrigin: false,
    })
    expect(resolved.slotMatrix[0][0]).toMatchObject({
      cellId: "c1",
      rowId: "r1",
      originRowId: "r1",
      isOrigin: true,
    })
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

  it("rejects reused cell ids before producing mutation metadata", () => {
    const c1 = cell("c1")
    const r1 = row("r1", ["c1"])
    const r2 = row("r2", ["c1"])

    expect(() => resolveFlowTableGrid(table(["r1", "r2"], { r1, r2, c1 }, 1))).toThrow("cell \"c1\" is referenced by more than one flow-table row")
  })

  it("rejects non-positive authored spans when called outside schema assertion", () => {
    const c1 = cell("c1", { colspan: 0 } as FlowTableCellNode["props"])
    const r1 = row("r1", ["c1"])

    expect(() => resolveFlowTableGrid(table(["r1"], { r1, c1 }, 1))).toThrow("cell \"c1\" colspan must be a positive integer")
  })

  it("returns a typed invalid result without throwing when requested", () => {
    const c1 = cell("c1")
    const r1 = row("r1", ["c1"])

    const result = tryResolveFlowTableGrid(table(["r1"], { r1, c1 }, 2))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(FlowTableGridError)
      expect(result.error.message).toBe("flow-table row \"r1\" must fill all 2 columns")
    }
  })
})
