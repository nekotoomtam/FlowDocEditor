import { createDefaultDocument } from "@/document"
import { pt } from "@/schema"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createNodePropsActionResult,
  createNodePropsOperationResult,
} from "../editorNodePropsOperationPlans"

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

describe("editor node props operation plans", () => {
  it("declares full validation and graph context for node prop updates", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = createEditorOperationFromAction({
      type: "UPDATE_PROPS",
      nodeId,
      changes: { fontSize: pt(18) },
    })

    const result = createNodePropsOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "node.props.patch",
      reducerPath: "UPDATE_PROPS",
      nodeId,
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId,
          nodeType: "paragraph",
          parentKind: "childIds",
          parentType: "body",
        }),
      ],
    }))
    if (result.status !== "success") return
    expect(getParagraph(result.nextDoc, nodeId).props.fontSize).toEqual(pt(18))
  })

  it("keeps empty-change action and operation policies aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const action = { type: "UPDATE_PROPS" as const, nodeId, changes: {} }
    const operation = createEditorOperationFromAction(action)

    expect(createNodePropsOperationResult(state, operation)).toEqual(createNodePropsActionResult(state, action))
  })
})
