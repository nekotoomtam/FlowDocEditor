import { describe, expect, it } from "vitest"
import type { PaginatedDocument } from "@/pagination"
import { markEditorPreviewLayoutFull, markEditorPreviewLayoutPartial, markEditorPreviewLayoutSettling } from "../editorPreviewLayoutStatus"
import { resolveEditorDisplayPaginated } from "../editorPreviewDisplay"

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
  })

  it("ignores stale partial previews from an older generation", () => {
    const authoritative = paginated("full")
    const partial = paginated("partial")

    expect(resolveEditorDisplayPaginated({
      authoritativePaginated: authoritative,
      partialPreviewPaginated: { generation: 4, requestId: 11, paginated: partial },
      previewLayout: markEditorPreviewLayoutPartial(5),
    })).toBe(authoritative)
  })
})
