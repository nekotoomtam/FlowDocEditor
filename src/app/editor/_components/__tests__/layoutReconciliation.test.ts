import { describe, expect, it } from "vitest"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { resolveSamePreviewOptimisticLayout } from "../layoutReconciliation"

function doc(id: string): DocumentNode {
  return { id } as unknown as DocumentNode
}

function paginated(id: string): PaginatedDocument {
  return { id } as unknown as PaginatedDocument
}

describe("layout reconciliation", () => {
  it("uses the optimistic layout captured for the same preview document", () => {
    const previewDoc = doc("preview")
    const sameDocLayout = paginated("same")
    const fallback = paginated("fallback")

    const resolved = resolveSamePreviewOptimisticLayout(
      { doc: previewDoc, paginated: sameDocLayout },
      previewDoc,
      fallback,
    )

    expect(resolved).toEqual({
      paginated: sameDocLayout,
      source: "same-preview-doc",
    })
  })

  it("falls back explicitly when the latest optimistic layout belongs to another preview document", () => {
    const resolved = resolveSamePreviewOptimisticLayout(
      { doc: doc("older"), paginated: paginated("older-layout") },
      doc("newer"),
      paginated("fallback"),
    )

    expect(resolved.source).toBe("fallback-current-canvas")
    expect(resolved.paginated).toEqual({ id: "fallback" })
  })
})
