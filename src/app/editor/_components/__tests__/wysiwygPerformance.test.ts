import { afterEach, describe, expect, it, vi } from "vitest"
import {
  appendWysiwygPerfEvent,
  finishFlowDocPerfSpan,
  finishWysiwygPerfSpan,
  getWysiwygPerformanceMetricDefinition,
  getWysiwygPerformanceReportSchemaVersion,
  getWysiwygPerformanceTimingAnchorVersion,
  isPaginationProfileRuntimeEnabled,
  isWysiwygPerfTraceRuntimeEnabled,
  recordFlowDocPerfEvent,
  recordWysiwygPerfEvent,
  summarizePaginatedForWysiwygPerf,
  type WysiwygPerfEvent,
} from "../wysiwygPerformance"
import type { PaginatedDocument } from "@/pagination"

function event(kind: WysiwygPerfEvent["kind"], startedAt: number): WysiwygPerfEvent {
  return { kind, startedAt, durationMs: 1 }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("appendWysiwygPerfEvent", () => {
  it("keeps newest events when the buffer reaches its cap", () => {
    const events = [
      event("inline-edit-draft-update", 1),
      event("active-paragraph-measure", 2),
    ]

    const next = appendWysiwygPerfEvent(
      events,
      event("browser-preview-pagination", 3),
      2,
    )

    expect(next.map((item) => item.startedAt)).toEqual([2, 3])
    expect(events.map((item) => item.startedAt)).toEqual([1, 2])
  })

  it("drops events when the cap is zero", () => {
    expect(appendWysiwygPerfEvent([], event("inline-edit-draft-update", 1), 0)).toEqual([])
  })
})

describe("editor performance schema facade", () => {
  it("exposes the normalized report schema metadata", () => {
    expect(getWysiwygPerformanceReportSchemaVersion()).toBe("editor-performance-report-v1")
    expect(getWysiwygPerformanceTimingAnchorVersion()).toBe("editor-performance-timing-anchors-v1")
    expect(getWysiwygPerformanceMetricDefinition("fullPaginationSettledMs")).toMatchObject({
      name: "fullPaginationSettledMs",
      kind: "timing",
    })
  })
})

describe("summarizePaginatedForWysiwygPerf", () => {
  it("counts pages and fragments across sections without inspecting document semantics", () => {
    const paginated = {
      sections: [
        {
          sectionId: "s1",
          pages: [
            { fragments: [{}, {}] },
            { fragments: [{}] },
          ],
        },
        {
          sectionId: "s2",
          pages: [
            { fragments: [{}, {}, {}] },
          ],
        },
      ],
    } as unknown as PaginatedDocument

    expect(summarizePaginatedForWysiwygPerf(paginated)).toEqual({
      pageCount: 3,
      fragmentCount: 6,
    })
  })
})

describe("finishWysiwygPerfSpan", () => {
  it("is inert when tracing is disabled", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(false, "inline-edit-draft-update", 10, {
      nodeId: "p1",
      textLength: 5,
    })

    expect(window.__flowDocWysiwygPerfEvents).toBeUndefined()
  })

  it("can enable tracing at runtime from the editor URL", () => {
    vi.stubGlobal("window", {
      location: { search: "?flowdocWysiwygPerfTrace=1" },
    })

    expect(isWysiwygPerfTraceRuntimeEnabled(false)).toBe(true)

    finishWysiwygPerfSpan(false, "inline-edit-draft-update", 10, {
      nodeId: "p1",
      textLength: 5,
    })

    expect(window.__flowDocWysiwygPerfEvents).toHaveLength(1)
  })

  it("can enable tracing at runtime from a browser global override", () => {
    vi.stubGlobal("window", {
      __flowDocWysiwygPerfTraceEnabled: true,
      location: { search: "" },
    })

    finishWysiwygPerfSpan(false, "inline-edit-draft-update", 10, {
      nodeId: "p1",
      textLength: 5,
    })

    expect(window.__flowDocWysiwygPerfEvents).toHaveLength(1)
  })

  it("can enable pagination profiling at runtime from the editor URL", () => {
    vi.stubGlobal("window", {
      location: { search: "?flowdocProfilePagination=1" },
    })

    expect(isPaginationProfileRuntimeEnabled()).toBe(true)
  })

  it("appends scalar metadata without storing paragraph text", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(true, "inline-edit-draft-update", 10, {
      nodeId: "p1",
      textLength: 5,
    })

    expect(window.__flowDocWysiwygPerfEvents).toHaveLength(1)
    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "inline-edit-draft-update",
      nodeId: "p1",
      textLength: 5,
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("Alpha")
  })

  it("records draft measure metadata without paragraph content", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(true, "text-engine-draft-measure", 10, {
      nodeId: "p1",
      pageIndex: 2,
      textLength: 42,
      lineCount: 3,
      availableWidth: 120,
      paragraphHeight: 54,
      source: "test-source",
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "text-engine-draft-measure",
      nodeId: "p1",
      pageIndex: 2,
      textLength: 42,
      lineCount: 3,
      availableWidth: 120,
      paragraphHeight: 54,
      source: "test-source",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records selection hot-path probe metadata without text content", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(true, "text-engine-pointer-frame", 10, {
      nodeId: "p1",
      pageIndex: 0,
      pointerTargetCount: 2,
      source: "applied",
    })
    finishWysiwygPerfSpan(true, "text-engine-pointer-hit-test", 11, {
      nodeId: "p1",
      pageIndex: 0,
      pointerTargetCount: 2,
      source: "hit",
    })
    finishWysiwygPerfSpan(true, "text-engine-pointer-selection-apply", 12, {
      nodeId: "p1",
      textLength: 20,
      selectionRangeLength: 5,
      selectionCollapsed: false,
      source: "changed",
    })
    finishWysiwygPerfSpan(true, "text-engine-selection-overlay", 13, {
      nodeId: "p1",
      lineCount: 1,
      overlayRectCount: 1,
      selectionRangeLength: 5,
      source: "active",
    })

    expect(window.__flowDocWysiwygPerfEvents?.map((item) => item.kind)).toEqual([
      "text-engine-pointer-frame",
      "text-engine-pointer-hit-test",
      "text-engine-pointer-selection-apply",
      "text-engine-selection-overlay",
    ])
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("selected text")
  })

  it("records editor canvas React commit metadata with explicit duration", () => {
    vi.stubGlobal("window", {})

    recordWysiwygPerfEvent(true, {
      kind: "editor-canvas-react-commit",
      startedAt: 100,
      durationMs: 3.5,
      baseDurationMs: 7.25,
      commitTime: 120,
      nodeId: "p1",
      selectionRangeLength: 4,
      selectionCollapsed: false,
      source: "update",
      pageCount: 1,
      fragmentCount: 3,
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "editor-canvas-react-commit",
      durationMs: 3.5,
      baseDurationMs: 7.25,
      commitTime: 120,
      nodeId: "p1",
      selectionRangeLength: 4,
      source: "update",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records WYSIWYG draft runtime metadata without draft content", () => {
    vi.stubGlobal("window", {})

    recordWysiwygPerfEvent(true, {
      kind: "flowdoc-wysiwyg-draft-runtime",
      startedAt: 100,
      durationMs: 0,
      nodeId: "p1",
      source: "flowdoc-draft-island",
      action: "runtime-begin",
      active: true,
      wysiwygDraftSessionBeginCount: 1,
      wysiwygDraftCurrentGeneration: 1,
      wysiwygDraftCurrentPhase: "starting",
      wysiwygDraftCurrentNodeId: "p1",
      wysiwygDraftSource: "flowdoc-draft-island",
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "flowdoc-wysiwyg-draft-runtime",
      nodeId: "p1",
      action: "runtime-begin",
      wysiwygDraftCurrentPhase: "starting",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records draft island scope metadata without draft content", () => {
    vi.stubGlobal("window", {})

    recordWysiwygPerfEvent(true, {
      kind: "flowdoc-island-fragment-split",
      startedAt: 100,
      durationMs: 1.5,
      nodeId: "p1",
      pageIndex: 14,
      textLength: 220,
      lineCount: 12,
      draftFragmentCount: 2,
      draftPageCount: 2,
      draftSurfaceCount: 2,
      draftMissingSurfaceCount: 0,
      draftCandidatePageCount: 18,
      draftLayoutCacheHit: true,
      pageIndexes: "14,15",
      source: "split-pages",
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "flowdoc-island-fragment-split",
      nodeId: "p1",
      draftFragmentCount: 2,
      draftPageCount: 2,
      draftCandidatePageCount: 18,
      draftLayoutCacheHit: true,
      pageIndexes: "14,15",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records draft island surface commit metadata without draft content", () => {
    vi.stubGlobal("window", {})

    recordWysiwygPerfEvent(true, {
      kind: "flowdoc-island-surface-react-commit",
      startedAt: 100,
      durationMs: 1.25,
      baseDurationMs: 2.5,
      commitTime: 104,
      nodeId: "p1",
      draftVersion: 3,
      textLength: 220,
      lineCount: 12,
      draftFragmentCount: 2,
      draftPageCount: 2,
      draftSurfaceCount: 2,
      draftMissingSurfaceCount: 0,
      componentName: "flowdoc-draft-editor-island-surface-v2:p1-0",
      selectionCollapsed: true,
      selectionRangeLength: 0,
      draftSurfaceRevisionChanged: true,
      draftSurfaceTextLengthChanged: true,
      draftSurfaceCaretChanged: true,
      draftSurfaceSelectionChanged: false,
      draftSurfaceLayoutChanged: false,
      draftSurfaceSurfaceChanged: false,
      draftSurfaceAnchorChanged: false,
      draftSurfaceCommitReason: "revision+text-length+caret",
      source: "update",
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "flowdoc-island-surface-react-commit",
      nodeId: "p1",
      draftVersion: 3,
      draftSurfaceCount: 2,
      componentName: "flowdoc-draft-editor-island-surface-v2:p1-0",
      draftSurfaceCommitReason: "revision+text-length+caret",
      source: "update",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records draft island visual-lines commit metadata without draft content", () => {
    vi.stubGlobal("window", {})

    recordWysiwygPerfEvent(true, {
      kind: "flowdoc-island-visual-lines-react-commit",
      startedAt: 100,
      durationMs: 0.75,
      baseDurationMs: 1.5,
      commitTime: 104,
      nodeId: "p1",
      pageIndex: 14,
      lineCount: 12,
      paragraphHeight: 72,
      pageIndexes: "14",
      componentName: "flowdoc-draft-editor-island-visual-lines-v2:p1-0",
      source: "update",
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "flowdoc-island-visual-lines-react-commit",
      nodeId: "p1",
      pageIndex: 14,
      lineCount: 12,
      componentName: "flowdoc-draft-editor-island-visual-lines-v2:p1-0",
      source: "update",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records draft island static chrome commit metadata without draft content", () => {
    vi.stubGlobal("window", {})

    recordWysiwygPerfEvent(true, {
      kind: "flowdoc-island-surface-chrome-react-commit",
      startedAt: 100,
      durationMs: 0.3,
      baseDurationMs: 0.6,
      commitTime: 104,
      nodeId: "p1",
      pageIndex: 14,
      paragraphHeight: 72,
      componentName: "flowdoc-draft-editor-island-surface-chrome-v2:p1-0",
      source: "mount",
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "flowdoc-island-surface-chrome-react-commit",
      nodeId: "p1",
      pageIndex: 14,
      paragraphHeight: 72,
      componentName: "flowdoc-draft-editor-island-surface-chrome-v2:p1-0",
      source: "mount",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records draft island caret commit metadata without draft content", () => {
    vi.stubGlobal("window", {})

    recordWysiwygPerfEvent(true, {
      kind: "flowdoc-island-caret-react-commit",
      startedAt: 100,
      durationMs: 0.2,
      baseDurationMs: 0.4,
      commitTime: 104,
      nodeId: "p1",
      pageIndex: 14,
      active: true,
      componentName: "flowdoc-draft-editor-island-caret-v2:p1-0",
      source: "update",
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "flowdoc-island-caret-react-commit",
      nodeId: "p1",
      pageIndex: 14,
      active: true,
      componentName: "flowdoc-draft-editor-island-caret-v2:p1-0",
      source: "update",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records editor action classification metadata without document content", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(true, "editor-action-dispatch", 10, {
      source: "dispatchEditorAction",
      commandType: "SELECT_NODE",
      uiImpact: "selection",
      layoutScope: "none",
      priority: "sync",
      layoutAffecting: false,
      nodeId: "p1",
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "editor-action-dispatch",
      source: "dispatchEditorAction",
      commandType: "SELECT_NODE",
      uiImpact: "selection",
      layoutScope: "none",
      priority: "sync",
      layoutAffecting: false,
      nodeId: "p1",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records structural attribution metadata without document content", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(true, "flowdoc-structural-attribution", 10, {
      nodeId: "cover_note_split",
      previousNodeId: "cover_note",
      sourceNodeId: "cover_note",
      operation: "split",
      action: "reducer-precomputed-split-fast-path",
      validationMode: "prevalidated",
      reducerPath: "precomputed-fast-path",
      boundarySafeMode: true,
      affectedPageIndex: 0,
      optimisticFragmentCount: 123,
      suppressedPageBreakNodeId: "cover_break",
      textLength: 42,
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "flowdoc-structural-attribution",
      nodeId: "cover_note_split",
      previousNodeId: "cover_note",
      operation: "split",
      action: "reducer-precomputed-split-fast-path",
      validationMode: "prevalidated",
      reducerPath: "precomputed-fast-path",
      boundarySafeMode: true,
      affectedPageIndex: 0,
      optimisticFragmentCount: 123,
      suppressedPageBreakNodeId: "cover_break",
      textLength: 42,
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("records structural panel release metadata without document content", () => {
    vi.stubGlobal("window", {})

    recordWysiwygPerfEvent(true, {
      kind: "flowdoc-structural-panel-release",
      startedAt: 20,
      durationMs: 12.5,
      nodeId: "cover_note",
      operation: "merge",
      action: "release-apply-start",
      source: "structural-refocus-painted",
      token: 3,
      active: true,
    })

    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "flowdoc-structural-panel-release",
      nodeId: "cover_note",
      operation: "merge",
      action: "release-apply-start",
      source: "structural-refocus-painted",
      token: 3,
      active: true,
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("paragraph text")
  })

  it("mirrors canonical baseline perf events without document content", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(true, "browser-preview-pagination", 10, {
      source: "initial",
      pageCount: 2,
      fragmentCount: 12,
    })

    expect(window.__FLOWDOC_PERF_EVENTS__).toHaveLength(1)
    expect(window.__FLOWDOC_PERF_EVENTS__?.[0]).toMatchObject({
      name: "pagination:browser",
      startMs: 10,
      detail: {
        source: "initial",
        pageCount: 2,
        fragmentCount: 12,
      },
    })
    expect(JSON.stringify(window.__FLOWDOC_PERF_EVENTS__)).not.toContain("paragraph text")
  })

  it("records generic FlowDoc perf markers only in the canonical stream", () => {
    vi.stubGlobal("window", {})

    recordFlowDocPerfEvent(true, {
      name: "pre-pagination:worker-create",
      startMs: 12,
      durationMs: 3,
      detail: { source: "test" },
    })
    finishFlowDocPerfSpan(true, "pre-pagination:preview-doc-create", 20, {
      mode: "template",
    })

    expect(window.__FLOWDOC_PERF_EVENTS__?.map((item) => item.name)).toEqual([
      "pre-pagination:worker-create",
      "pre-pagination:preview-doc-create",
    ])
    expect(window.__flowDocWysiwygPerfEvents).toBeUndefined()
    expect(JSON.stringify(window.__FLOWDOC_PERF_EVENTS__)).not.toContain("paragraph text")
  })
})
