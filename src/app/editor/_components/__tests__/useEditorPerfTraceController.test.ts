import { describe, expect, it } from "vitest"
import {
  resolveEditorCanvasCommitAttribution,
} from "../shell/useEditorPerfTraceController"
import type { WysiwygPerfEvent } from "../wysiwygPerformance"

function perfEvent(
  kind: WysiwygPerfEvent["kind"],
  startedAt: number,
  metadata: Partial<WysiwygPerfEvent> = {},
): WysiwygPerfEvent {
  return {
    ...metadata,
    kind,
    startedAt,
    durationMs: metadata.durationMs ?? 1,
  }
}

describe("resolveEditorCanvasCommitAttribution", () => {
  it("attributes a canvas commit to the latest input event", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 120,
      events: [
        perfEvent("flowdoc-island-input", 100, {
          action: "text-input",
          source: "beforeinput:insertText",
        }),
      ],
    })

    expect(attribution).toMatchObject({
      renderReason: "input",
      reason: "recent-perf-event",
      commitAttributionKind: "flowdoc-island-input",
      commitAttributionSource: "beforeinput:insertText",
      commitAttributionDelayMs: 19,
    })
  })

  it("does not let scheduled parent-sync telemetry hide direct input", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 110,
      events: [
        perfEvent("flowdoc-island-input", 100, { source: "key:a" }),
        perfEvent("flowdoc-island-parent-sync", 101, {
          action: "scheduled",
          source: "key:a",
        }),
      ],
    })

    expect(attribution.renderReason).toBe("input")
    expect(attribution.commitAttributionKind).toBe("flowdoc-island-input")
  })

  it("attributes idle draft flushes to parent-sync", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 128,
      events: [
        perfEvent("flowdoc-island-input", 50, { source: "key:a" }),
        perfEvent("inline-edit-draft-update", 120),
        perfEvent("flowdoc-island-parent-sync", 123, {
          durationMs: 2,
          source: "idle-debounce",
        }),
      ],
    })

    expect(attribution).toMatchObject({
      renderReason: "parent-sync",
      commitAttributionKind: "flowdoc-island-parent-sync",
      commitAttributionSource: "idle-debounce",
      commitAttributionDelayMs: 3,
    })
  })

  it("separates selection-only commits", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 220,
      events: [
        perfEvent("inline-edit-selection-update", 215, {
          selectionCollapsed: false,
        }),
      ],
    })

    expect(attribution.renderReason).toBe("selection")
    expect(attribution.commitAttributionKind).toBe("inline-edit-selection-update")
  })

  it("separates structural commits", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 320,
      events: [
        perfEvent("flowdoc-structural-attribution", 310, {
          action: "draft-split-text-resolve",
          operation: "split",
        }),
      ],
    })

    expect(attribution).toMatchObject({
      renderReason: "structural",
      commitAttributionKind: "flowdoc-structural-attribution",
      commitAttributionAction: "draft-split-text-resolve",
    })
  })

  it("keeps fragment split attribution visual when the visual output changed", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 420,
      events: [
        perfEvent("flowdoc-island-fragment-split", 415, {
          draftFragmentOutputChanged: true,
          draftFragmentVisualChanged: true,
          source: "split-pages",
        }),
      ],
    })

    expect(attribution).toMatchObject({
      renderReason: "visual",
      commitAttributionKind: "flowdoc-island-fragment-split",
      commitAttributionSource: "split-pages",
    })
  })

  it("keeps fragment split attribution visual when geometry is stable but rendered lines changed", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 460,
      events: [
        perfEvent("flowdoc-island-fragment-split", 455, {
          draftFragmentOutputChanged: false,
          draftFragmentVisualChanged: true,
          source: "split-pages",
        }),
      ],
    })

    expect(attribution).toMatchObject({
      renderReason: "visual",
      commitAttributionKind: "flowdoc-island-fragment-split",
      commitAttributionSource: "split-pages",
    })
  })

  it("separates unchanged-output fragment split attribution from visual changes", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 520,
      events: [
        perfEvent("flowdoc-island-fragment-split", 515, {
          draftFragmentOutputChanged: false,
          draftFragmentVisualChanged: false,
          source: "split-pages",
        }),
      ],
    })

    expect(attribution).toMatchObject({
      renderReason: "visual-unchanged",
      commitAttributionKind: "flowdoc-island-fragment-split",
      commitAttributionSource: "split-pages",
    })
  })

  it("ignores prior render telemetry and reports unattributed commits outside the lookback window", () => {
    const attribution = resolveEditorCanvasCommitAttribution({
      commitTime: 500,
      lookbackMs: 40,
      events: [
        perfEvent("flowdoc-island-input", 100),
        perfEvent("flowdoc-island-surface-react-commit", 498, {
          commitTime: 499,
          componentName: "flowdoc-draft-editor-island-surface-v2:p1-0",
        }),
        perfEvent("flowdoc-island-visual-lines-react-commit", 499, {
          commitTime: 500,
          componentName: "flowdoc-draft-editor-island-visual-lines-v2:p1-0",
        }),
        perfEvent("flowdoc-structural-render-attribution", 490),
      ],
    })

    expect(attribution).toMatchObject({
      renderReason: "unattributed",
      reason: "no-recent-perf-event",
    })
  })
})
