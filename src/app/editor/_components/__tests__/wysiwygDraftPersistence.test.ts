import { describe, expect, it } from "vitest"
import { pt, type DocumentNode } from "@/schema"
import { getPlainParagraphTextFromDocument } from "../wysiwygTextCommit"
import { resolvePersistableWysiwygDocument } from "../wysiwygDraftPersistence"
import { INACTIVE_WYSIWYG_TEXT_SESSION, type WysiwygTextSessionState } from "../useWysiwygTextSession"

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

function activeSession(draftText: string): WysiwygTextSessionState {
  return {
    nodeId: "p1",
    pageIndex: 0,
    baseText: "Base",
    draftText,
    caretOffset: draftText.length,
    selection: { anchorOffset: draftText.length, focusOffset: draftText.length },
    dirtyVersion: 1,
    layoutVersion: 1,
  }
}

describe("resolvePersistableWysiwygDocument", () => {
  it("persists the active WYSIWYG draft text without mutating the source document", () => {
    const doc = docWithParagraph("Base")
    const persisted = resolvePersistableWysiwygDocument(doc, activeSession("Draft"), true)

    expect(getPlainParagraphTextFromDocument(persisted, "p1")).toBe("Draft")
    expect(getPlainParagraphTextFromDocument(doc, "p1")).toBe("Base")
  })

  it("keeps the current document when WYSIWYG is disabled or inactive", () => {
    const doc = docWithParagraph("Base")

    expect(resolvePersistableWysiwygDocument(doc, activeSession("Draft"), false)).toBe(doc)
    expect(resolvePersistableWysiwygDocument(doc, INACTIVE_WYSIWYG_TEXT_SESSION, true)).toBe(doc)
  })
})
