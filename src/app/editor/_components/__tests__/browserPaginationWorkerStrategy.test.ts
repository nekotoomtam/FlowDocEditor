import { describe, expect, it } from "vitest"
import { createDefaultDocument, createParagraphNode } from "@/document"
import { defaultTextMeasurer } from "@/layout"
import { paginateDocument } from "@/pagination"
import type { BodyNode, DocumentNode, PageBreakNode } from "@/schema"
import type { BrowserPaginationWorkerPaginateRequest } from "../browserPaginationWorkerTypes"
import { tryBuildBrowserPaginationPartialResponse } from "../browserPaginationWorkerStrategy"

function pageBreak(id: string): PageBreakNode {
  return { id, type: "page-break", props: {} }
}

function makeBodyBasicDocument(pageCount: number): DocumentNode {
  const doc = createDefaultDocument("Worker partial")
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId] as BodyNode
  body.childIds = []

  for (let index = 0; index < pageCount; index++) {
    const paragraph = createParagraphNode(`Paragraph ${index + 1}`)
    const breakNode = pageBreak(`break-${index}`)
    section.nodes[paragraph.id] = paragraph
    section.nodes[breakNode.id] = breakNode
    body.childIds.push(paragraph.id, breakNode.id)
  }

  return doc
}

function request(doc: DocumentNode, pageIndex: number): BrowserPaginationWorkerPaginateRequest {
  return {
    type: "paginate",
    requestId: 7,
    doc,
    visibleWindow: { pageIndex, marginPages: 1 },
  }
}

describe("browser pagination worker strategy", () => {
  it("builds a partial response for incomplete body-basic visible-window pagination", () => {
    const doc = makeBodyBasicDocument(12)
    const full = paginateDocument(doc, defaultTextMeasurer)
    const response = tryBuildBrowserPaginationPartialResponse(request(doc, 3), defaultTextMeasurer, "fallback")

    expect(response?.type).toBe("partial")
    if (response?.type !== "partial") return
    expect(response.requestId).toBe(7)
    expect(response.coverage).toMatchObject({
      startPageIndex: 0,
      requestedPageIndex: 3,
    })
    expect(response.coverage.endPageIndex).toBeGreaterThanOrEqual(4)
    expect(response.paginated.sections[0].pages.length)
      .toBeLessThan(full.sections[0].pages.length)
  })

  it("does not emit partial when the visible-window result completes the document", () => {
    const doc = makeBodyBasicDocument(1)

    expect(tryBuildBrowserPaginationPartialResponse(request(doc, 0), defaultTextMeasurer, "fallback"))
      .toBeNull()
  })

  it("does not emit partial for unsupported body children", () => {
    const doc = createDefaultDocument("Unsupported worker partial")
    const section = doc.document.sections[0]
    const body = section.nodes[section.bodyRootId] as BodyNode
    body.childIds = ["toc"]
    section.nodes.toc = { id: "toc", type: "toc", props: { title: "สารบัญ" } }

    expect(tryBuildBrowserPaginationPartialResponse(request(doc, 2), defaultTextMeasurer, "fallback"))
      .toBeNull()
  })
})
