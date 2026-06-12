import { describe, expect, it } from "vitest"
import {
  classifyWysiwygDraftIslandSurfaceRenderTelemetry,
  type WysiwygDraftIslandSurfaceRenderTelemetryInput,
} from "../wysiwygDraftIslandSurfaceRenderTelemetry"

function input(overrides: Partial<WysiwygDraftIslandSurfaceRenderTelemetryInput> = {}): WysiwygDraftIslandSurfaceRenderTelemetryInput {
  return {
    nodeId: "p1",
    componentName: "flowdoc-draft-editor-island-surface-v2:p1-0",
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
    surfaceSignature: "p1-0:page-0:0:0:0:0:2:36:48:120:24",
    anchorsReady: true,
    inputToVisibleActive: true,
    ...overrides,
  }
}

describe("classifyWysiwygDraftIslandSurfaceRenderTelemetry", () => {
  it("marks the first surface commit as changed across tracked scopes", () => {
    const result = classifyWysiwygDraftIslandSurfaceRenderTelemetry(null, input())

    expect(result.metadata).toMatchObject({
      draftSurfaceRevisionChanged: true,
      draftSurfaceTextLengthChanged: true,
      draftSurfaceCaretChanged: true,
      draftSurfaceSelectionChanged: true,
      draftSurfaceLayoutChanged: true,
      draftSurfaceSurfaceChanged: true,
      draftSurfaceAnchorChanged: true,
      draftSurfaceInputToVisibleActive: true,
      draftSurfaceCommitReason: "revision+text-length+caret+selection+layout+surface+anchor",
    })
  })

  it("does not count collapsed caret movement as an active selection change", () => {
    const first = classifyWysiwygDraftIslandSurfaceRenderTelemetry(null, input())
    const typed = classifyWysiwygDraftIslandSurfaceRenderTelemetry(first.nextState, input({
      draftRevision: 2,
      textLength: 13,
      caretOffset: 13,
      selectionAnchorOffset: 13,
      selectionFocusOffset: 13,
    }))

    expect(typed.metadata).toMatchObject({
      draftSurfaceRevisionChanged: true,
      draftSurfaceTextLengthChanged: true,
      draftSurfaceCaretChanged: true,
      draftSurfaceSelectionChanged: false,
      draftSurfaceLayoutChanged: false,
      draftSurfaceSurfaceChanged: false,
      draftSurfaceAnchorChanged: false,
      draftSurfaceCommitReason: "revision+text-length+caret",
    })
  })

  it("separates active selection changes from layout surface and anchor changes", () => {
    const first = classifyWysiwygDraftIslandSurfaceRenderTelemetry(null, input())
    const selected = classifyWysiwygDraftIslandSurfaceRenderTelemetry(first.nextState, input({
      selectionAnchorOffset: 6,
      selectionFocusOffset: 12,
    }))
    const layout = classifyWysiwygDraftIslandSurfaceRenderTelemetry(selected.nextState, input({
      selectionAnchorOffset: 6,
      selectionFocusOffset: 12,
      lineCount: 3,
      paragraphHeight: 36,
    }))
    const surface = classifyWysiwygDraftIslandSurfaceRenderTelemetry(layout.nextState, input({
      selectionAnchorOffset: 6,
      selectionFocusOffset: 12,
      lineCount: 3,
      paragraphHeight: 36,
      surfaceSignature: "p1-0:page-0:0:0:0:0:3:36:48:120:36",
    }))
    const anchor = classifyWysiwygDraftIslandSurfaceRenderTelemetry(surface.nextState, input({
      selectionAnchorOffset: 6,
      selectionFocusOffset: 12,
      lineCount: 3,
      paragraphHeight: 36,
      surfaceSignature: "p1-0:page-0:0:0:0:0:3:36:48:120:36",
      anchorsReady: false,
    }))

    expect(selected.metadata).toMatchObject({
      draftSurfaceSelectionChanged: true,
      draftSurfaceCommitReason: "selection",
    })
    expect(layout.metadata).toMatchObject({
      draftSurfaceLayoutChanged: true,
      draftSurfaceCommitReason: "layout",
    })
    expect(surface.metadata).toMatchObject({
      draftSurfaceSurfaceChanged: true,
      draftSurfaceCommitReason: "surface",
    })
    expect(anchor.metadata).toMatchObject({
      draftSurfaceAnchorChanged: true,
      draftSurfaceCommitReason: "anchor",
    })
  })
})
