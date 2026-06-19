import { createDefaultDocument, migrateDocumentToV2 } from "@/document"
import type { DocumentNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import { createNodeDeleteOperationResult } from "../editorNodeOperationPlans"
import {
  attachEditorOperationDocumentGraphRuntime,
  shouldAttachDocumentGraphRuntime,
} from "../editorOperationRuntime"

function getFirstBodyChildId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected default document body child")
  }
  return body.childIds[0]
}

function createDragCommitAction(state: EditorState) {
  const section = state.doc.document.sections[0]
  const anchorNodeId = getFirstBodyChildId(state.doc)
  return {
    type: "DRAG_COMMIT" as const,
    sectionId: section.id,
    op: { kind: "insert-after" as const, parentId: section.bodyRootId, parentType: "body" as const, index: 1, anchorNodeId },
  }
}

describe("editor operation runtime", () => {
  it("attaches DocumentNode v2 graph runtime for graph-backed operation planning", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = createEditorOperationFromAction({ type: "DELETE_NODE", nodeId })

    const operationWithRuntime = attachEditorOperationDocumentGraphRuntime(operation, state.doc)
    const result = createNodeDeleteOperationResult(state, operationWithRuntime)

    expect(operationWithRuntime).not.toBe(operation)
    expect(operationWithRuntime.runtime?.documentGraph?.sourceModel).toBe("document-v2")
    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "scoped",
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "node.delete",
      graphSourceModel: "document-v2",
      graphDecisionSource: "document-v2",
      graphDecision: "allow",
    }))
  })

  it("keeps text draft operations on the lightweight runtime path", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = createEditorOperationFromAction({
      type: "UPDATE_INLINE_TEXT_DRAFT",
      nodeId,
      text: "Draft text",
    })

    expect(shouldAttachDocumentGraphRuntime(operation)).toBe(false)
    expect(attachEditorOperationDocumentGraphRuntime(operation, state.doc)).toBe(operation)
    expect(operation.runtime?.documentGraph).toBeUndefined()
  })

  it("preserves existing DocumentNode v2 graph runtime", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = {
      ...createEditorOperationFromAction({ type: "DELETE_NODE", nodeId }),
      runtime: {
        documentGraph: {
          sourceModel: "document-v2" as const,
          document: migrateDocumentToV2(state.doc),
        },
      },
    }

    expect(attachEditorOperationDocumentGraphRuntime(operation, state.doc)).toBe(operation)
  })

  it("attaches graph runtime for drag operations even when the static scope has no node ids", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const operation = createEditorOperationFromAction(createDragCommitAction(state))

    const operationWithRuntime = attachEditorOperationDocumentGraphRuntime(operation, state.doc)

    expect(operation.kind).toBe("drag.placement")
    expect(operation.scope.nodeIds).toEqual([])
    expect(operationWithRuntime.runtime?.documentGraph?.sourceModel).toBe("document-v2")
  })
})
