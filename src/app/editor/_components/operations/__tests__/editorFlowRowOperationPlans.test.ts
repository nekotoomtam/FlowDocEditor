import { createDefaultDocument, migrateDocumentToV2 } from "@/document"
import type { DocumentNode, LayoutNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createFlowRowAddColumnActionResult,
  createFlowRowAddColumnOperationResult,
  createFlowRowLayoutActionResult,
  createFlowRowLayoutOperationResult,
} from "../editorFlowRowOperationPlans"

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
            } as Record<string, LayoutNode>,
          }
        : current),
    },
  }
  return createInitialEditorState(nextDoc)
}

function withDocumentV2GraphRuntime<T extends ReturnType<typeof createEditorOperationFromAction>>(
  state: EditorState,
  operation: T,
): T {
  return {
    ...operation,
    runtime: {
      documentGraph: {
        sourceModel: "document-v2" as const,
        document: migrateDocumentToV2(state.doc),
      },
    },
  }
}

function getFirstFlowRowParagraphId(state: EditorState): string {
  const section = state.doc.document.sections[0]
  const stack = section.nodes["stack-1"]
  if (stack?.type !== "flow-stack" || stack.childIds.length === 0) {
    throw new Error("expected flow-stack paragraph")
  }
  return stack.childIds[0]
}

describe("editor flow-row operation plans", () => {
  it("declares scoped validation and graph context for flow-row add column", () => {
    const state = createStateWithFlowRow()
    const operation = createEditorOperationFromAction({
      type: "FLOW_ROW_ADD_COL",
      rowId: "row-1",
      stackId: "stack-1",
      position: "after",
    })

    const result = createFlowRowAddColumnOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
      validationScope: { kind: "flow-row", rowId: "row-1", fallback: "full-document" },
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "flow-row.structure.patch",
      reducerPath: "FLOW_ROW_ADD_COL",
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId: "row-1",
          nodeType: "flow-row",
          parentKind: "childIds",
          parentType: "body",
          operationSurface: "flow-row",
        }),
        expect.objectContaining({
          nodeId: "stack-1",
          nodeType: "flow-stack",
          parentKind: "childIds",
          parentType: "flow-row",
          siblingCount: 2,
          operationSurface: "flow-row",
        }),
      ],
    }))
  })

  it("keeps add-column action and operation no-op policies aligned", () => {
    const state = createStateWithFlowRow()
    const action = { type: "FLOW_ROW_ADD_COL" as const, rowId: "missing-row" }
    const operation = createEditorOperationFromAction(action)

    expect(createFlowRowAddColumnOperationResult(state, operation)).toEqual(createFlowRowAddColumnActionResult(state, action))
  })

  it("uses DocumentNode v2 graph runtime to allow flow-row structure planning", () => {
    const state = createStateWithFlowRow()
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({
        type: "FLOW_ROW_ADD_COL",
        rowId: "row-1",
        stackId: "stack-1",
        position: "after",
      }),
    )

    const result = createFlowRowAddColumnOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
      validationScope: { kind: "flow-row", rowId: "row-1", fallback: "full-document" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecisionSource: "document-v2",
      graphDecision: "allow",
      graphDecisionAllowedSurfaces: ["flow-row"],
    }))
  })

  it("uses DocumentNode v2 graph runtime to reject non-flow-row targets before flow-row mutation", () => {
    const state = createStateWithFlowRow()
    const paragraphId = getFirstFlowRowParagraphId(state)
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({
        type: "FLOW_ROW_ADD_COL",
        rowId: paragraphId,
      }),
    )

    const result = createFlowRowAddColumnOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "flow-row-add-column-disallowed-by-document-v2-graph",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecision: "deny",
      graphDecisionReason: "operation-surface-mismatch",
      graphDecisionDeniedNodeIds: [paragraphId],
    }))
  })

  it("declares graph context and paginated adoption for flow-row column resize", () => {
    const state = createStateWithFlowRow()
    const paginated = { ...state.paginated, sections: [...state.paginated.sections] }
    const operation = createEditorOperationFromAction({
      type: "RESIZE_COLUMNS",
      leftStackId: "stack-1",
      leftShare: 30,
      rightStackId: "stack-2",
      rightShare: 70,
      paginated,
    })

    const result = createFlowRowLayoutOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
      paginatedPatch: { paginated },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "flow-row.layout.patch",
      reducerPath: "RESIZE_COLUMNS",
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({ nodeId: "stack-1", parentType: "flow-row", siblingCount: 2 }),
        expect.objectContaining({ nodeId: "stack-2", parentType: "flow-row", siblingCount: 2 }),
      ],
    }))
  })

  it("keeps resize row min-height action and operation planning aligned", () => {
    const state = createStateWithFlowRow()
    const action = { type: "RESIZE_ROW_MIN_HEIGHT" as const, rowId: "row-1", minHeight: 96 }
    const operation = createEditorOperationFromAction(action)

    expect(createFlowRowLayoutOperationResult(state, operation)).toEqual(createFlowRowLayoutActionResult(state, action))
  })

  it("fails flow-row layout planning when a supplied DocumentNode v2 graph cannot resolve the row", () => {
    const state = createStateWithFlowRow()
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({ type: "RESIZE_ROW_MIN_HEIGHT", rowId: "missing-row", minHeight: 96 }),
    )

    const result = createFlowRowLayoutOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
    }))
    expect(result.status === "failure" ? result.failure.reason : null).toBe("flow-row-resize-min-height-document-v2-graph-unresolved")
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphContextResolved: false,
      graphDecision: "failure",
      graphDecisionReason: "unresolved-target-context",
    }))
  })
})
