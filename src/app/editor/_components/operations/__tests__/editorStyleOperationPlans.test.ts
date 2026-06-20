import { createDefaultDocument, TOR_HEADING1_PARAGRAPH_STYLE_ID } from "@/document"
import { pt } from "@/schema"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createStylePatchActionResult,
  createStylePatchOperationResult,
} from "../editorStyleOperationPlans"

function getFirstBodyChildId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body" || body.childIds.length === 0) {
    throw new Error("expected document body child")
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

describe("editor style operation plans", () => {
  it("declares full validation and selection policy for preset styles", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = createEditorOperationFromAction({
      type: "APPLY_PARAGRAPH_STYLE_PRESET",
      nodeId,
      styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
    })

    const result = createStylePatchOperationResult(state, operation)
    const paragraph = result.status === "success" ? getParagraph(result.nextDoc, nodeId) : undefined

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
      selectionPatch: { selectedNodeId: nodeId, selectionAnchorNodeId: nodeId },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "style.patch",
      reducerPath: "APPLY_PARAGRAPH_STYLE_PRESET",
      nodeId,
      styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
    }))
    expect(paragraph?.props.paragraphStyleId).toBe(TOR_HEADING1_PARAGRAPH_STYLE_ID)
    expect(paragraph?.props.fontSize).toEqual(pt(16))
    expect(paragraph?.props.headingLevel).toBe(1)
  })

  it("keeps clear-style no-op action and operation policies aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const action = { type: "CLEAR_PARAGRAPH_STYLE" as const, nodeId }
    const operation = createEditorOperationFromAction(action)

    expect(createStylePatchOperationResult(state, operation)).toEqual(createStylePatchActionResult(state, action))
  })

  it("uses style command instead of compatibility snapshots", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const nodeId = getFirstBodyChildId(state.doc)
    const operation = {
      ...createEditorOperationFromAction({
        type: "APPLY_PARAGRAPH_STYLE_PRESET",
        nodeId,
        styleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
      }),
      action: {
        type: "APPLY_PARAGRAPH_STYLE_PRESET" as const,
        nodeId,
        styleId: "tor.body" as any,
      },
      payload: {
        kind: "style.patch" as const,
        styleType: "apply-paragraph-style-preset" as const,
        nodeId,
        styleId: "tor.body" as any,
      },
    }

    const result = createStylePatchOperationResult(state, operation)
    const paragraph = result.status === "success" ? getParagraph(result.nextDoc, nodeId) : undefined

    expect(result.status).toBe("success")
    expect(paragraph?.props.paragraphStyleId).toBe(TOR_HEADING1_PARAGRAPH_STYLE_ID)
    expect(paragraph?.props.headingLevel).toBe(1)
  })
})
