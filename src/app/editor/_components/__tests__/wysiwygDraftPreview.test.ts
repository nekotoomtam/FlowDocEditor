import { describe, expect, it } from "vitest"
import { pt, type DocumentNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import {
  buildWysiwygTextDraftPreviewDocument,
  countWysiwygTextDraftFragments,
} from "../wysiwygDraftPreview"
import { getPlainParagraphTextFromDocument } from "../wysiwygTextCommit"

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

describe("buildWysiwygTextDraftPreviewDocument", () => {
  it("creates a draft preview document without mutating the source document", () => {
    const source = docWithParagraph("Alpha")
    const draft = buildWysiwygTextDraftPreviewDocument({
      doc: source,
      nodeId: "p1",
      draftText: "Alpha draft",
    })

    expect(getPlainParagraphTextFromDocument(source, "p1")).toBe("Alpha")
    expect(getPlainParagraphTextFromDocument(draft, "p1")).toBe("Alpha draft")
    expect(draft).not.toBe(source)
  })
})

describe("countWysiwygTextDraftFragments", () => {
  it("counts paragraph fragments for the active draft node", () => {
    const paginated: PaginatedDocument = {
      tocEntries: [],
      sections: [{
        sectionId: "s1",
        pages: [
          {
            index: 0,
            width: 200,
            height: 300,
            contentBox: { x: 10, y: 10, width: 180, height: 280 },
            headerFragments: [],
            footerFragments: [],
            fragments: [{ nodeId: "p1", nodeType: "paragraph", pageIndex: 0, x: 10, y: 20, width: 100, height: 20 }],
          },
          {
            index: 1,
            width: 200,
            height: 300,
            contentBox: { x: 10, y: 10, width: 180, height: 280 },
            headerFragments: [],
            footerFragments: [],
            fragments: [{ nodeId: "p1", nodeType: "paragraph", pageIndex: 1, x: 10, y: 20, width: 100, height: 20 }],
          },
        ],
      }],
    }

    expect(countWysiwygTextDraftFragments(paginated, "p1")).toBe(2)
    expect(countWysiwygTextDraftFragments(paginated, "missing")).toBe(0)
  })
})
