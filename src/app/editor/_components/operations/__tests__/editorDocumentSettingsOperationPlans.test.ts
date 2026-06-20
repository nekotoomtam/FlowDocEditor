import { createDefaultDocument } from "@/document"
import { pt } from "@/schema"
import { describe, expect, it } from "vitest"
import { createInitialEditorState } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  createDocumentSettingsActionResult,
  createDocumentSettingsOperationResult,
} from "../editorDocumentSettingsOperationPlans"

describe("editor document settings operation plans", () => {
  it("declares full validation and section diagnostics for margin updates", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const sectionId = state.doc.document.sections[0].id
    const operation = createEditorOperationFromAction({
      type: "UPDATE_MARGIN",
      sectionIndex: 0,
      margin: { top: 24, right: 36, bottom: 48, left: 60 },
    })

    const result = createDocumentSettingsOperationResult(state, operation)
    const margin = result.status === "success"
      ? result.nextDoc.document.sections[0].page.margin
      : state.doc.document.sections[0].page.margin

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
    }))
    expect(margin.top).toEqual(pt(24))
    expect(margin.right).toEqual(pt(36))
    expect(margin.bottom).toEqual(pt(48))
    expect(margin.left).toEqual(pt(60))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "document.settings.patch",
      reducerPath: "UPDATE_MARGIN",
      sectionIndex: 0,
      sectionId,
      sectionExists: true,
      sectionCount: 1,
    }))
  })

  it("keeps header/footer mode no-op action and operation policies aligned", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const action = {
      type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE" as const,
      sectionIndex: 0,
      mode: "body" as const,
    }
    const operation = createEditorOperationFromAction(action)

    expect(createDocumentSettingsOperationResult(state, operation)).toEqual(
      createDocumentSettingsActionResult(state, action),
    )
  })

  it("uses document settings command instead of compatibility snapshots", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const operation = {
      ...createEditorOperationFromAction({
        type: "UPDATE_MARGIN",
        sectionIndex: 0,
        margin: { top: 24, right: 36, bottom: 48, left: 60 },
      }),
      action: {
        type: "UPDATE_MARGIN" as const,
        sectionIndex: 0,
        margin: { top: 99, right: 99, bottom: 99, left: 99 },
      },
      payload: {
        kind: "document.settings.patch" as const,
        setting: "margin" as const,
        sectionIndex: 0,
        margin: { top: 99, right: 99, bottom: 99, left: 99 },
      },
    }

    const result = createDocumentSettingsOperationResult(state, operation)
    const margin = result.status === "success"
      ? result.nextDoc.document.sections[0].page.margin
      : state.doc.document.sections[0].page.margin

    expect(result.status).toBe("success")
    expect(margin.top).toEqual(pt(24))
    expect(margin.right).toEqual(pt(36))
    expect(margin.bottom).toEqual(pt(48))
    expect(margin.left).toEqual(pt(60))
  })

  it("declares mode diagnostics for header/footer horizontal mode updates", () => {
    const state = createInitialEditorState(createDefaultDocument())
    const operation = createEditorOperationFromAction({
      type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE",
      sectionIndex: 0,
      mode: "full",
    })

    const result = createDocumentSettingsOperationResult(state, operation)

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      validationPolicy: "full",
      historyPolicy: { kind: "push" },
    }))
    expect(result.diagnostics).toEqual(expect.objectContaining({
      operationKind: "document.settings.patch",
      reducerPath: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE",
      sectionIndex: 0,
      mode: "full",
      sectionExists: true,
    }))
  })
})
