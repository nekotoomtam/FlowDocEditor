import { describe, expect, it } from "vitest"
import { pt, type DocumentNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import {
  commitWysiwygTextEditState,
  getPlainParagraphTextFromDocument,
  type WysiwygTextCommitState,
} from "../wysiwygTextCommit"

function paginated(id: string): PaginatedDocument {
  return {
    sections: [{
      sectionId: id,
      pages: [],
    }],
  } as unknown as PaginatedDocument
}

function docWithParagraph(text: string): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["p1"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: {
              align: "left",
              fontSize: pt(12),
              fontFamilyKey: "default",
              lineHeight: 1.5,
              spacingBefore: pt(0),
              spacingAfter: pt(0),
              textIndent: pt(0),
              indentLeft: pt(0),
              indentRight: pt(0),
            },
            children: [{ id: "p1-text", type: "text", text }],
          },
        },
      }],
    },
  }
}

describe("commitWysiwygTextEditState", () => {
  it("commits session draft text once and records one history entry", () => {
    const beforeDoc = docWithParagraph("Alpha")
    const beforePaginated = paginated("before")
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: beforePaginated,
      past: [],
      future: [{ doc: docWithParagraph("Future"), paginated: paginated("future") }],
    }

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Alpha!",
      beforeText: "Alpha",
      afterPaginated: paginated("after"),
    }, 50)

    expect(getPlainParagraphTextFromDocument(next.doc, "p1")).toBe("Alpha!")
    expect(next.past).toHaveLength(1)
    expect(next.past[0]).toEqual({ doc: beforeDoc, paginated: beforePaginated })
    expect(next.future).toEqual([])
  })

  it("does not add history when draft text matches the session base text", () => {
    const state: WysiwygTextCommitState = {
      doc: docWithParagraph("Alpha"),
      paginated: paginated("before"),
      past: [],
      future: [],
    }
    const afterPaginated = paginated("after")

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Alpha",
      beforeText: "Alpha",
      afterPaginated,
    }, 50)

    expect(getPlainParagraphTextFromDocument(next.doc, "p1")).toBe("Alpha")
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([])
  })

  it("uses the captured inline-edit history when provided", () => {
    const history = { doc: docWithParagraph("Original"), paginated: paginated("original") }
    const state: WysiwygTextCommitState = {
      doc: docWithParagraph("Draft base"),
      paginated: paginated("current"),
      past: [],
      future: [],
    }

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Committed",
      beforeText: "Draft base",
      history,
      afterPaginated: paginated("after"),
    }, 50)

    expect(next.past).toEqual([history])
  })
})

