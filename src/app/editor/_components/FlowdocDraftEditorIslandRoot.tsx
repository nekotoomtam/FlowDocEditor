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
  type ClipboardEvent as ReactClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ProfilerOnRenderCallback,
} from "react"
import { flushSync } from "react-dom"
import { getTextRunParagraphText } from "@/document"
import type { TextMeasurer } from "@/layout"
import { resolvePaginatedLineBaselineY, type PageFragment, type PaginatedLine, type PaginatedPage, type ParagraphRenderProps } from "@/pagination"
import type { ParagraphNode } from "@/schema"
import { resolveFontCssFamily } from "@/font-registry"
import { buildSplitEditInput, buildWysiwygDraftParagraphLayout, resolveWysiwygPointerSelectionState } from "./ParagraphTextSurface"
import {
  resolveCaretOffsetFromPointInFragment,
  resolveCollapsedCaretOverlayInFragment,
  resolveVerticalCaretNavigationInFragments,
  resolveSelectionOverlayRectsInFragment,
  type WysiwygVerticalCaretLineAffinity,
} from "./wysiwygCaretMapping"
import {
  applyWysiwygTextClipboardCut,
  applyWysiwygTextInputKey,
  applyWysiwygTextInputText,
  areWysiwygTextSelectionsEqual,
  clampWysiwygTextOffset,
  getWysiwygTextSelectedText,
  type WysiwygTextInputKey,
  type WysiwygTextSelection,
} from "./useWysiwygTextSession"
import { hasPlatformShortcutModifier, normalizeShortcutKey } from "./keyboardShortcuts"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { splitWysiwygDraftVisualFragments } from "./wysiwygDraftVisualPreview"
import {
  classifyWysiwygTextReflow,
  shouldPatchPlainParagraphBoundaryHeightPreview,
  type WysiwygTextReflowDecision,
} from "./wysiwygReflow"
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
  pages?: PaginatedPage[] | null
  scale: number
  textMeasurer: TextMeasurer
  draftText: string | null
  caretOffset: number | null
  selection: WysiwygTextSelection | null
  getPageElement: (pageKey: string) => HTMLElement | null
  getPageKeyByPageIndex?: (pageIndex: number) => string | null
  onDraftChange: (nodeId: string, text: string, caretOffset: number | null, selection?: WysiwygTextSelection | null) => void
  onHeightChange?: (nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => void
  onReflowDecision?: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
  onEndEdit: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph?: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph?: (nodeId: string, text?: string) => void
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

interface DraftIslandSurface {
  key: string
  pageKey: string
  fragment: PageFragment
}

export interface DraftIslandHeightPreviewState {
  key: string
  height: number
}

interface DraftIslandPointerSelectionDrag {
  pointerId: number
  anchorOffset: number
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
  userSelect: "none",
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

function draftSelectionRange(current: DraftIslandState): { start: number; end: number; isCollapsed: boolean } {
  const caretOffset = clampWysiwygTextOffset(current.text, current.caretOffset) ?? current.text.length
  const anchorOffset = clampWysiwygTextOffset(current.text, current.selection?.anchorOffset) ?? caretOffset
  const focusOffset = clampWysiwygTextOffset(current.text, current.selection?.focusOffset) ?? caretOffset
  const start = Math.min(anchorOffset, focusOffset)
  const end = Math.max(anchorOffset, focusOffset)
  return { start, end, isCollapsed: start === end }
}

function safelySetDraftIslandPointerCapture(element: SVGSVGElement | null | undefined, pointerId: number): void {
  try {
    element?.setPointerCapture?.(pointerId)
  } catch {
    // Pointer capture is best-effort; the island still owns hit testing when the
    // browser has already released or rejected the pointer.
  }
}

function safelyReleaseDraftIslandPointerCapture(element: SVGSVGElement | null | undefined, pointerId: number): void {
  try {
    element?.releasePointerCapture?.(pointerId)
  } catch {
    // The pointer may already be released by pointerup/cancel/lostcapture.
  }
}

function clearBrowserTextSelection(): void {
  if (typeof window === "undefined") return
  window.getSelection()?.removeAllRanges()
}

function isSelectAllShortcut(event: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; code?: string; key: string }): boolean {
  if (event.altKey || (!event.ctrlKey && !event.metaKey)) return false
  return event.code === "KeyA" || event.key.toLowerCase() === "a"
}

function isVerticalNavigationKey(key: string): key is "ArrowUp" | "ArrowDown" {
  return key === "ArrowUp" || key === "ArrowDown"
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

function resolveDraftLineRangeAttrs(lines: PaginatedLine[]): Array<{ start: number | null; end: number | null }> {
  const ranges = lines.map(lineRangeAttrs)
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (ranges[lineIndex].start != null && ranges[lineIndex].end != null) continue
    if (lines[lineIndex].text.length > 0) continue

    let previousIndex = -1
    for (let candidateIndex = lineIndex - 1; candidateIndex >= 0; candidateIndex -= 1) {
      if (ranges[candidateIndex].end != null) {
        previousIndex = candidateIndex
        break
      }
    }
    if (previousIndex >= 0) {
      const previousEnd = ranges[previousIndex].end ?? 0
      const offset = previousEnd + (lineIndex - previousIndex)
      ranges[lineIndex] = { start: offset, end: offset }
      continue
    }

    let nextIndex = -1
    for (let candidateIndex = lineIndex + 1; candidateIndex < ranges.length; candidateIndex += 1) {
      if (ranges[candidateIndex].start != null) {
        nextIndex = candidateIndex
        break
      }
    }
    if (nextIndex >= 0) {
      const nextStart = ranges[nextIndex].start ?? 0
      const offset = Math.max(0, nextStart - (nextIndex - lineIndex))
      ranges[lineIndex] = { start: offset, end: offset }
      continue
    }

    ranges[lineIndex] = { start: lineIndex, end: lineIndex }
  }
  return ranges
}

function renderDraftLine(input: {
  line: PaginatedLine
  index: number
  renderProps: ParagraphRenderProps | undefined
  range?: { start: number | null; end: number | null }
}) {
  const { line, index, renderProps } = input
  const baseY = resolvePaginatedLineBaselineY(line)
  const range = input.range ?? lineRangeAttrs(line)
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

function draftIslandSurfaceKey(fragment: PageFragment): string {
  return [
    fragment.pageIndex,
    fragment.fragmentIndex ?? "x",
    fragment.lineStart ?? "x",
    fragment.lineEnd ?? "x",
    fragment.continuesFrom ? "from" : "source",
    fragment.isContinued ? "continued" : "final",
  ].join(":")
}

function resolveDraftIslandSurfaceHeightPt(sourceFragment: PageFragment, draftFragment: PageFragment): number {
  if (
    draftFragment.pageIndex === sourceFragment.pageIndex &&
    draftFragment.continuesFrom !== true
  ) {
    return resolveDraftIslandCoverHeightPt(sourceFragment, draftFragment.height)
  }
  return Math.max(ISLAND_MIN_HEIGHT_PT, draftFragment.height)
}

function totalDraftIslandLineCount(fragments: PageFragment[]): number {
  return fragments.reduce((sum, fragment) => sum + (fragment.lines?.length ?? 0), 0)
}

function resolveDraftIslandFragmentForCaret(
  fragments: PageFragment[],
  caretOffset: number | null,
): PageFragment | null {
  if (fragments.length === 0) return null
  if (caretOffset == null) return fragments[0]
  for (const fragment of fragments) {
    if (fragment.lineStart == null || fragment.lineEnd == null) continue
    if (caretOffset >= fragment.lineStart && caretOffset <= fragment.lineEnd) return fragment
  }
  return fragments[fragments.length - 1]
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
  pages,
  scale,
  textMeasurer,
  draftText,
  caretOffset,
  selection,
  getPageElement,
  getPageKeyByPageIndex,
  onDraftChange,
  onHeightChange,
  onReflowDecision,
  onEndEdit,
  onSplitParagraph,
  onMergeParagraph,
}: FlowdocDraftEditorIslandRootProps) {
  const inputBridgeRef = useRef<HTMLTextAreaElement | null>(null)
  const latestDraftRef = useRef<DraftIslandState | null>(null)
  const parentSyncedRevisionRef = useRef<number>(-1)
  const parentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressNextUnmountParentSyncRef = useRef(false)
  const lastHeightPreviewRef = useRef<DraftIslandHeightPreviewState | null>(null)
  const heightPreviewFrameRef = useRef<number | null>(null)
  const lastInputStartedAtRef = useRef<number | null>(null)
  const latestPageRectByPageKeyRef = useRef<Map<string, IslandPosition>>(new Map())
  const latestSurfacesRef = useRef<DraftIslandSurface[]>([])
  const pointerSelectionDragRef = useRef<DraftIslandPointerSelectionDrag | null>(null)
  const verticalCaretXRef = useRef<number | null>(null)
  const verticalCaretLineAffinityRef = useRef<WysiwygVerticalCaretLineAffinity | null>(null)
  const pageBoundaryReflowRequestRef = useRef<string | null>(null)
  const onEndEditRef = useRef(onEndEdit)
  onEndEditRef.current = onEndEdit
  const [draftState, setDraftState] = useState<DraftIslandState | null>(() => (
    active && nodeId && paragraph
      ? createDraftIslandState({ nodeId, paragraph, draftText, caretOffset, selection })
      : null
  ))
  const [positionsByPageKey, setPositionsByPageKey] = useState<Record<string, IslandPosition>>({})

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

  const draftFragments = useMemo<PageFragment[]>(() => {
    if (!fragment || !draftLayout) return []
    if (pages && pages.length > 0) {
      return splitWysiwygDraftVisualFragments({
        sourceFragment: fragment,
        draftLines: draftLayout.lines,
        draftHeight: draftLayout.height,
        pages,
      })
    }
    return [{
      ...fragment,
      height: draftLayout.height,
      lines: draftLayout.lines,
    }]
  }, [draftLayout, fragment, pages])

  const draftReflowDecision = useMemo(() => {
    if (!fragment || !draftLayout) return null
    const sourcePage = pages?.find((page) => page.index === fragment.pageIndex) ?? null
    return classifyWysiwygTextReflow({
      fragment,
      draftLines: draftLayout.lines,
      draftHeight: draftLayout.height,
      pageContentBottom: sourcePage ? sourcePage.contentBox.y + sourcePage.contentBox.height : null,
      supportsLocalDraftLayout: !fragment.continuesFrom,
      supportsSamePageHeightPatch: onHeightChange != null,
    })
  }, [draftLayout, fragment, onHeightChange, pages])

  const draftSurfaces = useMemo<DraftIslandSurface[]>(() => {
    if (!fragment || !pageKey) return []
    return draftFragments
      .map((draftFragment): DraftIslandSurface | null => {
        const surfacePageKey = draftFragment.pageIndex === fragment.pageIndex
          ? pageKey
          : getPageKeyByPageIndex?.(draftFragment.pageIndex) ?? null
        if (!surfacePageKey) return null
        return {
          key: draftIslandSurfaceKey(draftFragment),
          pageKey: surfacePageKey,
          fragment: draftFragment,
        }
      })
      .filter((surface): surface is DraftIslandSurface => surface !== null)
  }, [draftFragments, fragment, getPageKeyByPageIndex, pageKey])

  useEffect(() => {
    latestSurfacesRef.current = draftSurfaces
  }, [draftSurfaces])

  const activeDraftFragment = useMemo(() => (
    resolveDraftIslandFragmentForCaret(draftFragments, draftState?.caretOffset ?? null)
  ), [draftFragments, draftState?.caretOffset])

  const sourceDraftFragment = draftFragments.find((candidate) => (
    candidate.pageIndex === fragment?.pageIndex &&
    candidate.continuesFrom !== true
  )) ?? draftFragments[0] ?? null
  const visualHeightPt = sourceDraftFragment && fragment
    ? resolveDraftIslandVisualHeightPt(fragment, sourceDraftFragment.height)
    : 0
  const totalLineCount = totalDraftIslandLineCount(draftFragments)
  const isPageBoundaryPreview = draftFragments.length > 1 || draftReflowDecision?.kind === "hard-page-boundary"

  useEffect(() => {
    if (!active || !nodeId || !fragment || !onHeightChange) return
    const shouldPatchBoundaryHeight = shouldPatchPlainParagraphBoundaryHeightPreview({
      isFlowStackParagraph: false,
      isTableCellParagraph: false,
      reflow: draftReflowDecision,
    })
    if (draftReflowDecision && !draftReflowDecision.shouldPatchSamePageHeight && !shouldPatchBoundaryHeight) return
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
      onHeightChange(nodeId, visualHeightPt, fragment.pageIndex, draftReflowDecision ?? undefined)
    })
    heightPreviewFrameRef.current = frameId
    return () => {
      if (heightPreviewFrameRef.current !== frameId) return
      window.cancelAnimationFrame(frameId)
      heightPreviewFrameRef.current = null
    }
  }, [active, draftReflowDecision, fragment, nodeId, onHeightChange, visualHeightPt])

  const updatePosition = useCallback(() => {
    if (!active || draftSurfaces.length === 0) {
      latestPageRectByPageKeyRef.current = new Map()
      setPositionsByPageKey({})
      return
    }
    const nextByPageKey = new Map<string, IslandPosition>()
    const nextRecord: Record<string, IslandPosition> = {}
    for (const surface of draftSurfaces) {
      const pageElement = getPageElement(surface.pageKey)
      if (!pageElement) continue
      const pageRect = pageElement.getBoundingClientRect()
      const next: IslandPosition = {
        left: pageRect.left + surface.fragment.x * scale,
        top: pageRect.top + surface.fragment.y * scale,
        width: Math.max(1, surface.fragment.width * scale),
        pageLeft: pageRect.left,
        pageTop: pageRect.top,
      }
      nextByPageKey.set(surface.pageKey, next)
      nextRecord[surface.pageKey] = next
    }
    latestPageRectByPageKeyRef.current = nextByPageKey
    setPositionsByPageKey((current) => {
      const currentKeys = Object.keys(current)
      const nextKeys = Object.keys(nextRecord)
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => {
          const a = current[key]
          const b = nextRecord[key]
          return a &&
            Math.abs(a.left - b.left) < 0.5 &&
            Math.abs(a.top - b.top) < 0.5 &&
            Math.abs(a.width - b.width) < 0.5 &&
            Math.abs(a.pageLeft - b.pageLeft) < 0.5 &&
            Math.abs(a.pageTop - b.pageTop) < 0.5
        })
      ) {
        return current
      }
      return nextRecord
    })
  }, [active, draftSurfaces, getPageElement, scale])

  useLayoutEffect(() => {
    updatePosition()
    if (!active) return undefined
    const pageElements = draftSurfaces
      .map((surface) => getPageElement(surface.pageKey))
      .filter((element): element is HTMLElement => element !== null)
    const resizeObserver = typeof ResizeObserver !== "undefined" && pageElements.length > 0
      ? new ResizeObserver(updatePosition)
      : null
    if (resizeObserver) {
      for (const pageElement of pageElements) resizeObserver.observe(pageElement)
    }
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [active, draftSurfaces, getPageElement, updatePosition])

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

  useEffect(() => {
    if (
      !active ||
      !nodeId ||
      !fragment ||
      !draftReflowDecision ||
      draftReflowDecision.kind !== "hard-page-boundary" ||
      !draftReflowDecision.shouldQueueSettledPagination ||
      !onReflowDecision
    ) {
      return
    }
    const key = [
      nodeId,
      fragment.pageIndex ?? "null",
      "hard-page-boundary",
    ].join(":")
    if (pageBoundaryReflowRequestRef.current === key) return
    pageBoundaryReflowRequestRef.current = key
    flushParentDraft("page-boundary")
    onReflowDecision(nodeId, draftReflowDecision)
  }, [
    active,
    draftReflowDecision,
    flushParentDraft,
    fragment,
    nodeId,
    onReflowDecision,
  ])

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
    if (suppressNextUnmountParentSyncRef.current) {
      suppressNextUnmountParentSyncRef.current = false
      return
    }
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

  const resetVerticalCaretMemory = useCallback(() => {
    verticalCaretXRef.current = null
    verticalCaretLineAffinityRef.current = null
  }, [])

  const focusInputBridge = useCallback(() => {
    inputBridgeRef.current?.focus({ preventScroll: true })
  }, [])

  const clearInputBridgeText = useCallback(() => {
    if (inputBridgeRef.current) inputBridgeRef.current.value = ""
  }, [])

  const mirrorClipboardTextToInputBridge = useCallback((text: string) => {
    const bridge = inputBridgeRef.current
    if (!bridge) return false
    bridge.value = text
    focusInputBridge()
    bridge.setSelectionRange(0, text.length)
    window.setTimeout(() => {
      if (bridge.value === text) bridge.value = ""
    }, 250)
    return true
  }, [focusInputBridge])

  const applyTextInput = useCallback((insertedText: string, source: string) => {
    const current = latestDraftRef.current
    if (!current || !insertedText) return false
    resetVerticalCaretMemory()
    const change = applyWysiwygTextInputText(current.text, current.caretOffset, insertedText, current.selection)
    if (!change) return false
    return applyDraftChange(change, source)
  }, [applyDraftChange, resetVerticalCaretMemory])

  const getSelectedDraftText = useCallback(() => {
    const current = latestDraftRef.current
    if (!current) return ""
    return getWysiwygTextSelectedText(current.text, current.caretOffset, current.selection)
  }, [])

  const getClipboardCutDraft = useCallback(() => {
    const current = latestDraftRef.current
    if (!current) return null
    return applyWysiwygTextClipboardCut(current.text, current.caretOffset, current.selection)
  }, [])

  const applyClipboardCutToDraft = useCallback((cut = getClipboardCutDraft()) => {
    if (!cut) return null
    return applyDraftChange(cut.change, "clipboard-cut") ? cut.selectedText : null
  }, [applyDraftChange, getClipboardCutDraft])

  const applySelectAll = useCallback(() => {
    const current = latestDraftRef.current
    if (!current) return false
    resetVerticalCaretMemory()
    clearBrowserTextSelection()
    focusInputBridge()
    const end = current.text.length
    return applyDraftChange({
      text: current.text,
      caretOffset: end,
      selection: { anchorOffset: 0, focusOffset: end },
    }, "shortcut-select-all")
  }, [applyDraftChange, focusInputBridge, resetVerticalCaretMemory])

  const writeClipboardText = useCallback((text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return Promise.resolve(false)
    return navigator.clipboard.writeText(text).then(() => true, () => false)
  }, [])

  const reinforceClipboardText = useCallback((text: string) => {
    void writeClipboardText(text)
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        void writeClipboardText(text)
      }, 0)
      window.setTimeout(() => {
        void writeClipboardText(text)
      }, 50)
    }
  }, [writeClipboardText])

  const copyTextToClipboard = useCallback((text: string) => {
    const bridge = inputBridgeRef.current
    if (
      bridge &&
      typeof document !== "undefined" &&
      typeof document.execCommand === "function"
    ) {
      const previousValue = bridge.value
      const previousSelectionStart = bridge.selectionStart
      const previousSelectionEnd = bridge.selectionEnd
      bridge.value = text
      focusInputBridge()
      bridge.setSelectionRange(0, text.length)
      try {
        if (document.execCommand("copy")) {
          bridge.value = previousValue
          bridge.setSelectionRange(
            Math.min(previousSelectionStart, previousValue.length),
            Math.min(previousSelectionEnd, previousValue.length),
          )
          reinforceClipboardText(text)
          return Promise.resolve(true)
        }
      } catch {
        // Fall through to the async Clipboard API. The island remains the
        // source of truth; the hidden input is only a transport fallback.
      }
      bridge.value = previousValue
      bridge.setSelectionRange(
        Math.min(previousSelectionStart, previousValue.length),
        Math.min(previousSelectionEnd, previousValue.length),
      )
    }
    return writeClipboardText(text).then((written) => {
      if (written) reinforceClipboardText(text)
      return written
    })
  }, [focusInputBridge, reinforceClipboardText, writeClipboardText])

  const readClipboardText = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return Promise.resolve("")
    return navigator.clipboard.readText().then((text) => text, () => "")
  }, [])

  const handleClipboardShortcutKeyDown = useCallback((event: KeyboardEvent<Element>) => {
    if (isSelectAllShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      applySelectAll()
      return true
    }
    if (!hasPlatformShortcutModifier(event)) return false
    const key = normalizeShortcutKey(event)
    if (key !== "c" && key !== "x" && key !== "v") return false

    if (key === "v") {
      event.preventDefault()
      event.stopPropagation()
      void readClipboardText().then((pastedText) => {
        clearInputBridgeText()
        applyTextInput(pastedText, "clipboard-paste-shortcut")
      })
      return true
    }

    const cut = key === "x" ? getClipboardCutDraft() : null
    const selectedText = cut?.selectedText ?? getSelectedDraftText()
    if (!selectedText) return false
    if (key === "c") {
      clearBrowserTextSelection()
      mirrorClipboardTextToInputBridge(selectedText)
      return true
    }
    event.preventDefault()
    event.stopPropagation()
    clearBrowserTextSelection()
    focusInputBridge()
    void copyTextToClipboard(selectedText).then((written) => {
      if (written && cut) {
        applyClipboardCutToDraft(cut)
        clearInputBridgeText()
      }
    })
    return true
  }, [
    applyClipboardCutToDraft,
    applySelectAll,
    applyTextInput,
    clearInputBridgeText,
    getClipboardCutDraft,
    getSelectedDraftText,
    mirrorClipboardTextToInputBridge,
    readClipboardText,
    copyTextToClipboard,
    focusInputBridge,
  ])

  useEffect(() => {
    if (!active) return

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isSelectAllShortcut(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        applySelectAll()
        return
      }
      if (!hasPlatformShortcutModifier(event)) return
      const key = normalizeShortcutKey(event)
      if (key !== "c" && key !== "x" && key !== "v") return

      if (key === "v") {
        event.preventDefault()
        event.stopImmediatePropagation()
        void readClipboardText().then((pastedText) => {
          clearInputBridgeText()
          applyTextInput(pastedText, "clipboard-paste-document-key")
        })
        return
      }

      const cut = key === "x" ? getClipboardCutDraft() : null
      const selectedText = cut?.selectedText ?? getSelectedDraftText()
      if (!selectedText) return
      if (key === "c") {
        clearBrowserTextSelection()
        mirrorClipboardTextToInputBridge(selectedText)
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      clearBrowserTextSelection()
      focusInputBridge()
      void copyTextToClipboard(selectedText).then((written) => {
        if (written && cut) {
          applyClipboardCutToDraft(cut)
          clearInputBridgeText()
        }
      })
    }

    document.addEventListener("keydown", handleDocumentKeyDown, true)
    return () => document.removeEventListener("keydown", handleDocumentKeyDown, true)
  }, [
    active,
    applyClipboardCutToDraft,
    applySelectAll,
    applyTextInput,
    clearInputBridgeText,
    focusInputBridge,
    getClipboardCutDraft,
    getSelectedDraftText,
    mirrorClipboardTextToInputBridge,
    readClipboardText,
    copyTextToClipboard,
  ])

  const clearPendingParentSync = useCallback(() => {
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncTimerRef.current = null
  }, [])

  const applyStructuralEnter = useCallback((event: KeyboardEvent<Element> | null, current: DraftIslandState, source: string) => {
    if (!onSplitParagraph) return false
    if (event && (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing)) return false
    const range = draftSelectionRange(current)
    const splitInput = buildSplitEditInput("", current.text, range.start, range.end)
    clearPendingParentSync()
    pointerSelectionDragRef.current = null
    suppressNextUnmountParentSyncRef.current = true
    parentSyncedRevisionRef.current = current.revision
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-structural-edit",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: current.text.length,
      source,
      action: "split-paragraph",
    })
    onSplitParagraph(current.nodeId, splitInput.splitIndex, splitInput.text)
    return true
  }, [clearPendingParentSync, onSplitParagraph])

  const applyStructuralBackspace = useCallback((event: KeyboardEvent<Element>, current: DraftIslandState) => {
    if (!onMergeParagraph) return false
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return false
    const range = draftSelectionRange(current)
    if (!range.isCollapsed || range.start !== 0) return false
    clearPendingParentSync()
    pointerSelectionDragRef.current = null
    suppressNextUnmountParentSyncRef.current = true
    parentSyncedRevisionRef.current = current.revision
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-structural-edit",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: current.text.length,
      source: "key:Backspace",
      action: "merge-paragraph",
    })
    onMergeParagraph(current.nodeId, current.text)
    return true
  }, [clearPendingParentSync, onMergeParagraph])

  const applyVerticalKeyInput = useCallback((event: KeyboardEvent<Element>, current: DraftIslandState) => {
    if (draftFragments.length === 0 || !isVerticalNavigationKey(event.key)) return false
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false
    const caretOffset = clampWysiwygTextOffset(current.text, current.caretOffset) ?? current.text.length
    const navigation = resolveVerticalCaretNavigationInFragments(
      draftFragments,
      caretOffset,
      event.key === "ArrowUp" ? "up" : "down",
      {
        preferredX: verticalCaretXRef.current,
        lineAffinity: verticalCaretLineAffinityRef.current,
        textMeasurer,
      },
    )
    if (!navigation) return false

    verticalCaretXRef.current = navigation.preferredX
    verticalCaretLineAffinityRef.current = navigation.lineAffinity
    const selectionAnchor = event.shiftKey
      ? clampWysiwygTextOffset(current.text, current.selection?.anchorOffset) ?? caretOffset
      : navigation.offset
    return applyDraftChange({
      text: current.text,
      caretOffset: navigation.offset,
      selection: {
        anchorOffset: selectionAnchor,
        focusOffset: navigation.offset,
      },
    }, `key:${event.key}`)
  }, [applyDraftChange, draftFragments, textMeasurer])

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
    if (handleClipboardShortcutKeyDown(event)) return
    if (event.key === "Enter" && applyStructuralEnter(event, current, "key:Enter")) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.key === "Backspace" && applyStructuralBackspace(event, current)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (applyVerticalKeyInput(event, current)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!isVerticalNavigationKey(event.key)) resetVerticalCaretMemory()
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
  }, [
    applyDraftChange,
    applyStructuralBackspace,
    applyStructuralEnter,
    applyVerticalKeyInput,
    flushParentDraft,
    handleClipboardShortcutKeyDown,
    resetVerticalCaretMemory,
  ])

  const handleBeforeInput = useCallback((event: FormEvent<Element>) => {
    const nativeEvent = event.nativeEvent as InputEvent
    const current = latestDraftRef.current
    if (!current || nativeEvent.isComposing) return
    const inputType = nativeEvent.inputType
    let change: ReturnType<typeof applyWysiwygTextInputText> = null
    if (inputType === "insertText" && nativeEvent.data) {
      change = applyWysiwygTextInputText(current.text, current.caretOffset, nativeEvent.data, current.selection)
    } else if (inputType === "insertParagraph") {
      if (applyStructuralEnter(null, current, "beforeinput:insertParagraph")) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      change = applyWysiwygTextInputText(current.text, current.caretOffset, "\n", current.selection)
    }
    if (!change) return
    event.preventDefault()
    event.stopPropagation()
    applyDraftChange(change, `beforeinput:${inputType}`)
  }, [applyDraftChange, applyStructuralEnter])

  const handleInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    const insertedText = event.currentTarget.value
    event.currentTarget.value = ""
    applyTextInput(insertedText, "input-bridge-value")
  }, [applyTextInput])

  const handlePaste = useCallback((event: ReactClipboardEvent<Element>) => {
    const pastedText = event.clipboardData.getData("text/plain")
    if (!pastedText) return
    event.preventDefault()
    event.stopPropagation()
    clearInputBridgeText()
    applyTextInput(pastedText, "clipboard-paste")
  }, [applyTextInput, clearInputBridgeText])

  const handleCopy = useCallback((event: ReactClipboardEvent<Element>) => {
    const selectedText = getSelectedDraftText()
    if (!selectedText) return
    event.preventDefault()
    event.stopPropagation()
    clearBrowserTextSelection()
    event.clipboardData.setData("text/plain", selectedText)
    reinforceClipboardText(selectedText)
  }, [getSelectedDraftText, reinforceClipboardText])

  const handleCut = useCallback((event: ReactClipboardEvent<Element>) => {
    const cut = getClipboardCutDraft()
    if (!cut?.selectedText) return
    event.preventDefault()
    event.stopPropagation()
    clearBrowserTextSelection()
    event.clipboardData.setData("text/plain", cut.selectedText)
    applyClipboardCutToDraft(cut)
    clearInputBridgeText()
  }, [applyClipboardCutToDraft, clearInputBridgeText, getClipboardCutDraft])

  useEffect(() => {
    if (!active) return

    const handleDocumentCopy = (event: ClipboardEvent) => {
      const selectedText = getSelectedDraftText()
      if (!selectedText) return
      event.preventDefault()
      event.stopImmediatePropagation()
      clearBrowserTextSelection()
      focusInputBridge()
      event.clipboardData?.setData("text/plain", selectedText)
      reinforceClipboardText(selectedText)
    }

    const handleDocumentCut = (event: ClipboardEvent) => {
      const cut = getClipboardCutDraft()
      if (!cut?.selectedText) return
      event.preventDefault()
      event.stopImmediatePropagation()
      clearBrowserTextSelection()
      focusInputBridge()
      event.clipboardData?.setData("text/plain", cut.selectedText)
      void writeClipboardText(cut.selectedText)
      applyClipboardCutToDraft(cut)
      clearInputBridgeText()
    }

    const handleDocumentPaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData("text/plain")
      if (!pastedText) return
      event.preventDefault()
      event.stopImmediatePropagation()
      clearInputBridgeText()
      focusInputBridge()
      applyTextInput(pastedText, "clipboard-paste-document")
    }

    document.addEventListener("copy", handleDocumentCopy, true)
    document.addEventListener("cut", handleDocumentCut, true)
    document.addEventListener("paste", handleDocumentPaste, true)
    return () => {
      document.removeEventListener("copy", handleDocumentCopy, true)
      document.removeEventListener("cut", handleDocumentCut, true)
      document.removeEventListener("paste", handleDocumentPaste, true)
    }
  }, [
    active,
    applyClipboardCutToDraft,
    applyTextInput,
    clearInputBridgeText,
    focusInputBridge,
    getClipboardCutDraft,
    getSelectedDraftText,
    reinforceClipboardText,
    writeClipboardText,
  ])

  const resolvePointerCandidate = useCallback((input: { clientX: number; clientY: number; currentTarget?: EventTarget | null }, source: string) => {
    if (!fragment) return null
    const targetElement = input.currentTarget instanceof SVGElement ? input.currentTarget : null
    const targetPageKey = targetElement?.getAttribute("data-wysiwyg-island-page-key") ?? null
    const surfaces = latestSurfacesRef.current
    const surface = (targetPageKey ? surfaces.find((candidate) => candidate.pageKey === targetPageKey) : null) ??
      surfaces[0] ??
      null
    if (!surface) return null
    const pagePosition = latestPageRectByPageKeyRef.current.get(surface.pageKey) ?? positionsByPageKey[surface.pageKey]
    if (!pagePosition) return null
    const point = {
      x: (input.clientX - pagePosition.pageLeft) / scale,
      y: (input.clientY - pagePosition.pageTop) / scale,
    }
    const startedAt = startWysiwygPerfSpan()
    const candidate = resolveCaretOffsetFromPointInFragment(surface.fragment, point, { textMeasurer })
    const current = latestDraftRef.current
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-pointer-hit-test",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: current?.nodeId ?? surface.fragment.nodeId,
      pageIndex: surface.fragment.pageIndex,
      draftVersion: current?.revision,
      source: `${source}:${candidate?.source ?? "miss"}`,
    })
    return candidate
  }, [fragment, positionsByPageKey, scale, textMeasurer])

  const applyPointerSelection = useCallback((anchorOffset: number, focusOffset: number, source: string) => {
    const current = latestDraftRef.current
    if (!current) return false
    const resolved = resolveWysiwygPointerSelectionState({
      text: current.text,
      anchorOffset,
      focusOffset,
      currentCaretOffset: current.caretOffset,
      currentSelection: current.selection,
    })
    if (!resolved.changed) return false
    applyDraftChange({
      text: current.text,
      caretOffset: resolved.caretOffset,
      selection: resolved.selection,
    }, source)
    clearBrowserTextSelection()
    focusInputBridge()
    return true
  }, [applyDraftChange, focusInputBridge])

  const handlePointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    resetVerticalCaretMemory()
    focusInputBridge()
    const candidate = resolvePointerCandidate(event, "pointer-down")
    if (!candidate) return
    pointerSelectionDragRef.current = {
      pointerId: event.pointerId,
      anchorOffset: candidate.offset,
    }
    safelySetDraftIslandPointerCapture(event.currentTarget, event.pointerId)
    applyPointerSelection(candidate.offset, candidate.offset, "pointer-select-start")
  }, [applyPointerSelection, focusInputBridge, resetVerticalCaretMemory, resolvePointerCandidate])

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const drag = pointerSelectionDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const candidate = resolvePointerCandidate(event, "pointer-move")
    if (!candidate) return
    applyPointerSelection(drag.anchorOffset, candidate.offset, "pointer-select-drag")
  }, [applyPointerSelection, resolvePointerCandidate])

  const finishPointerSelection = useCallback((event: PointerEvent<SVGSVGElement>, source: string) => {
    const drag = pointerSelectionDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const candidate = resolvePointerCandidate(event, source)
    if (candidate) {
      applyPointerSelection(drag.anchorOffset, candidate.offset, "pointer-select-end")
    }
    pointerSelectionDragRef.current = null
    safelyReleaseDraftIslandPointerCapture(event.currentTarget, event.pointerId)
  }, [applyPointerSelection, resolvePointerCandidate])

  const handlePointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    finishPointerSelection(event, "pointer-up")
  }, [finishPointerSelection])

  const handlePointerCancel = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (pointerSelectionDragRef.current?.pointerId === event.pointerId) {
      pointerSelectionDragRef.current = null
    }
    safelyReleaseDraftIslandPointerCapture(event.currentTarget, event.pointerId)
  }, [])

  const handleBlur = useCallback(() => {
    pointerSelectionDragRef.current = null
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncTimerRef.current = null
    if (suppressNextUnmountParentSyncRef.current) return
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
      lineCount: totalLineCount,
      paragraphHeight: activeDraftFragment?.height,
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
        lineCount: totalLineCount,
        paragraphHeight: activeDraftFragment?.height ?? undefined,
        source: "input-to-island-visible-lines",
      })
      lastInputStartedAtRef.current = null
    }
  }, [activeDraftFragment?.height, totalLineCount])

  if (!active || !nodeId || !paragraph || !fragment || !pageKey || !draftState || draftSurfaces.length === 0 || !draftLayout) {
    return null
  }

  const renderProps = fragment.renderProps
  const selectionStart = draftState.selection?.anchorOffset ?? draftState.caretOffset ?? undefined
  const selectionEnd = draftState.selection?.focusOffset ?? draftState.caretOffset ?? undefined
  const selectedDraftTextLength = draftState.selection && draftState.selection.anchorOffset !== draftState.selection.focusOffset
    ? getWysiwygTextSelectedText(draftState.text, draftState.caretOffset, draftState.selection).length
    : 0
  const totalSelectionOverlayCount = draftState.selection && draftState.selection.anchorOffset !== draftState.selection.focusOffset
    ? draftSurfaces.reduce((sum, surface) => (
      sum + resolveSelectionOverlayRectsInFragment(surface.fragment, draftState.selection!.anchorOffset, draftState.selection!.focusOffset, { textMeasurer }).length
    ), 0)
    : 0
  const firstSurfacePosition = positionsByPageKey[draftSurfaces[0]?.pageKey ?? ""]
  const inputBridgeStyle: CSSProperties = {
    ...hiddenInputBridgeStyle,
    left: firstSurfacePosition?.left ?? -10000,
    top: firstSurfacePosition?.top ?? -10000,
  }

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
          onPaste={handlePaste}
          onCopy={handleCopy}
          onCut={handleCut}
          onBlur={handleBlur}
        />
        {draftSurfaces.map((surface, surfaceIndex) => {
          const surfaceFragment = surface.fragment
          const surfaceHeightPt = resolveDraftIslandSurfaceHeightPt(fragment, surfaceFragment)
          const position = positionsByPageKey[surface.pageKey]
          const caret = resolveCollapsedCaretOverlayInFragment(surfaceFragment, draftState.caretOffset ?? draftState.text.length, { textMeasurer })
          const selectionRects = draftState.selection && draftState.selection.anchorOffset !== draftState.selection.focusOffset
            ? resolveSelectionOverlayRectsInFragment(surfaceFragment, draftState.selection.anchorOffset, draftState.selection.focusOffset, { textMeasurer })
            : []
          const draftLineRanges = resolveDraftLineRangeAttrs(surfaceFragment.lines ?? [])
          const svgStyle: CSSProperties = {
            ...islandSvgStyle,
            left: position?.left ?? -10000,
            top: position?.top ?? -10000,
            width: position?.width ?? Math.max(1, surfaceFragment.width * scale),
            height: Math.max(1, surfaceHeightPt * scale),
            display: position ? "block" : "none",
          }
          const viewBox = `${surfaceFragment.x} ${surfaceFragment.y} ${surfaceFragment.width} ${surfaceHeightPt}`
          return (
            <svg
              key={surface.key}
              data-wysiwyg-draft-editor-island="true"
              data-wysiwyg-out-of-canvas-island="true"
              data-wysiwyg-text-engine-layer="true"
              data-wysiwyg-active-visual-mode="flowdoc-draft-editor-island"
              data-wysiwyg-active-visual-detail="out-of-canvas-v2"
              data-wysiwyg-island-page-key={surface.pageKey}
              data-page-index={surfaceFragment.pageIndex}
              data-wysiwyg-island-surface-index={surfaceIndex}
              data-wysiwyg-island-fragment-count={draftSurfaces.length}
              data-wysiwyg-island-page-boundary-preview={isPageBoundaryPreview ? "true" : "false"}
              data-wysiwyg-island-reflow-kind={draftReflowDecision?.kind ?? undefined}
              data-wysiwyg-island-reflow-reason={draftReflowDecision?.reason ?? undefined}
              data-wysiwyg-line-count={surfaceFragment.lines?.length ?? 0}
              data-wysiwyg-flowdoc-draft-line-count={surfaceFragment.lines?.length ?? 0}
              data-wysiwyg-flowdoc-draft-total-line-count={totalLineCount}
              data-wysiwyg-flowdoc-draft-text-length={draftState.text.length}
              data-wysiwyg-flowdoc-draft-caret-offset={draftState.caretOffset ?? undefined}
              data-wysiwyg-flowdoc-draft-selection-start={selectionStart}
              data-wysiwyg-flowdoc-draft-selection-end={selectionEnd}
              data-wysiwyg-flowdoc-draft-selected-text-length={selectedDraftTextLength}
              data-wysiwyg-flowdoc-draft-selection-collapsed={String(!draftState.selection || draftState.selection.anchorOffset === draftState.selection.focusOffset)}
              data-wysiwyg-native-visible-text="false"
              data-wysiwyg-custom-caret-visible={caret ? "true" : undefined}
              data-wysiwyg-hidden-input-bridge="true"
              data-wysiwyg-flowdoc-draft-clipboard="true"
              data-wysiwyg-visible-pointer-owner="flowdoc-draft-island-v2"
              data-wysiwyg-flowdoc-draft-pointer-selection="true"
              data-wysiwyg-flowdoc-draft-selection-overlay-count={totalSelectionOverlayCount}
              data-wysiwyg-flowdoc-draft-surface-selection-overlay-count={selectionRects.length}
              data-wysiwyg-live-echo-suppressed="true"
              data-wysiwyg-draft-text-replacement-active={undefined}
              data-inline-edit-node-id={nodeId}
              data-inline-edit-visual-mode="flowdoc-draft-editor-island"
              data-wysiwyg-island-revision={draftState.revision}
              data-wysiwyg-island-parent-sync-debounce-ms={ISLAND_PARENT_SYNC_DEBOUNCE_MS}
              viewBox={viewBox}
              style={svgStyle}
              tabIndex={surfaceIndex === 0 ? 0 : -1}
              role="textbox"
              aria-multiline="true"
              onKeyDown={handleKeyDown}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onLostPointerCapture={handlePointerCancel}
              onPaste={handlePaste}
              onCopy={handleCopy}
              onCut={handleCut}
              onBlur={handleBlur}
            >
              <rect
                data-wysiwyg-out-of-canvas-cover="true"
                x={surfaceFragment.x}
                y={surfaceFragment.y}
                width={surfaceFragment.width}
                height={surfaceHeightPt}
                fill="#ffffff"
                pointerEvents="none"
              />
              <rect
                data-wysiwyg-hit-area="true"
                data-wysiwyg-draft-editor-island-hit-area="true"
                x={surfaceFragment.x}
                y={surfaceFragment.y}
                width={surfaceFragment.width}
                height={surfaceHeightPt}
                fill="transparent"
                pointerEvents="all"
              />
              <rect
                data-wysiwyg-draft-editor-island-outline="true"
                x={surfaceFragment.x}
                y={surfaceFragment.y}
                width={surfaceFragment.width}
                height={surfaceHeightPt}
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
                {surfaceFragment.lines?.map((line, index) => renderDraftLine({ line, index, renderProps, range: draftLineRanges[index] }))}
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
          )
        })}
      </>
    </Profiler>
  )
}
