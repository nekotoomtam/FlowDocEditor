import { createDefaultDocument } from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import {
  createInlineTextDraftResult,
  createTextCommitActionResult,
  createTextCommitOperationResult,
  createTextDraftOperationResult,
} from "../editorTextCommitPlans"
import { createEditorOperationFromAction } from "../editorOperationFromAction"

function getFirstBodyChildId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected default document body child")
  }
  return body.childIds[0]
}

function getParagraph(doc: DocumentNode, nodeId: string): ParagraphNode {
  const node = doc.document.sections[0].nodes[nodeId]
  if (node?.type !== "paragraph") {
    throw new Error(`expected paragraph ${nodeId}`)
  }
  return node
}

function getParagraphText(doc: DocumentNode, nodeId: string): string {
  return getParagraph(doc, nodeId).children
    .map((child) => child.type === "text" ? child.text : "")
    .join("")
}

describe("editor text operation plans", () => {
  it("declares full validation for plain text commits", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = createEditorOperationFromAction({ type: "UPDATE_TEXT", nodeId, text: "Changed text" })

    const result = createTextCommitOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "text.commit",
      reducerPath: "UPDATE_TEXT",
      nodeId,
    }))
    if (result.status !== "success") return
    expect(getParagraphText(result.nextDoc, nodeId)).toBe("Changed text")
  })

  it("keeps inline text draft action and operation policies aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const action = { type: "UPDATE_INLINE_TEXT_DRAFT" as const, nodeId, text: "Draft text" }
    const operation = createEditorOperationFromAction(action)
    const operationResult = createTextDraftOperationResult(state, operation)
    const actionResult = createInlineTextDraftResult(state, action)

    expect(operationResult).toEqual(expect.objectContaining({
      status: actionResult.status,
      validationPolicy: "full",
      historyPolicy: { kind: "none", reason: "active inline text draft" },
    }))
    expect(operationResult.diagnostics).toEqual(actionResult.diagnostics)
    if (operationResult.status !== "success" || actionResult.status !== "success") return
    expect(getParagraphText(operationResult.nextDoc, nodeId)).toBe(getParagraphText(actionResult.nextDoc, nodeId))
  })

  it("keeps WYSIWYG text commit action and operation policies aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const beforeText = getParagraphText(state.doc, nodeId)
    const afterPaginated = { ...state.paginated, tocEntries: [...state.paginated.tocEntries] }
    const action = {
      type: "COMMIT_WYSIWYG_TEXT_EDIT" as const,
      nodeId,
      beforeText,
      text: "WYSIWYG committed text",
      afterPaginated,
    }
    const operation = createEditorOperationFromAction(action)
    const operationResult = createTextCommitOperationResult(state, operation)
    const actionResult = createTextCommitActionResult(state, action)

    expect(operationResult).toEqual(expect.objectContaining({
      status: actionResult.status,
      validationPolicy: "prevalidated",
      historyPolicy: actionResult.status === "success" ? actionResult.historyPolicy : undefined,
      paginatedPatch: { paginated: afterPaginated },
    }))
    expect(operationResult.diagnostics).toEqual(actionResult.diagnostics)
    if (operationResult.status !== "success" || actionResult.status !== "success") return
    expect(getParagraphText(operationResult.nextDoc, nodeId)).toBe(getParagraphText(actionResult.nextDoc, nodeId))
  })
})
