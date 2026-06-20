import { createDefaultDocument } from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createParagraphMergeActionResult,
  createParagraphMergeOperationResult,
  createParagraphSplitOperationResult,
} from "../editorParagraphOperationPlans"
import { createEditorDocumentGraphRuntime } from "../editorOperationRuntime"

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

function createTextState(text = "Hello world") {
  const doc = createDefaultDocument()
  const nodeId = getFirstBodyChildId(doc)
  const paragraph = getParagraph(doc, nodeId)
  const section = doc.document.sections[0]
  const nextDoc: DocumentNode = {
    ...doc,
    document: {
      ...doc.document,
      sections: doc.document.sections.map((current, index) => index === 0
        ? {
            ...section,
            nodes: {
              ...section.nodes,
              [nodeId]: {
                ...paragraph,
                children: [{ id: "text-1", type: "text", text }],
              },
            },
          }
        : current),
    },
  }
  return { state: createInitialEditorState(nextDoc), nodeId }
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

function getBodyRootId(state: EditorState): string {
  return state.doc.document.sections[0].bodyRootId
}

describe("editor paragraph operation plans", () => {
  it("declares full validation and split refocus policy for paragraph splits", () => {
    const { state, nodeId } = createTextState()
    const operation = createEditorOperationFromAction({
      type: "SPLIT_PARAGRAPH",
      nodeId,
      splitIndex: "Hello ".length,
    })

    const result = createParagraphSplitOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push", entry: undefined },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "paragraph.split",
      reducerPath: "fallback",
      validationPolicy: "full",
    }))
    if (result.status !== "success") return
    expect(result.selectionPatch?.lastSplitNodeId).toBeTruthy()
  })

  it("uses DocumentNode v2 graph runtime to allow paragraph split planning", () => {
    const { state, nodeId } = createTextState()
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({
        type: "SPLIT_PARAGRAPH",
        nodeId,
        newNodeId: "planned-new-node",
        splitIndex: "Hello ".length,
      }),
    )

    const result = createParagraphSplitOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      historyPolicy: { kind: "push", entry: undefined },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecisionSource: "document-v2",
      graphDecision: "allow",
      graphDecisionAllowedSurfaces: ["inline"],
      targetNodeIds: [nodeId],
    }))
  })

  it("uses paragraph split command instead of the compatibility action snapshot", () => {
    const { state, nodeId } = createTextState()
    const operation = {
      ...createEditorOperationFromAction({
        type: "SPLIT_PARAGRAPH",
        nodeId,
        splitIndex: "Hello ".length,
      }),
      action: {
        type: "SPLIT_PARAGRAPH" as const,
        nodeId: "missing-node",
        splitIndex: 0,
      },
    }

    const result = createParagraphSplitOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      targetNodeIds: [nodeId],
    }))
  })

  it("uses paragraph merge command instead of the compatibility action snapshot", () => {
    const { state, nodeId } = createTextState()
    const operation = {
      ...createEditorOperationFromAction({ type: "MERGE_PARAGRAPH", nodeId }),
      action: {
        type: "MERGE_PARAGRAPH" as const,
        nodeId: "missing-node",
      },
    }

    const result = createParagraphMergeOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "paragraph-merge-noop",
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      targetNodeIds: [nodeId],
    }))
  })

  it("uses DocumentNode v2 graph runtime to reject non-inline paragraph split targets", () => {
    const { state } = createTextState()
    const nodeId = getBodyRootId(state)
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({
        type: "SPLIT_PARAGRAPH",
        nodeId,
        splitIndex: 0,
      }),
    )

    const result = createParagraphSplitOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "noop",
      noopReason: "paragraph-split-disallowed-by-document-v2-graph",
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

  it("fails paragraph merge planning when a supplied DocumentNode v2 graph cannot resolve the target", () => {
    const { state } = createTextState()
    const operation = withDocumentV2GraphRuntime(
      state,
      createEditorOperationFromAction({ type: "MERGE_PARAGRAPH", nodeId: "missing-node" }),
    )

    const result = createParagraphMergeOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document graph unresolved" },
    }))
    expect(result.status === "failure" ? result.failure.reason : null).toBe("paragraph-merge-document-v2-graph-unresolved")
    expect(result.diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphDecision: "failure",
      graphDecisionReason: "unresolved-target-context",
    }))
  })

  it("keeps merge no-op action and operation policies aligned", () => {
    const { state, nodeId } = createTextState()
    const action = { type: "MERGE_PARAGRAPH" as const, nodeId }
    const operation = createEditorOperationFromAction(action)

    expect(createParagraphMergeOperationResult(state, operation)).toEqual(createParagraphMergeActionResult(state, action))
  })
})
