import { describe, expect, it } from "vitest"
import type { FlowBox } from "../../layout"
import type { FlowTableCellNode, FlowTableNode, FlowTableRowNode } from "../../schema"
import {
  planFlowTableRowspanGroupSlice,
  planFlowTableRowspanGroups,
  planFlowTableRowspanGroupSlices,
} from "../flowTableRowspanPlan"

function cell(id: string, props: FlowTableCellNode["props"] = {}): FlowTableCellNode {
  return { id, type: "flow-table-cell", props, childIds: [] }
}

function row(id: string, cellIds: string[]): FlowTableRowNode {
  return { id, type: "flow-table-row", props: {}, cellIds }
}

function table(
  rowIds: string[],
  nodes: FlowTableNode["nodes"],
  columnCount = 3,
): FlowTableNode {
  return {
    id: "ft",
    type: "flow-table",
    props: {},
    columns: Array.from({ length: columnCount }, () => ({ width: { value: 90, unit: "pt" as const } })),
    rowIds,
    nodes,
  }
}

function rowBox(rowId: string, rowIndex: number, height: number): FlowBox {
  const y = [0, 30, 80, 120].slice(0, rowIndex).reduce((sum, value) => sum + value, 0)
  return {
    nodeId: rowId,
    nodeType: "flow-table-row",
    x: 72,
    y,
    width: 270,
    height,
    children: [],
  }
}

describe("flow-table rowspan pagination planner", () => {
  it("groups rows linked by rowspan cells and keeps covered-slot metadata", () => {
    const cA = cell("cA", { rowspan: 2 })
    const cB = cell("cB")
    const cC = cell("cC")
    const cD = cell("cD")
    const cE = cell("cE")
    const cF = cell("cF")
    const cG = cell("cG")
    const cH = cell("cH")
    const r0 = row("r0", [cA.id, cB.id, cC.id])
    const r1 = row("r1", [cD.id, cE.id])
    const r2 = row("r2", [cF.id, cG.id, cH.id])
    const plan = planFlowTableRowspanGroups(
      table([r0.id, r1.id, r2.id], { r0, r1, r2, cA, cB, cC, cD, cE, cF, cG, cH }),
      [rowBox(r0.id, 0, 30), rowBox(r1.id, 1, 40), rowBox(r2.id, 2, 50)],
    )

    expect(plan.map((group) => group.rowIndices)).toEqual([[0, 1], [2]])
    expect(plan[0].rowIds).toEqual(["r0", "r1"])
    expect(plan[0].totalHeight).toBe(70)
    expect(plan[0].spanningCells).toHaveLength(1)
    expect(plan[0].spanningCells[0]).toMatchObject({
      cellId: "cA",
      rowIndex: 0,
      rowEndIndex: 1,
      columnIndex: 0,
      columnEndIndex: 0,
      rowspan: 2,
      colspan: 1,
    })
    expect(plan[0].spanningCells[0].coveredSlots).toEqual([
      { rowIndex: 0, columnIndex: 0 },
      { rowIndex: 1, columnIndex: 0 },
    ])
    expect(plan[1].spanningCells).toEqual([])
  })

  it("keeps covered-slot metadata for cells with both rowspan and colspan", () => {
    const cA = cell("cA", { colspan: 2, rowspan: 2 })
    const cB = cell("cB")
    const cC = cell("cC")
    const cD = cell("cD")
    const cE = cell("cE")
    const cF = cell("cF")
    const r0 = row("r0", [cA.id, cB.id])
    const r1 = row("r1", [cC.id])
    const r2 = row("r2", [cD.id, cE.id, cF.id])
    const plan = planFlowTableRowspanGroups(
      table([r0.id, r1.id, r2.id], { r0, r1, r2, cA, cB, cC, cD, cE, cF }, 3),
      [rowBox(r0.id, 0, 30), rowBox(r1.id, 1, 40), rowBox(r2.id, 2, 50)],
    )

    expect(plan.map((group) => group.rowIndices)).toEqual([[0, 1], [2]])
    expect(plan[0].spanningCells).toHaveLength(1)
    expect(plan[0].spanningCells[0]).toMatchObject({
      cellId: "cA",
      rowIndex: 0,
      rowEndIndex: 1,
      columnIndex: 0,
      columnEndIndex: 1,
      rowspan: 2,
      colspan: 2,
    })
    expect(plan[0].spanningCells[0].coveredSlots).toEqual([
      { rowIndex: 0, columnIndex: 0 },
      { rowIndex: 0, columnIndex: 1 },
      { rowIndex: 1, columnIndex: 0 },
      { rowIndex: 1, columnIndex: 1 },
    ])
  })

  it("packs a rowspan group into row-boundary slices and marks carried cells", () => {
    const cA = cell("cA", { rowspan: 3 })
    const cB = cell("cB")
    const cC = cell("cC")
    const cD = cell("cD")
    const cE = cell("cE")
    const cF = cell("cF")
    const cG = cell("cG")
    const r0 = row("r0", [cA.id, cB.id, cC.id])
    const r1 = row("r1", [cD.id, cE.id])
    const r2 = row("r2", [cF.id, cG.id])
    const [group] = planFlowTableRowspanGroups(
      table([r0.id, r1.id, r2.id], { r0, r1, r2, cA, cB, cC, cD, cE, cF, cG }),
      [rowBox(r0.id, 0, 30), rowBox(r1.id, 1, 50), rowBox(r2.id, 2, 40)],
    )

    const slices = planFlowTableRowspanGroupSlices(group, 70)

    expect(slices.map((slice) => slice.rowIndices)).toEqual([[0], [1], [2]])
    expect(slices.map((slice) => slice.height)).toEqual([30, 50, 40])
    expect(slices[0]).toMatchObject({
      continuesFromPreviousGroupSlice: false,
      continuesOnNextGroupSlice: true,
      continuedFromPreviousCellIds: [],
      continuesOnNextCellIds: ["cA"],
      carriedCellIds: ["cA"],
    })
    expect(slices[1]).toMatchObject({
      continuesFromPreviousGroupSlice: true,
      continuesOnNextGroupSlice: true,
      continuedFromPreviousCellIds: ["cA"],
      continuesOnNextCellIds: ["cA"],
      carriedCellIds: ["cA"],
    })
    expect(slices[2]).toMatchObject({
      continuesFromPreviousGroupSlice: true,
      continuesOnNextGroupSlice: false,
      continuedFromPreviousCellIds: ["cA"],
      continuesOnNextCellIds: [],
      carriedCellIds: ["cA"],
    })
  })

  it("forces a too-tall single row slice without emitting an empty slice", () => {
    const cA = cell("cA", { rowspan: 2 })
    const cB = cell("cB")
    const cC = cell("cC")
    const cD = cell("cD")
    const r0 = row("r0", [cA.id, cB.id])
    const r1 = row("r1", [cC.id])
    const [group] = planFlowTableRowspanGroups(
      table([r0.id, r1.id], { r0, r1, cA, cB, cC }, 2),
      [rowBox(r0.id, 0, 120), rowBox(r1.id, 1, 30)],
    )

    const slices = planFlowTableRowspanGroupSlices(group, 70)

    expect(slices.map((slice) => slice.rowIndices)).toEqual([[0], [1]])
    expect(slices.map((slice) => slice.height)).toEqual([120, 30])
    expect(slices.every((slice) => slice.rowIndices.length > 0)).toBe(true)
  })

  it("rejects invalid slice heights", () => {
    const r0 = row("r0", [cell("cA").id])
    const group = planFlowTableRowspanGroups(
      table([r0.id], { r0, cA: cell("cA") }, 1),
      [rowBox(r0.id, 0, 20)],
    )[0]

    expect(() => planFlowTableRowspanGroupSlices(group, 0)).toThrow("maxSliceHeight must be a positive finite number")
  })

  it("rejects slice boundaries outside the group", () => {
    const cA = cell("cA", { rowspan: 2 })
    const cB = cell("cB")
    const cC = cell("cC")
    const r0 = row("r0", [cA.id, cB.id])
    const r1 = row("r1", [cC.id])
    const [group] = planFlowTableRowspanGroups(
      table([r0.id, r1.id], { r0, r1, cA, cB, cC }, 2),
      [rowBox(r0.id, 0, 20), rowBox(r1.id, 1, 20)],
    )

    expect(() => planFlowTableRowspanGroupSlice(group, 1, 0)).toThrow("rowStartIndex must be less than or equal to rowEndIndex")
    expect(() => planFlowTableRowspanGroupSlice(group, 0, 2)).toThrow("slice row boundaries must belong to the rowspan group")
  })
})
