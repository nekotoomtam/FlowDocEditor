import { describe, expect, it } from "vitest"
import type { PaginatedDocument } from "@/pagination"
import {
  findEditorPageKeyByPageIndex,
  scrollElementIntoNearestView,
  shouldFollowInlineEditPageChange,
} from "../editorPageFollow"

function makePaginated(): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [
      {
        sectionId: "s1",
        pages: [
          {
            index: 0,
            width: 200,
            height: 300,
            contentBox: { x: 10, y: 10, width: 180, height: 280 },
            headerFragments: [],
            footerFragments: [],
            fragments: [],
          },
          {
            index: 1,
            width: 200,
            height: 300,
            contentBox: { x: 10, y: 10, width: 180, height: 280 },
            headerFragments: [],
            footerFragments: [],
            fragments: [],
          },
        ],
      },
      {
        sectionId: "s2",
        pages: [
          {
            index: 2,
            width: 200,
            height: 300,
            contentBox: { x: 10, y: 10, width: 180, height: 280 },
            headerFragments: [],
            footerFragments: [],
            fragments: [],
          },
        ],
      },
    ],
  }
}

describe("editor page follow helpers", () => {
  it("follows only when an active edit session moves from one known page to another", () => {
    expect(shouldFollowInlineEditPageChange({ previousPageIndex: 0, nextPageIndex: 1 })).toBe(true)
    expect(shouldFollowInlineEditPageChange({ previousPageIndex: 1, nextPageIndex: 1 })).toBe(false)
    expect(shouldFollowInlineEditPageChange({ previousPageIndex: null, nextPageIndex: 1 })).toBe(false)
    expect(shouldFollowInlineEditPageChange({ previousPageIndex: 1, nextPageIndex: null })).toBe(false)
  })

  it("resolves a rendered page key from a physical page index", () => {
    const paginated = makePaginated()

    expect(findEditorPageKeyByPageIndex(paginated, 0)).toBe("0-0")
    expect(findEditorPageKeyByPageIndex(paginated, 1)).toBe("0-1")
    expect(findEditorPageKeyByPageIndex(paginated, 2)).toBe("1-0")
    expect(findEditorPageKeyByPageIndex(paginated, 99)).toBeNull()
    expect(findEditorPageKeyByPageIndex(paginated, null)).toBeNull()
  })

  it("scrolls the target page with nearest alignment and falls back for older APIs", () => {
    const calls: Array<ScrollIntoViewOptions | "plain"> = []

    scrollElementIntoNearestView({
      scrollIntoView: (options?: ScrollIntoViewOptions) => {
        calls.push(options ?? "plain")
      },
    })

    scrollElementIntoNearestView({
      scrollIntoView: (options?: ScrollIntoViewOptions) => {
        if (!options) {
          calls.push("plain")
          return
        }
        calls.push(options)
        throw new Error("scroll options unsupported")
      },
    })

    expect(calls).toEqual([
      { block: "nearest", inline: "nearest" },
      { block: "nearest", inline: "nearest" },
      "plain",
    ])
  })
})
