import { createDefaultDocument } from "@/document"
import { pt } from "@/schema"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState, reducer } from "../editorReducer"
import type { EditorState } from "../editorReducer"

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

function getParagraphText(doc: DocumentNode, nodeId: string): string {
  return getParagraph(doc, nodeId).children
    .map((child) => child.type === "text" ? child.text : "")
    .join("")
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

describe("editorReducer text, props, and field mutations", () => {
  it("keeps UPDATE_PROPS empty-change behavior reference-stable", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)

    const next = reducer(state, { type: "UPDATE_PROPS", nodeId, changes: {} })

    expect(next).toBe(state)
  })

  it("commits UPDATE_PROPS through history without changing selection", () => {
    const state: EditorState = {
      ...createInitialEditorState(createDefaultDocument()),
      selectedNodeId: "selected-node",
      selectionAnchorNodeId: "selected-node",
    }
    const nodeId = getFirstBodyChildId(state.doc)

    const next = reducer(state, { type: "UPDATE_PROPS", nodeId, changes: { fontSize: pt(18) } })
    const paragraph = getParagraph(next.doc, nodeId)

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(next.selectedNodeId).toBe("selected-node")
    expect(next.selectionAnchorNodeId).toBe("selected-node")
    expect(paragraph.props.fontSize).toEqual(pt(18))
  })

  it("commits UPDATE_TEXT through history", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)

    const next = reducer(state, { type: "UPDATE_TEXT", nodeId, text: "Changed text" })

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(getParagraphText(next.doc, nodeId)).toBe("Changed text")
  })

  it("commits UPDATE_FIELD_REF through history", () => {
    const { state, nodeId, fieldRefId } = createStateWithFieldRef()

    const next = reducer(state, {
      type: "UPDATE_FIELD_REF",
      fieldRefId,
      changes: { label: "Client", fallback: "N/A" },
    })
    const fieldRef = getParagraph(next.doc, nodeId).children.find((child) => child.id === fieldRefId)

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(fieldRef?.type).toBe("fieldRef")
    if (fieldRef?.type !== "fieldRef") return
    expect(fieldRef.label).toBe("Client")
    expect(fieldRef.fallback).toBe("N/A")
  })
})
