import { createDefaultDocument, duplicateNode } from "@/document"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createNodeDuplicateActionResult,
  createNodeDuplicateOperationResult,
  createNodeDeleteActionResult,
  createNodeDeleteOperationResult,
  createNodeReorderActionResult,
  createNodeReorderOperationResult,
} from "../editorNodeOperationPlans"
import { createEditorDocumentGraphRuntime } from "../editorOperationRuntime"

function getFirstBodyChildId(state: EditorState): string {
  const section = state.doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected default document body child")
  }
  return body.childIds[0]
}

function getBodyChildIds(state: EditorState): string[] {
  const section = state.doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected default document body")
  }
  return body.childIds
}

function getBodyRootId(state: EditorState): string {
  return state.doc.document.sections[0].bodyRootId
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

function createStateWithTwoBodyChildren(): EditorState {
  const baseState = createInitialEditorState(createDefaultDocument())
  const firstNodeId = getFirstBodyChildId(baseState)
  const result = duplicateNode(baseState.doc, firstNodeId)
  if (!result.duplicatedNodeId) {
    throw new Error("expected duplicated node")
  }
  return createInitialEditorState(result.doc)
}

describe("editor node operation plans", () => {
  it("declares read-only noop policy for missing node deletes", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const operation = createEditorOperationFromAction({ type: "DELETE_NODE", nodeId: "missing-node" })

    const result = createNodeDeleteOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "node-delete-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
    }))
  })

  it("declares full validation, history push, and selection clearing for node deletes", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const operation = createEditorOperationFromAction({ type: "DELETE_NODE", nodeId })

    const result = createNodeDeleteOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      validationScope: { kind: "node-subtree", nodeIds: [nodeId], fallback: "full-document" },
      historyPolicy: { kind: "push" },
      selectionPatch: { selectedNodeId: null, selectionAnchorNodeId: null },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "current-document",
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId,
          nodeType: "paragraph",
          parentKind: "childIds",
          parentType: "body",
          operationSurface: "inline",
          canDelete: true,
        }),
      ],
    }))
  })

  it("consumes DocumentNode v2 graph runtime for node delete planning diagnostics", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({ type: "DELETE_NODE", nodeId }),
    )

    const result = createNodeDeleteOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "node.delete",
      graphSourceModel: "document-v2",
      graphDecisionSource: "document-v2",
      graphDecision: "allow",
      graphDecisionCapability: "canDelete",
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId,
          nodeType: "paragraph",
          parentKind: "childIds",
          parentType: "body",
          operationSurface: "inline",
          canDelete: true,
        }),
      ],
    }))
  })

  it("uses node delete command instead of compatibility snapshots", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const operation = {
      ...createEditorOperationFromAction({ type: "DELETE_NODE", nodeId }),
      action: { type: "DELETE_NODE" as const, nodeId: "missing-node" },
      payload: { kind: "node.delete" as const, nodeId: "missing-node" },
    }

    const result = createNodeDeleteOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationScope: { kind: "node-subtree", nodeIds: [nodeId], fallback: "full-document" },
    }))
  })

  it("uses DocumentNode v2 capabilities to reject non-deletable node targets before mutation", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getBodyRootId(state)
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({ type: "DELETE_NODE", nodeId }),
    )

    const result = createNodeDeleteOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "node-delete-disallowed-by-document-v2-graph",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecision: "deny",
      graphDecisionCapability: "canDelete",
      graphDecisionDeniedNodeIds: [nodeId],
    }))
  })

  it("fails node duplicate planning when a supplied DocumentNode v2 graph cannot resolve the target", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({ type: "DUPLICATE_NODE", nodeId: "missing-node" }),
    )

    const result = createNodeDuplicateOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
    }))
    expect(result.status === "failure" ? result.failure.reason : null).toBe("node-duplicate-document-v2-graph-unresolved")
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphContextResolved: false,
      graphDecision: "failure",
      graphDecisionCapability: "canDuplicate",
      graphDecisionReason: "unresolved-target-context",
    }))
  })

  it("keeps legacy action and operation delete planning behavior aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const action = { type: "DELETE_NODE" as const, nodeId }
    const operation = createEditorOperationFromAction(action)

    expect(createNodeDeleteOperationResult(state, operation)).toEqual(createNodeDeleteActionResult(state, action))
  })

  it("declares read-only noop policy for missing node duplicates", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const operation = createEditorOperationFromAction({ type: "DUPLICATE_NODE", nodeId: "missing-node" })

    const result = createNodeDuplicateOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "node-duplicate-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
    }))
  })

  it("declares full validation, history push, and duplicate selection for node duplicates", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const operation = createEditorOperationFromAction({ type: "DUPLICATE_NODE", nodeId })

    const result = createNodeDuplicateOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      validationScope: { kind: "node-subtree", nodeIds: [nodeId], fallback: "full-document" },
      historyPolicy: { kind: "push" },
    }))
    expect(result.status === "success" ? result.selectionPatch?.selectedNodeId : null).toBeTruthy()
    expect(result.status === "success" ? result.selectionPatch?.selectedNodeId : null).not.toBe(nodeId)
  })

  it("uses node duplicate command instead of compatibility snapshots", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const operation = {
      ...createEditorOperationFromAction({ type: "DUPLICATE_NODE", nodeId }),
      action: { type: "DUPLICATE_NODE" as const, nodeId: "missing-node" },
      payload: { kind: "node.duplicate" as const, nodeId: "missing-node" },
    }

    const result = createNodeDuplicateOperationResult(state, operation)

    expect(result.status).toBe("success")
    if (result.status !== "success") return
    expect(result.selectionPatch?.selectedNodeId).toBeTruthy()
    expect(result.selectionPatch?.selectedNodeId).not.toBe(nodeId)
  })

  it("keeps legacy action and operation duplicate planning policy aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const action = { type: "DUPLICATE_NODE" as const, nodeId: "missing-node" }
    const operation = createEditorOperationFromAction(action)

    expect(createNodeDuplicateOperationResult(state, operation)).toEqual(createNodeDuplicateActionResult(state, action))
  })

  it("declares read-only noop policy for missing body reorder targets", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const sectionId = state.doc.document.sections[0].id
    const operation = createEditorOperationFromAction({
      type: "REORDER_BODY_CHILD",
      sectionId,
      sourceNodeId: nodeId,
      targetNodeId: "missing-node",
      position: "after",
    })

    const result = createNodeReorderOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "body-reorder-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
    }))
  })

  it("declares full validation, history push, and source selection for body reorders", () => {
    const state = createStateWithTwoBodyChildren()
    const [targetNodeId, sourceNodeId] = getBodyChildIds(state)
    const sectionId = state.doc.document.sections[0].id
    const operation = createEditorOperationFromAction({
      type: "REORDER_BODY_CHILD",
      sectionId,
      sourceNodeId,
      targetNodeId,
      position: "before",
    })

    const result = createNodeReorderOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      validationScope: { kind: "node-subtree", nodeIds: [sourceNodeId, targetNodeId], fallback: "full-document" },
      historyPolicy: { kind: "push" },
      selectionPatch: { selectedNodeId: sourceNodeId, selectionAnchorNodeId: sourceNodeId },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId: sourceNodeId,
          parentKind: "childIds",
          parentType: "body",
          siblingCount: 2,
        }),
        expect.objectContaining({
          nodeId: targetNodeId,
          parentKind: "childIds",
          parentType: "body",
          siblingCount: 2,
        }),
      ],
    }))
  })

  it("uses node reorder command instead of compatibility snapshots", () => {
    const state = createStateWithTwoBodyChildren()
    const [targetNodeId, sourceNodeId] = getBodyChildIds(state)
    const sectionId = state.doc.document.sections[0].id
    const operation = {
      ...createEditorOperationFromAction({
        type: "REORDER_BODY_CHILD",
        sectionId,
        sourceNodeId,
        targetNodeId,
        position: "before",
      }),
      action: {
        type: "REORDER_BODY_CHILD" as const,
        sectionId,
        sourceNodeId: "missing-source",
        targetNodeId: "missing-target",
        position: "after" as const,
      },
      payload: {
        kind: "node.reorder" as const,
        sectionId,
        sourceNodeId: "missing-source",
        targetNodeId: "missing-target",
        position: "after" as const,
      },
    }

    const result = createNodeReorderOperationResult(state, operation)

    expect(result.status).toBe("success")
    if (result.status !== "success") return
    expect(getBodyChildIds({ ...state, doc: result.nextDoc })).toEqual([sourceNodeId, targetNodeId])
  })

  it("keeps legacy action and operation reorder planning behavior aligned", () => {
    const state = createStateWithTwoBodyChildren()
    const [targetNodeId, sourceNodeId] = getBodyChildIds(state)
    const action = {
      type: "REORDER_BODY_CHILD" as const,
      sectionId: state.doc.document.sections[0].id,
      sourceNodeId,
      targetNodeId,
      position: "before" as const,
    }
    const operation = createEditorOperationFromAction(action)

    expect(createNodeReorderOperationResult(state, operation)).toEqual(createNodeReorderActionResult(state, action))
  })
})
