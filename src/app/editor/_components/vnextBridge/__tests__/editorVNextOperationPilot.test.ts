import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { runEditorVNextTextReplaceOperationPilot } from "../editorVNextBridgeHost"

function fixtureValue(name: string): unknown {
  const fixtureUrl = new URL(`../../../../../../vnext-workspace/fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown
}

describe("editor vNext operation pilot", () => {
  it("runs a text-block text replace pilot with validation, history, and render invalidation metadata", () => {
    const result = runEditorVNextTextReplaceOperationPilot(
      fixtureValue("product-report-vnext.flowdoc.json"),
      {
        kind: "text-block.text.replace",
        source: "automation",
        nodeId: "cover-title",
        children: [
          { id: "cover-title-pilot-text", type: "text", text: "Pilot Title" },
        ],
      },
      { measurementProfileId: "operation-pilot-test" },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reason)

    expect(result.snapshot).toMatchObject({
      source: "editor-vnext-operation-pilot",
      phase: "11.6",
      mode: "mutating-derived-output",
      input: "canonical-vnext-package",
      status: "committed",
      documentId: "product-report-vnext",
      packageVersion: 2,
      documentVersion: 3,
      operation: {
        kind: "text-block.text.replace",
        source: "automation",
        targetNodeIds: ["cover-title"],
        failureReason: null,
        validationPolicy: "full",
        historyIntent: "content",
        renderInvalidation: {
          lane: "text-content",
          affectedNodeIds: ["cover-title"],
        },
        scope: {
          sectionIds: ["section-cover"],
          textBlockIds: ["cover-title"],
        },
      },
      mutation: {
        appliedToVNextDocument: true,
        returnedNextDocument: true,
        targetNodeId: "cover-title",
        replacementInlineChildCount: 1,
        persisted: false,
        editorStateApplied: false,
      },
      history: {
        recordCreated: true,
        recordStatus: "committed",
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        apiRoutes: false,
      },
    })
    expect(result.snapshot.history.record).toMatchObject({
      schemaVersion: 1,
      status: "committed",
      operationKind: "text-block.text.replace",
      historyIntent: "content",
      validationPolicy: "full",
      command: {
        kind: "text-block.text.replace",
        nodeId: "cover-title",
      },
    })
    expect(result.snapshot.history.record?.renderInvalidation?.pageScope).toEqual({
      kind: "unknown",
      reason: "pagination-not-integrated",
    })
    expect("document" in result.snapshot).toBe(false)
    expect("runtime" in result.snapshot).toBe(false)
  })

  it("returns a rejected history-ready record when the vNext operation rejects", () => {
    const result = runEditorVNextTextReplaceOperationPilot(
      fixtureValue("product-report-vnext.flowdoc.json"),
      {
        kind: "text-block.text.replace",
        nodeId: "missing-text-block",
        children: [
          { id: "missing-text", type: "text", text: "No target" },
        ],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("Expected missing target to be rejected.")

    expect(result.reason).toBe("target-not-found")
    expect(result.snapshot).toMatchObject({
      status: "rejected",
      operation: {
        kind: "text-block.text.replace",
        targetNodeIds: ["missing-text-block"],
        failureReason: "target-not-found",
        validationPolicy: null,
        historyIntent: null,
        renderInvalidation: null,
        scope: null,
      },
      mutation: {
        appliedToVNextDocument: false,
        returnedNextDocument: false,
        persisted: false,
        editorStateApplied: false,
      },
      history: {
        recordCreated: true,
        recordStatus: "rejected",
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        apiRoutes: false,
      },
    })
    expect(result.snapshot.history.record).toMatchObject({
      schemaVersion: 1,
      status: "rejected",
      operationKind: "text-block.text.replace",
      failureReason: "target-not-found",
      historyIntent: null,
      validationPolicy: null,
      renderInvalidation: null,
    })
    expect(result.snapshot.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "target-not-found" }),
    ]))
  })

  it("blocks raw document-shaped input before running the operation", () => {
    const result = runEditorVNextTextReplaceOperationPilot(
      {
        version: 3,
        document: {
          id: "raw-doc",
          meta: { title: "Raw Doc" },
          sections: [],
        },
      },
      {
        kind: "text-block.text.replace",
        nodeId: "cover-title",
        children: [
          { id: "cover-title-pilot-text", type: "text", text: "Pilot Title" },
        ],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("Expected raw input to be blocked.")

    expect(result.reason).toBe("unsupported-version")
    expect(result.snapshot).toMatchObject({
      status: "blocked",
      documentId: null,
      packageVersion: null,
      documentVersion: null,
      operation: {
        failureReason: "bridge-blocked",
        validationPolicy: null,
        historyIntent: null,
      },
      mutation: {
        appliedToVNextDocument: false,
        returnedNextDocument: false,
        persisted: false,
        editorStateApplied: false,
      },
      history: {
        recordCreated: false,
        recordStatus: null,
        record: null,
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        apiRoutes: false,
      },
    })
    expect(result.snapshot.issues.length).toBeGreaterThan(0)
  })
})
