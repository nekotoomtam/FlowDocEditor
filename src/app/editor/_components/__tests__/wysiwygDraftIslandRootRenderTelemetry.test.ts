import { describe, expect, it } from "vitest"
import {
  classifyWysiwygDraftIslandRootRenderTelemetry,
  type WysiwygDraftIslandRootRenderTelemetryInput,
} from "../wysiwygDraftIslandRootRenderTelemetry"

function input(overrides: Partial<WysiwygDraftIslandRootRenderTelemetryInput> = {}): WysiwygDraftIslandRootRenderTelemetryInput {
  return {
    nodeId: "p1",
    draftRevision: 1,
    textLength: 12,
    caretOffset: 12,
    selectionAnchorOffset: 12,
    selectionFocusOffset: 12,
    lineCount: 2,
    paragraphHeight: 24,
    draftFragmentCount: 1,
    draftPageCount: 1,
    draftSurfaceCount: 1,
    draftMissingSurfaceCount: 0,
    pageIndexes: "0",
    surfaceSignature: "0:0-0:0:0:0:2:36:48:120:24",
    anchorsReady: true,
    inputToVisibleActive: true,
    ...overrides,
  }
}

describe("classifyWysiwygDraftIslandRootRenderTelemetry", () => {
  it("marks the first root commit as changed across all tracked scopes", () => {
    const result = classifyWysiwygDraftIslandRootRenderTelemetry(null, input())

    expect(result.metadata).toMatchObject({
      draftRootDraftChanged: true,
      draftRootLayoutChanged: true,
      draftRootSurfaceChanged: true,
      draftRootAnchorChanged: true,
      draftRootInputToVisibleActive: true,
      draftRootCommitReason: "draft+layout+surface+anchor",
    })
  })

  it("reports stable commits separately from draft-only changes", () => {
    const first = classifyWysiwygDraftIslandRootRenderTelemetry(null, input())
    const stable = classifyWysiwygDraftIslandRootRenderTelemetry(first.nextState, input())
    const draftOnly = classifyWysiwygDraftIslandRootRenderTelemetry(stable.nextState, input({
      draftRevision: 2,
      textLength: 13,
      caretOffset: 13,
      selectionAnchorOffset: 13,
      selectionFocusOffset: 13,
    }))

    expect(stable.metadata).toMatchObject({
      draftRootDraftChanged: false,
      draftRootLayoutChanged: false,
      draftRootSurfaceChanged: false,
      draftRootAnchorChanged: false,
      draftRootSameDraftRepeatCount: 1,
      draftRootCommitReason: "stable",
    })
    expect(draftOnly.metadata).toMatchObject({
      draftRootDraftChanged: true,
      draftRootLayoutChanged: false,
      draftRootSurfaceChanged: false,
      draftRootAnchorChanged: false,
      draftRootCommitReason: "draft",
    })
  })

  it("separates layout surface and anchor changes from draft changes", () => {
    const first = classifyWysiwygDraftIslandRootRenderTelemetry(null, input())
    const layout = classifyWysiwygDraftIslandRootRenderTelemetry(first.nextState, input({
      lineCount: 3,
      paragraphHeight: 36,
    }))
    const surface = classifyWysiwygDraftIslandRootRenderTelemetry(layout.nextState, input({
      lineCount: 3,
      paragraphHeight: 36,
      surfaceSignature: "0:0-0:0:0:0:3:36:48:120:36",
    }))
    const anchor = classifyWysiwygDraftIslandRootRenderTelemetry(surface.nextState, input({
      lineCount: 3,
      paragraphHeight: 36,
      surfaceSignature: "0:0-0:0:0:0:3:36:48:120:36",
      anchorsReady: false,
    }))

    expect(layout.metadata).toMatchObject({
      draftRootDraftChanged: false,
      draftRootLayoutChanged: true,
      draftRootSurfaceChanged: false,
      draftRootAnchorChanged: false,
      draftRootCommitReason: "layout",
    })
    expect(surface.metadata).toMatchObject({
      draftRootDraftChanged: false,
      draftRootLayoutChanged: false,
      draftRootSurfaceChanged: true,
      draftRootAnchorChanged: false,
      draftRootCommitReason: "surface",
    })
    expect(anchor.metadata).toMatchObject({
      draftRootDraftChanged: false,
      draftRootLayoutChanged: false,
      draftRootSurfaceChanged: false,
      draftRootAnchorChanged: true,
      draftRootCommitReason: "anchor",
    })
  })
})
