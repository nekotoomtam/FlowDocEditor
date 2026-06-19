import { createDefaultDocument } from "@/document"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import type { EditorState, HistoryEntry } from "../../editorReducer"
import { commitEditorOperationResult } from "../editorOperationCommit"

function createState(): EditorState {
  return createInitialEditorState(createDefaultDocument())
}

describe("commitEditorOperationResult", () => {
  it("commits a full-validation document result with one history entry", () => {
    const state = createState()

    const next = commitEditorOperationResult(state, {
      status: "success",
      nextDoc: state.doc,
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
      diagnostics: { operationKind: "node.delete" },
    })

    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(next.doc).toEqual(state.doc)
  })

  it("commits a prevalidated document result through the push-history path", () => {
    const state = createState()
    const history: HistoryEntry = { doc: state.doc, paginated: state.paginated }

    const next = commitEditorOperationResult(state, {
      status: "success",
      nextDoc: state.doc,
      validationPolicy: "prevalidated",
      historyPolicy: { kind: "push", entry: history },
      diagnostics: { operationKind: "paragraph.split" },
    })

    expect(next.past).toEqual([history])
    expect(next.future).toEqual([])
    expect(next.doc).toBe(state.doc)
  })

  it("commits a scoped document result through the safe validation fallback", () => {
    const state = createState()

    const next = commitEditorOperationResult(state, {
      status: "success",
      nextDoc: state.doc,
      validationPolicy: "scoped",
      validationScope: { kind: "table", tableId: "table-1", fallback: "full-document" },
      historyPolicy: { kind: "push" },
      diagnostics: { operationKind: "table.structure.patch", validationPolicy: "scoped" },
    })

    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(next.doc).toEqual(state.doc)
  })

  it("commits a no-history document result without clearing redo state", () => {
    const state = createState()
    const future: HistoryEntry = { doc: state.doc, paginated: state.paginated }
    const stateWithFuture: EditorState = { ...state, future: [future] }

    const next = commitEditorOperationResult(stateWithFuture, {
      status: "success",
      nextDoc: state.doc,
      validationPolicy: "full",
      historyPolicy: { kind: "none", reason: "active draft" },
      diagnostics: { operationKind: "text.commit" },
    })

    expect(next.past).toEqual([])
    expect(next.future).toEqual([future])
    expect(next.doc).toEqual(state.doc)
  })

  it("applies selection and paginated patches after document commit", () => {
    const state = createState()
    const paginated = { ...state.paginated, sections: [...state.paginated.sections] }

    const next = commitEditorOperationResult(state, {
      status: "success",
      nextDoc: state.doc,
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
      selectionPatch: {
        selectedNodeId: "node-1",
        selectionAnchorNodeId: "node-1",
        mergeResult: null,
      },
      paginatedPatch: { paginated },
      diagnostics: { operationKind: "node.duplicate" },
    })

    expect(next.selectedNodeId).toBe("node-1")
    expect(next.selectionAnchorNodeId).toBe("node-1")
    expect(next.mergeResult).toBeNull()
    expect(next.paginated).toBe(paginated)
    expect(next.past).toHaveLength(1)
  })

  it("applies state patches without touching history", () => {
    const state = createState()
    const paginated = { ...state.paginated, sections: [...state.paginated.sections] }

    const next = commitEditorOperationResult(state, {
      status: "state-patch",
      historyPolicy: { kind: "none", reason: "preview adoption" },
      paginatedPatch: { paginated },
      diagnostics: { operationKind: "text.commit" },
    })

    expect(next.doc).toBe(state.doc)
    expect(next.paginated).toBe(paginated)
    expect(next.past).toEqual([])
    expect(next.future).toEqual([])
  })

  it("commits history-only results without validating or replacing the document", () => {
    const state = createState()
    const future: HistoryEntry = { doc: state.doc, paginated: state.paginated }
    const stateWithFuture: EditorState = { ...state, future: [future] }
    const history: HistoryEntry = { doc: state.doc, paginated: state.paginated }
    const paginated = { ...state.paginated, sections: [...state.paginated.sections] }

    const next = commitEditorOperationResult(stateWithFuture, {
      status: "history-only",
      historyPolicy: { kind: "push", entry: history },
      paginatedPatch: { paginated },
      diagnostics: { operationKind: "text.commit" },
    })

    expect(next.doc).toBe(state.doc)
    expect(next.paginated).toBe(paginated)
    expect(next.past).toEqual([history])
    expect(next.future).toEqual([])
  })

  it("leaves state untouched for no-op and failure results", () => {
    const state = createState()

    expect(
      commitEditorOperationResult(state, {
        status: "noop",
        noopReason: "unchanged",
        validationPolicy: "read-only",
        historyPolicy: { kind: "none", reason: "unchanged" },
      }),
    ).toBe(state)

    expect(
      commitEditorOperationResult(state, {
        status: "failure",
        failure: { reason: "invalid operation" },
        validationPolicy: "full",
        historyPolicy: { kind: "none", reason: "failed" },
      }),
    ).toBe(state)
  })
})
