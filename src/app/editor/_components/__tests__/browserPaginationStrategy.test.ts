import { describe, expect, it } from "vitest"
import { createDefaultDocument, createParagraphNode } from "@/document"
import type { BodyNode, DocumentNode } from "@/schema"
import {
  BACKGROUND_BROWSER_PAGINATION_WEIGHT_THRESHOLD,
  estimateDocumentPaginationWeight,
  shouldUseBackgroundBrowserPagination,
} from "../browserPaginationStrategy"

function makeDocumentWithParagraphs(count: number): DocumentNode {
  const doc = createDefaultDocument("Pagination strategy")
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

describe("browser pagination strategy", () => {
  it("keeps small documents on main-thread preview pagination", () => {
    const doc = makeDocumentWithParagraphs(8)

    expect(estimateDocumentPaginationWeight(doc)).toBeLessThan(BACKGROUND_BROWSER_PAGINATION_WEIGHT_THRESHOLD)
    expect(shouldUseBackgroundBrowserPagination({
      doc,
      canUseWorker: true,
      inlineEditNodeId: null,
    })).toBe(false)
  })

  it("routes long non-editing documents to the background worker", () => {
    const doc = makeDocumentWithParagraphs(BACKGROUND_BROWSER_PAGINATION_WEIGHT_THRESHOLD)

    expect(shouldUseBackgroundBrowserPagination({
      doc,
      canUseWorker: true,
      inlineEditNodeId: null,
    })).toBe(true)
  })

  it("does not use the worker when inline editing owns preview pagination", () => {
    const doc = makeDocumentWithParagraphs(BACKGROUND_BROWSER_PAGINATION_WEIGHT_THRESHOLD)

    expect(shouldUseBackgroundBrowserPagination({
      doc,
      canUseWorker: true,
      inlineEditNodeId: "p1",
    })).toBe(false)
  })
})
