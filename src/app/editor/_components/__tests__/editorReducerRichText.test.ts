import { afterEach, describe, expect, it, vi } from "vitest"
import {
  assertDocument,
  DEFAULT_HEADER_FOOTER_RESERVED_PT,
  DEFAULT_PARAGRAPH_PROPS,
  BULLET_BASIC_LIST_STYLE_ID,
  getAllListStylePresets,
  MAX_HEADER_FOOTER_RESERVED_RATIO,
  MIN_HEADER_FOOTER_RESERVED_PT,
  mergeParagraphWithPrevious,
  resolveStyledParagraphProps,
  splitParagraphAtIndex,
  TOR_BODY_PARAGRAPH_STYLE_ID,
  TOR_CLAUSE_LIST_STYLE_ID,
  TOR_HEADING1_PARAGRAPH_STYLE_ID,
} from "@/document"
import { getPageDimensions } from "@/pagination"
import type { DocumentNode, LayoutNode, ParagraphNode } from "@/schema"
import { pt } from "@/schema"
import { createInitialEditorState, reducer } from "../editorReducer"

const PAGE_BREAK_SPLIT_TEXT = "ชุดข้อมูลนี้สร้างขึ้นเพื่อทดลอง pagination, TOC, heading, list, table, field และ editor interaction ในเอกสารขนาดใหญ่"
const PAGE_BREAK_SPLIT_INDEX = PAGE_BREAK_SPLIT_TEXT.indexOf("pagination") + "pagination".length
const PAGE_BREAK_SOURCE_TEXT = PAGE_BREAK_SPLIT_TEXT.slice(0, PAGE_BREAK_SPLIT_INDEX)
const PAGE_BREAK_AFTER_TEXT = PAGE_BREAK_SPLIT_TEXT.slice(PAGE_BREAK_SPLIT_INDEX)

afterEach(() => {
  vi.unstubAllGlobals()
})

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

function docWithParagraphBeforePageBreak(): DocumentNode {
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
          body: { id: "body", type: "body", props: {}, childIds: ["cover_note", "cover_break", "after_break"] },
          cover_note: {
            id: "cover_note",
            type: "paragraph",
            props: {
              ...DEFAULT_PARAGRAPH_PROPS,
              spacingBefore: pt(42),
            },
            children: [{ id: "cover_note_text", type: "text", text: PAGE_BREAK_SPLIT_TEXT }],
          },
          cover_break: { id: "cover_break", type: "page-break", props: {} } as LayoutNode,
          after_break: {
            id: "after_break",
            type: "paragraph",
            props: {
              ...DEFAULT_PARAGRAPH_PROPS,
              headingLevel: 1,
            },
            children: [{ id: "after_break_text", type: "text", text: "หลัง page break" }],
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

function docWithListedFlowStack(): DocumentNode {
  const nodes: Record<string, LayoutNode> = {
    body: { id: "body", type: "body", props: {}, childIds: ["fr1"] },
    fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
    fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p0", "p1"] },
    fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
    p0: {
      id: "p0",
      type: "paragraph",
      props: {
        ...DEFAULT_PARAGRAPH_PROPS,
        list: { instanceId: "tor-main", level: 0, itemId: "tor.stack.parent" },
      },
      children: [{ id: "t0", type: "text", text: "stack parent" }],
    },
    p1: {
      id: "p1",
      type: "paragraph",
      props: {
        ...DEFAULT_PARAGRAPH_PROPS,
        list: { instanceId: "tor-main", level: 1, itemId: "tor.stack.left" },
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
        list: { instanceId: "tor-main", level: 0, itemId: "tor.stack.right" },
      },
      children: [{ id: "t3", type: "text", text: "right stack" }],
    },
  }

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
        nodes,
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

  it("ignores document heading actions for non-body paragraphs", () => {
    const state = createInitialEditorState(docWithListedFlowStack())
    const styled = reducer(state, {
      type: "APPLY_PARAGRAPH_STYLE_PRESET",
      nodeId: "p1",
      styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
    })
    const directHeading = reducer(state, {
      type: "UPDATE_PROPS",
      nodeId: "p1",
      changes: { headingLevel: 1 },
    })
    const patched = reducer(state, {
      type: "PATCH_PARAGRAPH_STYLE_OVERRIDES",
      nodeId: "p1",
      changes: { fontSize: pt(18), headingLevel: 1 },
    })
    const paragraph = patched.doc.document.sections[0].nodes.p1 as ParagraphNode

    expect(styled).toBe(state)
    expect(directHeading).toBe(state)
    expect(paragraph.props.styleOverrides).toEqual({ fontSize: pt(18) })
    expect(paragraph.props.headingLevel).toBeUndefined()
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

  it("uses the latest edit text before splitting a listed flow-stack paragraph", () => {
    const state = createInitialEditorState(docWithListedFlowStack())
    const next = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "p1",
      splitIndex: "Stack draft ".length,
      text: "Stack draft child",
    })
    const newNodeId = next.lastSplitNodeId
    expect(newNodeId).toBeTruthy()
    if (!newNodeId) return

    const section = next.doc.document.sections[0]
    const stack = section.nodes.fs1
    const rightStack = section.nodes.fs2
    const first = section.nodes.p1 as ParagraphNode
    const inserted = section.nodes[newNodeId] as ParagraphNode

    expect(stack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (stack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(stack.childIds).toEqual(["p0", "p1", newNodeId])
    expect(rightStack.childIds).toEqual(["p2"])
    expect(first.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("Stack draft ")
    expect(inserted.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("child")
    expect(first.props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: "tor.stack.left" })
    expect(inserted.props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: newNodeId })
    expect(next.past).toHaveLength(1)
  })

  it("uses a non-colliding preallocated split id and undo removes the optimistic node", () => {
    const state = createInitialEditorState(docWithParagraph())
    const next = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "p1",
      splitIndex: 2,
      newNodeId: "optimistic-split-node",
    })
    const section = next.doc.document.sections[0]
    const source = section.nodes.p1 as ParagraphNode
    const inserted = section.nodes["optimistic-split-node"] as ParagraphNode

    expect(next.lastSplitNodeId).toBe("optimistic-split-node")
    expect(source.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("He")
    expect(inserted.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("llo")
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual([
      "p1",
      "optimistic-split-node",
    ])

    const undone = reducer(next, { type: "UNDO" })
    const undoneSection = undone.doc.document.sections[0]
    expect(undoneSection.nodes["optimistic-split-node"]).toBeUndefined()
    expect(undoneSection.nodes.body?.type === "body" ? undoneSection.nodes.body.childIds : []).toEqual(["p1"])
    expect((undoneSection.nodes.p1 as ParagraphNode).children.map((child) => child.type === "text" ? child.text : "").join(""))
      .toBe("Hello")
  })

  it("keeps optimistic split pagination in the same reducer commit as the document split", () => {
    const state = createInitialEditorState(docWithParagraph())
    const optimisticPaginated = {
      ...state.paginated,
      tocEntries: [...state.paginated.tocEntries],
    }
    const next = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "p1",
      splitIndex: 2,
      newNodeId: "optimistic-split-node",
      paginated: optimisticPaginated,
    })

    expect(next.doc).not.toBe(state.doc)
    expect(next.paginated).toBe(optimisticPaginated)
    expect(next.lastSplitNodeId).toBe("optimistic-split-node")
    expect(next.past).toHaveLength(1)
    expect(next.past[0].paginated).toBe(state.paginated)
  })

  it("uses a precomputed split before a page break without leaving stale source text", () => {
    const doc = docWithParagraphBeforePageBreak()
    const state = createInitialEditorState(doc)
    const precomputed = splitParagraphAtIndex(state.doc, "cover_note", PAGE_BREAK_SPLIT_INDEX, {
      newNodeId: "cover_note_split",
    })
    const optimisticPaginated = {
      ...state.paginated,
      tocEntries: [...state.paginated.tocEntries],
    }
    const next = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "cover_note",
      splitIndex: 0,
      precomputed,
      paginated: optimisticPaginated,
    })
    const section = next.doc.document.sections[0]
    const source = section.nodes.cover_note as ParagraphNode
    const inserted = section.nodes.cover_note_split as ParagraphNode

    expect(next.lastSplitNodeId).toBe("cover_note_split")
    expect(source.children.map((child) => child.type === "text" ? child.text : "").join(""))
      .toBe(PAGE_BREAK_SOURCE_TEXT)
    expect(inserted.children.map((child) => child.type === "text" ? child.text : "").join(""))
      .toBe(PAGE_BREAK_AFTER_TEXT)
    expect(source.children.map((child) => child.type === "text" ? child.text : "").join(""))
      .not.toBe(PAGE_BREAK_SPLIT_TEXT)
    expect(source.children.map((child) => child.type === "text" ? child.text : "").join(""))
      .not.toContain("TOC")
    expect(source.props.spacingAfter).toEqual(pt(0))
    expect(inserted.props.spacingBefore).toEqual(pt(0))
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual([
      "cover_note",
      "cover_note_split",
      "cover_break",
      "after_break",
    ])
    expect(section.nodes.cover_break?.type).toBe("page-break")
    expect(() => assertDocument(next.doc)).not.toThrow()
    expect(next.paginated).toBe(optimisticPaginated)
    expect(next.past[0].doc).toBe(state.doc)
  })

  it("uses a prevalidated precomputed split without normalizing the shell result", () => {
    vi.stubGlobal("window", {
      __flowDocWysiwygPerfTraceEnabled: true,
      location: { search: "" },
    })
    const doc = docWithParagraphBeforePageBreak()
    const state = reducer(createInitialEditorState(doc), {
      type: "SELECT_NODE",
      nodeId: "cover_note",
      anchorNodeId: "cover_note",
    })
    const precomputed = splitParagraphAtIndex(state.doc, "cover_note", PAGE_BREAK_SPLIT_INDEX, {
      newNodeId: "cover_note_fast_split",
    })
    const optimisticPaginated = {
      ...state.paginated,
      tocEntries: [...state.paginated.tocEntries],
    }
    const next = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "cover_note",
      splitIndex: 999,
      text: "fallback text should not be applied",
      newNodeId: "fallback_split_id",
      precomputed,
      precomputedDocValidation: "shell-optimistic-structural",
      paginated: optimisticPaginated,
    })
    const section = next.doc.document.sections[0]
    const source = section.nodes.cover_note as ParagraphNode
    const inserted = section.nodes.cover_note_fast_split as ParagraphNode

    expect(next).not.toBe(state)
    expect(next.doc).toBe(precomputed.doc)
    expect(next.paginated).toBe(optimisticPaginated)
    expect(next.lastSplitNodeId).toBe("cover_note_fast_split")
    expect(next.selectedNodeId).toBe("cover_note")
    expect(next.selectionAnchorNodeId).toBe("cover_note")
    expect(section.nodes.fallback_split_id).toBeUndefined()
    expect(source.children.map((child) => child.type === "text" ? child.text : "").join(""))
      .toBe(PAGE_BREAK_SOURCE_TEXT)
    expect(inserted.children.map((child) => child.type === "text" ? child.text : "").join(""))
      .toBe(PAGE_BREAK_AFTER_TEXT)
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual([
      "cover_note",
      "cover_note_fast_split",
      "cover_break",
      "after_break",
    ])
    expect(next.past).toHaveLength(1)
    const attributionEvents = window.__flowDocWysiwygPerfEvents?.filter((event) => (
      event.kind === "flowdoc-structural-attribution"
    )) ?? []
    expect(attributionEvents.map((event) => event.action)).toContain("reducer-precomputed-split-fast-path")
    expect(attributionEvents.map((event) => event.action)).toContain("push-prevalidated-doc")
    expect(attributionEvents.map((event) => event.action)).toContain("reducer-total")
    expect(attributionEvents.some((event) => event.action === "normalize")).toBe(false)
    expect(attributionEvents.some((event) => event.action === "assert-document")).toBe(false)
    expect(JSON.stringify(attributionEvents)).not.toContain("fallback text should not be applied")
  })

  it("uses a precomputed merge payload with optimistic pagination", () => {
    const state = createInitialEditorState(docWithParagraph())
    const afterSplit = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "p1",
      splitIndex: 2,
      newNodeId: "optimistic-split-node",
    })
    const merge = mergeParagraphWithPrevious(afterSplit.doc, "optimistic-split-node")
    expect(merge).toBeTruthy()
    if (!merge) return

    const optimisticPaginated = {
      ...afterSplit.paginated,
      tocEntries: [...afterSplit.paginated.tocEntries],
    }
    const next = reducer(afterSplit, {
      type: "MERGE_PARAGRAPH",
      nodeId: "optimistic-split-node",
      precomputed: merge,
      paginated: optimisticPaginated,
    })
    const section = next.doc.document.sections[0]
    const merged = section.nodes.p1 as ParagraphNode

    expect(section.nodes["optimistic-split-node"]).toBeUndefined()
    expect(merged.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("Hello")
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["p1"])
    expect(next.mergeResult).toEqual({ prevNodeId: "p1", caretIndex: 2 })
    expect(next.paginated).toBe(optimisticPaginated)
    expect(next.past).toHaveLength(2)
  })

  it("uses a prevalidated precomputed merge without normalizing the shell result", () => {
    const state = createInitialEditorState(docWithParagraphBeforePageBreak())
    const afterSplit = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "cover_note",
      splitIndex: PAGE_BREAK_SPLIT_INDEX,
      newNodeId: "cover_note_fast_merge",
    })
    const merge = mergeParagraphWithPrevious(afterSplit.doc, "cover_note_fast_merge")
    expect(merge).toBeTruthy()
    if (!merge) return

    const optimisticPaginated = {
      ...afterSplit.paginated,
      tocEntries: [...afterSplit.paginated.tocEntries],
    }
    const next = reducer(afterSplit, {
      type: "MERGE_PARAGRAPH",
      nodeId: "cover_note_fast_merge",
      text: "fallback text should not be applied",
      precomputed: merge,
      precomputedDocValidation: "shell-optimistic-structural",
      paginated: optimisticPaginated,
    })
    const section = next.doc.document.sections[0]
    const merged = section.nodes.cover_note as ParagraphNode

    expect(next.doc).toBe(merge.doc)
    expect(next.paginated).toBe(optimisticPaginated)
    expect(section.nodes.cover_note_fast_merge).toBeUndefined()
    expect(merged.children.map((child) => child.type === "text" ? child.text : "").join(""))
      .toBe(PAGE_BREAK_SPLIT_TEXT)
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual([
      "cover_note",
      "cover_break",
      "after_break",
    ])
    expect(section.nodes.cover_break?.type).toBe("page-break")
    expect(next.mergeResult).toEqual({
      prevNodeId: "cover_note",
      caretIndex: PAGE_BREAK_SPLIT_INDEX,
    })
  })

  it("merges an immediate split back into the source paragraph", () => {
    const state = createInitialEditorState(docWithParagraph())
    const afterSplit = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "p1",
      splitIndex: 3,
      newNodeId: "immediate-backspace-node",
    })
    const merge = mergeParagraphWithPrevious(afterSplit.doc, "immediate-backspace-node")
    expect(merge).toBeTruthy()
    if (!merge) return

    const next = reducer(afterSplit, {
      type: "MERGE_PARAGRAPH",
      nodeId: "immediate-backspace-node",
      precomputed: merge,
    })
    const section = next.doc.document.sections[0]
    const merged = section.nodes.p1 as ParagraphNode

    expect(section.nodes["immediate-backspace-node"]).toBeUndefined()
    expect(merged.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("Hello")
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["p1"])
    expect(next.mergeResult).toEqual({ prevNodeId: "p1", caretIndex: 3 })
  })

  it("merges a split-before-page-break back without leaving a ghost node", () => {
    const doc = docWithParagraphBeforePageBreak()
    const state = createInitialEditorState(doc)
    const splitIndex = PAGE_BREAK_SPLIT_INDEX
    const afterSplit = reducer(state, {
      type: "SPLIT_PARAGRAPH",
      nodeId: "cover_note",
      splitIndex,
      newNodeId: "cover_note_split",
    })
    expect(afterSplit.doc.document.sections[0].nodes.body?.type === "body"
      ? afterSplit.doc.document.sections[0].nodes.body.childIds
      : []).toEqual(["cover_note", "cover_note_split", "cover_break", "after_break"])

    const merge = mergeParagraphWithPrevious(afterSplit.doc, "cover_note_split")
    expect(merge).toBeTruthy()
    if (!merge) return

    const next = reducer(afterSplit, {
      type: "MERGE_PARAGRAPH",
      nodeId: "cover_note_split",
      precomputed: merge,
    })
    const section = next.doc.document.sections[0]
    const merged = section.nodes.cover_note as ParagraphNode

    expect(section.nodes.cover_note_split).toBeUndefined()
    expect(merged.children.map((child) => child.type === "text" ? child.text : "").join(""))
      .toBe(PAGE_BREAK_SPLIT_TEXT)
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual([
      "cover_note",
      "cover_break",
      "after_break",
    ])
    expect(section.nodes.cover_break?.type).toBe("page-break")
    expect(next.mergeResult).toEqual({ prevNodeId: "cover_note", caretIndex: splitIndex })
    expect(() => assertDocument(next.doc)).not.toThrow()
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

  it("exits an empty listed flow-stack paragraph without changing stack topology", () => {
    const state = createInitialEditorState(docWithListedFlowStack())
    const next = reducer(state, {
      type: "EXIT_LIST_ITEM",
      nodeId: "p1",
      text: "",
    })
    const section = next.doc.document.sections[0]
    const stack = section.nodes.fs1
    const paragraph = section.nodes.p1 as ParagraphNode

    expect(stack.type).toBe("flow-stack")
    if (stack.type !== "flow-stack") return
    expect(stack.childIds).toEqual(["p0", "p1"])
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

  it("outdents a flow-stack list item on Backspace while preserving latest draft text and caret", () => {
    const state = createInitialEditorState(docWithListedFlowStack())
    const next = reducer(state, {
      type: "BACKSPACE_LIST_ITEM_AT_START",
      nodeId: "p1",
      text: "Draft stack child",
      caretIndex: "Draft".length,
    })
    const section = next.doc.document.sections[0]
    const stack = section.nodes.fs1
    const paragraph = section.nodes.p1 as ParagraphNode

    expect(stack.type).toBe("flow-stack")
    if (stack.type !== "flow-stack") return
    expect(stack.childIds).toEqual(["p0", "p1"])
    expect(paragraph.props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "tor.stack.left" })
    expect(paragraph.children.map((child) => child.type === "text" ? child.text : "").join("")).toBe("Draft stack child")
    expect(next.listLevelChangeResult).toEqual({ nodeId: "p1", caretIndex: "Draft".length })
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
