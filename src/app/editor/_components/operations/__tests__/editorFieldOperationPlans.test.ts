import { createDefaultDocument } from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createFieldPatchActionResult,
  createFieldPatchOperationResult,
} from "../editorFieldOperationPlans"

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

function createStateWithFieldRef(): { state: EditorState; nodeId: string; fieldRefId: string } {
  const doc = createDefaultDocument()
  const section = doc.document.sections[0]
  const nodeId = getFirstBodyChildId(doc)
  const paragraph = getParagraph(doc, nodeId)
  const fieldRefId = "field-1"
  const paragraphWithField: ParagraphNode = {
    ...paragraph,
    children: [
      { id: "text-1", type: "text", text: "Customer: " },
      { id: fieldRefId, type: "fieldRef", key: "customer.name", label: "Customer", fallback: "-" },
    ],
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
              [nodeId]: paragraphWithField,
            },
          }
        : current),
    },
  }
  return { state: createInitialEditorState(nextDoc), nodeId, fieldRefId }
}

describe("editor field operation plans", () => {
  it("keeps field patch action and operation policies aligned", () => {
    const { state, fieldRefId } = createStateWithFieldRef()
    const action = {
      type: "UPDATE_FIELD_REF" as const,
      fieldRefId,
      changes: { label: "Client", fallback: "N/A" },
    }
    const operation = createEditorOperationFromAction(action)

    expect(createFieldPatchOperationResult(state, operation)).toEqual(createFieldPatchActionResult(state, action))
  })

  it("commits field patches through full validation", () => {
    const { state, nodeId, fieldRefId } = createStateWithFieldRef()
    const operation = createEditorOperationFromAction({
      type: "UPDATE_FIELD_REF",
      fieldRefId,
      changes: { label: "Client", fallback: "N/A" },
    })

    const result = createFieldPatchOperationResult(state, operation)
    const fieldRef = result.status === "success"
      ? getParagraph(result.nextDoc, nodeId).children.find((child) => child.id === fieldRefId)
      : undefined

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "field.patch",
      reducerPath: "UPDATE_FIELD_REF",
      fieldRefId,
    }))
    expect(fieldRef?.type).toBe("fieldRef")
    if (fieldRef?.type !== "fieldRef") return
    expect(fieldRef.label).toBe("Client")
    expect(fieldRef.fallback).toBe("N/A")
  })
})
