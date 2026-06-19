import { assertDocument, createDefaultDocument } from "@/document"
import type { DocumentNode } from "@/schema"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createInitialEditorState, reducer } from "../editorReducer"
import type { EditorState } from "../editorReducer"

const STRESS_FIXTURE_PATH = join(process.cwd(), "public/mock/flowdoc-stress-mock.flowdoc.json")
const STRESS_DUPLICATE_NODE_ID = "p_00114"
const STRESS_FIXTURE_TEST_TIMEOUT_MS = 30000

function getFirstBodyChildId(state: EditorState): string {
  const section = state.doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected default document body child")
  }
  return body.childIds[0]
}

function docWithFlowRow(): DocumentNode {
  const doc = createDefaultDocument()
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected default document body child")
  }
  const paragraphId = body.childIds[0]
  return {
    ...doc,
    document: {
      ...doc.document,
      sections: doc.document.sections.map((current, index) => index === 0
        ? {
            ...current,
            nodes: {
              ...current.nodes,
              [body.id]: { ...body, childIds: ["fr1"] },
              fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
              fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: [paragraphId] },
              fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
            },
          }
        : current),
    },
  }
}

function loadStressDocument(): DocumentNode {
  const packageDoc = JSON.parse(readFileSync(STRESS_FIXTURE_PATH, "utf8")) as { document: DocumentNode }
  return packageDoc.document
}

function getBodyChildIds(doc: DocumentNode): string[] {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") throw new Error("expected stress document body")
  return body.childIds
}

function getFirstFlowRowTarget(doc: DocumentNode): { rowId: string; stackId: string; childIds: string[] } {
  const section = doc.document.sections[0]
  const row = Object.values(section.nodes).find((node) => node.type === "flow-row")
  if (!row || row.type !== "flow-row" || row.childIds.length === 0) {
    throw new Error("expected stress document flow-row")
  }
  return { rowId: row.id, stackId: row.childIds[0], childIds: row.childIds }
}

function getParagraphText(doc: DocumentNode, nodeId: string): string {
  const section = doc.document.sections[0]
  const node = section.nodes[nodeId]
  if (node?.type !== "paragraph") throw new Error(`expected paragraph ${nodeId}`)
  return node.children.map((child) => child.type === "text" ? child.text : "").join("")
}

describe("editorReducer node mutations", () => {
  it("keeps DELETE_NODE no-op behavior reference-stable", () => {
    const state = createInitialEditorState(createDefaultDocument())

    const next = reducer(state, { type: "DELETE_NODE", nodeId: "missing-node" })

    expect(next).toBe(state)
  })

  it("commits DELETE_NODE through history and clears selection", () => {
    const baseState = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(baseState)
    const state: EditorState = {
      ...baseState,
      selectedNodeId: nodeId,
      selectionAnchorNodeId: nodeId,
    }

    const next = reducer(state, { type: "DELETE_NODE", nodeId })
    const section = next.doc.document.sections[0]

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(next.selectedNodeId).toBeNull()
    expect(next.selectionAnchorNodeId).toBeNull()
    expect(section.nodes[nodeId]).toBeUndefined()
  })

  it("keeps DUPLICATE_NODE no-op behavior reference-stable", () => {
    const state = createInitialEditorState(createDefaultDocument())

    const next = reducer(state, { type: "DUPLICATE_NODE", nodeId: "missing-node" })

    expect(next).toBe(state)
  })

  it("commits DUPLICATE_NODE through history and selects the duplicate", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)

    const next = reducer(state, { type: "DUPLICATE_NODE", nodeId })

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(next.selectedNodeId).toBeTruthy()
    expect(next.selectedNodeId).not.toBe(nodeId)
    expect(next.selectionAnchorNodeId).toBe(next.selectedNodeId)
    expect(next.doc.document.sections[0].nodes[next.selectedNodeId ?? ""]).toBeDefined()
  })

  it("keeps REORDER_BODY_CHILD no-op behavior reference-stable", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)
    const sectionId = state.doc.document.sections[0].id

    const next = reducer(state, {
      type: "REORDER_BODY_CHILD",
      sectionId,
      sourceNodeId: nodeId,
      targetNodeId: "missing-node",
      position: "after",
    })

    expect(next).toBe(state)
  })

  it("commits REORDER_BODY_CHILD through history and selects the moved source", () => {
    const baseState = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(baseState)
    const duplicated = reducer(baseState, { type: "DUPLICATE_NODE", nodeId })
    const duplicatedNodeId = duplicated.selectedNodeId
    if (!duplicatedNodeId) throw new Error("expected duplicate selection")
    const sectionId = duplicated.doc.document.sections[0].id

    const next = reducer(duplicated, {
      type: "REORDER_BODY_CHILD",
      sectionId,
      sourceNodeId: duplicatedNodeId,
      targetNodeId: nodeId,
      position: "before",
    })
    const section = next.doc.document.sections[0]
    const body = section.nodes[section.bodyRootId]

    expect(next).not.toBe(duplicated)
    expect(next.past).toHaveLength(2)
    expect(next.past[1]).toEqual({ doc: duplicated.doc, paginated: duplicated.paginated })
    expect(next.future).toEqual([])
    expect(next.selectedNodeId).toBe(duplicatedNodeId)
    expect(next.selectionAnchorNodeId).toBe(duplicatedNodeId)
    expect(body?.type === "body" ? body.childIds[0] : null).toBe(duplicatedNodeId)
  })

  it("keeps FLOW_ROW_ADD_COL no-op behavior reference-stable", () => {
    const state = createInitialEditorState(docWithFlowRow())

    const next = reducer(state, { type: "FLOW_ROW_ADD_COL", rowId: "missing-row" })

    expect(next).toBe(state)
  })

  it("commits FLOW_ROW_ADD_COL through history without changing selection", () => {
    const state: EditorState = {
      ...createInitialEditorState(docWithFlowRow()),
      selectedNodeId: "fr1",
      selectionAnchorNodeId: "fr1",
    }

    const next = reducer(state, {
      type: "FLOW_ROW_ADD_COL",
      rowId: "fr1",
      stackId: "fs1",
      position: "after",
    })
    const section = next.doc.document.sections[0]
    const row = section.nodes.fr1
    const leftStack = section.nodes.fs1
    const rightStack = section.nodes.fs2

    expect(next).not.toBe(state)
    expect(next.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(next.future).toEqual([])
    expect(next.selectedNodeId).toBe("fr1")
    expect(next.selectionAnchorNodeId).toBe("fr1")
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(3)
    expect(row.childIds[0]).toBe("fs1")
    expect(row.childIds[2]).toBe("fs2")
    const insertedStack = section.nodes[row.childIds[1]]
    expect(leftStack.type).toBe("flow-stack")
    expect(insertedStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (leftStack.type !== "flow-stack" || insertedStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(leftStack.props.widthShare).toBe(25)
    expect(insertedStack.props.widthShare).toBe(25)
    expect(rightStack.props.widthShare).toBe(50)
  })

  it("duplicates a direct body paragraph on the stress fixture and undo restores it", () => {
    const stressDoc = loadStressDocument()
    assertDocument(stressDoc)
    const state = createInitialEditorState(stressDoc)
    const beforeBodyChildIds = getBodyChildIds(state.doc)
    const sourceIndex = beforeBodyChildIds.indexOf(STRESS_DUPLICATE_NODE_ID)
    expect(sourceIndex).toBeGreaterThanOrEqual(0)

    const duplicated = reducer(state, { type: "DUPLICATE_NODE", nodeId: STRESS_DUPLICATE_NODE_ID })
    const duplicatedNodeId = duplicated.selectedNodeId
    if (!duplicatedNodeId) throw new Error("expected duplicated node selection")
    const afterBodyChildIds = getBodyChildIds(duplicated.doc)

    expect(duplicated).not.toBe(state)
    expect(duplicated.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(afterBodyChildIds[sourceIndex + 1]).toBe(duplicatedNodeId)
    expect(duplicated.doc.document.sections[0].nodes[duplicatedNodeId]).toBeDefined()
    assertDocument(duplicated.doc)

    const undone = reducer(duplicated, { type: "UNDO" })

    expect(undone.doc).toBe(state.doc)
    expect(getBodyChildIds(undone.doc)).toEqual(beforeBodyChildIds)
    expect(undone.future).toHaveLength(1)
  }, STRESS_FIXTURE_TEST_TIMEOUT_MS)

  it("adds a flow-row stack column on the stress fixture and undo restores it", () => {
    const stressDoc = loadStressDocument()
    assertDocument(stressDoc)
    const state = createInitialEditorState(stressDoc)
    const target = getFirstFlowRowTarget(state.doc)

    const added = reducer(state, {
      type: "FLOW_ROW_ADD_COL",
      rowId: target.rowId,
      stackId: target.stackId,
      position: "after",
    })
    const section = added.doc.document.sections[0]
    const row = section.nodes[target.rowId]

    expect(added).not.toBe(state)
    expect(added.past).toEqual([{ doc: state.doc, paginated: state.paginated }])
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(target.childIds.length + 1)
    expect(row.childIds[0]).toBe(target.stackId)
    expect(row.childIds[1]).not.toBe(target.stackId)
    expect(section.nodes[row.childIds[1]]?.type).toBe("flow-stack")
    assertDocument(added.doc)

    const undone = reducer(added, { type: "UNDO" })
    const undoneTarget = getFirstFlowRowTarget(undone.doc)

    expect(undone.doc).toBe(state.doc)
    expect(undoneTarget.childIds).toEqual(target.childIds)
    expect(undone.future).toHaveLength(1)
  }, STRESS_FIXTURE_TEST_TIMEOUT_MS)

  it("updates inline text draft through the no-history operation policy", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state)

    const next = reducer(state, {
      type: "UPDATE_INLINE_TEXT_DRAFT",
      nodeId,
      text: "Draft without history",
    })

    expect(next).not.toBe(state)
    expect(getParagraphText(next.doc, nodeId)).toBe("Draft without history")
    expect(next.past).toEqual([])
    expect(next.future).toEqual([])
  })
})
