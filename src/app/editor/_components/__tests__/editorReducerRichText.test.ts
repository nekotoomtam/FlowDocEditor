import { describe, expect, it } from "vitest"
import { DEFAULT_PARAGRAPH_PROPS } from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { pt } from "@/schema"
import { createInitialEditorState, reducer } from "../editorReducer"

function docWithParagraph(): DocumentNode {
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
          margin: {
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["p1"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: DEFAULT_PARAGRAPH_PROPS,
            children: [{ id: "t1", type: "text", text: "Hello" }],
          },
        },
      }],
    },
  }
}

describe("editorReducer rich text range actions", () => {
  it("applies text-run style to only the requested range", () => {
    const state = createInitialEditorState(docWithParagraph())
    const next = reducer(state, {
      type: "UPDATE_TEXT_RUN_STYLE_RANGE",
      nodeId: "p1",
      start: 1,
      end: 4,
      changes: { fontWeight: "bold" },
    })
    const paragraph = next.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.children).toEqual([
      { id: expect.any(String), type: "text", text: "H" },
      { id: expect.any(String), type: "text", text: "ell", style: { fontWeight: "bold" } },
      { id: expect.any(String), type: "text", text: "o" },
    ])
    expect(next.past).toHaveLength(1)
  })

  it("does not push history for a collapsed text-run style range", () => {
    const state = createInitialEditorState(docWithParagraph())
    const next = reducer(state, {
      type: "UPDATE_TEXT_RUN_STYLE_RANGE",
      nodeId: "p1",
      start: 2,
      end: 2,
      changes: { fontWeight: "bold" },
    })

    expect(next).toBe(state)
  })
})
