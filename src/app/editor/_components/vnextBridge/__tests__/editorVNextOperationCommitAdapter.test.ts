import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { runEditorVNextTextReplaceOperationPilot } from "../editorVNextBridgeHost"
import { createEditorVNextOperationCommitReadinessSnapshot } from "../editorVNextOperationCommitAdapter"

function fixtureValue(name: string): unknown {
  const fixtureUrl = new URL(`../../../../../../vnext-workspace/fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown
}

describe("editor vNext operation commit adapter", () => {
  it("turns a committed operation pilot into diagnostic commit readiness without session history eligibility", () => {
    const pilot = runEditorVNextTextReplaceOperationPilot(
      fixtureValue("product-report-vnext.flowdoc.json"),
      {
        kind: "text-block.text.replace",
        source: "automation",
        nodeId: "cover-title",
        children: [
          { id: "cover-title-adapter-text", type: "text", text: "Adapter Title" },
        ],
      },
    )

    expect(pilot.ok).toBe(true)
    const snapshot = createEditorVNextOperationCommitReadinessSnapshot(pilot.snapshot)

    expect(snapshot).toMatchObject({
      source: "editor-vnext-operation-commit-adapter",
      milestone: "post-11",
      jobItem: "J5",
      mode: "commit-readiness-diagnostic",
      input: "vnext-operation-pilot-snapshot",
      operation: {
        kind: "text-block.text.replace",
        status: "committed",
        targetNodeIds: ["cover-title"],
        failureReason: null,
        validationPolicy: "full",
        historyIntent: "content",
        renderInvalidation: {
          lane: "text-content",
          affectedNodeIds: ["cover-title"],
        },
      },
      durableHistory: {
        recordCreated: true,
        recordStatus: "committed",
        recordAvailable: true,
        auditable: true,
      },
      sessionHistory: {
        eligible: false,
        reason: "current-editor-history-requires-current-document-snapshot",
        currentHistoryEntryCreated: false,
        currentUndoRedoChanged: false,
      },
      commitReadiness: {
        operationLayerCommitted: true,
        durableHistoryReady: true,
        currentSessionHistoryReady: false,
        visibleEditorMutationReady: false,
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        persistence: false,
        apiRoutes: false,
      },
    })
    expect("document" in snapshot).toBe(false)
    expect("runtime" in snapshot).toBe(false)
    expect("pagination" in snapshot).toBe(false)
    expect("nextDocument" in snapshot).toBe(false)
  })

  it("keeps rejected operation pilots auditable but not session-history eligible", () => {
    const pilot = runEditorVNextTextReplaceOperationPilot(
      fixtureValue("product-report-vnext.flowdoc.json"),
      {
        kind: "text-block.text.replace",
        nodeId: "missing-text-block",
        children: [
          { id: "missing-adapter-text", type: "text", text: "No target" },
        ],
      },
    )

    expect(pilot.ok).toBe(false)
    const snapshot = createEditorVNextOperationCommitReadinessSnapshot(pilot.snapshot)

    expect(snapshot).toMatchObject({
      operation: {
        status: "rejected",
        failureReason: "target-not-found",
        validationPolicy: null,
        historyIntent: null,
      },
      durableHistory: {
        recordCreated: true,
        recordStatus: "rejected",
        recordAvailable: true,
        auditable: true,
      },
      sessionHistory: {
        eligible: false,
        reason: "operation-not-committed",
        currentHistoryEntryCreated: false,
        currentUndoRedoChanged: false,
      },
      commitReadiness: {
        operationLayerCommitted: false,
        durableHistoryReady: true,
        currentSessionHistoryReady: false,
        visibleEditorMutationReady: false,
      },
    })
  })

  it("keeps bridge-blocked pilots out of current session history", () => {
    const pilot = runEditorVNextTextReplaceOperationPilot(
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
          { id: "cover-title-adapter-text", type: "text", text: "Adapter Title" },
        ],
      },
    )

    expect(pilot.ok).toBe(false)
    const snapshot = createEditorVNextOperationCommitReadinessSnapshot(pilot.snapshot)

    expect(snapshot).toMatchObject({
      operation: {
        status: "blocked",
        failureReason: "bridge-blocked",
      },
      durableHistory: {
        recordCreated: false,
        recordStatus: null,
        recordAvailable: false,
        auditable: false,
      },
      sessionHistory: {
        eligible: false,
        reason: "bridge-blocked",
        currentHistoryEntryCreated: false,
        currentUndoRedoChanged: false,
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        persistence: false,
        apiRoutes: false,
      },
    })
  })
})
