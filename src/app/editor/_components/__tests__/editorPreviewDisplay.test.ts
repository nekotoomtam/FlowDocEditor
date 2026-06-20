import { describe, expect, it } from "vitest"
import type { PaginatedDocument } from "@/pagination"
import { markEditorPreviewLayoutFull, markEditorPreviewLayoutPartial, markEditorPreviewLayoutSettling } from "../editorPreviewLayoutStatus"
import {
  resolveEditorDisplayPaginated,
  resolveEditorDisplayPagination,
} from "../editorPreviewDisplay"

function paginated(id: string): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [{
      sectionId: id,
      pages: [],
    }],
  }
}

describe("editor preview display pagination", () => {
  it("uses the authoritative full pagination unless the preview state is current partial", () => {
    const authoritative = paginated("full")
    const partial = paginated("partial")

    expect(resolveEditorDisplayPaginated({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: { generation: 3, requestId: 10, paginated: partial },
      previewLayout: markEditorPreviewLayoutSettling(3, { blocksCanvas: false }),
    })).toBe(authoritative)
    expect(resolveEditorDisplayPagination({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: { generation: 3, requestId: 10, paginated: partial },
      previewLayout: markEditorPreviewLayoutSettling(3, { blocksCanvas: false }),
    })).toMatchObject({
      source: "authoritative-state",
      reason: "preview-layout-not-partial",
      paginated: authoritative,
      identity: { source: "authoritative-state" },
      freshness: "current",
      adoptionPurpose: "display",
      previewGeneration: 3,
      partialGeneration: 3,
    })

    expect(resolveEditorDisplayPaginated({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: { generation: 3, requestId: 10, paginated: partial },
      previewLayout: markEditorPreviewLayoutFull(3),
    })).toBe(authoritative)
  })

  it("uses a generation-matched partial preview for editor display only", () => {
    const authoritative = paginated("full")
    const partial = paginated("partial")

    expect(resolveEditorDisplayPaginated({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: { generation: 4, requestId: 11, paginated: partial },
      previewLayout: markEditorPreviewLayoutPartial(4),
    })).toBe(partial)
    expect(resolveEditorDisplayPagination({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: { generation: 4, requestId: 11, paginated: partial },
      previewLayout: markEditorPreviewLayoutPartial(4),
    })).toMatchObject({
      source: "partial-browser-preview",
      reason: "partial-preview-current",
      paginated: partial,
      identity: {
        source: "partial-browser-preview",
        generation: 4,
        requestId: 11,
      },
      freshness: "current",
      adoptionPurpose: "display",
      previewGeneration: 4,
      partialGeneration: 4,
    })
  })

  it("uses partial preview identity metadata when deciding display freshness", () => {
    const authoritative = paginated("full")
    const partial = paginated("partial")

    expect(resolveEditorDisplayPagination({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: {
        generation: 4,
        requestId: 11,
        paginated: partial,
        identity: {
          source: "partial-browser-preview",
          generation: 4,
          requestId: 11,
        },
      },
      previewLayout: markEditorPreviewLayoutPartial(4),
    })).toMatchObject({
      source: "partial-browser-preview",
      reason: "partial-preview-current",
      paginated: partial,
      identity: {
        source: "partial-browser-preview",
        generation: 4,
        requestId: 11,
      },
      freshness: "current",
      adoptionPurpose: "display",
    })
  })

  it("rejects partial previews when identity metadata contradicts the preview output", () => {
    const authoritative = paginated("full")
    const partial = paginated("partial")

    expect(resolveEditorDisplayPagination({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: {
        generation: 4,
        requestId: 11,
        paginated: partial,
        identity: {
          source: "partial-browser-preview",
          generation: 3,
          requestId: 11,
        },
      },
      previewLayout: markEditorPreviewLayoutPartial(4),
    })).toMatchObject({
      source: "authoritative-state",
      reason: "partial-preview-identity-mismatch",
      paginated: authoritative,
      identity: { source: "authoritative-state" },
      freshness: "current",
      adoptionPurpose: "display",
    })
  })

  it("ignores stale partial previews from an older generation", () => {
    const authoritative = paginated("full")
    const partial = paginated("partial")

    expect(resolveEditorDisplayPaginated({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: { generation: 4, requestId: 11, paginated: partial },
      previewLayout: markEditorPreviewLayoutPartial(5),
    })).toBe(authoritative)
    expect(resolveEditorDisplayPagination({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: { generation: 4, requestId: 11, paginated: partial },
      previewLayout: markEditorPreviewLayoutPartial(5),
    })).toMatchObject({
      source: "authoritative-state",
      reason: "partial-preview-generation-mismatch",
      paginated: authoritative,
      previewGeneration: 5,
      partialGeneration: 4,
    })
  })

  it("falls back to authoritative pagination while partial preview output is missing", () => {
    const authoritative = paginated("full")

    expect(resolveEditorDisplayPagination({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: null,
      previewLayout: markEditorPreviewLayoutPartial(6),
    })).toMatchObject({
      source: "authoritative-state",
      reason: "partial-preview-missing",
      paginated: authoritative,
      previewGeneration: 6,
      partialGeneration: null,
    })
  })
})
