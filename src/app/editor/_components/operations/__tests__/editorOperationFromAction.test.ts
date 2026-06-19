import { describe, it, expect } from "vitest"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import type { EditorAction } from "../../editorReducer"

describe("editorOperationFromAction", () => {
  it("losslessly roundtrips a SPLIT_PARAGRAPH action", () => {
    const originalAction = {
      type: "SPLIT_PARAGRAPH",
      nodeId: "node-1",
      newNodeId: "node-2",
      splitIndex: 5,
      text: "Hello world",
      history: { operation: "split" } as any
    } as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("paragraph.split")
    expect(envelope.scope.nodeIds).toContain("node-1")
    expect(envelope.scope.nodeIds).toContain("node-2")

    // The most important guarantee for Phase 1
    expect(envelope.action).toBe(originalAction)
    expect(envelope.action).toEqual(originalAction)
  })

  it("losslessly roundtrips a legacy action like SET_PAGINATED", () => {
    const originalAction = {
      type: "SET_PAGINATED",
      paginated: {
        sections: [],
      } as any
    } as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("legacy.action")
    expect(envelope.scope.nodeIds).toHaveLength(0)
    expect(envelope.urgency).toBe("sync") // From NO_LAYOUT

    // The most important guarantee for Phase 1
    expect(envelope.action).toBe(originalAction)
    expect(envelope.action).toEqual(originalAction)
  })

  it("classifies DUPLICATE_NODE as a node duplicate operation", () => {
    const originalAction = {
      type: "DUPLICATE_NODE",
      nodeId: "node-1",
    } as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("node.duplicate")
    expect(envelope.scope.nodeIds).toEqual(["node-1"])
    expect(envelope.action).toBe(originalAction)
  })

  it("classifies REORDER_BODY_CHILD as a node reorder operation", () => {
    const originalAction = {
      type: "REORDER_BODY_CHILD",
      sectionId: "section-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      position: "after",
    } as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("node.reorder")
    expect(envelope.scope.nodeIds).toEqual(["node-1", "node-2"])
    expect(envelope.action).toBe(originalAction)
  })

  it("classifies FLOW_ROW_ADD_COL as a flow-row structure operation", () => {
    const originalAction = {
      type: "FLOW_ROW_ADD_COL",
      rowId: "row-1",
      stackId: "stack-1",
      position: "before",
    } as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("flow-row.structure.patch")
    expect(envelope.scope.nodeIds).toEqual(["row-1", "stack-1"])
    expect(envelope.action).toBe(originalAction)
  })

  it("classifies UPDATE_INLINE_TEXT_DRAFT as a no-history draft operation", () => {
    const originalAction = {
      type: "UPDATE_INLINE_TEXT_DRAFT",
      nodeId: "node-1",
      text: "Draft text",
    } as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("text.draft")
    expect(envelope.scope.nodeIds).toEqual(["node-1"])
    expect(envelope.scope.needsHistory).toBe(false)
    expect(envelope.action).toBe(originalAction)
  })

  it("classifies list structural actions as list structure operations", () => {
    const originalAction = {
      type: "CHANGE_LIST_ITEM_LEVEL",
      nodeId: "node-1",
      direction: "indent",
    } as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("list.structure.patch")
    expect(envelope.scope.nodeIds).toEqual(["node-1"])
    expect(envelope.action).toBe(originalAction)
  })

  it("classifies remaining direct reducer mutation groups with explicit operation kinds", () => {
    const cases: Array<{
      action: EditorAction
      kind: ReturnType<typeof createEditorOperationFromAction>["kind"]
      nodeIds: string[]
    }> = [
      {
        action: { type: "DRAG_COMMIT", sectionId: "section-1", op: {} as any } as EditorAction,
        kind: "drag.placement",
        nodeIds: [],
      },
      {
        action: { type: "UPDATE_PROPS", nodeId: "node-1", changes: { fontSize: 16 } },
        kind: "node.props.patch",
        nodeIds: ["node-1"],
      },
      {
        action: { type: "APPLY_PARAGRAPH_STYLE_PRESET", nodeId: "node-1", styleId: "body" as any },
        kind: "style.patch",
        nodeIds: ["node-1"],
      },
      {
        action: { type: "DETACH_PARAGRAPH_STYLE", nodeId: "node-1" },
        kind: "style.patch",
        nodeIds: ["node-1"],
      },
      {
        action: { type: "PATCH_PARAGRAPH_STYLE_DEFINITION", styleId: "body", patch: { name: "Body" } },
        kind: "style.patch",
        nodeIds: [],
      },
      {
        action: { type: "UPDATE_FIELD_REF", fieldRefId: "field-1", changes: { fallback: "Fallback" } },
        kind: "field.patch",
        nodeIds: [],
      },
      {
        action: { type: "TABLE_FIT_TO_WIDTH", tableId: "table-1" },
        kind: "table.structure.patch",
        nodeIds: ["table-1"],
      },
      {
        action: { type: "UPDATE_FLOW_TABLE_CELL_SPAN", cellId: "cell-1", changes: { colspan: 2 } },
        kind: "table.structure.patch",
        nodeIds: ["cell-1"],
      },
      {
        action: {
          type: "RESIZE_COLUMNS",
          leftStackId: "stack-1",
          leftShare: 2,
          rightStackId: "stack-2",
          rightShare: 1,
        },
        kind: "flow-row.layout.patch",
        nodeIds: ["stack-1", "stack-2"],
      },
      {
        action: { type: "RESIZE_ROW_MIN_HEIGHT", rowId: "row-1", minHeight: 120 },
        kind: "flow-row.layout.patch",
        nodeIds: ["row-1"],
      },
      {
        action: {
          type: "UPDATE_MARGIN",
          sectionIndex: 0,
          margin: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        kind: "document.settings.patch",
        nodeIds: [],
      },
      {
        action: { type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE", sectionIndex: 0, zone: "header" },
        kind: "document.settings.patch",
        nodeIds: [],
      },
    ]

    for (const { action, kind, nodeIds } of cases) {
      const envelope = createEditorOperationFromAction(action)

      expect(envelope.kind).toBe(kind)
      expect(envelope.scope.nodeIds).toEqual(nodeIds)
      expect(envelope.action).toBe(action)
    }
  })
})
