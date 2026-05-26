import { describe, expect, it } from "vitest"
import {
  DEFAULT_HEADER_FOOTER_RESERVED_PT,
  DEFAULT_PARAGRAPH_PROPS,
  BULLET_BASIC_LIST_STYLE_ID,
  getAllListStylePresets,
  MAX_HEADER_FOOTER_RESERVED_RATIO,
  MIN_HEADER_FOOTER_RESERVED_PT,
  resolveStyledParagraphProps,
  TOR_BODY_PARAGRAPH_STYLE_ID,
  TOR_CLAUSE_LIST_STYLE_ID,
  TOR_HEADING1_PARAGRAPH_STYLE_ID,
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

function docWithEmptyParagraphAfterParagraph(): DocumentNode {
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
          body: { id: "body", type: "body", props: {}, childIds: ["p1", "p2"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: DEFAULT_PARAGRAPH_PROPS,
            children: [{ id: "t1", type: "text", text: "Before" }],
          },
          p2: {
            id: "p2",
            type: "paragraph",
            props: DEFAULT_PARAGRAPH_PROPS,
            children: [{ id: "t2", type: "text", text: "", style: { fontWeight: "bold" } }],
          },
        },
      }],
    },
  }
}

function docWithOnlyEmptyParagraph(): DocumentNode {
  const doc = docWithParagraph()
  const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
  return {
    ...doc,
    document: {
      ...doc.document,
      sections: [{
        ...doc.document.sections[0],
        nodes: {
          ...doc.document.sections[0].nodes,
          p1: {
            ...paragraph,
            children: [{ id: "t1", type: "text", text: "" }],
          },
        },
      }],
    },
  }
}

function docWithStyleBackedParagraph(): DocumentNode {
  const doc = docWithParagraph()
  const section = doc.document.sections[0]
  const paragraph = section.nodes.p1 as ParagraphNode
  return {
    ...doc,
    document: {
      ...doc.document,
      sections: [{
        ...section,
        nodes: {
          ...section.nodes,
          p1: {
            ...paragraph,
            props: {
              ...paragraph.props,
              paragraphStyleId: TOR_BODY_PARAGRAPH_STYLE_ID,
            },
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
          body: { id: "body", type: "body", props: {}, childIds: ["p0", "p0-child", "p1", "p2"] },
          p0: {
            id: "p0",
            type: "paragraph",
            props: {
              ...DEFAULT_PARAGRAPH_PROPS,
              list: { instanceId: "tor-main", level: 0, itemId: "tor.parent" },
            },
            children: [{ id: "t0", type: "text", text: "parent" }],
          },
          "p0-child": {
            id: "p0-child",
            type: "paragraph",
            props: {
              ...DEFAULT_PARAGRAPH_PROPS,
              list: { instanceId: "tor-main", level: 1, itemId: "tor.parent.child" },
            },
            children: [{ id: "t0-child", type: "text", text: "parent child" }],
          },
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

describe("editorReducer paragraph style actions", () => {
  it("ensures a document base style for authoring without styling legacy paragraphs", () => {
    const state = createInitialEditorState(docWithParagraph())
    const paragraph = state.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(state.doc.document.styles?.baseParagraphStyleId).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
    expect(state.doc.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID]).toBeDefined()
    expect(paragraph.props.paragraphStyleId).toBeUndefined()
  })

  it("applies and clears a preset-backed paragraph style", () => {
    const state = createInitialEditorState(docWithParagraph())
    const styled = reducer(state, {
      type: "APPLY_PARAGRAPH_STYLE_PRESET",
      nodeId: "p1",
      styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
    })
    const paragraph = styled.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(styled.doc.document.styles?.paragraphStyles?.[TOR_HEADING1_PARAGRAPH_STYLE_ID]).toBeDefined()
    expect(paragraph.props.paragraphStyleId).toBe(TOR_HEADING1_PARAGRAPH_STYLE_ID)
    expect(paragraph.props.fontSize).toEqual(pt(16))
    expect(paragraph.props.headingLevel).toBe(1)
    expect(styled.selectedNodeId).toBe("p1")
    expect(styled.past).toHaveLength(1)

    const cleared = reducer(styled, {
      type: "CLEAR_PARAGRAPH_STYLE",
      nodeId: "p1",
    })
    const clearedParagraph = cleared.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(clearedParagraph.props.paragraphStyleId).toBeUndefined()
    expect(clearedParagraph.props.styleOverrides).toBeUndefined()
    expect(cleared.past).toHaveLength(2)
  })

  it("resets paragraph style overrides from the editor reducer", () => {
    const state = createInitialEditorState(docWithParagraph())
    const styled = reducer(state, {
      type: "APPLY_PARAGRAPH_STYLE_PRESET",
      nodeId: "p1",
      styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
    })
    const withOverrideDoc: DocumentNode = {
      ...styled.doc,
      document: {
        ...styled.doc.document,
        sections: styled.doc.document.sections.map((section) => ({
          ...section,
          nodes: {
            ...section.nodes,
            p1: {
              ...(section.nodes.p1 as ParagraphNode),
              props: {
                ...(section.nodes.p1 as ParagraphNode).props,
                styleOverrides: { fontSize: pt(18) },
              },
            },
          },
        })),
      },
    }
    const withOverride = createInitialEditorState(withOverrideDoc)
    const reset = reducer(withOverride, {
      type: "RESET_PARAGRAPH_STYLE_OVERRIDES",
      nodeId: "p1",
    })
    const paragraph = reset.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.props.styleOverrides).toBeUndefined()
    expect(paragraph.props.fontSize).toEqual(pt(16))
    expect(reset.past).toHaveLength(1)
  })

  it("patches style overrides without removing text-run styling", () => {
    const state = createInitialEditorState(docWithParagraph())
    const styled = reducer(state, {
      type: "APPLY_PARAGRAPH_STYLE_PRESET",
      nodeId: "p1",
      styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
    })
    const styledParagraph = styled.doc.document.sections[0].nodes.p1 as ParagraphNode
    const withRunStyleDoc: DocumentNode = {
      ...styled.doc,
      document: {
        ...styled.doc.document,
        sections: styled.doc.document.sections.map((section) => ({
          ...section,
          nodes: {
            ...section.nodes,
            p1: {
              ...styledParagraph,
              children: [{ id: "t1", type: "text", text: "Hello", style: { fontWeight: "bold" } }],
            },
          },
        })),
      },
    }
    const withRunStyle = createInitialEditorState(withRunStyleDoc)
    const patched = reducer(withRunStyle, {
      type: "PATCH_PARAGRAPH_STYLE_OVERRIDES",
      nodeId: "p1",
      changes: { fontSize: pt(18), headingLevel: null },
    })
    const paragraph = patched.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.props.paragraphStyleId).toBe(TOR_HEADING1_PARAGRAPH_STYLE_ID)
    expect(paragraph.props.styleOverrides).toEqual({ fontSize: pt(18), headingLevel: null })
    expect(paragraph.props.fontSize).toEqual(pt(16))
    expect(paragraph.children).toEqual([{ id: "t1", type: "text", text: "Hello", style: { fontWeight: "bold" } }])
    expect(patched.past).toHaveLength(1)
  })

  it("detaches a style while keeping the resolved paragraph appearance", () => {
    const state = createInitialEditorState(docWithParagraph())
    const styled = reducer(state, {
      type: "APPLY_PARAGRAPH_STYLE_PRESET",
      nodeId: "p1",
      styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
    })
    const withOverride = reducer(styled, {
      type: "PATCH_PARAGRAPH_STYLE_OVERRIDES",
      nodeId: "p1",
      changes: { fontSize: pt(18), headingLevel: null },
    })
    const detached = reducer(withOverride, {
      type: "DETACH_PARAGRAPH_STYLE",
      nodeId: "p1",
    })
    const paragraph = detached.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.props.paragraphStyleId).toBeUndefined()
    expect(paragraph.props.styleOverrides).toBeUndefined()
    expect(paragraph.props.fontSize).toEqual(pt(18))
    expect(paragraph.props.fontWeight).toBe("bold")
    expect(paragraph.props.headingLevel).toBeUndefined()
    expect(detached.past).toHaveLength(3)
  })

  it("patches paragraph style box overrides through the editor reducer", () => {
    const state = createInitialEditorState(docWithParagraph())
    const styled = reducer(state, {
      type: "APPLY_PARAGRAPH_STYLE_PRESET",
      nodeId: "p1",
      styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
    })
    const patched = reducer(styled, {
      type: "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX",
      nodeId: "p1",
      changes: { fill: "F5F7FA" },
    })
    const paragraph = patched.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(paragraph.props.box).toBeUndefined()
    expect(paragraph.props.styleOverrides?.box).toEqual({ fill: "F5F7FA" })
    expect(patched.past).toHaveLength(2)
  })

  it("patches a document style definition without rewriting paragraphs", () => {
    const state = createInitialEditorState(docWithStyleBackedParagraph())
    const beforeParagraph = state.doc.document.sections[0].nodes.p1 as ParagraphNode
    const beforeEffective = resolveStyledParagraphProps(state.doc.document.styles, beforeParagraph)

    const patched = reducer(state, {
      type: "PATCH_PARAGRAPH_STYLE_DEFINITION",
      styleId: TOR_BODY_PARAGRAPH_STYLE_ID,
      patch: { props: { fontSize: pt(13), lineHeight: 1.25 } },
    })
    const afterParagraph = patched.doc.document.sections[0].nodes.p1 as ParagraphNode
    const afterEffective = resolveStyledParagraphProps(patched.doc.document.styles, afterParagraph)

    expect(beforeEffective.fontSize).toEqual(pt(12))
    expect(patched.doc.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID].props.fontSize).toEqual(pt(13))
    expect(patched.doc.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID].props.lineHeight).toBe(1.25)
    expect(afterParagraph).toEqual(beforeParagraph)
    expect(afterEffective.fontSize).toEqual(pt(13))
    expect(afterEffective.lineHeight).toBe(1.25)
    expect(patched.past).toHaveLength(1)

    const undone = reducer(patched, { type: "UNDO" })
    const undoneStyle = undone.doc.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID]
    expect(undoneStyle?.props.fontSize).toEqual(pt(12))
    expect(undone.future).toHaveLength(1)

    const redone = reducer(undone, { type: "REDO" })
    const redoneStyle = redone.doc.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID]
    expect(redoneStyle?.props.fontSize).toEqual(pt(13))
    expect(redone.past).toHaveLength(1)
  })

  it("renames a document style definition as one history operation", () => {
    const state = createInitialEditorState(docWithStyleBackedParagraph())
    const renamed = reducer(state, {
      type: "RENAME_PARAGRAPH_STYLE_DEFINITION",
      styleId: TOR_BODY_PARAGRAPH_STYLE_ID,
      name: " Contract Body ",
    })

    expect(renamed.doc.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID].name).toBe("Contract Body")
    expect(renamed.past).toHaveLength(1)

    const cleared = reducer(renamed, {
      type: "RENAME_PARAGRAPH_STYLE_DEFINITION",
      styleId: TOR_BODY_PARAGRAPH_STYLE_ID,
      name: " ",
    })

    expect(cleared.doc.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID].name).toBeUndefined()
    expect(cleared.past).toHaveLength(2)
  })

  it("does not push history when patching a missing style definition", () => {
    const state = createInitialEditorState(docWithStyleBackedParagraph())
    const next = reducer(state, {
      type: "PATCH_PARAGRAPH_STYLE_DEFINITION",
      styleId: "missing.style",
      patch: { props: { fontSize: pt(13) } },
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
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["p0", "p0-child", "p1", newNodeId, "p2"])
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

  it("deletes an empty unlisted paragraph on Backspace at paragraph start", () => {
    const selected = reducer(createInitialEditorState(docWithEmptyParagraphAfterParagraph()), {
      type: "SELECT_NODE",
      nodeId: "p2",
    })
    const next = reducer(selected, { type: "MERGE_PARAGRAPH", nodeId: "p2" })
    const section = next.doc.document.sections[0]
    const previous = section.nodes.p1 as ParagraphNode

    expect(section.nodes.p2).toBeUndefined()
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["p1"])
    expect(previous.children).toEqual([{ id: "t1", type: "text", text: "Before" }])
    expect(next.selectedNodeId).toBe("p1")
    expect(next.mergeResult).toEqual({ prevNodeId: "p1", caretIndex: "Before".length })
    expect(next.past).toHaveLength(1)
  })

  it("uses the latest edit text before deleting an empty unlisted paragraph", () => {
    const doc = docWithEmptyParagraphAfterParagraph()
    const paragraph = doc.document.sections[0].nodes.p2 as ParagraphNode
    paragraph.children = [{ id: "t2", type: "text", text: "draft text" }]
    const selected = reducer(createInitialEditorState(doc), {
      type: "SELECT_NODE",
      nodeId: "p2",
    })
    const next = reducer(selected, { type: "MERGE_PARAGRAPH", nodeId: "p2", text: "" })
    const section = next.doc.document.sections[0]

    expect(section.nodes.p2).toBeUndefined()
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["p1"])
    expect(next.mergeResult).toEqual({ prevNodeId: "p1", caretIndex: "Before".length })
    expect(next.past).toHaveLength(1)
  })

  it("deletes the only empty unlisted paragraph without creating a merge target", () => {
    const selected = reducer(createInitialEditorState(docWithOnlyEmptyParagraph()), {
      type: "SELECT_NODE",
      nodeId: "p1",
    })
    const next = reducer(selected, { type: "MERGE_PARAGRAPH", nodeId: "p1" })
    const section = next.doc.document.sections[0]

    expect(section.nodes.p1).toBeUndefined()
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual([])
    expect(next.selectedNodeId).toBeNull()
    expect(next.mergeResult).toBeNull()
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

  it("does not indent bullet lists beyond the levels defined by the style", () => {
    const state = createInitialEditorState(docWithParagraph())
    const listed = reducer(state, {
      type: "TOGGLE_LIST_PRESET",
      nodeId: "p1",
      styleId: BULLET_BASIC_LIST_STYLE_ID,
      instanceId: "bullets",
      level: 0,
    })
    const indented = reducer(listed, {
      type: "CHANGE_LIST_ITEM_LEVEL",
      nodeId: "p1",
      direction: "indent",
    })
    const paragraph = indented.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(indented).toBe(listed)
    expect(paragraph.props.list).toEqual({ instanceId: "bullets", level: 0, itemId: "p1" })
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
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["p0", "p0-child", "p1"])
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
