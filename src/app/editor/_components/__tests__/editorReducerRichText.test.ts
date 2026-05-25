import { describe, expect, it } from "vitest"
import { DEFAULT_HEADER_FOOTER_RESERVED_PT, DEFAULT_PARAGRAPH_PROPS, MAX_HEADER_FOOTER_RESERVED_RATIO, MIN_HEADER_FOOTER_RESERVED_PT } from "@/document"
import { getPageDimensions } from "@/pagination"
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

describe("editorReducer header/footer authoring hydration", () => {
  it("creates missing reserved zone roots when initializing a loaded document", () => {
    const doc = docWithParagraph()
    doc.document.sections[0].page = {
      ...doc.document.sections[0].page,
      headerReserved: 36,
      footerReserved: 24,
    }

    const state = createInitialEditorState(doc)
    const section = state.doc.document.sections[0]

    expect(section.headerRootId).toBeTruthy()
    expect(section.footerRootId).toBeTruthy()
    expect(section.headerRootId ? section.nodes[section.headerRootId]?.type : null).toBe("stack")
    expect(section.footerRootId ? section.nodes[section.footerRootId]?.type : null).toBe("stack")
  })

  it("creates missing reserved zone roots when loading a document through the reducer", () => {
    const state = createInitialEditorState(docWithParagraph())
    const doc = docWithParagraph()
    doc.document.sections[0].page = {
      ...doc.document.sections[0].page,
      headerReserved: 36,
    }

    const next = reducer(state, { type: "LOAD_DOCUMENT", doc })
    const section = next.doc.document.sections[0]

    expect(section.headerRootId).toBeTruthy()
    expect(section.headerRootId ? section.nodes[section.headerRootId]?.type : null).toBe("stack")
  })

  it("opens an inactive header zone at the default authoring height", () => {
    const state = createInitialEditorState(docWithParagraph())
    const next = reducer(state, {
      type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE",
      sectionIndex: 0,
      zone: "header",
    })
    const section = next.doc.document.sections[0]

    expect(section.page.headerReserved).toBe(DEFAULT_HEADER_FOOTER_RESERVED_PT)
    expect(section.headerRootId).toBeTruthy()
    expect(section.headerRootId ? section.nodes[section.headerRootId]?.type : null).toBe("stack")
    expect(next.past).toHaveLength(1)
  })

  it("does not push history when an already visible header zone is opened", () => {
    const state = createInitialEditorState(docWithParagraph())
    const visible = reducer(state, {
      type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE",
      sectionIndex: 0,
      zone: "header",
    })
    const next = reducer(visible, {
      type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE",
      sectionIndex: 0,
      zone: "header",
    })

    expect(next).toBe(visible)
    expect(next.past).toHaveLength(1)
  })

  it("turns off an empty header zone without leaving a minimum reserved height behind", () => {
    const state = createInitialEditorState(docWithParagraph())
    const visible = reducer(state, {
      type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE",
      sectionIndex: 0,
      zone: "header",
    })
    const next = reducer(visible, {
      type: "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY",
      sectionIndex: 0,
      zone: "header",
    })
    const section = next.doc.document.sections[0]

    expect(section.page.headerReserved).toBe(0)
    expect(section.headerRootId).toBeUndefined()
    expect(next.past).toHaveLength(2)
  })

  it("preserves footer reserved height when committing a footer-priority resize", () => {
    const state = createInitialEditorState(docWithParagraph())
    const section = state.doc.document.sections[0]
    const { height } = getPageDimensions(section.page)
    const usableHeight = height - section.page.margin.top.value - section.page.margin.bottom.value
    const maxReserved = Math.round(usableHeight * MAX_HEADER_FOOTER_RESERVED_RATIO * 100) / 100

    const next = reducer(state, {
      type: "UPDATE_RESERVED_ZONES",
      sectionIndex: 0,
      reserved: { headerReserved: 200, footerReserved: 500 },
      priority: "footerReserved",
    })
    const page = next.doc.document.sections[0].page

    expect(page.headerReserved).toBe(MIN_HEADER_FOOTER_RESERVED_PT)
    expect(page.footerReserved).toBe(maxReserved - MIN_HEADER_FOOTER_RESERVED_PT)
    expect(next.past).toHaveLength(1)
  })
})
