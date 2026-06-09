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
})
