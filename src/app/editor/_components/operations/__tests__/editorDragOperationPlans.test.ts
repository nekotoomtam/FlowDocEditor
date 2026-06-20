import { createDefaultDocument } from "@/document"
import type { DocumentNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createDragPlacementActionResult,
  createDragPlacementOperationResult,
} from "../editorDragOperationPlans"
import { createEditorDocumentGraphRuntime } from "../editorOperationRuntime"

function getBodyChildIds(doc: DocumentNode): string[] {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected body")
  }
  return body.childIds
}

function createDragCommitAction(state: EditorState) {
  const section = state.doc.document.sections[0]
  const anchorNodeId = getBodyChildIds(state.doc)[0]
  return {
    type: "DRAG_COMMIT" as const,
    sectionId: section.id,
    op: { kind: "insert-after" as const, parentId: section.bodyRootId, parentType: "body" as const, index: 1, anchorNodeId },
  }
}

function createActiveDragState(): EditorState {
  const baseState = createInitialEditorState(createDefaultDocument())
  return {
    ...baseState,
    drag: {
      source: { source: "palette", blockType: "paragraph" },
      clientX: 10,
      clientY: 20,
      preview: null,
    },
  }
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

describe("editor drag operation plans", () => {
  it("keeps missing active drag action and operation policies aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const action = createDragCommitAction(state)
    const operation = createEditorOperationFromAction(action)

    expect(createDragPlacementOperationResult(state, operation)).toEqual(createDragPlacementActionResult(state, action))
  })

  it("declares full validation and clears drag state for active placement", () => {
    const state = createActiveDragState()
    const operation = createEditorOperationFromAction(createDragCommitAction(state))

    const result = createDragPlacementOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
      selectionPatch: { drag: null },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "drag.placement",
      reducerPath: "DRAG_COMMIT",
      placementKind: "insert-after",
    }))
    if (result.status !== "success") return
    expect(getBodyChildIds(result.nextDoc)).toHaveLength(getBodyChildIds(state.doc).length + 1)
  })

  it("uses drag placement command instead of the compatibility action snapshot", () => {
    const state = createActiveDragState()
    const operation = {
      ...createEditorOperationFromAction(createDragCommitAction(state)),
      action: {
        type: "DRAG_COMMIT" as const,
        sectionId: "missing-section",
        op: { kind: "insert-into-container" as const, containerId: "missing-container", containerType: "body" as const, index: 0 },
      },
    }

    const result = createDragPlacementOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      sectionId: state.doc.document.sections[0].id,
      placementKind: "insert-after",
    }))
    if (result.status !== "success") return
    expect(getBodyChildIds(result.nextDoc)).toHaveLength(getBodyChildIds(state.doc).length + 1)
  })

  it("uses DocumentNode v2 graph runtime to allow active drag placement preflight", () => {
    const state = createActiveDragState()
    const operation = withDocumentV2GraphRuntime(state, createEditorOperationFromAction(createDragCommitAction(state)))

    const result = createDragPlacementOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecisionSource: "document-v2",
      graphDecision: "allow",
      targetNodeIds: [state.doc.document.sections[0].bodyRootId, getBodyChildIds(state.doc)[0]],
    }))
  })

  it("fails active drag placement when a supplied DocumentNode v2 graph cannot resolve the placement anchor", () => {
    const state = createActiveDragState()
    const section = state.doc.document.sections[0]
    const action = {
      type: "DRAG_COMMIT" as const,
      sectionId: section.id,
      op: {
        kind: "insert-after" as const,
        parentId: section.bodyRootId,
        parentType: "body" as const,
        index: 1,
        anchorNodeId: "missing-anchor",
      },
    }
    const operation = withDocumentV2GraphRuntime(state, createEditorOperationFromAction(action))

    const result = createDragPlacementOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
    }))
    expect(result.status === "failure" ? result.failure.reason : null).toBe("drag-placement-document-v2-graph-unresolved")
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphContextResolved: false,
      graphDecision: "failure",
      graphDecisionReason: "unresolved-target-context",
      targetNodeIds: [section.bodyRootId, "missing-anchor"],
    }))
  })
})
