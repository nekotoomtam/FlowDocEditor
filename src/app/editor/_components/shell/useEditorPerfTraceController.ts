import { useCallback, useEffect, useState, type MutableRefObject, type ProfilerOnRenderCallback } from "react"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import {
  isWysiwygPerfTraceRuntimeEnabled,
  recordWysiwygPerfEvent,
  type WysiwygPerfEvent,
} from "../wysiwygPerformance"

type WysiwygTextSessionPerfState = {
  nodeId: string | null
  dirtyVersion: number
  draftText: string
  selection: {
    anchorOffset: number
    focusOffset: number
  } | null
}

const EDITOR_CANVAS_COMMIT_ATTRIBUTION_LOOKBACK_MS = 160
const EDITOR_CANVAS_COMMIT_ATTRIBUTION_FUTURE_TOLERANCE_MS = 2
const RENDER_TRACE_EVENT_KINDS = new Set<WysiwygPerfEvent["kind"]>([
  "editor-canvas-react-commit",
  "flowdoc-island-react-commit",
  "flowdoc-island-surface-react-commit",
  "flowdoc-island-visual-lines-react-commit",
  "flowdoc-island-visible-lines",
  "flowdoc-structural-render-attribution",
])
const PARENT_SYNC_SOURCES = new Set([
  "idle-debounce",
  "page-boundary",
  "global-flush",
  "outside-pointerdown",
  "keyboard-exit",
  "blur",
  "unmount",
])

export type EditorCanvasCommitAttribution = {
  renderReason: string
  reason: string
  commitAttributionKind?: WysiwygPerfEvent["kind"]
  commitAttributionAction?: string
  commitAttributionSource?: string
  commitAttributionDelayMs?: number
  commitAttributionLookbackMs: number
}

function eventEndMs(event: WysiwygPerfEvent): number {
  return event.startedAt + Math.max(0, event.durationMs)
}

function isParentSyncSource(source: string | undefined): boolean {
  if (!source) return false
  return PARENT_SYNC_SOURCES.has(source) || source.endsWith("-parent-sync")
}

function classifyEditorCanvasCommitEvent(event: WysiwygPerfEvent): string | null {
  if (RENDER_TRACE_EVENT_KINDS.has(event.kind)) return null
  switch (event.kind) {
    case "flowdoc-island-input":
      return "input"
    case "inline-edit-draft-update":
      return isParentSyncSource(event.source) ? "parent-sync" : "input"
    case "editor-shell-draft-change-enter":
    case "editor-shell-draft-change-exit":
      return isParentSyncSource(event.source) ? "parent-sync" : "draft-change"
    case "flowdoc-island-parent-sync":
      if (event.action === "scheduled" || event.action === "rescheduled-active-input") return null
      return "parent-sync"
    case "flowdoc-island-blur-handoff":
    case "flowdoc-island-lifecycle":
      return event.action?.includes("parent-sync") ? "parent-sync" : "lifecycle"
    case "inline-edit-selection-update":
    case "text-engine-pointer-selection-apply":
    case "text-engine-selection-overlay":
      return "selection"
    case "flowdoc-island-structural-edit":
    case "flowdoc-structural-attribution":
    case "flowdoc-structural-transaction":
    case "structural-operation-handler-execute":
    case "inline-edit-structural-refocus":
    case "enter-key-to-optimistic-island-visible":
    case "enter-key-to-new-caret-visible":
    case "structural-refocus-used-full-pagination-before-island":
    case "optimistic-refocus-stale-settle-ignored":
    case "structural-refocus-settled-pagination":
      return "structural"
    case "inline-edit-height-preview":
    case "flowdoc-island-draft-measure":
    case "text-engine-draft-measure":
    case "table-cell-visual-preview":
    case "table-cell-visual-chrome":
      return "visual"
    case "flowdoc-island-fragment-split":
      if (event.draftFragmentVisualChanged != null) {
        return event.draftFragmentVisualChanged ? "visual" : "visual-unchanged"
      }
      return event.draftFragmentOutputChanged === false ? "visual-unchanged" : "visual"
    case "draft-pagination-state":
    case "draft-pagination-schedule":
    case "browser-preview-pagination":
    case "table-cell-reflow-decision":
    case "flowdoc-structural-pagination-schedule":
    case "flowdoc-preview-settle-runtime":
      return "pagination"
    default:
      return null
  }
}

export function resolveEditorCanvasCommitAttribution({
  events,
  commitTime,
  lookbackMs = EDITOR_CANVAS_COMMIT_ATTRIBUTION_LOOKBACK_MS,
}: {
  events: readonly WysiwygPerfEvent[]
  commitTime: number
  lookbackMs?: number
}): EditorCanvasCommitAttribution {
  const candidates = events
    .map((event, index) => {
      const renderReason = classifyEditorCanvasCommitEvent(event)
      if (!renderReason) return null
      const endedAt = eventEndMs(event)
      const delayMs = commitTime - endedAt
      if (delayMs < -EDITOR_CANVAS_COMMIT_ATTRIBUTION_FUTURE_TOLERANCE_MS || delayMs > lookbackMs) {
        return null
      }
      return { event, index, renderReason, delayMs, endedAt }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => (
      right.endedAt - left.endedAt ||
      right.index - left.index
    ))

  const candidate = candidates[0]
  if (!candidate) {
    return {
      renderReason: "unattributed",
      reason: "no-recent-perf-event",
      commitAttributionLookbackMs: lookbackMs,
    }
  }

  return {
    renderReason: candidate.renderReason,
    reason: "recent-perf-event",
    commitAttributionKind: candidate.event.kind,
    commitAttributionAction: candidate.event.action,
    commitAttributionSource: candidate.event.source,
    commitAttributionDelayMs: Math.max(0, Math.round(candidate.delayMs * 1000) / 1000),
    commitAttributionLookbackMs: lookbackMs,
  }
}

function resolveCurrentEditorCanvasCommitAttribution(commitTime: number): EditorCanvasCommitAttribution {
  if (typeof window === "undefined") {
    return {
      renderReason: "unattributed",
      reason: "window-unavailable",
      commitAttributionLookbackMs: EDITOR_CANVAS_COMMIT_ATTRIBUTION_LOOKBACK_MS,
    }
  }
  return resolveEditorCanvasCommitAttribution({
    events: [
      ...(window.__flowDocWysiwygPerfEvents ?? []),
      ...(window.__flowDocWysiwygPerfAttributionEvents ?? []),
    ],
    commitTime,
  })
}

export function useEditorPerfTraceController<TSession extends WysiwygTextSessionPerfState>({
  document,
  selectedNodeId,
  selectionAnchorNodeId,
  lastSplitNodeId,
  mergeResult,
  wysiwygTextSessionStateRef,
  paginatedPerfSummaryRef,
}: {
  document: unknown
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  lastSplitNodeId: string | null
  mergeResult: unknown
  wysiwygTextSessionStateRef: MutableRefObject<TSession>
  paginatedPerfSummaryRef: MutableRefObject<object>
}) {
  const [wysiwygPerfTraceActive] = useState(() => (
    isWysiwygPerfTraceRuntimeEnabled(WYSIWYG_PERF_TRACE_ENABLED)
  ))

  useEffect(() => {
    if (!wysiwygPerfTraceActive) return
    window.__flowDocEditorSmokeState = {
      document,
      selectedNodeId,
      selectionAnchorNodeId,
      lastSplitNodeId,
      mergeResult,
      updatedAt: performance.now(),
    }
    return () => {
      delete window.__flowDocEditorSmokeState
    }
  }, [
    wysiwygPerfTraceActive,
    document,
    selectedNodeId,
    selectionAnchorNodeId,
    lastSplitNodeId,
    mergeResult,
  ])

  const handleEditorCanvasProfilerRender = useCallback<ProfilerOnRenderCallback>((
    _id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    const session = wysiwygTextSessionStateRef.current
    const selection = session.selection
    const attribution = resolveCurrentEditorCanvasCommitAttribution(commitTime)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "editor-canvas-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      source: phase,
      ...attribution,
      ...(session.nodeId ? {
        nodeId: session.nodeId,
        draftVersion: session.dirtyVersion,
        textLength: session.draftText.length,
      } : {}),
      ...(selection ? {
        selectionCollapsed: selection.anchorOffset === selection.focusOffset,
        selectionRangeLength: Math.abs(selection.focusOffset - selection.anchorOffset),
      } : {}),
      ...paginatedPerfSummaryRef.current,
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-render-attribution",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      componentName: "EditorCanvas",
      source: "EditorCanvas",
      action: phase,
      active: true,
      ...paginatedPerfSummaryRef.current,
    })
  }, [paginatedPerfSummaryRef, wysiwygTextSessionStateRef])

  return {
    wysiwygPerfTraceActive,
    handleEditorCanvasProfilerRender,
  }
}
