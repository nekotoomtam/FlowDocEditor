"use client"

import {
  Profiler,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ProfilerOnRenderCallback,
} from "react"
import { flushSync } from "react-dom"
import { getTextRunParagraphText } from "@/document"
import type { TextMeasurer } from "@/layout"
import { resolvePaginatedLineBaselineY, type PageFragment, type PaginatedLine, type ParagraphRenderProps } from "@/pagination"
import type { ParagraphNode } from "@/schema"
import { resolveFontCssFamily } from "@/font-registry"
import { buildWysiwygDraftParagraphLayout } from "./ParagraphTextSurface"
import {
  resolveCaretOffsetFromPointInFragment,
  resolveCollapsedCaretOverlayInFragment,
  resolveSelectionOverlayRectsInFragment,
} from "./wysiwygCaretMapping"
import {
  applyWysiwygTextInputKey,
  applyWysiwygTextInputText,
  areWysiwygTextSelectionsEqual,
  type WysiwygTextInputKey,
  type WysiwygTextSelection,
} from "./useWysiwygTextSession"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import {
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
} from "./wysiwygPerformance"

interface FlowdocDraftEditorIslandRootProps {
  active: boolean
  nodeId: string | null
  paragraph: ParagraphNode | null
  fragment: PageFragment | null
  pageKey: string | null
  scale: number
  textMeasurer: TextMeasurer
  draftText: string | null
  caretOffset: number | null
  selection: WysiwygTextSelection | null
  getPageElement: (pageKey: string) => HTMLElement | null
  onDraftChange: (nodeId: string, text: string, caretOffset: number | null, selection?: WysiwygTextSelection | null) => void
  onHeightChange?: (nodeId: string, height: number, pageIndex: number | null) => void
  onEndEdit: (nodeId: string, reason?: "blur" | "keyboard") => void
}

interface DraftIslandState {
  nodeId: string
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null
  revision: number
}

interface IslandPosition {
  left: number
  top: number
  width: number
  pageLeft: number
  pageTop: number
}

export interface DraftIslandHeightPreviewState {
  key: string
  height: number
}

const ISLAND_PARENT_SYNC_DEBOUNCE_MS = 240
const ISLAND_MIN_HEIGHT_PT = 1
const ISLAND_Z_INDEX = 8000

const islandSvgStyle: CSSProperties = {
  position: "fixed",
  overflow: "visible",
  pointerEvents: "auto",
  zIndex: ISLAND_Z_INDEX,
  color: "#111827",
  cursor: "text",
}

const hiddenInputBridgeStyle: CSSProperties = {
  position: "fixed",
  width: 1,
  height: 1,
  opacity: 0,
  border: 0,
  padding: 0,
  margin: 0,
  outline: "none",
  background: "transparent",
  color: "transparent",
  caretColor: "transparent",
  pointerEvents: "none",
  overflow: "hidden",
  whiteSpace: "pre",
  resize: "none",
  zIndex: ISLAND_Z_INDEX + 1,
}

function collapsedSelection(caretOffset: number | null): WysiwygTextSelection | null {
  if (caretOffset == null) return null
  return { anchorOffset: caretOffset, focusOffset: caretOffset }
}

function createDraftIslandState(input: {
  nodeId: string
  paragraph: ParagraphNode
  draftText: string | null
  caretOffset: number | null
  selection: WysiwygTextSelection | null
}): DraftIslandState {
  const baseText = getTextRunParagraphText(input.paragraph) ?? ""
  const text = input.draftText ?? baseText
  const caretOffset = input.caretOffset ?? text.length
  return {
    nodeId: input.nodeId,
    text,
    caretOffset,
    selection: input.selection ?? collapsedSelection(caretOffset),
    revision: 0,
  }
}

function textAnchorForAlign(align: ParagraphRenderProps["align"] | undefined): "start" | "middle" | "end" {
  if (align === "center") return "middle"
  if (align === "right") return "end"
  return "start"
}

function lineX(line: PaginatedLine, align: ParagraphRenderProps["align"] | undefined): number {
  if (align === "center") return line.x + line.width / 2
  if (align === "right") return line.x + line.width
  return line.x
}

function fontWeightForRenderProps(renderProps: ParagraphRenderProps | undefined): number | undefined {
  return renderProps?.fontWeight === "bold" ? 700 : undefined
}

function fontStyleForRenderProps(renderProps: ParagraphRenderProps | undefined): "italic" | undefined {
  return renderProps?.fontStyle === "italic" ? "italic" : undefined
}

function textDecorationForRenderProps(renderProps: ParagraphRenderProps | undefined): string | undefined {
  const decorations: string[] = []
  if (renderProps?.textDecoration === "underline") decorations.push("underline")
  if (renderProps?.strikethrough) decorations.push("line-through")
  return decorations.length > 0 ? decorations.join(" ") : undefined
}

type RenderableLineRun = NonNullable<PaginatedLine["runs"]>[number]

function fontWeightForLineRun(run: RenderableLineRun): number | undefined {
  return run.style.fontWeight === "bold" ? 700 : undefined
}

function fontStyleForLineRun(run: RenderableLineRun): "italic" | undefined {
  return run.style.fontStyle === "italic" ? "italic" : undefined
}

function textDecorationForLineRun(run: RenderableLineRun): string | undefined {
  const decorations: string[] = []
  if (run.style.textDecoration === "underline") decorations.push("underline")
  if (run.style.strikethrough) decorations.push("line-through")
  return decorations.length > 0 ? decorations.join(" ") : undefined
}

function lineRangeAttrs(line: PaginatedLine): { start: number | null; end: number | null } {
  const ranges = [
    ...(line.segments ?? []).map((segment) => ({ start: segment.start, end: segment.end })),
    ...(line.runs ?? []).map((run) => ({ start: run.start, end: run.end })),
  ].filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
  if (ranges.length === 0) return { start: null, end: null }
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  }
}

function renderDraftLine(input: {
  line: PaginatedLine
  index: number
  renderProps: ParagraphRenderProps | undefined
}) {
  const { line, index, renderProps } = input
  const baseY = resolvePaginatedLineBaselineY(line)
  const range = lineRangeAttrs(line)
  if (line.runs?.length) {
    return (
      <g key={index} data-wysiwyg-flowdoc-draft-line="true" data-wysiwyg-draft-line-start={range.start ?? undefined} data-wysiwyg-draft-line-end={range.end ?? undefined}>
        {line.runs
          .filter((run) => run.text.trim() !== "")
          .map((run, runIndex) => (
            <text
              key={runIndex}
              xmlSpace="preserve"
              x={line.x + run.x}
              y={baseY}
              fontSize={run.style.fontSize}
              fontFamily={resolveFontCssFamily(run.style.fontFamilyKey)}
              fontWeight={fontWeightForLineRun(run)}
              fontStyle={fontStyleForLineRun(run)}
              textDecoration={textDecorationForLineRun(run)}
              fill={`#${run.style.textColor}`}
              style={{ whiteSpace: "pre" }}
            >
              {run.text}
            </text>
          ))}
      </g>
    )
  }

  return (
    <text
      key={index}
      data-wysiwyg-flowdoc-draft-line="true"
      data-wysiwyg-draft-line-start={range.start ?? undefined}
      data-wysiwyg-draft-line-end={range.end ?? undefined}
      x={lineX(line, renderProps?.align)}
      y={baseY}
      fontSize={line.fontSize ?? renderProps?.fontSize ?? 8}
      fontFamily={resolveFontCssFamily(renderProps?.fontFamilyKey)}
      fontWeight={fontWeightForRenderProps(renderProps)}
      fontStyle={fontStyleForRenderProps(renderProps)}
      textDecoration={textDecorationForRenderProps(renderProps)}
      textAnchor={textAnchorForAlign(renderProps?.align)}
      fill={`#${renderProps?.textColor ?? "111827"}`}
      xmlSpace="preserve"
      style={{ whiteSpace: "pre" }}
    >
      {line.text}
    </text>
  )
}

function resolveDraftIslandVisualHeightPt(fragment: PageFragment, draftHeight: number | null): number {
  return Math.max(ISLAND_MIN_HEIGHT_PT, draftHeight ?? fragment.height)
}

function resolveDraftIslandCoverHeightPt(fragment: PageFragment, draftHeight: number | null): number {
  return Math.max(resolveDraftIslandVisualHeightPt(fragment, draftHeight), fragment.height)
}

export function shouldReportDraftIslandHeightPreview(input: {
  previous: DraftIslandHeightPreviewState | null
  key: string
  nextHeight: number
  fragmentHeight: number
  threshold?: number
}): boolean {
  const threshold = input.threshold ?? 0.5
  if (!input.previous || input.previous.key !== input.key) {
    return Math.abs(input.nextHeight - input.fragmentHeight) >= threshold
  }
  return Math.abs(input.nextHeight - input.previous.height) >= threshold
}

export function FlowdocDraftEditorIslandRoot({
  active,
  nodeId,
  paragraph,
  fragment,
  pageKey,
  scale,
  textMeasurer,
  draftText,
  caretOffset,
  selection,
  getPageElement,
  onDraftChange,
  onHeightChange,
  onEndEdit,
}: FlowdocDraftEditorIslandRootProps) {
  const inputBridgeRef = useRef<HTMLTextAreaElement | null>(null)
  const latestDraftRef = useRef<DraftIslandState | null>(null)
  const parentSyncedRevisionRef = useRef<number>(-1)
  const parentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHeightPreviewRef = useRef<DraftIslandHeightPreviewState | null>(null)
  const heightPreviewFrameRef = useRef<number | null>(null)
  const lastInputStartedAtRef = useRef<number | null>(null)
  const latestPageRectRef = useRef<IslandPosition | null>(null)
  const onEndEditRef = useRef(onEndEdit)
  onEndEditRef.current = onEndEdit
  const [draftState, setDraftState] = useState<DraftIslandState | null>(() => (
    active && nodeId && paragraph
      ? createDraftIslandState({ nodeId, paragraph, draftText, caretOffset, selection })
      : null
  ))
  const [position, setPosition] = useState<IslandPosition | null>(null)

  useEffect(() => {
    if (!active || !nodeId || !paragraph) {
      latestDraftRef.current = null
      parentSyncedRevisionRef.current = -1
      setDraftState(null)
      return
    }
    setDraftState((current) => {
      if (current?.nodeId === nodeId) return current
      const next = createDraftIslandState({ nodeId, paragraph, draftText, caretOffset, selection })
      latestDraftRef.current = next
      parentSyncedRevisionRef.current = next.revision
      return next
    })
  }, [active, caretOffset, draftText, nodeId, paragraph, selection])

  useEffect(() => {
    latestDraftRef.current = draftState
  }, [draftState])

  const draftLayout = useMemo(() => {
    if (!active || !fragment || !paragraph || !draftState) return null
    const startedAt = startWysiwygPerfSpan()
    const layout = buildWysiwygDraftParagraphLayout(fragment, paragraph, draftState.text, textMeasurer, {
      allowContinuedFirstFragment: true,
      traceMeasure: true,
    })
    const durationMs = Math.max(0, startWysiwygPerfSpan() - startedAt)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-draft-measure",
      startedAt,
      durationMs,
      nodeId: fragment.nodeId,
      pageIndex: fragment.pageIndex,
      draftVersion: draftState.revision,
      textLength: draftState.text.length,
      lineCount: layout?.lines.length ?? 0,
      availableWidth: fragment.width,
      paragraphHeight: layout?.height ?? fragment.height,
      source: "out-of-canvas-v2",
    })
    return layout
  }, [active, draftState, fragment, paragraph, textMeasurer])

  const draftFragment = useMemo<PageFragment | null>(() => {
    if (!fragment || !draftLayout) return null
    return {
      ...fragment,
      height: draftLayout.height,
      lines: draftLayout.lines,
    }
  }, [draftLayout, fragment])

  const visualHeightPt = fragment ? resolveDraftIslandVisualHeightPt(fragment, draftLayout?.height ?? null) : 0
  const islandHeightPt = fragment ? resolveDraftIslandCoverHeightPt(fragment, draftLayout?.height ?? null) : 0

  useEffect(() => {
    if (!active || !nodeId || !fragment || !onHeightChange) return
    const key = `${nodeId}:${fragment.pageIndex ?? "null"}`
    if (!shouldReportDraftIslandHeightPreview({
      previous: lastHeightPreviewRef.current,
      key,
      nextHeight: visualHeightPt,
      fragmentHeight: fragment.height,
    })) {
      return
    }
    lastHeightPreviewRef.current = { key, height: visualHeightPt }
    if (heightPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(heightPreviewFrameRef.current)
      heightPreviewFrameRef.current = null
    }
    const frameId = window.requestAnimationFrame(() => {
      heightPreviewFrameRef.current = null
      onHeightChange(nodeId, visualHeightPt, fragment.pageIndex)
    })
    heightPreviewFrameRef.current = frameId
    return () => {
      if (heightPreviewFrameRef.current !== frameId) return
      window.cancelAnimationFrame(frameId)
      heightPreviewFrameRef.current = null
    }
  }, [active, fragment, nodeId, onHeightChange, visualHeightPt])

  const updatePosition = useCallback(() => {
    if (!active || !fragment || !pageKey) {
      latestPageRectRef.current = null
      setPosition(null)
      return
    }
    const pageElement = getPageElement(pageKey)
    if (!pageElement) {
      latestPageRectRef.current = null
      setPosition(null)
      return
    }
    const pageRect = pageElement.getBoundingClientRect()
    const next: IslandPosition = {
      left: pageRect.left + fragment.x * scale,
      top: pageRect.top + fragment.y * scale,
      width: Math.max(1, fragment.width * scale),
      pageLeft: pageRect.left,
      pageTop: pageRect.top,
    }
    latestPageRectRef.current = next
    setPosition((current) => (
      current &&
      Math.abs(current.left - next.left) < 0.5 &&
      Math.abs(current.top - next.top) < 0.5 &&
      Math.abs(current.width - next.width) < 0.5 &&
      Math.abs(current.pageLeft - next.pageLeft) < 0.5 &&
      Math.abs(current.pageTop - next.pageTop) < 0.5
        ? current
        : next
    ))
  }, [active, fragment, getPageElement, pageKey, scale])

  useLayoutEffect(() => {
    updatePosition()
    if (!active) return undefined
    const pageElement = pageKey ? getPageElement(pageKey) : null
    const resizeObserver = typeof ResizeObserver !== "undefined" && pageElement
      ? new ResizeObserver(updatePosition)
      : null
    if (resizeObserver && pageElement) resizeObserver.observe(pageElement)
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [active, getPageElement, pageKey, updatePosition])

  useEffect(() => {
    if (!active) return
    inputBridgeRef.current?.focus({ preventScroll: true })
  }, [active, nodeId])

  const flushParentDraft = useCallback((source: string) => {
    const current = latestDraftRef.current
    if (!current || parentSyncedRevisionRef.current === current.revision) return
    parentSyncedRevisionRef.current = current.revision
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-parent-sync",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: current.text.length,
      source,
    })
    if (source === "blur" || source === "keyboard-exit") {
      flushSync(() => {
        onDraftChange(current.nodeId, current.text, current.caretOffset, current.selection)
      })
      return
    }
    onDraftChange(current.nodeId, current.text, current.caretOffset, current.selection)
  }, [onDraftChange])

  const scheduleParentSync = useCallback(() => {
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncTimerRef.current = setTimeout(() => {
      parentSyncTimerRef.current = null
      flushParentDraft("idle-debounce")
    }, ISLAND_PARENT_SYNC_DEBOUNCE_MS)
  }, [flushParentDraft])

  useEffect(() => () => {
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncTimerRef.current = null
    flushParentDraft("unmount")
  }, [flushParentDraft])

  const applyDraftChange = useCallback((change: { text: string; caretOffset?: number | null; selection?: WysiwygTextSelection | null } | null, source: string) => {
    if (!change) return false
    const startedAt = startWysiwygPerfSpan()
    const current = latestDraftRef.current
    if (!current) return false
    const nextCaretOffset = change.caretOffset ?? current.caretOffset
    const nextSelection = change.selection ?? collapsedSelection(nextCaretOffset)
    if (
      current.text === change.text &&
      current.caretOffset === nextCaretOffset &&
      areWysiwygTextSelectionsEqual(current.selection, nextSelection)
    ) {
      return false
    }
    const next = {
      ...current,
      text: change.text,
      caretOffset: nextCaretOffset,
      selection: nextSelection,
      revision: current.revision + 1,
    }
    latestDraftRef.current = next
    setDraftState(next)
    lastInputStartedAtRef.current = startedAt
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-input",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: latestDraftRef.current?.nodeId,
      draftVersion: latestDraftRef.current?.revision,
      textLength: latestDraftRef.current?.text.length,
      source,
      active: true,
    })
    scheduleParentSync()
    return true
  }, [scheduleParentSync])

  const focusInputBridge = useCallback(() => {
    inputBridgeRef.current?.focus({ preventScroll: true })
  }, [])

  const handleKeyDown = useCallback((event: KeyboardEvent<Element>) => {
    const current = latestDraftRef.current
    if (!current) return
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
      parentSyncTimerRef.current = null
      flushParentDraft("keyboard-exit")
      window.setTimeout(() => onEndEditRef.current(current.nodeId, "keyboard"), 0)
      return
    }
    const input: WysiwygTextInputKey = {
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
    }
    const change = applyWysiwygTextInputKey(current.text, current.caretOffset, input, current.selection)
    if (!change) return
    event.preventDefault()
    event.stopPropagation()
    applyDraftChange(change, `key:${event.key}`)
  }, [applyDraftChange, flushParentDraft])

  const handleBeforeInput = useCallback((event: FormEvent<Element>) => {
    const nativeEvent = event.nativeEvent as InputEvent
    const current = latestDraftRef.current
    if (!current || nativeEvent.isComposing) return
    const inputType = nativeEvent.inputType
    let change: ReturnType<typeof applyWysiwygTextInputText> = null
    if (inputType === "insertText" && nativeEvent.data) {
      change = applyWysiwygTextInputText(current.text, current.caretOffset, nativeEvent.data, current.selection)
    } else if (inputType === "insertParagraph") {
      change = applyWysiwygTextInputText(current.text, current.caretOffset, "\n", current.selection)
    }
    if (!change) return
    event.preventDefault()
    event.stopPropagation()
    applyDraftChange(change, `beforeinput:${inputType}`)
  }, [applyDraftChange])

  const handleInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    const current = latestDraftRef.current
    const insertedText = event.currentTarget.value
    event.currentTarget.value = ""
    if (!current || !insertedText) return
    const change = applyWysiwygTextInputText(current.text, current.caretOffset, insertedText, current.selection)
    if (!change) return
    applyDraftChange(change, "input-bridge-value")
  }, [applyDraftChange])

  const handlePointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (!draftFragment || !draftState || !fragment) return
    event.preventDefault()
    event.stopPropagation()
    focusInputBridge()
    const pagePosition = latestPageRectRef.current ?? position
    if (!pagePosition) return
    const point = {
      x: (event.clientX - pagePosition.pageLeft) / scale,
      y: (event.clientY - pagePosition.pageTop) / scale,
    }
    const startedAt = startWysiwygPerfSpan()
    const candidate = resolveCaretOffsetFromPointInFragment(draftFragment, point, { textMeasurer })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-pointer-hit-test",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: draftState.nodeId,
      pageIndex: fragment.pageIndex,
      draftVersion: draftState.revision,
      source: candidate?.source ?? "miss",
    })
    if (!candidate) return
    applyDraftChange({
      text: draftState.text,
      caretOffset: candidate.offset,
      selection: collapsedSelection(candidate.offset),
    }, "pointer-hit-test")
  }, [applyDraftChange, draftFragment, draftState, focusInputBridge, fragment, position, scale, textMeasurer])

  const handleBlur = useCallback(() => {
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncTimerRef.current = null
    flushParentDraft("blur")
    const current = latestDraftRef.current
    if (!current) return
    window.setTimeout(() => onEndEditRef.current(current.nodeId, "blur"), 0)
  }, [flushParentDraft])

  const handleIslandRender = useCallback<ProfilerOnRenderCallback>((
    _id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    const current = latestDraftRef.current
    const inputStartedAt = lastInputStartedAtRef.current
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      nodeId: current?.nodeId,
      draftVersion: current?.revision,
      textLength: current?.text.length,
      lineCount: draftFragment?.lines?.length ?? 0,
      paragraphHeight: draftFragment?.height,
      source: phase,
    })
    if (inputStartedAt !== null && current) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-island-visible-lines",
        startedAt: inputStartedAt,
        durationMs: Math.max(0, commitTime - inputStartedAt),
        nodeId: current.nodeId,
        draftVersion: current.revision,
        textLength: current.text.length,
        lineCount: draftFragment?.lines?.length ?? 0,
        paragraphHeight: draftFragment?.height ?? undefined,
        source: "input-to-island-visible-lines",
      })
      lastInputStartedAtRef.current = null
    }
  }, [draftFragment])

  if (!active || !nodeId || !paragraph || !fragment || !pageKey || !draftState || !draftFragment || !draftLayout) {
    return null
  }

  const renderProps = fragment.renderProps
  const caret = resolveCollapsedCaretOverlayInFragment(draftFragment, draftState.caretOffset ?? draftState.text.length, { textMeasurer })
  const selectionStart = draftState.selection?.anchorOffset ?? draftState.caretOffset ?? undefined
  const selectionEnd = draftState.selection?.focusOffset ?? draftState.caretOffset ?? undefined
  const selectionRects = draftState.selection && draftState.selection.anchorOffset !== draftState.selection.focusOffset
    ? resolveSelectionOverlayRectsInFragment(draftFragment, draftState.selection.anchorOffset, draftState.selection.focusOffset, { textMeasurer })
    : []
  const svgStyle: CSSProperties = {
    ...islandSvgStyle,
    left: position?.left ?? -10000,
    top: position?.top ?? -10000,
    width: position?.width ?? Math.max(1, fragment.width * scale),
    height: Math.max(1, islandHeightPt * scale),
    display: position ? "block" : "none",
  }
  const inputBridgeStyle: CSSProperties = {
    ...hiddenInputBridgeStyle,
    left: position?.left ?? -10000,
    top: position?.top ?? -10000,
  }
  const viewBox = `${fragment.x} ${fragment.y} ${fragment.width} ${islandHeightPt}`

  return (
    <Profiler id="flowdoc-draft-editor-island-v2" onRender={handleIslandRender}>
      <>
        <textarea
          ref={inputBridgeRef}
          data-wysiwyg-input-bridge="true"
          data-wysiwyg-input-bridge-mode="hidden-flowdoc-draft-editor-island-v2"
          data-wysiwyg-visible-area-pointer-target="false"
          data-inline-edit-node-id={nodeId}
          spellCheck={false}
          role="textbox"
          aria-label="WYSIWYG text input"
          style={inputBridgeStyle}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleBeforeInput}
          onInput={handleInput}
          onBlur={handleBlur}
        />
        <svg
          data-wysiwyg-draft-editor-island="true"
          data-wysiwyg-out-of-canvas-island="true"
          data-wysiwyg-text-engine-layer="true"
          data-wysiwyg-active-visual-mode="flowdoc-draft-editor-island"
          data-wysiwyg-active-visual-detail="out-of-canvas-v2"
          data-wysiwyg-line-count={draftFragment.lines?.length ?? 0}
          data-wysiwyg-flowdoc-draft-line-count={draftFragment.lines?.length ?? 0}
          data-wysiwyg-flowdoc-draft-text-length={draftState.text.length}
          data-wysiwyg-flowdoc-draft-caret-offset={draftState.caretOffset ?? undefined}
          data-wysiwyg-flowdoc-draft-selection-start={selectionStart}
          data-wysiwyg-flowdoc-draft-selection-end={selectionEnd}
          data-wysiwyg-flowdoc-draft-selection-collapsed={String(!draftState.selection || draftState.selection.anchorOffset === draftState.selection.focusOffset)}
          data-wysiwyg-native-visible-text="false"
          data-wysiwyg-custom-caret-visible={caret ? "true" : undefined}
          data-wysiwyg-hidden-input-bridge="true"
          data-wysiwyg-visible-pointer-owner="flowdoc-draft-island-v2"
          data-wysiwyg-live-echo-suppressed="true"
          data-wysiwyg-draft-text-replacement-active={undefined}
          data-inline-edit-node-id={nodeId}
          data-inline-edit-visual-mode="flowdoc-draft-editor-island"
          data-wysiwyg-island-revision={draftState.revision}
          data-wysiwyg-island-parent-sync-debounce-ms={ISLAND_PARENT_SYNC_DEBOUNCE_MS}
          viewBox={viewBox}
          style={svgStyle}
          tabIndex={0}
          role="textbox"
          aria-multiline="true"
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onBlur={handleBlur}
        >
          <rect
            data-wysiwyg-out-of-canvas-cover="true"
            x={fragment.x}
            y={fragment.y}
            width={fragment.width}
            height={islandHeightPt}
            fill="#ffffff"
            pointerEvents="none"
          />
          <rect
            data-wysiwyg-hit-area="true"
            data-wysiwyg-draft-editor-island-hit-area="true"
            x={fragment.x}
            y={fragment.y}
            width={fragment.width}
            height={islandHeightPt}
            fill="transparent"
            pointerEvents="all"
          />
          <rect
            data-wysiwyg-draft-editor-island-outline="true"
            x={fragment.x}
            y={fragment.y}
            width={fragment.width}
            height={islandHeightPt}
            fill="none"
            stroke="#2563eb"
            strokeWidth={1}
            opacity={0.42}
            pointerEvents="none"
          />
          {selectionRects.length > 0 ? (
            <g data-wysiwyg-selection-overlay="true" pointerEvents="none">
              {selectionRects.map((rect, index) => (
                <rect
                  key={index}
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill="#bfdbfe"
                  opacity={0.58}
                />
              ))}
            </g>
          ) : null}
          <g data-wysiwyg-flowdoc-draft-lines="true" pointerEvents="none">
            {draftFragment.lines?.map((line, index) => renderDraftLine({ line, index, renderProps }))}
          </g>
          {caret ? (
            <line
              data-wysiwyg-caret="true"
              x1={caret.x1}
              y1={caret.y1}
              x2={caret.x2}
              y2={caret.y2}
              stroke="#2563eb"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ) : null}
        </svg>
      </>
    </Profiler>
  )
}
