import { describe, expect, it } from "vitest"
import { assertPaginatedDocument, paginateDocument } from "@/pagination"
import { createDefaultDocument, createParagraphNode } from "@/document"
import { defaultTextMeasurer } from "@/layout"
import type { BodyNode, DocumentNode } from "@/schema"
import { createEditorPlaceholderPaginatedDocument } from "../editorInitialPagination"
import { createInitialEditorState, reducer } from "../editorReducer"

function makeDocumentWithParagraphs(count: number): DocumentNode {
  const doc = createDefaultDocument("Long")
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId] as BodyNode
  body.childIds = []
  for (let index = 0; index < count; index++) {
    const paragraph = createParagraphNode(`Paragraph ${index + 1}`)
    section.nodes[paragraph.id] = paragraph
    body.childIds.push(paragraph.id)
  }
  return doc
}

describe("editor initial pagination placeholder", () => {
  it("creates a valid empty page shell without running full pagination", () => {
    const doc = makeDocumentWithParagraphs(12)
    const paginated = createEditorPlaceholderPaginatedDocument(doc)

    expect(paginated.tocEntries).toEqual([])
    expect(paginated.sections).toHaveLength(1)
    expect(paginated.sections[0].pages).toHaveLength(1)
    expect(paginated.sections[0].pages[0].fragments).toEqual([])
    expect(() => assertPaginatedDocument(paginated)).not.toThrow()
  })

  it("initial editor state starts with the placeholder pagination shell", () => {
    const state = createInitialEditorState(makeDocumentWithParagraphs(4))

    expect(state.paginated.sections[0].pages[0].fragments).toEqual([])
  })

  it("keeps an explicit load-document pagination result when provided", () => {
    const doc = makeDocumentWithParagraphs(4)
    const fullPaginated = paginateDocument(doc, defaultTextMeasurer)
    const state = createInitialEditorState(createDefaultDocument("Initial"))
    const next = reducer(state, { type: "LOAD_DOCUMENT", doc, paginated: fullPaginated })

    expect(next.paginated).toBe(fullPaginated)
  })
})
