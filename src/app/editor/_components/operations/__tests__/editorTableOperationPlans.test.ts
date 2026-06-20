import { createDefaultDocument, createDefaultFlowTable } from "@/document"
import type { DocumentNode, FlowTableNode, LayoutNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createTableStructureActionResult,
  createTableStructureOperationResult,
} from "../editorTableOperationPlans"
import { createEditorDocumentGraphRuntime } from "../editorOperationRuntime"

function createStateWithFlowTable(rowCount = 2, columnCount = 2): { state: EditorState; tableId: string; cellId: string } {
  const doc = createDefaultDocument()
  const table = createDefaultFlowTable(rowCount, columnCount)
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
  return {
    state: createInitialEditorState(nextDoc),
    tableId: table.id,
    cellId: firstRow.cellIds[0],
  }
}

function getFlowTable(state: EditorState, tableId: string): FlowTableNode {
  const table = state.doc.document.sections[0].nodes[tableId]
  if (table?.type !== "flow-table") {
    throw new Error("expected flow table")
  }
  return table as unknown as FlowTableNode
}

function withDocumentV2GraphRuntime<T extends ReturnType<typeof createEditorOperationFromAction>>(
  state: EditorState,
  operation: T,
): T {
  return {
    ...operation,
    runtime: {
      documentGraph: createEditorDocumentGraphRuntime(state.doc),
    },
  }
}

function getFirstBodyParagraphId(state: EditorState): string {
  const section = state.doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected default document body")
  }
  const paragraphId = body.childIds.find((childId) => section.nodes[childId]?.type === "paragraph")
  if (!paragraphId) {
    throw new Error("expected body paragraph")
  }
  return paragraphId
}

describe("editor table operation plans", () => {
  it("declares scoped validation and graph context for table row insertion", () => {
    const { state, tableId } = createStateWithFlowTable()
    const operation = createEditorOperationFromAction({ type: "TABLE_ADD_ROW", tableId, afterIndex: 0 })

    const result = createTableStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
      validationScope: { kind: "table", tableId, fallback: "full-document" },
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "table.structure.patch",
      reducerPath: "TABLE_ADD_ROW",
      tableId,
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId: tableId,
          nodeType: "flow-table",
          parentKind: "childIds",
          parentType: "body",
          operationSurface: "table",
        }),
      ],
    }))
  })

  it("keeps missing-table action and operation no-op policies aligned", () => {
    const { state } = createStateWithFlowTable()
    const action = { type: "TABLE_REMOVE_COL" as const, tableId: "missing-table", colIndex: 0 }
    const operation = createEditorOperationFromAction(action)

    expect(createTableStructureOperationResult(state, operation)).toEqual(createTableStructureActionResult(state, action))
  })

  it("uses table structure command instead of compatibility snapshots", () => {
    const { state, tableId } = createStateWithFlowTable()
    const operation = {
      ...createEditorOperationFromAction({ type: "TABLE_ADD_ROW", tableId, afterIndex: 0 }),
      action: { type: "TABLE_ADD_ROW" as const, tableId: "missing-table", afterIndex: 0 },
      payload: { kind: "table.structure.patch" as const, mutation: "add-row" as const, tableId: "missing-table", afterIndex: 0 },
    }

    const result = createTableStructureOperationResult(state, operation)

    expect(result.status).toBe("success")
    if (result.status !== "success") return
    expect(getFlowTable({ ...state, doc: result.nextDoc }, tableId).rowIds).toHaveLength(3)
  })

  it("uses DocumentNode v2 graph runtime to allow table root structure planning", () => {
    const { state, tableId } = createStateWithFlowTable()
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({ type: "TABLE_ADD_ROW", tableId, afterIndex: 0 }),
    )

    const result = createTableStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
      validationScope: { kind: "table", tableId, fallback: "full-document" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecisionSource: "document-v2",
      graphDecision: "allow",
      graphDecisionAllowedSurfaces: ["table"],
    }))
  })

  it("fails table root planning when a supplied DocumentNode v2 graph cannot resolve the table", () => {
    const { state } = createStateWithFlowTable()
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({ type: "TABLE_ADD_ROW", tableId: "missing-table", afterIndex: 0 }),
    )

    const result = createTableStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
    }))
    expect(result.status === "failure" ? result.failure.reason : null).toBe("table-structure-document-v2-graph-unresolved")
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphContextResolved: false,
      graphDecision: "failure",
      graphDecisionReason: "unresolved-target-context",
    }))
  })

  it("declares paginated adoption for table column-pair resize", () => {
    const { state, tableId } = createStateWithFlowTable()
    const paginated = { ...state.paginated, sections: [...state.paginated.sections] }
    const operation = createEditorOperationFromAction({
      type: "RESIZE_TABLE_COLUMN_PAIR",
      tableId,
      leftColIndex: 0,
      leftWidth: 200,
      rightWidth: 100,
      paginated,
    })

    const result = createTableStructureOperationResult(state, operation)
    const beforeTable = getFlowTable(state, tableId)
    const afterTable = result.status === "success" ? getFlowTable({ ...state, doc: result.nextDoc }, tableId) : beforeTable

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
      validationScope: { kind: "table", tableId, fallback: "full-document" },
      historyPolicy: { kind: "push" },
      paginatedPatch: { paginated },
    }))
    expect(afterTable.columns).not.toEqual(beforeTable.columns)
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "table.structure.patch",
      reducerPath: "RESIZE_TABLE_COLUMN_PAIR",
      tableId,
      graphContextResolved: true,
    }))
  })

  it("declares full validation and table graph context for cell span edits", () => {
    const { state, tableId, cellId } = createStateWithFlowTable()
    const operation = createEditorOperationFromAction({
      type: "UPDATE_FLOW_TABLE_CELL_SPAN",
      cellId,
      changes: { colspan: 2 },
    })

    const result = createTableStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "table.structure.patch",
      reducerPath: "UPDATE_FLOW_TABLE_CELL_SPAN",
      cellId,
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId: cellId,
          nodeType: "flow-table-cell",
          parentKind: "cellIds",
          parentType: "flow-table-row",
          tableId,
          operationSurface: "table",
        }),
      ],
    }))
  })

  it("uses table cell span command instead of compatibility snapshots", () => {
    const { state, cellId } = createStateWithFlowTable()
    const operation = {
      ...createEditorOperationFromAction({
        type: "UPDATE_FLOW_TABLE_CELL_SPAN",
        cellId,
        changes: { colspan: 2 },
      }),
      action: {
        type: "UPDATE_FLOW_TABLE_CELL_SPAN" as const,
        cellId,
        changes: { colspan: 1 },
      },
      payload: { kind: "table.structure.patch" as const, mutation: "cell-span" as const, cellId, changes: { colspan: 1 } },
    }

    const result = createTableStructureOperationResult(state, operation)

    expect(result.status).toBe("success")
    if (result.status !== "success") return
    const table = Object.values(result.nextDoc.document.sections[0].nodes).find((node) => node.type === "flow-table") as FlowTableNode | undefined
    const cell = table?.nodes[cellId]
    expect(cell?.type).toBe("flow-table-cell")
    if (cell?.type !== "flow-table-cell") return
    expect(cell.props.colspan).toBe(2)
  })

  it("uses DocumentNode v2 graph runtime to scope table cell span edits to the table", () => {
    const { state, tableId, cellId } = createStateWithFlowTable()
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({
        type: "UPDATE_FLOW_TABLE_CELL_SPAN",
        cellId,
        changes: { colspan: 2 },
      }),
    )

    const result = createTableStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
      validationScope: { kind: "table", tableId, fallback: "full-document" },
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecision: "allow",
      graphDecisionAllowedSurfaces: ["table"],
    }))
  })

  it("uses DocumentNode v2 graph runtime to reject non-table paragraph targets before table paragraph mutation", () => {
    const { state } = createStateWithFlowTable()
    const paragraphId = getFirstBodyParagraphId(state)
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({ type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH", nodeId: paragraphId }),
    )

    const result = createTableStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "delete-empty-table-cell-paragraph-disallowed-by-document-v2-graph",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecision: "deny",
      graphDecisionReason: "missing-table-context",
      graphDecisionDeniedNodeIds: [paragraphId],
    }))
  })

  it("uses delete-empty table cell paragraph command instead of compatibility snapshots", () => {
    const { state, tableId, cellId } = createStateWithFlowTable()
    const table = getFlowTable(state, tableId)
    const cell = table.nodes[cellId]
    if (cell?.type !== "flow-table-cell") {
      throw new Error("expected flow table cell")
    }
    const paragraphId = cell.childIds[0]
    const operation = {
      ...createEditorOperationFromAction({ type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH", nodeId: paragraphId, text: "" }),
      action: {
        type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH" as const,
        nodeId: "missing-paragraph",
        text: "wrong",
      },
      payload: {
        kind: "table.structure.patch" as const,
        mutation: "delete-empty-cell-paragraph" as const,
        nodeId: "missing-paragraph",
        text: "wrong",
      },
    }

    const result = createTableStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "delete-empty-table-cell-paragraph-noop",
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      nodeId: paragraphId,
      targetNodeIds: [paragraphId],
    }))
  })

  it("keeps delete-empty table cell paragraph action and operation planning aligned", () => {
    const { state } = createStateWithFlowTable()
    const action = { type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH" as const, nodeId: "missing-paragraph" }
    const operation = createEditorOperationFromAction(action)

    expect(createTableStructureOperationResult(state, operation)).toEqual(createTableStructureActionResult(state, action))
  })
})
