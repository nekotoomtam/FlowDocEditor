import { useCallback, useEffect, useRef } from "react"
import type { RefObject } from "react"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { recordWysiwygPerfEvent, startWysiwygPerfSpan } from "./wysiwygPerformance"
import { shouldApplyWysiwygNativeHeightPreview } from "./wysiwygCaretViewportState"

const WYSIWYG_NATIVE_GEOMETRY_SYNC_THROTTLE_MS = 160

interface UseWysiwygNativeTextareaGeometryInput {
  layerRef: RefObject<SVGGElement | null>
  nodeId: string
  pageIndex: number | null | undefined
  nativeEditHeight: number
  nativeLineCount: number
  nativeSpacingBefore: number
  nativeSpacingAfter: number
  scale: number
  shouldUseFlowdocDraftLines: boolean
  onNativeHeightChange?: (nodeId: string, height: number, pageIndex: number | null) => void
}

export function useWysiwygNativeTextareaGeometry(input: UseWysiwygNativeTextareaGeometryInput) {
  const nativeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const nativeForeignObjectRef = useRef<SVGForeignObjectElement | null>(null)
  const nativeHitAreaRef = useRef<SVGRectElement | null>(null)
  const nativeOutlineRef = useRef<SVGRectElement | null>(null)
  const nativeGeometrySyncFrameRef = useRef<number | null>(null)
  const nativeGeometrySyncAfterPaintFrameRef = useRef<number | null>(null)
  const nativeGeometrySyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nativeGeometrySyncSourceRef = useRef<string>("unknown")
  const nativeGeometryHeightRef = useRef<number | null>(null)
  const nativeHeightPreviewLastReportedRef = useRef<{ key: string; height: number } | null>(null)
  const nativeGeometryLastSyncAtRef = useRef<number>(0)

  const nativeRenderedEditHeight = input.shouldUseFlowdocDraftLines
    ? input.nativeEditHeight
    : Math.max(input.nativeEditHeight, nativeGeometryHeightRef.current ?? 0)

  const reportNativeHeightPreview = useCallback((height: number, source: string) => {
    if (!input.onNativeHeightChange) return false
    const nextHeight = Math.max(1, height)
    const key = `${input.nodeId}:${input.pageIndex ?? "null"}:${input.shouldUseFlowdocDraftLines ? "flowdoc-draft-lines" : "native-edit-layer"}`
    const previous = nativeHeightPreviewLastReportedRef.current
    if (
      previous?.key === key &&
      !shouldApplyWysiwygNativeHeightPreview(previous.height, nextHeight)
    ) {
      return false
    }
    const startedAt = startWysiwygPerfSpan()
    nativeHeightPreviewLastReportedRef.current = { key, height: nextHeight }
    input.onNativeHeightChange(input.nodeId, nextHeight, input.pageIndex ?? null)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "inline-edit-height-preview",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: input.nodeId,
      pageIndex: input.pageIndex,
      paragraphHeight: nextHeight,
      source,
      active: true,
    })
    return true
  }, [
    input.nodeId,
    input.onNativeHeightChange,
    input.pageIndex,
    input.shouldUseFlowdocDraftLines,
  ])

  const syncNativeTextareaGeometry = useCallback((
    textarea: HTMLTextAreaElement | null = nativeTextareaRef.current,
    source = nativeGeometrySyncSourceRef.current,
  ) => {
    if (!textarea) return
    nativeGeometrySyncSourceRef.current = source
    const startedAt = startWysiwygPerfSpan()
    const scrollHeight = input.shouldUseFlowdocDraftLines ? input.nativeEditHeight : textarea.scrollHeight
    const nextHeight = input.shouldUseFlowdocDraftLines
      ? Math.max(input.nativeEditHeight, 1)
      : Math.max(input.nativeEditHeight, scrollHeight, 1)
    const previousHeight = nativeGeometryHeightRef.current
    nativeGeometryHeightRef.current = nextHeight
    const heightChanged = shouldApplyWysiwygNativeHeightPreview(previousHeight, nextHeight)
    if (heightChanged) {
      textarea.style.height = `${nextHeight}px`
      textarea.style.minHeight = `${input.nativeEditHeight}px`
      nativeForeignObjectRef.current?.setAttribute("height", String(nextHeight))
      nativeHitAreaRef.current?.setAttribute("height", String(nextHeight))
      nativeOutlineRef.current?.setAttribute("height", String(nextHeight))
      input.layerRef.current?.setAttribute("data-wysiwyg-native-edit-height", String(nextHeight / input.scale))
      reportNativeHeightPreview(
        Math.max(1, nextHeight / input.scale + input.nativeSpacingBefore + input.nativeSpacingAfter),
        `native-geometry-sync:${source}`,
      )
    }
    nativeGeometryLastSyncAtRef.current = startWysiwygPerfSpan()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "native-edit-geometry-sync",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: input.nodeId,
      pageIndex: input.pageIndex,
      textLength: textarea.value.length,
      lineCount: input.nativeLineCount,
      paragraphHeight: nextHeight / input.scale,
      source: `${nativeGeometrySyncSourceRef.current}${input.shouldUseFlowdocDraftLines ? ":flowdoc-draft-height" : ""}${heightChanged ? ":height-changed" : ":height-stable"}`,
      requestedDelayMs: input.shouldUseFlowdocDraftLines ? undefined : scrollHeight,
      scheduledDelayMs: previousHeight == null ? undefined : Math.abs(nextHeight - previousHeight),
    })
  }, [
    input.layerRef,
    input.nativeEditHeight,
    input.nativeLineCount,
    input.nativeSpacingAfter,
    input.nativeSpacingBefore,
    input.nodeId,
    input.pageIndex,
    input.scale,
    input.shouldUseFlowdocDraftLines,
    reportNativeHeightPreview,
  ])

  const scheduleNativeTextareaGeometrySync = useCallback((
    textarea: HTMLTextAreaElement | null = nativeTextareaRef.current,
    source = "input",
  ) => {
    nativeGeometrySyncSourceRef.current = source
    const isInputSync = source.includes("input")
    const shouldThrottleInputSync = isInputSync && !source.includes("after-paint")
    if (shouldThrottleInputSync && typeof performance !== "undefined" && typeof performance.now === "function") {
      const now = performance.now()
      const elapsed = now - nativeGeometryLastSyncAtRef.current
      if (elapsed < WYSIWYG_NATIVE_GEOMETRY_SYNC_THROTTLE_MS) {
        if (!nativeGeometrySyncTimeoutRef.current) {
          nativeGeometrySyncTimeoutRef.current = setTimeout(() => {
            nativeGeometrySyncTimeoutRef.current = null
            scheduleNativeTextareaGeometrySync(nativeTextareaRef.current, source)
          }, WYSIWYG_NATIVE_GEOMETRY_SYNC_THROTTLE_MS - elapsed)
        }
        return
      }
    }
    if (!textarea || typeof requestAnimationFrame !== "function") {
      syncNativeTextareaGeometry(textarea)
      return
    }
    if (nativeGeometrySyncFrameRef.current != null || nativeGeometrySyncAfterPaintFrameRef.current != null) {
      return
    }
    nativeGeometrySyncFrameRef.current = requestAnimationFrame(() => {
      nativeGeometrySyncFrameRef.current = null
      nativeGeometrySyncAfterPaintFrameRef.current = requestAnimationFrame(() => {
        nativeGeometrySyncAfterPaintFrameRef.current = null
        syncNativeTextareaGeometry(textarea)
      })
    })
  }, [syncNativeTextareaGeometry])

  useEffect(() => () => {
    if (nativeGeometrySyncFrameRef.current != null) {
      cancelAnimationFrame(nativeGeometrySyncFrameRef.current)
      nativeGeometrySyncFrameRef.current = null
    }
    if (nativeGeometrySyncAfterPaintFrameRef.current != null) {
      cancelAnimationFrame(nativeGeometrySyncAfterPaintFrameRef.current)
      nativeGeometrySyncAfterPaintFrameRef.current = null
    }
    if (nativeGeometrySyncTimeoutRef.current) {
      clearTimeout(nativeGeometrySyncTimeoutRef.current)
      nativeGeometrySyncTimeoutRef.current = null
    }
  }, [])

  return {
    nativeTextareaRef,
    nativeForeignObjectRef,
    nativeHitAreaRef,
    nativeOutlineRef,
    nativeRenderedEditHeight,
    reportNativeHeightPreview,
    scheduleNativeTextareaGeometrySync,
    syncNativeTextareaGeometry,
  }
}
