import { createDefaultDocument, createDefaultFlowTable } from "@/document"
import type { FlowTableNode, LayoutNode, DocumentNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState, reducer } from "../editorReducer"
import type { EditorAction, EditorState } from "../editorReducer"

function getFirstBodyChildId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected document body child")
  }
  return body.childIds[0]
}

function getBodyChildIds(doc: DocumentNode): string[] {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected document body")
  }
  return body.childIds
}

function createStateWithFlowRow(): EditorState {
  const doc = createDefaultDocument()
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected default document body")
  }
  const paragraphId = body.childIds[0]
  const nextDoc: DocumentNode = {
    ...doc,
    document: {
      ...doc.document,
      sections: doc.document.sections.map((current, index) => index === 0
        ? {
            ...section,
            nodes: {
              ...section.nodes,
              [body.id]: { ...body, childIds: ["row-1"] },
              "row-1": { id: "row-1", type: "flow-row", props: {}, childIds: ["stack-1", "stack-2"] },
              "stack-1": { id: "stack-1", type: "flow-stack", props: { widthShare: 50 }, childIds: [paragraphId] },
              "stack-2": { id: "stack-2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
            },
          }
        : current),
    },
  }
  return createInitialEditorState(nextDoc)
}

function createStateWithFlowTable(): { state: EditorState; tableId: string; cellId: string } {
  const doc = createDefaultDocument()
  const table = createDefaultFlowTable(2, 2)
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected default document body")
  }
  const firstRow = table.nodes[table.rowIds[0]]
  if (firstRow?.type !== "flow-table-row") {
    throw new Error("expected flow table row")
  }
  const nextDoc: DocumentNode = {
    ...doc,
    document: {
      ...doc.document,
      sections: doc.document.sections.map((current, index) => index === 0
        ? {
            ...section,
            nodes: {
              ...section.nodes,
              [body.id]: { ...body, childIds: [...body.childIds, table.id] },
              [table.id]: table as unknown as LayoutNode,
            },
          }
        : current),
    },
  }
  return { state: createInitialEditorState(nextDoc), tableId: table.id, cellId: firstRow.cellIds[0] }
}

function getFlowTable(state: EditorState, tableId: string): FlowTableNode {
  const table = state.doc.document.sections[0].nodes[tableId]
  if (table?.type !== "flow-table") {
    throw new Error("expected flow table")
  }
  return table as unknown as FlowTableNode
}

describe("editorReducer layout mutations", () => {
  it("keeps DRAG_COMMIT without active drag reference-stable", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const section = state.doc.document.sections[0]
    const anchorNodeId = getFirstBodyChildId(state.doc)

    const next = reducer(state, {
      type: "DRAG_COMMIT",
      sectionId: section.id,
      op: { kind: "insert-after", parentId: section.bodyRootId, parentType: "body", index: 1, anchorNodeId },
    })

    expect(next).toBe(state)
  })

  it("commits DRAG_COMMIT through history and clears drag state", () => {
    const baseState = createInitialEditorState(createDefaultDocument())
    const section = baseState.doc.document.sections[0]
    const anchorNodeId = getFirstBodyChildId(baseState.doc)
    const state: EditorState = {
      ...baseState,
      drag: {
        source: { source: "palette", blockType: "paragraph" },
        clientX: 10,
        clientY: 20,
        preview: null,
      },
    }

    const next = reducer(state, {
      type: "DRAG_COMMIT",
      sectionId: section.id,
      op: { kind: "insert-after", parentId: section.bodyRootId, parentType: "body", index: 1, anchorNodeId },
    })

    expect(next).not.toBe(state)
    expect(next.drag).toBeNull()
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(getBodyChildIds(next.doc)).toHaveLength(getBodyChildIds(state.doc).length + 1)
  })

  it("keeps UPDATE_FLOW_TABLE_CELL_SPAN no-op behavior reference-stable", () => {
    const { state } = createStateWithFlowTable()

    const next = reducer(state, { type: "UPDATE_FLOW_TABLE_CELL_SPAN", cellId: "missing-cell", changes: { colspan: 2 } })

    expect(next).toBe(state)
  })

  it("commits UPDATE_FLOW_TABLE_CELL_SPAN through history", () => {
    const { state, tableId, cellId } = createStateWithFlowTable()

    const next = reducer(state, { type: "UPDATE_FLOW_TABLE_CELL_SPAN", cellId, changes: { colspan: 2 } })
    const table = getFlowTable(next, tableId)
    const cell = table.nodes[cellId]

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(cell.type).toBe("flow-table-cell")
    if (cell.type !== "flow-table-cell") return
    expect(cell.props.colspan).toBe(2)
  })

  it("commits RESIZE_COLUMNS through history and adopts provided pagination", () => {
    const state = createStateWithFlowRow()
    const paginated = { ...state.paginated, sections: [...state.paginated.sections] }

    const next = reducer(state, {
      type: "RESIZE_COLUMNS",
      leftStackId: "stack-1",
      leftShare: 30,
      rightStackId: "stack-2",
      rightShare: 70,
      paginated,
    })
    const section = next.doc.document.sections[0]
    const left = section.nodes["stack-1"]
    const right = section.nodes["stack-2"]

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(next.paginated).toBe(paginated)
    expect(left.type).toBe("flow-stack")
    expect(right.type).toBe("flow-stack")
    if (left.type !== "flow-stack" || right.type !== "flow-stack") return
    expect(left.props.widthShare).toBe(30)
    expect(right.props.widthShare).toBe(70)
  })

  it("commits RESIZE_ROW_MIN_HEIGHT through history", () => {
    const state = createStateWithFlowRow()

    const next = reducer(state, { type: "RESIZE_ROW_MIN_HEIGHT", rowId: "row-1", minHeight: 96 })
    const row = next.doc.document.sections[0].nodes["row-1"]

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.props.minHeight).toBe(96)
  })
})
