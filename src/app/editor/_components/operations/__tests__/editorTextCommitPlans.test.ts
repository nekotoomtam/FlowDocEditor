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

function withParagraphText(paragraph: ParagraphNode, text: string): ParagraphNode {
  return {
    ...paragraph,
    children: paragraph.children.map((child) => child.type === "text" ? { ...child, text } : child),
  }
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

  it("uses text draft command instead of compatibility snapshots", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = {
      ...createEditorOperationFromAction({ type: "UPDATE_INLINE_TEXT_DRAFT", nodeId, text: "Command draft" }),
      action: { type: "UPDATE_INLINE_TEXT_DRAFT" as const, nodeId, text: "Action draft" },
      payload: { kind: "text.draft" as const, nodeId, text: "Payload draft" },
    }

    const result = createTextDraftOperationResult(state, operation)

    expect(result.status).toBe("success")
    if (result.status !== "success") return
    expect(getParagraphText(result.nextDoc, nodeId)).toBe("Command draft")
  })

  it("uses plain text commit command instead of compatibility snapshots", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = {
      ...createEditorOperationFromAction({ type: "UPDATE_TEXT", nodeId, text: "Command commit" }),
      action: { type: "UPDATE_TEXT" as const, nodeId, text: "Action commit" },
      payload: { kind: "text.commit" as const, commitType: "update-text" as const, nodeId, text: "Payload commit" },
    }

    const result = createTextCommitOperationResult(state, operation)

    expect(result.status).toBe("success")
    if (result.status !== "success") return
    expect(getParagraphText(result.nextDoc, nodeId)).toBe("Command commit")
  })

  it("uses inline text commit command/runtime instead of compatibility snapshots", () => {
    const beforeState = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(beforeState.doc)
    const beforeText = getParagraphText(beforeState.doc, nodeId)
    const draftResult = createTextDraftOperationResult(
      beforeState,
      createEditorOperationFromAction({ type: "UPDATE_INLINE_TEXT_DRAFT", nodeId, text: "Inline command text" }),
    )
    if (draftResult.status !== "success") {
      throw new Error("expected inline draft setup to succeed")
    }
    const state = { ...beforeState, doc: draftResult.nextDoc }
    const afterPaginated = { ...state.paginated, tocEntries: [...state.paginated.tocEntries] }
    const operation = {
      ...createEditorOperationFromAction({
        type: "COMMIT_INLINE_TEXT_EDIT",
        nodeId,
        beforeDoc: beforeState.doc,
        beforePaginated: beforeState.paginated,
        beforeText,
        afterPaginated,
      }),
      action: { type: "UPDATE_TEXT" as const, nodeId, text: "Action fallback text" },
      payload: { kind: "text.commit" as const, commitType: "update-text" as const, nodeId, text: "Payload fallback text" },
    }

    const result = createTextCommitOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "history-only",
      historyPolicy: { kind: "push", entry: { doc: beforeState.doc, paginated: beforeState.paginated } },
      paginatedPatch: { paginated: afterPaginated },
    }))
  })

  it("uses wysiwyg text commit command/runtime instead of compatibility snapshots", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const beforeText = getParagraphText(state.doc, nodeId)
    const afterPaginated = { ...state.paginated, tocEntries: [...state.paginated.tocEntries] }
    const wrongPaginated = { ...state.paginated, sections: [], tocEntries: [] }
    const operation = {
      ...createEditorOperationFromAction({
        type: "COMMIT_WYSIWYG_TEXT_EDIT",
        nodeId,
        beforeText,
        text: "WYSIWYG command text",
        afterPaginated,
      }),
      action: {
        type: "COMMIT_WYSIWYG_TEXT_EDIT" as const,
        nodeId,
        beforeText,
        text: "WYSIWYG action text",
        afterPaginated: wrongPaginated,
      },
      payload: { kind: "text.commit" as const, commitType: "update-text" as const, nodeId, text: "Payload fallback text" },
    }

    const result = createTextCommitOperationResult(state, operation)

    expect(result.status).toBe("success")
    if (result.status !== "success") return
    expect(getParagraphText(result.nextDoc, nodeId)).toBe("WYSIWYG command text")
    expect(result.paginatedPatch).toEqual({ paginated: afterPaginated })
  })

  it("uses wysiwyg rich text commit command/runtime instead of compatibility snapshots", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const afterPaginated = { ...state.paginated, tocEntries: [...state.paginated.tocEntries] }
    const commandParagraph = withParagraphText(getParagraph(state.doc, nodeId), "Rich command text")
    const actionParagraph = withParagraphText(getParagraph(state.doc, nodeId), "Rich action text")
    const operation = {
      ...createEditorOperationFromAction({
        type: "COMMIT_WYSIWYG_RICH_TEXT_EDIT",
        nodeId,
        paragraph: commandParagraph,
        afterPaginated,
      }),
      action: {
        type: "COMMIT_WYSIWYG_RICH_TEXT_EDIT" as const,
        nodeId,
        paragraph: actionParagraph,
        afterPaginated: { ...state.paginated, sections: [], tocEntries: [] },
      },
      payload: { kind: "text.commit" as const, commitType: "update-text" as const, nodeId, text: "Payload fallback text" },
    }

    const result = createTextCommitOperationResult(state, operation)

    expect(result.status).toBe("success")
    if (result.status !== "success") return
    expect(getParagraphText(result.nextDoc, nodeId)).toBe("Rich command text")
    expect(result.paginatedPatch).toEqual({ paginated: afterPaginated })
  })

  it("fails lifecycle text commit operations when required runtime is missing", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = {
      ...createEditorOperationFromAction({
        type: "COMMIT_WYSIWYG_TEXT_EDIT",
        nodeId,
        beforeText: getParagraphText(state.doc, nodeId),
        text: "Missing runtime text",
        afterPaginated: state.paginated,
      }),
      runtime: undefined,
    }

    const result = createTextCommitOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      failure: { reason: "missing-text-commit-runtime" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "missing text commit runtime" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      reducerPath: "COMMIT_WYSIWYG_TEXT_EDIT",
      missingRuntimeFields: ["textCommit.afterPaginated"],
    }))
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
