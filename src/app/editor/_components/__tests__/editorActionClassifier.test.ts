import { describe, expect, it } from "vitest"
import { pt } from "@/schema"
import { createDefaultDocument } from "@/document"
import {
  classifyEditorAction,
  classifyParagraphBoxStyleChanges,
  classifyParagraphStyleProperties,
  classifyParagraphTextStyleChanges,
  shouldSuppressLayoutLoadingOverlayForEditorAction,
} from "../editorActionClassifier"

describe("editorActionClassifier", () => {
  it("keeps selection and drag preview actions synchronous and layout-free", () => {
    expect(classifyEditorAction({ type: "SELECT_NODE", nodeId: "p1" })).toMatchObject({
      uiImpact: "selection",
      layoutScope: "none",
      priority: "sync",
    })
    expect(classifyEditorAction({ type: "DRAG_MOVE", clientX: 10, clientY: 12, preview: null })).toMatchObject({
      uiImpact: "none",
      layoutScope: "none",
      priority: "sync",
    })
    expect(shouldSuppressLayoutLoadingOverlayForEditorAction({ type: "SELECT_NODE", nodeId: "p1" })).toBe(false)
  })

  it("classifies text color and decoration as visual-only", () => {
    expect(classifyParagraphTextStyleChanges({ textColor: "DC2626" })).toMatchObject({
      uiImpact: "visual",
      layoutScope: "none",
      priority: "background",
    })
    expect(classifyParagraphTextStyleChanges({ textDecoration: "underline", strikethrough: true })).toMatchObject({
      uiImpact: "visual",
      layoutScope: "none",
      priority: "background",
    })
    expect(shouldSuppressLayoutLoadingOverlayForEditorAction({
      type: "UPDATE_PARAGRAPH_TEXT_STYLE",
      nodeId: "p1",
      changes: { textColor: "DC2626" },
    })).toBe(true)
  })

  it("classifies font metrics as visible node layout work", () => {
    expect(classifyParagraphTextStyleChanges({ fontSize: pt(16) })).toMatchObject({
      uiImpact: "layout",
      layoutScope: "node",
      priority: "visible",
    })
    expect(classifyParagraphTextStyleChanges({ fontFamilyKey: "sarabun", textColor: "DC2626" })).toMatchObject({
      uiImpact: "layout",
      layoutScope: "node",
      priority: "visible",
    })
  })

  it("classifies paragraph style box fill as visual and padding/border as layout", () => {
    expect(classifyParagraphBoxStyleChanges({ fill: "F8FAFC" })).toMatchObject({
      uiImpact: "visual",
      layoutScope: "none",
      priority: "background",
    })
    expect(classifyParagraphBoxStyleChanges({ padding: { top: pt(6) } })).toMatchObject({
      uiImpact: "layout",
      layoutScope: "block",
      priority: "visible",
    })
    expect(classifyParagraphBoxStyleChanges({
      border: { top: { style: "solid", width: pt(1), color: "111827" } },
    })).toMatchObject({
      uiImpact: "layout",
      layoutScope: "block",
      priority: "visible",
    })
  })

  it("classifies paragraph style override patches by visual vs metric keys", () => {
    expect(classifyParagraphStyleProperties({ textColor: "2563EB", box: { fill: "F8FAFC" } })).toMatchObject({
      uiImpact: "visual",
      layoutScope: "none",
      priority: "background",
    })
    expect(classifyParagraphStyleProperties({ lineHeight: 1.7 })).toMatchObject({
      uiImpact: "layout",
      layoutScope: "node",
      priority: "visible",
    })
    expect(classifyParagraphStyleProperties({ box: { padding: { top: pt(2), right: pt(2), bottom: pt(2), left: pt(2) } } })).toMatchObject({
      uiImpact: "layout",
      layoutScope: "node",
      priority: "visible",
    })
  })

  it("classifies document style definitions as document background layout when metrics change", () => {
    expect(classifyEditorAction({
      type: "PATCH_PARAGRAPH_STYLE_DEFINITION",
      styleId: "tor.body",
      patch: { name: "Body" },
    })).toMatchObject({
      uiImpact: "visual",
      layoutScope: "none",
      priority: "background",
    })
    expect(classifyEditorAction({
      type: "PATCH_PARAGRAPH_STYLE_DEFINITION",
      styleId: "tor.body",
      patch: { props: { fontSize: pt(13) } },
    })).toMatchObject({
      uiImpact: "layout",
      layoutScope: "document",
      priority: "background",
    })
  })

  it("marks structure actions as visible work that should not block the canvas overlay", () => {
    const reorder = {
      type: "REORDER_BODY_CHILD",
      sectionId: "section",
      sourceNodeId: "p2",
      targetNodeId: "p1",
      position: "before",
    } as const
    expect(classifyEditorAction(reorder)).toMatchObject({
      uiImpact: "structure",
      layoutScope: "from-index",
      priority: "visible",
    })
    expect(shouldSuppressLayoutLoadingOverlayForEditorAction(reorder)).toBe(true)
    expect(shouldSuppressLayoutLoadingOverlayForEditorAction({ type: "TABLE_ADD_ROW", tableId: "table1" })).toBe(true)
    expect(shouldSuppressLayoutLoadingOverlayForEditorAction({ type: "LOAD_DOCUMENT", doc: createDefaultDocument("Doc") })).toBe(false)
  })
})
