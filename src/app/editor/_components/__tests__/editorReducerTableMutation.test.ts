import { createDefaultDocument, createDefaultFlowTable } from "@/document"
import type { FlowTableNode, LayoutNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState, reducer } from "../editorReducer"
import type { EditorAction, EditorState } from "../editorReducer"

function createStateWithFlowTable(rowCount = 2, columnCount = 2): { state: EditorState; tableId: string } {
  const doc = createDefaultDocument()
  const table = createDefaultFlowTable(rowCount, columnCount)
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected default document body")
  }
  const nextSection = {
    ...section,
    nodes: {
      ...section.nodes,
      [body.id]: { ...body, childIds: [...body.childIds, table.id] },
      [table.id]: table as unknown as LayoutNode,
    },
  }
  const nextDoc = {
    ...doc,
    document: {
      ...doc.document,
      sections: [nextSection, ...doc.document.sections.slice(1)],
    },
  }
  return { state: createInitialEditorState(nextDoc), tableId: table.id }
}

function getFlowTable(state: EditorState, tableId: string): FlowTableNode {
  const node = state.doc.document.sections[0].nodes[tableId]
  if (node?.type !== "flow-table") {
    throw new Error("expected flow table")
  }
  return node as unknown as FlowTableNode
}

function expectHistoryAndSelectionPreserved(next: EditorState, previous: EditorState, selectedNodeId: string): void {
  expect(next).not.toBe(previous)
  expect(next.past).toEqual([{ doc: previous.doc, paginated: previous.paginated }])
  expect(next.future).toEqual([])
  expect(next.selectedNodeId).toBe(selectedNodeId)
  expect(next.selectionAnchorNodeId).toBe(selectedNodeId)
}

describe("editorReducer table mutations", () => {
  it.each([
    [{ type: "TABLE_ADD_ROW", tableId: "missing-table", afterIndex: 0 } as EditorAction],
    [{ type: "TABLE_REMOVE_ROW", tableId: "missing-table", rowIndex: 0 } as EditorAction],
    [{ type: "TABLE_ADD_COL", tableId: "missing-table", afterIndex: 0 } as EditorAction],
    [{ type: "TABLE_REMOVE_COL", tableId: "missing-table", colIndex: 0 } as EditorAction],
    [{ type: "TABLE_FIT_TO_WIDTH", tableId: "missing-table" } as EditorAction],
    [{ type: "RESIZE_TABLE_COLUMN_PAIR", tableId: "missing-table", leftColIndex: 0, leftWidth: 200, rightWidth: 100 } as EditorAction],
  ])("keeps %s no-op behavior reference-stable", (action) => {
    const { state } = createStateWithFlowTable()

    const next = reducer(state, action)

    expect(next).toBe(state)
  })

  it("commits TABLE_ADD_ROW through history and preserves selection", () => {
    const { state, tableId } = createStateWithFlowTable()
    const selectedNodeId = getFlowTable(state, tableId).rowIds[0]
    const selectedState: EditorState = {
      ...state,
      selectedNodeId,
      selectionAnchorNodeId: selectedNodeId,
    }
    const beforeTable = getFlowTable(selectedState, tableId)

    const next = reducer(selectedState, { type: "TABLE_ADD_ROW", tableId, afterIndex: 0 })
    const afterTable = getFlowTable(next, tableId)

    expectHistoryAndSelectionPreserved(next, selectedState, selectedNodeId)
    expect(afterTable.rowIds).toHaveLength(beforeTable.rowIds.length + 1)
  })

  it("commits TABLE_REMOVE_ROW through history and preserves selection", () => {
    const { state, tableId } = createStateWithFlowTable(3, 2)
    const selectedNodeId = getFlowTable(state, tableId).rowIds[0]
    const selectedState: EditorState = {
      ...state,
      selectedNodeId,
      selectionAnchorNodeId: selectedNodeId,
    }
    const beforeTable = getFlowTable(selectedState, tableId)

    const next = reducer(selectedState, { type: "TABLE_REMOVE_ROW", tableId, rowIndex: 1 })
    const afterTable = getFlowTable(next, tableId)

    expectHistoryAndSelectionPreserved(next, selectedState, selectedNodeId)
    expect(afterTable.rowIds).toHaveLength(beforeTable.rowIds.length - 1)
  })

  it("commits TABLE_ADD_COL through history and preserves selection", () => {
    const { state, tableId } = createStateWithFlowTable()
    const selectedNodeId = getFlowTable(state, tableId).rowIds[0]
    const selectedState: EditorState = {
      ...state,
      selectedNodeId,
      selectionAnchorNodeId: selectedNodeId,
    }
    const beforeTable = getFlowTable(selectedState, tableId)

    const next = reducer(selectedState, { type: "TABLE_ADD_COL", tableId, afterIndex: 0 })
    const afterTable = getFlowTable(next, tableId)

    expectHistoryAndSelectionPreserved(next, selectedState, selectedNodeId)
    expect(afterTable.columns).toHaveLength(beforeTable.columns.length + 1)
  })

  it("commits TABLE_REMOVE_COL through history and preserves selection", () => {
    const { state, tableId } = createStateWithFlowTable(2, 3)
    const selectedNodeId = getFlowTable(state, tableId).rowIds[0]
    const selectedState: EditorState = {
      ...state,
      selectedNodeId,
      selectionAnchorNodeId: selectedNodeId,
    }
    const beforeTable = getFlowTable(selectedState, tableId)

    const next = reducer(selectedState, { type: "TABLE_REMOVE_COL", tableId, colIndex: 1 })
    const afterTable = getFlowTable(next, tableId)

    expectHistoryAndSelectionPreserved(next, selectedState, selectedNodeId)
    expect(afterTable.columns).toHaveLength(beforeTable.columns.length - 1)
  })

  it("commits TABLE_FIT_TO_WIDTH through history and preserves selection", () => {
    const { state, tableId } = createStateWithFlowTable()
    const selectedNodeId = getFlowTable(state, tableId).rowIds[0]
    const selectedState: EditorState = {
      ...state,
      selectedNodeId,
      selectionAnchorNodeId: selectedNodeId,
    }
    const beforeTable = getFlowTable(selectedState, tableId)

    const next = reducer(selectedState, { type: "TABLE_FIT_TO_WIDTH", tableId })
    const afterTable = getFlowTable(next, tableId)

    expectHistoryAndSelectionPreserved(next, selectedState, selectedNodeId)
    expect(afterTable.columns).not.toEqual(beforeTable.columns)
  })

  it("commits RESIZE_TABLE_COLUMN_PAIR through history and adopts provided pagination", () => {
    const { state, tableId } = createStateWithFlowTable()
    const selectedNodeId = getFlowTable(state, tableId).rowIds[0]
    const selectedState: EditorState = {
      ...state,
      selectedNodeId,
      selectionAnchorNodeId: selectedNodeId,
    }
    const beforeTable = getFlowTable(selectedState, tableId)
    const paginated = { ...selectedState.paginated, sections: [...selectedState.paginated.sections] }

    const next = reducer(selectedState, {
      type: "RESIZE_TABLE_COLUMN_PAIR",
      tableId,
      leftColIndex: 0,
      leftWidth: 200,
      rightWidth: 100,
      paginated,
    })
    const afterTable = getFlowTable(next, tableId)

    expectHistoryAndSelectionPreserved(next, selectedState, selectedNodeId)
    expect(afterTable.columns).not.toEqual(beforeTable.columns)
    expect(next.paginated).toBe(paginated)
  })
})
