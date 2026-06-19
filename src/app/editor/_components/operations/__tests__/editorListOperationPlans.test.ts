import { createDefaultDocument, migrateDocumentToV2, TOR_CLAUSE_LIST_STYLE_ID } from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createListStructureActionResult,
  createListStructureOperationResult,
} from "../editorListOperationPlans"

function getFirstBodyChildId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected document body child")
  }
  return body.childIds[0]
}

function getParagraph(doc: DocumentNode, nodeId: string): ParagraphNode {
  const node = doc.document.sections[0].nodes[nodeId]
  if (node?.type !== "paragraph") {
    throw new Error(`expected paragraph ${nodeId}`)
  }
  return node
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

function getBodyRootId(state: EditorState): string {
  return state.doc.document.sections[0].bodyRootId
}

describe("editor list operation plans", () => {
  it("declares full validation and graph context for list preset toggles", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = createEditorOperationFromAction({
      type: "TOGGLE_LIST_PRESET",
      nodeId,
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      level: 0,
    })

    const result = createListStructureOperationResult(state, operation)
    const paragraph = result.status === "success" ? getParagraph(result.nextDoc, nodeId) : undefined

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push", entry: undefined },
      selectionPatch: { selectedNodeId: nodeId, selectionAnchorNodeId: nodeId },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "list.structure.patch",
      reducerPath: "TOGGLE_LIST_PRESET",
      nodeId,
      graphContextResolved: true,
    }))
    expect(paragraph?.props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: nodeId })
  })

  it("uses DocumentNode v2 graph runtime to allow list structure planning", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({
        type: "TOGGLE_LIST_PRESET",
        nodeId,
        styleId: TOR_CLAUSE_LIST_STYLE_ID,
        instanceId: "tor-main",
        level: 0,
      }),
    )

    const result = createListStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
      historyPolicy: { kind: "push", entry: undefined },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecisionSource: "document-v2",
      graphDecision: "allow",
      graphDecisionAllowedSurfaces: ["inline"],
    }))
  })

  it("uses DocumentNode v2 graph runtime to reject non-inline list targets", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getBodyRootId(state)
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({
        type: "TOGGLE_LIST_PRESET",
        nodeId,
        styleId: TOR_CLAUSE_LIST_STYLE_ID,
        instanceId: "tor-main",
        level: 0,
      }),
    )

    const result = createListStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "list-structure-disallowed-by-document-v2-graph",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecision: "deny",
      graphDecisionReason: "operation-surface-mismatch",
      graphDecisionDeniedNodeIds: [nodeId],
    }))
  })

  it("fails list structure planning when a supplied DocumentNode v2 graph cannot resolve the target", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({
        type: "TOGGLE_LIST_PRESET",
        nodeId: "missing-node",
        styleId: TOR_CLAUSE_LIST_STYLE_ID,
        instanceId: "tor-main",
        level: 0,
      }),
    )

    const result = createListStructureOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
    }))
    expect(result.status === "failure" ? result.failure.reason : null).toBe("list-structure-document-v2-graph-unresolved")
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecision: "failure",
      graphDecisionReason: "unresolved-target-context",
    }))
  })

  it("keeps exit-list no-op action and operation policies aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const action = { type: "EXIT_LIST_ITEM" as const, nodeId }
    const operation = createEditorOperationFromAction(action)

    expect(createListStructureOperationResult(state, operation)).toEqual(createListStructureActionResult(state, action))
  })
})
