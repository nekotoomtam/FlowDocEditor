import { describe, expect, it, vi } from "vitest"
import { createDefaultDocument } from "@/document"
import type { PageFragment, PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import {
  executeModelStructuralRefocus,
  type ModelStructuralRefocusContext,
} from "../editorStructuralModelRefocus"

function firstParagraphId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (!body || !("childIds" in body)) throw new Error("expected body root")
  return body.childIds[0]
}

function fragment(nodeId: string): PageFragment {
  return {
    nodeId,
    nodeType: "paragraph",
    pageIndex: 0,
    x: 10,
    y: 20,
    width: 300,
    height: 24,
  }
}

function paginatedFor(nodeId: string): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [
      {
        sectionId: "section-1",
        pages: [
          {
            index: 0,
            width: 600,
            height: 800,
            contentBox: { x: 40, y: 40, width: 520, height: 720 },
            fragments: [fragment(nodeId)],
            headerFragments: [],
            footerFragments: [],
          },
        ],
      },
    ],
  }
}

function contextFor(doc: DocumentNode, structuralPaginated: PaginatedDocument | null): ModelStructuralRefocusContext {
  return {
    doc,
    textEngineEnabled: true,
    startInlineEditAfterStructuralChange: vi.fn(() => structuralPaginated),
    setPaginatedRef: vi.fn(),
    clearWysiwygDraftPagination: vi.fn(),
    endWysiwygTextSession: vi.fn(),
    startWysiwygTextSession: vi.fn(),
  }
}

describe("editorStructuralModelRefocus", () => {
  it("starts a WYSIWYG text session after model structural refocus succeeds", () => {
    const doc = createDefaultDocument("Structural refocus")
    const nodeId = firstParagraphId(doc)
    const paginated = paginatedFor(nodeId)
    const context = contextFor(doc, paginated)

    expect(executeModelStructuralRefocus({ nodeId, caretIndex: 3 }, context)).toBe(true)

    expect(context.startInlineEditAfterStructuralChange).toHaveBeenCalledWith(nodeId, 3)
    expect(context.setPaginatedRef).toHaveBeenCalledWith(paginated)
    expect(context.startWysiwygTextSession).toHaveBeenCalledWith(nodeId, 3, null)
    expect(context.clearWysiwygDraftPagination).not.toHaveBeenCalled()
    expect(context.endWysiwygTextSession).not.toHaveBeenCalled()
  })

  it("clears draft state when structural refocus cannot produce paginated output", () => {
    const doc = createDefaultDocument("Structural refocus")
    const nodeId = firstParagraphId(doc)
    const context = contextFor(doc, null)

    expect(executeModelStructuralRefocus({ nodeId, caretIndex: 0 }, context)).toBe(false)

    expect(context.clearWysiwygDraftPagination).toHaveBeenCalled()
    expect(context.endWysiwygTextSession).toHaveBeenCalled()
    expect(context.setPaginatedRef).not.toHaveBeenCalled()
    expect(context.startWysiwygTextSession).not.toHaveBeenCalled()
  })

  it("clears draft state when the refocused fragment is not WYSIWYG eligible", () => {
    const doc = createDefaultDocument("Structural refocus")
    const nodeId = "missing-node"
    const context = contextFor(doc, paginatedFor(nodeId))

    expect(executeModelStructuralRefocus({ nodeId, caretIndex: 0 }, context)).toBe(false)

    expect(context.setPaginatedRef).toHaveBeenCalled()
    expect(context.clearWysiwygDraftPagination).toHaveBeenCalled()
    expect(context.endWysiwygTextSession).toHaveBeenCalled()
    expect(context.startWysiwygTextSession).not.toHaveBeenCalled()
  })
})
