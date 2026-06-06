import { Profiler, memo, useCallback, type ProfilerOnRenderCallback, type ReactNode } from "react"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import { recordFlowDocPerfEvent, recordWysiwygPerfEvent } from "../wysiwygPerformance"

export function EditorCanvasPerfProfiler({
  enabled,
  onRender,
  children,
}: {
  enabled: boolean
  onRender: ProfilerOnRenderCallback
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <Profiler id="editor-canvas" onRender={onRender}>
      {children}
    </Profiler>
  )
}

export function EditorSubtreePerfProfiler({
  enabled,
  id,
  children,
}: {
  enabled: boolean
  id: string
  children: ReactNode
}) {
  const handleRender = useCallback<ProfilerOnRenderCallback>((
    profilerId,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "react:subtree-commit",
      startMs: startTime,
      durationMs: Math.max(0, actualDuration),
      detail: {
        id: profilerId,
        source: phase,
        baseDurationMs: Math.max(0, baseDuration),
        commitTime,
      },
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-render-attribution",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      componentName: id,
      source: id,
      action: phase,
      active: true,
    })
  }, [])

  if (!enabled) return <>{children}</>
  return (
    <Profiler id={id} onRender={handleRender}>
      {children}
    </Profiler>
  )
}

export const StructuralPaintDeferredSubtree = memo(function StructuralPaintDeferredSubtree({
  children,
}: {
  defer: boolean
  children: ReactNode
}) {
  // Keep non-critical rails on their previous tree while the structural island gets its first paint.
  return <>{children}</>
}, (_previousProps, nextProps) => nextProps.defer)
