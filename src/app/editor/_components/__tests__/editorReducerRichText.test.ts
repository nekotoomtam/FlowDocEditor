import { describe, expect, it } from "vitest"
import {
  DEFAULT_HEADER_FOOTER_RESERVED_PT,
  DEFAULT_PARAGRAPH_PROPS,
  getAllListStylePresets,
  MAX_HEADER_FOOTER_RESERVED_RATIO,
  MIN_HEADER_FOOTER_RESERVED_PT,
  TOR_CLAUSE_LIST_STYLE_ID,
} from "@/document"
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

function docWithListedParagraphs(): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      listStyles: getAllListStylePresets(),
      listInstances: {
        "tor-main": { id: "tor-main", styleId: "tor-clause" },
      },
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
          body: { id: "body", type: "body", props: {}, childIds: ["p1", "p2"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: {
              ...DEFAULT_PARAGRAPH_PROPS,
              list: { instanceId: "tor-main", level: 1, itemId: "tor.item.1" },
            },
            children: [
              { id: "t1", type: "text", text: "Hello ", style: { fontWeight: "bold" } },
              { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
            ],
          },
          p2: {
            id: "p2",
            type: "paragraph",
            props: {
              ...DEFAULT_PARAGRAPH_PROPS,
              list: { instanceId: "tor-main", level: 1, itemId: "tor.item.2" },
            },
            children: [
              { id: "t3", type: "text", text: "next", style: { fontWeight: "bold" } },
            ],
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

describe("editorReducer list-aware structural paragraph actions", () => {
  it("splits a listed text-run paragraph without duplicating list item identity", () => {
    const state = createInitialEditorState(docWithListedParagraphs())
    const next = reducer(state, { type: "SPLIT_PARAGRAPH", nodeId: "p1", splitIndex: "Hello ".length })
    const newNodeId = next.lastSplitNodeId
    expect(newNodeId).toBeTruthy()
    if (!newNodeId) return

    const section = next.doc.document.sections[0]
    const first = section.nodes.p1 as ParagraphNode
    const inserted = section.nodes[newNodeId] as ParagraphNode

    expect(first.props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: "tor.item.1" })
    expect(inserted.props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: newNodeId })
    expect(first.children).toEqual([
      { id: expect.any(String), type: "text", text: "Hello ", style: { fontWeight: "bold" } },
    ])
    expect(inserted.children).toEqual([
      { id: expect.any(String), type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["p1", newNodeId, "p2"])
    expect(next.past).toHaveLength(1)
  })

  it("uses the latest edit text before splitting a listed paragraph", () => {
    const state = createInitialEditorState(docWithListedParagraphs())
    const next = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "p1",
      splitIndex: "Hello edited ".length,
      text: "Hello edited world",
    })
    const newNodeId = next.lastSplitNodeId
    expect(newNodeId).toBeTruthy()
    if (!newNodeId) return

    const section = next.doc.document.sections[0]
    const first = section.nodes.p1 as ParagraphNode
    const inserted = section.nodes[newNodeId] as ParagraphNode

    expect(first.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("Hello edited ")
    expect(inserted.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("world")
    expect(inserted.props.list?.itemId).toBe(newNodeId)
  })

  it("exits a listed paragraph when the current edit text is empty", () => {
    const state = createInitialEditorState(docWithListedParagraphs())
    const next = reducer(state, {
      type: "EXIT_LIST_ITEM",
      nodeId: "p1",
      text: "",
    })
    const paragraph = next.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.props.list).toBeUndefined()
    expect(paragraph.children).toEqual([
      { id: expect.any(String), type: "text", text: "", style: { fontWeight: "bold" } },
    ])
    expect(next.listExitNodeId).toBe("p1")
    expect(next.past).toHaveLength(1)
  })

  it("changes a listed paragraph level while preserving latest edit text and caret", () => {
    const state = createInitialEditorState(docWithListedParagraphs())
    const next = reducer(state, {
      type: "CHANGE_LIST_ITEM_LEVEL",
      nodeId: "p1",
      direction: "indent",
      text: "Hello edited world",
      caretIndex: "Hello edited".length,
    })
    const paragraph = next.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.props.list?.level).toBe(2)
    expect(paragraph.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("Hello edited world")
    expect(paragraph.children).toEqual([
      { id: "t1", type: "text", text: "Hello edited ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    expect(next.listLevelChangeResult).toEqual({ nodeId: "p1", caretIndex: "Hello edited".length })
    expect(next.past).toHaveLength(1)
  })

  it("does not push history when a listed paragraph level cannot change", () => {
    const doc = docWithListedParagraphs()
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props = {
      ...paragraph.props,
      list: { instanceId: "tor-main", level: 0, itemId: "tor.item.1" },
    }
    const state = createInitialEditorState(doc)
    const next = reducer(state, {
      type: "CHANGE_LIST_ITEM_LEVEL",
      nodeId: "p1",
      direction: "outdent",
      text: "Ignored draft text",
      caretIndex: 4,
    })

    expect(next).toBe(state)
  })

  it("outdents a nested list item on Backspace at paragraph start", () => {
    const state = createInitialEditorState(docWithListedParagraphs())
    const next = reducer(state, {
      type: "BACKSPACE_LIST_ITEM_AT_START",
      nodeId: "p1",
      text: "Hello edited world",
      caretIndex: 0,
    })
    const paragraph = next.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "tor.item.1" })
    expect(paragraph.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("Hello edited world")
    expect(next.listLevelChangeResult).toEqual({ nodeId: "p1", caretIndex: 0 })
    expect(next.past).toHaveLength(1)
  })

  it("clears list metadata on Backspace at top-level list item start", () => {
    const doc = docWithListedParagraphs()
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props = {
      ...paragraph.props,
      list: { instanceId: "tor-main", level: 0, itemId: "tor.item.1" },
    }
    const state = createInitialEditorState(doc)
    const next = reducer(state, {
      type: "BACKSPACE_LIST_ITEM_AT_START",
      nodeId: "p1",
      text: "Plain heading",
      caretIndex: 0,
    })
    const updated = next.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(updated.props.list).toBeUndefined()
    expect(updated.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("Plain heading")
    expect(next.listLevelChangeResult).toEqual({ nodeId: "p1", caretIndex: 0 })
    expect(next.past).toHaveLength(1)
  })

  it("toggles a preset-backed list from the editor reducer", () => {
    const state = createInitialEditorState(docWithParagraph())
    const listed = reducer(state, {
      type: "TOGGLE_LIST_PRESET",
      nodeId: "p1",
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      level: 0,
    })
    const paragraph = listed.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(listed.doc.document.listStyles?.[TOR_CLAUSE_LIST_STYLE_ID]?.levels).toHaveLength(8)
    expect(listed.doc.document.listInstances?.["tor-main"]).toEqual({ id: "tor-main", styleId: TOR_CLAUSE_LIST_STYLE_ID })
    expect(paragraph.props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "p1" })
    expect(listed.selectedNodeId).toBe("p1")
    expect(listed.past).toHaveLength(1)

    const cleared = reducer(listed, {
      type: "TOGGLE_LIST_PRESET",
      nodeId: "p1",
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      level: 0,
    })
    const updated = cleared.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(updated.props.list).toBeUndefined()
    expect(cleared.past).toHaveLength(2)
  })

  it("toggles a preset-backed list while preserving the latest draft text", () => {
    const state = createInitialEditorState(docWithParagraph())
    const next = reducer(state, {
      type: "TOGGLE_LIST_PRESET",
      nodeId: "p1",
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      level: 0,
      text: "Draft list item",
    })
    const paragraph = next.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "p1" })
    expect(paragraph.children).toEqual([{ id: expect.any(String), type: "text", text: "Draft list item" }])
    expect(next.past).toHaveLength(1)
  })

  it("merges a listed text-run paragraph into the previous paragraph while preserving previous identity", () => {
    const state = createInitialEditorState(docWithListedParagraphs())
    const next = reducer(state, { type: "MERGE_PARAGRAPH", nodeId: "p2" })
    const section = next.doc.document.sections[0]
    const merged = section.nodes.p1 as ParagraphNode

    expect(section.nodes.p2).toBeUndefined()
    expect(merged.props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: "tor.item.1" })
    expect(merged.children).toEqual([
      { id: expect.any(String), type: "text", text: "Hello ", style: { fontWeight: "bold" } },
      { id: expect.any(String), type: "text", text: "world", style: { fontStyle: "italic" } },
      { id: expect.any(String), type: "text", text: "next", style: { fontWeight: "bold" } },
    ])
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["p1"])
    expect(next.mergeResult).toEqual({ prevNodeId: "p1", caretIndex: "Hello world".length })
    expect(next.past).toHaveLength(1)
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
