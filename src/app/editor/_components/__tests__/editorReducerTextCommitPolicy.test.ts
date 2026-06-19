import { createDefaultDocument } from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState, reducer } from "../editorReducer"

function getFirstBodyChildId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected default document body child")
  }
  return body.childIds[0]
}

function getParagraph(doc: DocumentNode, nodeId: string): ParagraphNode {
  const node = doc.document.sections[0].nodes[nodeId]
  if (node?.type !== "paragraph") throw new Error(`expected paragraph ${nodeId}`)
  return node
}

function getParagraphText(doc: DocumentNode, nodeId: string): string {
  return getParagraph(doc, nodeId).children.map((child) => child.type === "text" ? child.text : "").join("")
}

describe("editorReducer text commit policy", () => {
  it("adopts inline commit pagination without history when text is unchanged", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const beforeText = getParagraphText(state.doc, nodeId)
    const afterPaginated = { ...state.paginated, tocEntries: [...state.paginated.tocEntries] }

    const next = reducer(state, {
      type: "COMMIT_INLINE_TEXT_EDIT",
      nodeId,
      beforeDoc: state.doc,
      beforePaginated: state.paginated,
      beforeText,
      afterPaginated,
    })

    expect(next.doc).toBe(state.doc)
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([])
    expect(next.future).toEqual([])
  })

  it("commits inline text edits as history-only with adopted pagination", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const beforeText = getParagraphText(state.doc, nodeId)
    const draft = reducer(state, {
      type: "UPDATE_INLINE_TEXT_DRAFT",
      nodeId,
      text: "Inline committed text",
    })
    const afterPaginated = { ...draft.paginated, tocEntries: [...draft.paginated.tocEntries] }

    const next = reducer(draft, {
      type: "COMMIT_INLINE_TEXT_EDIT",
      nodeId,
      beforeDoc: state.doc,
      beforePaginated: state.paginated,
      beforeText,
      afterPaginated,
    })

    expect(next.doc).toBe(draft.doc)
    expect(getParagraphText(next.doc, nodeId)).toBe("Inline committed text")
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
  })

  it("commits WYSIWYG text edits through the operation commit policy", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const beforeText = getParagraphText(state.doc, nodeId)
    const afterPaginated = { ...state.paginated, tocEntries: [...state.paginated.tocEntries] }

    const next = reducer(state, {
      type: "COMMIT_WYSIWYG_TEXT_EDIT",
      nodeId,
      beforeText,
      text: "WYSIWYG committed text",
      afterPaginated,
    })

    expect(getParagraphText(next.doc, nodeId)).toBe("WYSIWYG committed text")
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
  })

  it("commits WYSIWYG rich text edits through the operation commit policy", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const paragraph = getParagraph(state.doc, nodeId)
    const afterPaginated = { ...state.paginated, tocEntries: [...state.paginated.tocEntries] }

    const next = reducer(state, {
      type: "COMMIT_WYSIWYG_RICH_TEXT_EDIT",
      nodeId,
      paragraph: {
        ...paragraph,
        children: [{ id: "rich-text-1", type: "text", text: "Rich committed text", style: { fontWeight: "bold" } }],
      },
      afterPaginated,
    })

    expect(getParagraphText(next.doc, nodeId)).toBe("Rich committed text")
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
  })
})
