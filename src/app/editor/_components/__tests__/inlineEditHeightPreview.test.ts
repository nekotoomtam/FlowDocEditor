import { describe, expect, it } from "vitest"
import type { DocumentNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import { resizeFragmentHeightAndShift } from "../inlineEditHeightPreview"

const doc = {
  version: 1,
  document: { id: "doc", sections: [] },
} as unknown as DocumentNode

function makePaginated(): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [{
      sectionId: "s1",
      pages: [{
        index: 0,
        width: 200,
        height: 300,
        contentBox: { x: 10, y: 10, width: 180, height: 280 },
        headerFragments: [],
        footerFragments: [],
        fragments: [
          {
            nodeId: "p1",
            nodeType: "paragraph",
            pageIndex: 0,
            x: 10,
            y: 20,
            width: 100,
            height: 20,
            lines: [{ text: "A", x: 10, y: 20, width: 10, height: 20 }],
          },
          {
            nodeId: "p2",
            nodeType: "paragraph",
            pageIndex: 0,
            x: 10,
            y: 50,
            width: 100,
            height: 20,
            lines: [{ text: "B", x: 10, y: 50, width: 10, height: 20 }],
          },
        ],
      }],
    }],
  }
}

describe("resizeFragmentHeightAndShift", () => {
  it("patches the active paragraph height and shifts following same-page fragments", () => {
    const next = resizeFragmentHeightAndShift(makePaginated(), doc, "p1", 32, 0)
    const fragments = next.sections[0].pages[0].fragments

    expect(fragments[0].height).toBe(32)
    expect(fragments[1].y).toBe(62)
    expect(fragments[1].lines?.[0].y).toBe(62)
  })

  it("does not shift when the active fragment height is unchanged", () => {
    const original = makePaginated()
    const next = resizeFragmentHeightAndShift(original, doc, "p1", 20.25, 0)

    expect(next).toBe(original)
  })
})
