import { describe, expect, it } from "vitest"
import type { PageFragment, PaginatedLine } from "@/pagination"
import { classifyWysiwygTextReflow } from "../wysiwygReflow"

function line(text: string, y = 20): PaginatedLine {
  return { text, x: 10, y, width: text.length * 5, height: 12 }
}

function fragment(overrides: Partial<PageFragment> = {}): PageFragment {
  return {
    nodeId: "p1",
    nodeType: "paragraph",
    pageIndex: 0,
    x: 10,
    y: 20,
    width: 100,
    height: 12,
    lineStart: 0,
    lineEnd: 1,
    lines: [line("Hello")],
    ...overrides,
  }
}

describe("classifyWysiwygTextReflow", () => {
  it("classifies same fragment line count and height as soft", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello!")],
      draftHeight: 12,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })).toMatchObject({
      kind: "soft",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: false,
    })
  })

  it("classifies line count changes that still fit on the page as hard-local", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello"), line("world", 32)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })).toMatchObject({
      kind: "hard-local",
      reason: "line-count-changed",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: true,
    })
  })

  it("classifies growth past the page content bottom as hard-page-boundary", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })).toMatchObject({
      kind: "hard-page-boundary",
      reason: "page-boundary",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: true,
    })
  })

  it("fails closed for unsupported fragments", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello")],
      draftHeight: 12,
      supportsLocalDraftLayout: false,
    })).toMatchObject({
      kind: "unsupported",
      shouldPatchActiveLines: false,
      shouldPatchSamePageHeight: false,
    })
  })
})
