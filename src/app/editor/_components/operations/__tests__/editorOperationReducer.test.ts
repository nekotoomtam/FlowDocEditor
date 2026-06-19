import { createDefaultDocument, createDefaultFlowTable } from "@/document"
import type { DocumentNode, LayoutNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState, reducer, reduceEditorOperation } from "../../editorReducer"
import type { EditorAction, EditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import type { EditorOperationEnvelope, EditorOperationKind } from "../editorOperationTypes"

type NonLegacyEditorOperationKind = Exclude<EditorOperationKind, "legacy.action">

const NON_LEGACY_OPERATION_KINDS = [
  "document.settings.patch",
  "drag.placement",
  "field.patch",
  "flow-row.layout.patch",
  "text.draft",
  "text.commit",
  "paragraph.split",
  "paragraph.merge",
  "list.structure.patch",
  "node.delete",
  "node.duplicate",
  "node.props.patch",
  "node.reorder",
  "flow-row.structure.patch",
  "style.patch",
  "table.structure.patch",
] as const satisfies readonly NonLegacyEditorOperationKind[]

type MissingOperationKind = Exclude<NonLegacyEditorOperationKind, typeof NON_LEGACY_OPERATION_KINDS[number]>
type ExtraOperationKind = Exclude<typeof NON_LEGACY_OPERATION_KINDS[number], NonLegacyEditorOperationKind>
const operationKindCoverageCheck: [MissingOperationKind, ExtraOperationKind] extends [never, never] ? true : never = true

function getFirstBodyChildId(state: EditorState): string {
  const section = state.doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected default document body child")
  }
  return body.childIds[0]
}

function getParagraphText(doc: DocumentNode, nodeId: string): string {
  const node = doc.document.sections[0].nodes[nodeId]
  if (node?.type !== "paragraph") {
    throw new Error(`expected paragraph ${nodeId}`)
  }
  return node.children
    .map((child) => child.type === "text" ? child.text : "")
    .join("")
}

function createStateWithFlowRow(): EditorState {
  const doc = createDefaultDocument()
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected default document body")
  }
  const paragraphId = body.childIds[0]
  const nextDoc: DocumentNode = {
    ...doc,
    document: {
      ...doc.document,
      sections: doc.document.sections.map((current, index) => index === 0
        ? {
            ...section,
            nodes: {
              ...section.nodes,
              [body.id]: { ...body, childIds: ["row-1"] },
              "row-1": { id: "row-1", type: "flow-row", props: {}, childIds: ["stack-1", "stack-2"] },
              "stack-1": { id: "stack-1", type: "flow-stack", props: { widthShare: 50 }, childIds: [paragraphId] },
              "stack-2": { id: "stack-2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
            } as Record<string, LayoutNode>,
          }
        : current),
    },
  }
  return createInitialEditorState(nextDoc)
}

function createStateWithFlowTable(): { state: EditorState; tableId: string } {
  const doc = createDefaultDocument()
  const table = createDefaultFlowTable(2, 2)
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected default document body")
  }
  const nextDoc: DocumentNode = {
    ...doc,
    document: {
      ...doc.document,
      sections: doc.document.sections.map((current, index) => index === 0
        ? {
            ...section,
            nodes: {
              ...section.nodes,
              [body.id]: { ...body, childIds: [...body.childIds, table.id] },
              [table.id]: table as unknown as LayoutNode,
            },
          }
        : current),
    },
  }
  return { state: createInitialEditorState(nextDoc), tableId: table.id }
}

describe("editor operation reducer", () => {
  it("routes every non-legacy operation kind before the legacy action fallback", () => {
    expect(operationKindCoverageCheck).toBe(true)
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const fallbackAction: EditorAction = { type: "SELECT_NODE", nodeId }

    for (const kind of NON_LEGACY_OPERATION_KINDS) {
      const operation: EditorOperationEnvelope = {
        ...createEditorOperationFromAction(fallbackAction),
        kind,
      }

      expect(reduceEditorOperation(state, operation), kind).toBe(state)
    }
  })

  it("keeps operation envelopes behavior-compatible with the legacy action reducer", () => {
    const cases: Array<{
      name: string
      createAction: (state: EditorState) => EditorAction
    }> = [
      {
        name: "selection",
        createAction: (state) => ({ type: "SELECT_NODE", nodeId: getFirstBodyChildId(state) }),
      },
      {
        name: "props patch",
        createAction: (state) => ({ type: "UPDATE_PROPS", nodeId: getFirstBodyChildId(state), changes: { label: "Updated" } }),
      },
      {
        name: "style definition visual patch",
        createAction: () => ({ type: "RENAME_PARAGRAPH_STYLE_DEFINITION", styleId: "body", name: "Body copy" }),
      },
      {
        name: "document settings",
        createAction: () => ({
          type: "UPDATE_MARGIN",
          sectionIndex: 0,
          margin: { top: 24, right: 36, bottom: 48, left: 60 },
        }),
      },
      {
        name: "node delete",
        createAction: (state) => ({ type: "DELETE_NODE", nodeId: getFirstBodyChildId(state) }),
      },
      {
        name: "pagination adoption",
        createAction: (state) => ({ type: "SET_PAGINATED", paginated: state.paginated }),
      },
    ]

    for (const current of cases) {
      const state = createInitialEditorState(createDefaultDocument())
      const action = current.createAction(state)
      const operation = createEditorOperationFromAction(action)

      expect(reduceEditorOperation(state, operation), current.name).toEqual(reducer(state, action))
    }
  })

  it("keeps flow-row layout operation routing behavior-compatible with the legacy action reducer", () => {
    const state = createStateWithFlowRow()
    const action: EditorAction = {
      type: "RESIZE_COLUMNS",
      leftStackId: "stack-1",
      leftShare: 30,
      rightStackId: "stack-2",
      rightShare: 70,
    }
    const operation = createEditorOperationFromAction(action)

    expect(reduceEditorOperation(state, operation)).toEqual(reducer(state, action))
  })

  it("routes text commit and draft operations by operation kind", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)

    const commitNext = reduceEditorOperation(
      state,
      createEditorOperationFromAction({ type: "UPDATE_TEXT", nodeId, text: "Committed text" }),
    )
    expect(getParagraphText(commitNext.doc, nodeId)).toBe("Committed text")
    expect(commitNext.past).toEqual([{ doc: state.doc, paginated: state.paginated }])

    const draftNext = reduceEditorOperation(
      state,
      createEditorOperationFromAction({ type: "UPDATE_INLINE_TEXT_DRAFT", nodeId, text: "Draft text" }),
    )
    expect(getParagraphText(draftNext.doc, nodeId)).toBe("Draft text")
    expect(draftNext.past).toEqual([])
  })

  it("keeps table structure operation routing behavior-compatible with the legacy action reducer", () => {
    const { state, tableId } = createStateWithFlowTable()
    const action: EditorAction = {
      type: "RESIZE_TABLE_COLUMN_PAIR",
      tableId,
      leftColIndex: 0,
      leftWidth: 200,
      rightWidth: 100,
    }
    const operation = createEditorOperationFromAction(action)

    expect(reduceEditorOperation(state, operation)).toEqual(reducer(state, action))
  })
})
