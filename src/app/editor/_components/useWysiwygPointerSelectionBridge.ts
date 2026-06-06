import type * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { MutableRefObject, RefObject } from "react"
import type { TextMeasurer } from "@/layout"
import type { PageFragment } from "@/pagination"
import {
  resolveVerticalCaretNavigationInFragments,
  type WysiwygVerticalCaretLineAffinity,
} from "./wysiwygCaretMapping"
import {
  focusElementWithoutScroll,
} from "./inlineEditSurfaceState"
import {
  areWysiwygTextSelectionsEqual,
  type WysiwygTextSelection,
} from "./useWysiwygTextSession"
import {
  resolveWysiwygPointerSelectionState,
  resolveWysiwygTextPointerOffsetFromFragmentTargets,
  resolveWysiwygWordSelectionRange,
  type WysiwygTextPointerFragmentTarget,
} from "./wysiwygTextSelectionState"
import type { WysiwygDraftSyncPayload } from "./wysiwygDraftSyncState"
import {
  safelyReleasePointerCapture,
  scrollEditorCanvasByPointerSelectionWheel,
} from "./wysiwygCaretViewportState"
import { finishWysiwygPerfSpan, startWysiwygPerfSpan } from "./wysiwygPerformance"

const POINTER_SELECTION_DRAG_THRESHOLD_PX = 3

interface WysiwygPointerSelectionDraftState {
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null | undefined
}

interface UseWysiwygPointerSelectionBridgeInput {
  activePointerFragmentTargets: WysiwygTextPointerFragmentTarget[]
  draftStateRef: MutableRefObject<WysiwygPointerSelectionDraftState>
  draftText?: string | null
  inputBridgeRef: RefObject<HTMLDivElement | null>
  nativeTextareaRef: RefObject<HTMLTextAreaElement | null>
  nodeId: string
  onDraftChange?: (nodeId: string, text: string, caretIndex: number | null, selection?: WysiwygTextSelection | null) => void
  pageIndex: PageFragment["pageIndex"]
  scale: number
  selection?: WysiwygTextSelection | null
  setFlowdocDraftSnapshot: (next: WysiwygDraftSyncPayload) => void
  shouldUseFlowdocDraftLines: boolean
  textMeasurer?: TextMeasurer
  traceHotPathPerf: boolean
  verticalCaretLineAffinityRef: MutableRefObject<WysiwygVerticalCaretLineAffinity | null>
  verticalCaretXRef: MutableRefObject<number | null>
}

export function useWysiwygPointerSelectionBridge(input: UseWysiwygPointerSelectionBridgeInput) {
  const {
    activePointerFragmentTargets,
    draftStateRef,
    draftText,
    inputBridgeRef,
    nativeTextareaRef,
    nodeId,
    onDraftChange,
    pageIndex,
    scale,
    selection,
    setFlowdocDraftSnapshot,
    shouldUseFlowdocDraftLines,
    textMeasurer,
    traceHotPathPerf,
    verticalCaretLineAffinityRef,
    verticalCaretXRef,
  } = input

  const pointerSelectionAnchorRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const pointerDragStartPointRef = useRef<{ x: number; y: number } | null>(null)
  const scheduledPointerSelectionFrameRef = useRef<number | null>(null)
  const scheduledPointerSelectionStartedAtRef = useRef<number | null>(null)
  const scheduledPointerSelectionPointRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const [isPointerSelecting, setIsPointerSelecting] = useState(false)
  const [localPointerSelectionPreview, setLocalPointerSelectionPreviewState] = useState<WysiwygTextSelection | null>(null)
  const localPointerSelectionPreviewRef = useRef<WysiwygTextSelection | null>(null)

  const setLocalPointerSelectionPreview = useCallback((next: WysiwygTextSelection | null) => {
    localPointerSelectionPreviewRef.current = next
    setLocalPointerSelectionPreviewState((current) => (
      areWysiwygTextSelectionsEqual(current, next) ? current : next
    ))
  }, [])

  useEffect(() => {
    setLocalPointerSelectionPreview(null)
  }, [draftText, nodeId, setLocalPointerSelectionPreview])

  const resolveTextEnginePointerOffsetFromClientPoint = useCallback((clientX: number, clientY: number): number | null => {
    const startedAt = traceHotPathPerf ? startWysiwygPerfSpan() : null
    const pageElements = typeof document === "undefined"
      ? []
      : Array.from(document.querySelectorAll<SVGSVGElement>('[data-testid="editor-page"]'))

    const offset = resolveWysiwygTextPointerOffsetFromFragmentTargets({
      clientX,
      clientY,
      scale,
      targets: activePointerFragmentTargets,
      textMeasurer,
      getPageRect: (targetPageKey) => {
        const target = activePointerFragmentTargets.find((candidate) => candidate.pageKey === targetPageKey)
        return pageElements
          .find((pageElement) => pageElement.getAttribute("data-page-key") === targetPageKey)
          ?.getBoundingClientRect() ??
          pageElements
            .find((pageElement) => pageElement.getAttribute("data-page-index") === String(target?.fragment.pageIndex))
          ?.getBoundingClientRect()
      },
    })
    if (startedAt !== null) {
      finishWysiwygPerfSpan(true, "text-engine-pointer-hit-test", startedAt, {
        nodeId,
        pageIndex,
        pointerTargetCount: activePointerFragmentTargets.length,
        source: offset === null ? "miss" : "hit",
      })
    }
    return offset
  }, [activePointerFragmentTargets, nodeId, pageIndex, scale, textMeasurer, traceHotPathPerf])

  const resolveTextEnginePointerOffset = useCallback((event: React.PointerEvent<SVGGElement> | React.MouseEvent<SVGGElement>): number | null => (
    resolveTextEnginePointerOffsetFromClientPoint(event.clientX, event.clientY)
  ), [resolveTextEnginePointerOffsetFromClientPoint])

  const applyPointerSelection = useCallback((anchorOffset: number, focusOffset: number, options: { syncToSession?: boolean } = {}) => {
    if (!onDraftChange) return false
    const startedAt = traceHotPathPerf ? startWysiwygPerfSpan() : null
    const syncToSession = options.syncToSession ?? true
    verticalCaretXRef.current = null
    verticalCaretLineAffinityRef.current = null
    const text = draftStateRef.current.text
    const previewSelection = localPointerSelectionPreviewRef.current
    const resolved = resolveWysiwygPointerSelectionState({
      text,
      anchorOffset,
      focusOffset,
      currentCaretOffset: syncToSession
        ? draftStateRef.current.caretOffset
        : previewSelection?.focusOffset ?? draftStateRef.current.caretOffset,
      currentSelection: syncToSession
        ? draftStateRef.current.selection
        : previewSelection ?? draftStateRef.current.selection,
    })
    if (!resolved.changed) {
      if (startedAt !== null) {
        finishWysiwygPerfSpan(true, "text-engine-pointer-selection-apply", startedAt, {
          nodeId,
          pageIndex,
          textLength: text.length,
          selectionRangeLength: resolved.selectionRangeLength,
          selectionCollapsed: resolved.selection.anchorOffset === resolved.selection.focusOffset,
          source: syncToSession ? "duplicate" : "preview-duplicate",
        })
      }
      return false
    }
    if (!syncToSession) {
      setLocalPointerSelectionPreview(resolved.selection)
      if (startedAt !== null) {
        finishWysiwygPerfSpan(true, "text-engine-pointer-selection-apply", startedAt, {
          nodeId,
          pageIndex,
          textLength: text.length,
          selectionRangeLength: resolved.selectionRangeLength,
          selectionCollapsed: resolved.selection.anchorOffset === resolved.selection.focusOffset,
          source: "preview",
        })
      }
      return true
    }
    setLocalPointerSelectionPreview(resolved.selection)
    draftStateRef.current = {
      text,
      caretOffset: resolved.caretOffset,
      selection: resolved.selection,
    }
    if (shouldUseFlowdocDraftLines) {
      setFlowdocDraftSnapshot({
        text,
        caretOffset: resolved.caretOffset,
        selection: resolved.selection,
      })
    }
    const textarea = nativeTextareaRef.current
    if (textarea) {
      const start = Math.max(0, Math.min(resolved.selection.anchorOffset, text.length))
      const end = Math.max(0, Math.min(resolved.selection.focusOffset, text.length))
      focusElementWithoutScroll(textarea)
      textarea.setSelectionRange(Math.min(start, end), Math.max(start, end), start === end ? "none" : start < end ? "forward" : "backward")
    }
    onDraftChange(nodeId, text, resolved.caretOffset, resolved.selection)
    if (startedAt !== null) {
      finishWysiwygPerfSpan(true, "text-engine-pointer-selection-apply", startedAt, {
        nodeId,
        pageIndex,
        textLength: text.length,
        selectionRangeLength: resolved.selectionRangeLength,
        selectionCollapsed: resolved.selection.anchorOffset === resolved.selection.focusOffset,
        source: "changed",
      })
    }
    return true
  }, [
    draftStateRef,
    nativeTextareaRef,
    nodeId,
    onDraftChange,
    pageIndex,
    setFlowdocDraftSnapshot,
    setLocalPointerSelectionPreview,
    shouldUseFlowdocDraftLines,
    traceHotPathPerf,
    verticalCaretLineAffinityRef,
    verticalCaretXRef,
  ])

  const applyPointerSelectionFromClientPoint = useCallback((clientX: number, clientY: number, options: { syncToSession?: boolean } = {}) => {
    if (pointerSelectionAnchorRef.current === null) return false
    const offset = resolveTextEnginePointerOffsetFromClientPoint(clientX, clientY)
    if (offset === null) return false
    return applyPointerSelection(pointerSelectionAnchorRef.current, offset, options)
  }, [applyPointerSelection, resolveTextEnginePointerOffsetFromClientPoint])

  const cancelScheduledPointerSelection = useCallback(() => {
    if (scheduledPointerSelectionFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(scheduledPointerSelectionFrameRef.current)
    }
    scheduledPointerSelectionFrameRef.current = null
    scheduledPointerSelectionPointRef.current = null
    scheduledPointerSelectionStartedAtRef.current = null
  }, [])

  const schedulePointerSelectionFromClientPoint = useCallback((clientX: number, clientY: number) => {
    if (pointerSelectionAnchorRef.current === null) return false
    scheduledPointerSelectionPointRef.current = { clientX, clientY }
    if (scheduledPointerSelectionFrameRef.current !== null) return true
    scheduledPointerSelectionStartedAtRef.current = traceHotPathPerf ? startWysiwygPerfSpan() : null
    if (typeof requestAnimationFrame === "undefined") {
      scheduledPointerSelectionPointRef.current = null
      scheduledPointerSelectionStartedAtRef.current = null
      return applyPointerSelectionFromClientPoint(clientX, clientY)
    }
    scheduledPointerSelectionFrameRef.current = requestAnimationFrame(() => {
      scheduledPointerSelectionFrameRef.current = null
      const startedAt = scheduledPointerSelectionStartedAtRef.current
      scheduledPointerSelectionStartedAtRef.current = null
      const point = scheduledPointerSelectionPointRef.current
      scheduledPointerSelectionPointRef.current = null
      const applied = point ? applyPointerSelectionFromClientPoint(point.clientX, point.clientY, { syncToSession: false }) : false
      if (startedAt !== null) {
        finishWysiwygPerfSpan(true, "text-engine-pointer-frame", startedAt, {
          nodeId,
          pageIndex,
          pointerTargetCount: activePointerFragmentTargets.length,
          source: applied ? "applied" : "skipped",
        })
      }
    })
    return true
  }, [activePointerFragmentTargets.length, applyPointerSelectionFromClientPoint, nodeId, pageIndex, traceHotPathPerf])

  const maybeStartPointerSelectionDrag = useCallback((clientX: number, clientY: number) => {
    const startPoint = pointerDragStartPointRef.current
    if (!startPoint || isPointerSelecting) return
    const dx = clientX - startPoint.x
    const dy = clientY - startPoint.y
    if (Math.sqrt(dx * dx + dy * dy) < POINTER_SELECTION_DRAG_THRESHOLD_PX) return
    setIsPointerSelecting(true)
  }, [isPointerSelecting])

  const finishPointerSelection = useCallback((clientX: number, clientY: number) => {
    cancelScheduledPointerSelection()
    applyPointerSelectionFromClientPoint(clientX, clientY)
    if (activePointerIdRef.current !== null) {
      safelyReleasePointerCapture(document.body, activePointerIdRef.current)
    }
    pointerSelectionAnchorRef.current = null
    activePointerIdRef.current = null
    pointerDragStartPointRef.current = null
    setIsPointerSelecting(false)
  }, [applyPointerSelectionFromClientPoint, cancelScheduledPointerSelection])

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (pointerSelectionAnchorRef.current === null) return
      maybeStartPointerSelectionDrag(event.clientX, event.clientY)
      event.preventDefault()
      schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
    }

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (pointerSelectionAnchorRef.current === null) return
      maybeStartPointerSelectionDrag(event.clientX, event.clientY)
      event.preventDefault()
      schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
    }

    const finishWindowPointerSelection = (event: PointerEvent) => {
      finishPointerSelection(event.clientX, event.clientY)
    }

    const finishWindowMouseSelection = (event: MouseEvent) => {
      finishPointerSelection(event.clientX, event.clientY)
    }

    window.addEventListener("pointermove", handleWindowPointerMove, true)
    window.addEventListener("pointerup", finishWindowPointerSelection, true)
    window.addEventListener("pointercancel", finishWindowPointerSelection, true)
    window.addEventListener("mousemove", handleWindowMouseMove, true)
    window.addEventListener("mouseup", finishWindowMouseSelection, true)
    document.addEventListener("pointermove", handleWindowPointerMove, true)
    document.addEventListener("pointerup", finishWindowPointerSelection, true)
    document.addEventListener("pointercancel", finishWindowPointerSelection, true)
    document.addEventListener("mousemove", handleWindowMouseMove, true)
    document.addEventListener("mouseup", finishWindowMouseSelection, true)
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true)
      window.removeEventListener("pointerup", finishWindowPointerSelection, true)
      window.removeEventListener("pointercancel", finishWindowPointerSelection, true)
      window.removeEventListener("mousemove", handleWindowMouseMove, true)
      window.removeEventListener("mouseup", finishWindowMouseSelection, true)
      document.removeEventListener("pointermove", handleWindowPointerMove, true)
      document.removeEventListener("pointerup", finishWindowPointerSelection, true)
      document.removeEventListener("pointercancel", finishWindowPointerSelection, true)
      document.removeEventListener("mousemove", handleWindowMouseMove, true)
      document.removeEventListener("mouseup", finishWindowMouseSelection, true)
    }
  }, [
    finishPointerSelection,
    maybeStartPointerSelectionDrag,
    schedulePointerSelectionFromClientPoint,
  ])

  useEffect(() => () => cancelScheduledPointerSelection(), [cancelScheduledPointerSelection])

  useEffect(() => {
    if (isPointerSelecting) return
    const previewSelection = localPointerSelectionPreviewRef.current
    if (!previewSelection) return
    if (!areWysiwygTextSelectionsEqual(previewSelection, selection)) return
    setLocalPointerSelectionPreview(null)
  }, [isPointerSelecting, selection, setLocalPointerSelectionPreview])

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation()
    event.preventDefault()
    focusElementWithoutScroll(inputBridgeRef.current)
    const offset = resolveTextEnginePointerOffset(event)
    if (offset === null) return
    if (event.detail >= 2) {
      pointerSelectionAnchorRef.current = null
      const wordSelection = resolveWysiwygWordSelectionRange(draftStateRef.current.text, offset)
      if (wordSelection) {
        applyPointerSelection(wordSelection.anchorOffset, wordSelection.focusOffset)
        return
      }
    }
    pointerSelectionAnchorRef.current = offset
    activePointerIdRef.current = event.pointerId
    pointerDragStartPointRef.current = { x: event.clientX, y: event.clientY }
    applyPointerSelection(offset, offset)
  }, [applyPointerSelection, draftStateRef, inputBridgeRef, resolveTextEnginePointerOffset])

  const selectWordFromPointerEvent = useCallback((event: React.MouseEvent<SVGGElement>) => {
    focusElementWithoutScroll(inputBridgeRef.current)
    pointerSelectionAnchorRef.current = null
    const offset = resolveTextEnginePointerOffset(event)
    const wordSelection = resolveWysiwygWordSelectionRange(draftStateRef.current.text, offset)
    if (!wordSelection) return false
    return applyPointerSelection(wordSelection.anchorOffset, wordSelection.focusOffset)
  }, [applyPointerSelection, draftStateRef, inputBridgeRef, resolveTextEnginePointerOffset])

  const handleDoubleClick = useCallback((event: React.MouseEvent<SVGGElement>) => {
    event.stopPropagation()
    event.preventDefault()
    selectWordFromPointerEvent(event)
  }, [selectWordFromPointerEvent])

  const handleClick = useCallback((event: React.MouseEvent<SVGGElement>) => {
    event.stopPropagation()
    if (event.detail < 2) return
    event.preventDefault()
    selectWordFromPointerEvent(event)
  }, [selectWordFromPointerEvent])

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGGElement>) => {
    if (pointerSelectionAnchorRef.current === null || (event.buttons & 1) === 0) return
    maybeStartPointerSelectionDrag(event.clientX, event.clientY)
    event.stopPropagation()
    event.preventDefault()
    schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
  }, [maybeStartPointerSelectionDrag, schedulePointerSelectionFromClientPoint])

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGGElement>) => {
    if (pointerSelectionAnchorRef.current === null) return
    event.stopPropagation()
    finishPointerSelection(event.clientX, event.clientY)
  }, [finishPointerSelection])

  const handlePointerCancel = useCallback(() => {
    if (activePointerIdRef.current !== null) {
      safelyReleasePointerCapture(document.body, activePointerIdRef.current)
    }
    cancelScheduledPointerSelection()
    setLocalPointerSelectionPreview(null)
    pointerSelectionAnchorRef.current = null
    activePointerIdRef.current = null
    pointerDragStartPointRef.current = null
    setIsPointerSelecting(false)
  }, [cancelScheduledPointerSelection, setLocalPointerSelectionPreview])

  const handlePointerSelectionWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const scrolled = scrollEditorCanvasByPointerSelectionWheel({
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
    })
    if (!scrolled) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return {
    activePointerIdRef,
    cancelScheduledPointerSelection,
    finishPointerSelection,
    handleClick,
    handleDoubleClick,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerSelectionWheel,
    handlePointerUp,
    isPointerSelecting,
    localPointerSelectionPreview,
    pointerDragStartPointRef,
    pointerSelectionAnchorRef,
    schedulePointerSelectionFromClientPoint,
    setIsPointerSelecting,
  }
}
