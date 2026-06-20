import { describe, it, expect } from "vitest"
import { createEditorOperationFromAction, createEditorOperationFromCommand } from "../editorOperationFromAction"
import type { EditorAction } from "../../editorReducer"
import type { EditorOperationCommand } from "../editorOperationTypes"

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
    expect(envelope.command).toEqual({
      kind: "paragraph.split",
      nodeId: "node-1",
      newNodeId: "node-2",
      splitIndex: 5,
      text: "Hello world",
    })
    expect(envelope.runtime?.structural?.history).toEqual({ operation: "split" })

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
    expect(envelope.command).toBeUndefined()
    expect(envelope.payload).toBeUndefined()

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
    expect(envelope.command).toEqual({ kind: "node.duplicate", nodeId: "node-1" })
    expect(envelope.payload).toEqual({ kind: "node.duplicate", nodeId: "node-1" })
    expect(envelope.payload).toBe(envelope.command)
    expect(envelope.action).toBe(originalAction)
  })

  it("creates an operation envelope from a semantic command without caller-provided action input", () => {
    const command: EditorOperationCommand = { kind: "node.delete", nodeId: "node-1" }

    const envelope = createEditorOperationFromCommand(command)

    expect(envelope.kind).toBe("node.delete")
    expect(envelope.command).toBe(command)
    expect(envelope.payload).toBe(command)
    expect(envelope.action).toEqual({ type: "DELETE_NODE", nodeId: "node-1" })
    expect(envelope.scope.nodeIds).toEqual(["node-1"])
  })

  it("creates compatibility action snapshots for command-first table operations", () => {
    const command: EditorOperationCommand = {
      kind: "table.structure.patch",
      mutation: "add-column",
      tableId: "table-1",
      afterIndex: 2,
    }

    const envelope = createEditorOperationFromCommand(command)

    expect(envelope.kind).toBe("table.structure.patch")
    expect(envelope.command).toBe(command)
    expect(envelope.payload).toBe(command)
    expect(envelope.action).toEqual({ type: "TABLE_ADD_COL", tableId: "table-1", afterIndex: 2 })
    expect(envelope.scope.nodeIds).toEqual(["table-1"])
  })

  it("creates compatibility action snapshots for command-first style operations", () => {
    const command: EditorOperationCommand = {
      kind: "style.patch",
      styleType: "text-run-style-range",
      nodeId: "node-1",
      start: 1,
      end: 4,
      changes: { textDecoration: "underline" },
    }

    const envelope = createEditorOperationFromCommand(command)

    expect(envelope.kind).toBe("style.patch")
    expect(envelope.command).toBe(command)
    expect(envelope.payload).toBe(command)
    expect(envelope.action).toEqual({
      type: "UPDATE_TEXT_RUN_STYLE_RANGE",
      nodeId: "node-1",
      start: 1,
      end: 4,
      changes: { textDecoration: "underline" },
    })
    expect(envelope.scope.nodeIds).toEqual(["node-1"])
  })

  it("creates compatibility action snapshots for command-first paragraph operations", () => {
    const command: EditorOperationCommand = {
      kind: "paragraph.split",
      nodeId: "node-1",
      splitIndex: 5,
      text: "Hello world",
      newNodeId: "node-2",
    }

    const envelope = createEditorOperationFromCommand(command)

    expect(envelope.kind).toBe("paragraph.split")
    expect(envelope.command).toBe(command)
    expect(envelope.payload).toBe(command)
    expect(envelope.action).toEqual({
      type: "SPLIT_PARAGRAPH",
      nodeId: "node-1",
      splitIndex: 5,
      text: "Hello world",
      newNodeId: "node-2",
    })
    expect(envelope.scope.nodeIds).toEqual(["node-1", "node-2"])
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
    expect(envelope.payload).toEqual({
      kind: "node.reorder",
      sectionId: "section-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      position: "after",
    })
    expect(envelope.command).toBe(envelope.payload)
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
    expect(envelope.payload).toEqual({
      kind: "flow-row.structure.patch",
      rowId: "row-1",
      stackId: "stack-1",
      position: "before",
    })
    expect(envelope.command).toBe(envelope.payload)
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
    expect(envelope.command).toEqual({ kind: "text.draft", nodeId: "node-1", text: "Draft text" })
    expect(envelope.payload).toEqual({ kind: "text.draft", nodeId: "node-1", text: "Draft text" })
    expect(envelope.payload).toBe(envelope.command)
    expect(envelope.action).toBe(originalAction)
  })

  it("classifies UPDATE_TEXT as a text commit payload", () => {
    const originalAction = {
      type: "UPDATE_TEXT",
      nodeId: "node-1",
      text: "Committed text",
    } as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("text.commit")
    expect(envelope.scope.nodeIds).toEqual(["node-1"])
    expect(envelope.payload).toEqual({
      kind: "text.commit",
      commitType: "update-text",
      nodeId: "node-1",
      text: "Committed text",
    })
    expect(envelope.command).toBe(envelope.payload)
    expect(envelope.action).toBe(originalAction)
  })

  it("separates inline text commit command from lifecycle runtime", () => {
    const beforeDoc = { document: { sections: [] } }
    const beforePaginated = { sections: [], tocEntries: [] }
    const afterPaginated = { sections: [{ pages: [] }], tocEntries: [] }
    const originalAction = {
      type: "COMMIT_INLINE_TEXT_EDIT",
      nodeId: "node-1",
      beforeText: "Before",
      beforeDoc,
      beforePaginated,
      afterPaginated,
    } as unknown as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("text.commit")
    expect(envelope.command).toEqual({
      kind: "text.commit",
      commitType: "inline-text",
      nodeId: "node-1",
      beforeText: "Before",
    })
    expect(envelope.runtime?.textCommit).toEqual({
      beforeDoc,
      beforePaginated,
      afterPaginated,
    })
    expect(envelope.action).toBe(originalAction)
  })

  it("separates wysiwyg text commit command from lifecycle runtime", () => {
    const history = { operation: "wysiwyg-text" }
    const afterPaginated = { sections: [{ pages: [] }], tocEntries: [] }
    const originalAction = {
      type: "COMMIT_WYSIWYG_TEXT_EDIT",
      nodeId: "node-1",
      beforeText: "Before",
      text: "After",
      history,
      afterPaginated,
    } as unknown as EditorAction

    const envelope = createEditorOperationFromAction(originalAction)

    expect(envelope.kind).toBe("text.commit")
    expect(envelope.command).toEqual({
      kind: "text.commit",
      commitType: "wysiwyg-text",
      nodeId: "node-1",
      beforeText: "Before",
      text: "After",
    })
    expect(envelope.runtime?.textCommit).toEqual({
      history,
      afterPaginated,
    })
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
    expect(envelope.command).toEqual({
      kind: "list.structure.patch",
      mutation: "change-level",
      nodeId: "node-1",
      direction: "indent",
    })
    expect(envelope.action).toBe(originalAction)
  })

  it("creates compatibility action snapshots for command-first list operations", () => {
    const command: EditorOperationCommand = {
      kind: "list.structure.patch",
      mutation: "toggle-preset",
      nodeId: "node-1",
      styleId: "tor-clause" as any,
      instanceId: "tor-main",
      level: 1,
      text: "Clause text",
    }

    const envelope = createEditorOperationFromCommand(command)

    expect(envelope.kind).toBe("list.structure.patch")
    expect(envelope.command).toBe(command)
    expect(envelope.payload).toBe(command)
    expect(envelope.action).toEqual({
      type: "TOGGLE_LIST_PRESET",
      nodeId: "node-1",
      styleId: "tor-clause",
      instanceId: "tor-main",
      level: 1,
      text: "Clause text",
    })
    expect(envelope.scope.nodeIds).toEqual(["node-1"])
  })

  it("classifies remaining direct reducer mutation groups with explicit operation kinds", () => {
    const cases: Array<{
      action: EditorAction
      kind: ReturnType<typeof createEditorOperationFromAction>["kind"]
      nodeIds: string[]
    }> = [
      {
        action: {
          type: "DRAG_COMMIT",
          sectionId: "section-1",
          op: { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
        } as EditorAction,
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
      expect(envelope.command).toBe(envelope.payload)
      if (action.type === "UPDATE_PROPS") {
        expect(envelope.payload).toEqual({ kind: "node.props.patch", nodeId: "node-1", changes: { fontSize: 16 } })
      }
      if (action.type === "DRAG_COMMIT") {
        expect(envelope.payload).toEqual({
          kind: "drag.placement",
          sectionId: "section-1",
          op: { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
        })
      }
      if (action.type === "UPDATE_FIELD_REF") {
        expect(envelope.payload).toEqual({ kind: "field.patch", fieldRefId: "field-1", changes: { fallback: "Fallback" } })
      }
      if (action.type === "APPLY_PARAGRAPH_STYLE_PRESET") {
        expect(envelope.payload).toEqual({
          kind: "style.patch",
          styleType: "apply-paragraph-style-preset",
          nodeId: "node-1",
          styleId: "body",
        })
      }
      if (action.type === "PATCH_PARAGRAPH_STYLE_DEFINITION") {
        expect(envelope.payload).toEqual({
          kind: "style.patch",
          styleType: "paragraph-style-definition",
          styleId: "body",
          patch: { name: "Body" },
        })
      }
      if (action.type === "FLOW_ROW_ADD_COL") {
        expect(envelope.payload).toEqual({
          kind: "flow-row.structure.patch",
          rowId: "row-1",
          stackId: "stack-1",
          position: "before",
        })
      }
      if (action.type === "RESIZE_COLUMNS") {
        expect(envelope.payload).toEqual({
          kind: "flow-row.layout.patch",
          layoutType: "resize-columns",
          leftStackId: "stack-1",
          leftShare: 2,
          rightStackId: "stack-2",
          rightShare: 1,
        })
      }
      if (action.type === "RESIZE_ROW_MIN_HEIGHT") {
        expect(envelope.payload).toEqual({
          kind: "flow-row.layout.patch",
          layoutType: "resize-row-min-height",
          rowId: "row-1",
          minHeight: 120,
        })
      }
      if (action.type === "TABLE_FIT_TO_WIDTH") {
        expect(envelope.payload).toEqual({ kind: "table.structure.patch", mutation: "fit-to-width", tableId: "table-1" })
      }
      if (action.type === "UPDATE_FLOW_TABLE_CELL_SPAN") {
        expect(envelope.payload).toEqual({
          kind: "table.structure.patch",
          mutation: "cell-span",
          cellId: "cell-1",
          changes: { colspan: 2 },
        })
      }
      expect(envelope.command).toBe(envelope.payload)
      if (action.type === "UPDATE_MARGIN") {
        expect(envelope.payload).toEqual({
          kind: "document.settings.patch",
          setting: "margin",
          sectionIndex: 0,
          margin: { top: 10, right: 10, bottom: 10, left: 10 },
        })
      }
      if (action.type === "ENSURE_HEADER_FOOTER_ZONE_VISIBLE") {
        expect(envelope.payload).toEqual({
          kind: "document.settings.patch",
          setting: "ensure-zone-visible",
          sectionIndex: 0,
          zone: "header",
        })
      }
      expect(envelope.action).toBe(action)
    }
  })

  it("creates compatibility action snapshots for command-first drag placement operations", () => {
    const command: EditorOperationCommand = {
      kind: "drag.placement",
      sectionId: "section-1",
      op: { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
    }

    const envelope = createEditorOperationFromCommand(command)

    expect(envelope.kind).toBe("drag.placement")
    expect(envelope.command).toBe(command)
    expect(envelope.payload).toBe(command)
    expect(envelope.action).toEqual({
      type: "DRAG_COMMIT",
      sectionId: "section-1",
      op: { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
    })
    expect(envelope.scope.nodeIds).toEqual([])
  })

  it("creates compatibility action snapshots for command-first delete-empty table cell paragraph operations", () => {
    const command: EditorOperationCommand = {
      kind: "table.structure.patch",
      mutation: "delete-empty-cell-paragraph",
      nodeId: "paragraph-1",
      text: "",
    }

    const envelope = createEditorOperationFromCommand(command)

    expect(envelope.kind).toBe("table.structure.patch")
    expect(envelope.command).toBe(command)
    expect(envelope.payload).toBe(command)
    expect(envelope.action).toEqual({
      type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH",
      nodeId: "paragraph-1",
      text: "",
    })
    expect(envelope.scope.nodeIds).toEqual(["paragraph-1"])
  })
})
