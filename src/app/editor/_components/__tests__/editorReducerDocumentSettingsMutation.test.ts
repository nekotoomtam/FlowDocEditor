import { createDefaultDocument } from "@/document"
import { pt } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState, reducer } from "../editorReducer"

describe("editorReducer document settings mutations", () => {
  it("commits UPDATE_MARGIN through history", () => {
    const state = createInitialEditorState(createDefaultDocument())

    const next = reducer(state, {
      type: "UPDATE_MARGIN",
      sectionIndex: 0,
      margin: { top: 24, right: 36, bottom: 48, left: 60 },
    })
    const margin = next.doc.document.sections[0].page.margin

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(margin.top).toEqual(pt(24))
    expect(margin.right).toEqual(pt(36))
    expect(margin.bottom).toEqual(pt(48))
    expect(margin.left).toEqual(pt(60))
  })

  it("keeps UPDATE_HEADER_FOOTER_HORIZONTAL_MODE no-op behavior reference-stable", () => {
    const state = createInitialEditorState(createDefaultDocument())

    const next = reducer(state, {
      type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE",
      sectionIndex: 0,
      mode: "body",
    })

    expect(next).toBe(state)
  })

  it("commits UPDATE_HEADER_FOOTER_HORIZONTAL_MODE through history", () => {
    const state = createInitialEditorState(createDefaultDocument())

    const next = reducer(state, {
      type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE",
      sectionIndex: 0,
      mode: "full",
    })

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(next.doc.document.sections[0].page.headerFooterHorizontalMode).toBe("full")
  })
})
