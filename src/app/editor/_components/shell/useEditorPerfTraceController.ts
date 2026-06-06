import { useCallback, useEffect, useState, type MutableRefObject, type ProfilerOnRenderCallback } from "react"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import {
  isWysiwygPerfTraceRuntimeEnabled,
  recordWysiwygPerfEvent,
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
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "editor-canvas-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      source: phase,
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
