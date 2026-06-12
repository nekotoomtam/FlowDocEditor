"use client"

import {
  createContext,
  memo,
  Profiler,
  useContext,
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
  type MouseEvent,
  type PointerEvent,
  type ProfilerOnRenderCallback,
  type FocusEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

import { getTextRunParagraphText } from "@/document"
import type { TextMeasurer } from "@/layout"
import type { PageFragment, PaginatedPage, ParagraphRenderProps } from "@/pagination"
import type { ParagraphNode } from "@/schema"
import { buildSplitEditInput } from "./inlineEditSurfaceState"
import {
  buildCachedWysiwygDraftParagraphLayout,
  createWysiwygDraftParagraphLayoutCacheKey,
  createWysiwygDraftParagraphLayoutCache,
  type WysiwygDraftParagraphLayout,
} from "./wysiwygDraftParagraphLayout"
import {
  resolveWysiwygPointerSelectionState,
  resolveWysiwygWordSelectionRange,
} from "./wysiwygTextSelectionState"
import {
  resolveCaretOffsetFromPointInFragment,
  resolveCollapsedCaretOverlayInFragment,
  resolveVerticalCaretNavigationInFragments,
  resolveSelectionOverlayRectsInFragment,
  type WysiwygVerticalCaretLineAffinity,
} from "./wysiwygCaretMapping"
import {
  ISLAND_CONTINUATION_BOUNDARY_CLEARANCE_PT,
  draftIslandSurfaceKey,
  renderDraftLine,
  resolveDraftIslandFragmentForCaret,
  resolveDraftIslandSurfaceChromeHeightPt,
  resolveDraftIslandSurfaceHeightPt,
  resolveDraftIslandVisualHeightPt,
  resolveDraftLineRangeAttrs,
  totalDraftIslandLineCount,
} from "./FlowdocDraftIslandRenderPrimitives"
import {
  ISLAND_STRUCTURAL_EDIT_GUARD_TIMEOUT_MS,
  resolveDraftIslandStructuralGuardUnlockReason,
  shouldDropDraftIslandStructuralKeyForGuard,
  type DraftIslandStructuralEditGuard,
  type DraftIslandStructuralEditGuardUnlockReason,
  type DraftIslandStructuralEditOperation,
} from "./flowdocDraftIslandStructuralGuard"
import {
  applyWysiwygTextClipboardCut,
  applyWysiwygTextInputKey,
  applyWysiwygTextInputText,
  areWysiwygTextSelectionsEqual,
  clampWysiwygTextOffset,
  getWysiwygTextSelectedText,
  type WysiwygTextInputKey,
  type WysiwygTextSelection,
  type WysiwygLocalDraftSnapshot,
} from "./useWysiwygTextSession"
import { hasPlatformShortcutModifier, normalizeShortcutKey } from "./keyboardShortcuts"
import {
  WYSIWYG_ISLAND_REACT_LIVE_ATTRS_ENABLED,
  WYSIWYG_ISLAND_SURFACE_LIVE_LAYER_ENABLED,
  WYSIWYG_PERF_TRACE_ENABLED,
} from "./wysiwygInlineEditConfig"
import { splitWysiwygDraftVisualFragments } from "./wysiwygDraftVisualPreview"
import {
  classifyWysiwygDraftFragmentSplitTelemetry,
  resolveWysiwygDraftFragmentSplitReuse,
  type WysiwygDraftFragmentSplitReuseState,
  type WysiwygDraftFragmentSplitTraceState,
} from "./wysiwygDraftFragmentSplitTelemetry"
import {
  classifyWysiwygDraftIslandRootRenderTelemetry,
  type WysiwygDraftIslandRootRenderTraceState,
} from "./wysiwygDraftIslandRootRenderTelemetry"
import {
  classifyWysiwygDraftIslandSurfaceRenderTelemetry,
  type WysiwygDraftIslandSurfaceRenderTraceState,
} from "./wysiwygDraftIslandSurfaceRenderTelemetry"
import {
  classifyWysiwygTextReflow,
  shouldPatchPlainParagraphBoundaryHeightPreview,
  type WysiwygTextReflowDecision,
} from "./wysiwygReflow"
import {
  registerWysiwygDraftFlushHandler,
  useWysiwygDraftStoreForNode,
  wysiwygDraftStore,
} from "./shell/wysiwygDraftStore"
import {
  recordWysiwygPerfAttributionEvent,
  recordWysiwygPerfEvent,
  finishWysiwygPerfSpan,
  startWysiwygPerfSpan,
} from "./wysiwygPerformance"
import type {
  StructuralEditRuntime,
  StructuralGuardDecision,
  StructuralGuardInput,
} from "./runtime/structuralEditRuntime"

type DraftIslandStructuralRuntime = Pick<
  StructuralEditRuntime,
  "beginStructuralEdit" | "canStartStructuralEdit" | "markKeyRepeatDropped"
>

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
  onDraftChange: (nodeId: string, text: string, caretOffset: number | null, selection?: WysiwygTextSelection | null, source?: string, revision?: number) => void
  onHeightChange?: (nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => void
  onReflowDecision?: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
  onRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey, overrideSnapshot?: WysiwygLocalDraftSnapshot) => boolean
  onEndEdit: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph?: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph?: (nodeId: string, text?: string) => void
  onRequestUndo?: () => void
  onCompositionChange?: (nodeId: string, isComposing: boolean) => void
  structuralRefocusStartedAt?: number | null
  onStructuralRefocusPainted?: (nodeId: string) => void
  structuralEditRuntime?: DraftIslandStructuralRuntime
}

interface DraftIslandState {
  nodeId: string
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null
  revision: number
}

interface DraftIslandSurface {
  key: string
  pageKey: string
  fragment: PageFragment
}

interface DraftIslandVisualLinesProps {
  surfaceFragment: PageFragment
  renderProps: ParagraphRenderProps | undefined
}

type DraftIslandSurfaceAnchorMode = "page-overlay" | "inline-fallback"
type DraftIslandSurfaceLiveLayerMode = "inline" | "detached"

interface DraftIslandSurfaceViewProps {
  surface: DraftIslandSurface
  surfaceIndex: number
  sourceFragment: PageFragment
  renderProps: ParagraphRenderProps | undefined
  scale: number
  nodeId: string
  draftRevision: number
  draftTextLength: number
  draftCaretOffset: number | null
  selectionStart: number | undefined
  selectionEnd: number | undefined
  selectionAnchorOffset: number | null
  selectionFocusOffset: number | null
  selectedDraftTextLength: number
  totalSelectionOverlayCount: number
  totalLineCount: number
  draftSurfaceCount: number
  isPageBoundaryPreview: boolean
  reflowKind: string | undefined
  reflowReason: string | undefined
  committing: boolean
  anchorMode: DraftIslandSurfaceAnchorMode
  textMeasurer: TextMeasurer
  onKeyDown: (event: KeyboardEvent<Element>) => void
  onClick: (event: MouseEvent<SVGSVGElement>) => void
  onDoubleClick: (event: MouseEvent<SVGSVGElement>) => void
  onPointerDown: (event: PointerEvent<SVGSVGElement>) => void
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void
  onPointerUp: (event: PointerEvent<SVGSVGElement>) => void
  onPointerCancel: (event: PointerEvent<SVGSVGElement>) => void
  onPaste: (event: ReactClipboardEvent<Element>) => void
  onCopy: (event: ReactClipboardEvent<Element>) => void
  onCut: (event: ReactClipboardEvent<Element>) => void
  onBlur: (event: FocusEvent<Element>) => void
  onFocus: () => void
  onIslandSurfaceRender: ProfilerOnRenderCallback
  liveLayerMode: DraftIslandSurfaceLiveLayerMode
}

interface DraftIslandSurfaceChromeProps {
  surfaceKey: string
  nodeId: string
  pageIndex: number
  x: number
  y: number
  width: number
  surfaceHeightPt: number
  surfaceChromeHeightPt: number
}

type DraftIslandCaretGeometry = ReturnType<typeof resolveCollapsedCaretOverlayInFragment>

interface DraftIslandCaretOverlayProps {
  surfaceKey: string
  nodeId: string
  pageIndex: number
  caret: DraftIslandCaretGeometry
}

interface DraftIslandSurfaceLiveLayerProps {
  surface: DraftIslandSurface
  renderProps: ParagraphRenderProps | undefined
  nodeId: string
  draftRevision: number
  draftTextLength: number
  draftCaretOffset: number | null
  selectionStart: number | undefined
  selectionEnd: number | undefined
  selectionAnchorOffset: number | null
  selectionFocusOffset: number | null
  selectedDraftTextLength: number
  totalSelectionOverlayCount: number
  totalLineCount: number
  textMeasurer: TextMeasurer
  surfaceElement?: DraftIslandSurfaceLiveAttributeSyncTarget | null
  surfaceElementRef?: { current: DraftIslandSurfaceLiveAttributeSyncTarget | null }
}

interface DraftIslandSurfaceLiveLayerContextValue {
  surfacesByKey: Record<string, DraftIslandSurface>
  renderProps: ParagraphRenderProps | undefined
  nodeId: string
  draftRevision: number
  draftTextLength: number
  draftCaretOffset: number | null
  selectionStart: number | undefined
  selectionEnd: number | undefined
  selectionAnchorOffset: number | null
  selectionFocusOffset: number | null
  selectedDraftTextLength: number
  totalSelectionOverlayCount: number
  totalLineCount: number
  textMeasurer: TextMeasurer
}

interface DraftIslandSurfaceLiveAttributesInput {
  lineCount: number
  totalLineCount: number
  draftTextLength: number
  draftCaretOffset: number | null
  selectionStart: number | undefined
  selectionEnd: number | undefined
  selectedDraftTextLength: number
  selectionCollapsed: boolean
  caretVisible: boolean
  totalSelectionOverlayCount: number
  surfaceSelectionOverlayCount: number
  draftRevision: number
}

export type DraftIslandSurfaceLiveAttributes = {
  "data-wysiwyg-line-count": number
  "data-wysiwyg-flowdoc-draft-line-count": number
  "data-wysiwyg-flowdoc-draft-total-line-count": number
  "data-wysiwyg-flowdoc-draft-text-length": number
  "data-wysiwyg-flowdoc-draft-caret-offset": number | undefined
  "data-wysiwyg-flowdoc-draft-selection-start": number | undefined
  "data-wysiwyg-flowdoc-draft-selection-end": number | undefined
  "data-wysiwyg-flowdoc-draft-selected-text-length": number
  "data-wysiwyg-flowdoc-draft-selection-collapsed": string
  "data-wysiwyg-custom-caret-visible": "true" | undefined
  "data-wysiwyg-flowdoc-draft-selection-overlay-count": number
  "data-wysiwyg-flowdoc-draft-surface-selection-overlay-count": number
  "data-wysiwyg-island-revision": number
}

export interface DraftIslandSurfaceLiveAttributeSyncTarget {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

type DraftIslandAnchorLookup = Record<string, HTMLElement>

export interface DraftIslandHeightPreviewState {
  key: string
  height: number
  lineCount: number
  draftPageCount: number
  reflowKind?: string
}

interface DraftIslandPointerSelectionDrag {
  pointerId: number
  anchorOffset: number
}

export const ISLAND_PARENT_SYNC_DEBOUNCE_MS = 240
export const ISLAND_TEXT_INPUT_PARENT_SYNC_DEBOUNCE_MS = 1000
export const ISLAND_BOUNDARY_HEIGHT_PREVIEW_DEBOUNCE_MS = 120
const INPUT_BRIDGE_BEFOREINPUT_SUPPRESSION_MS = 1000
const ISLAND_Z_INDEX = 8000
const EMPTY_DRAFT_LINES: NonNullable<PageFragment["lines"]> = []
const EMPTY_DRAFT_SURFACE_LIVE_ATTRIBUTES: Partial<DraftIslandSurfaceLiveAttributes> = {}
const DraftIslandSurfaceLiveLayerContext = createContext<DraftIslandSurfaceLiveLayerContextValue | null>(null)

export function areDraftIslandVisualLinesPropsEqual(
  previous: DraftIslandVisualLinesProps,
  next: DraftIslandVisualLinesProps,
): boolean {
  return previous.surfaceFragment === next.surfaceFragment && previous.renderProps === next.renderProps
}

function DraftIslandVisualLines({
  surfaceFragment,
  renderProps,
}: DraftIslandVisualLinesProps) {
  const draftLines = surfaceFragment.lines ?? EMPTY_DRAFT_LINES
  const draftLineRanges = useMemo(() => resolveDraftLineRangeAttrs(draftLines), [draftLines])
  const surfaceKey = draftIslandSurfaceKey(surfaceFragment)
  const handleVisualLinesRender = useCallback<ProfilerOnRenderCallback>((
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-visual-lines-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      nodeId: surfaceFragment.nodeId,
      pageIndex: surfaceFragment.pageIndex,
      lineCount: draftLines.length,
      paragraphHeight: surfaceFragment.height,
      pageIndexes: String(surfaceFragment.pageIndex),
      componentName: id,
      source: phase,
    })
  }, [
    draftLines.length,
    surfaceFragment.height,
    surfaceFragment.nodeId,
    surfaceFragment.pageIndex,
  ])

  return (
    <Profiler
      id={`flowdoc-draft-editor-island-visual-lines-v2:${surfaceKey}`}
      onRender={handleVisualLinesRender}
    >
      <g data-wysiwyg-flowdoc-draft-lines="true" pointerEvents="none">
        {draftLines.map((line, index) => renderDraftLine({
          line,
          index,
          renderProps,
          range: draftLineRanges[index],
        }))}
      </g>
    </Profiler>
  )
}

const MemoizedDraftIslandVisualLines = memo(DraftIslandVisualLines, areDraftIslandVisualLinesPropsEqual)
MemoizedDraftIslandVisualLines.displayName = "MemoizedDraftIslandVisualLines"

export function areDraftIslandSurfaceChromePropsEqual(
  previous: DraftIslandSurfaceChromeProps,
  next: DraftIslandSurfaceChromeProps,
): boolean {
  return (
    previous.surfaceKey === next.surfaceKey &&
    previous.nodeId === next.nodeId &&
    previous.pageIndex === next.pageIndex &&
    previous.x === next.x &&
    previous.y === next.y &&
    previous.width === next.width &&
    previous.surfaceHeightPt === next.surfaceHeightPt &&
    previous.surfaceChromeHeightPt === next.surfaceChromeHeightPt
  )
}

function DraftIslandSurfaceChrome({
  surfaceKey,
  nodeId,
  pageIndex,
  x,
  y,
  width,
  surfaceHeightPt,
  surfaceChromeHeightPt,
}: DraftIslandSurfaceChromeProps) {
  const handleChromeRender = useCallback<ProfilerOnRenderCallback>((
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-surface-chrome-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      nodeId,
      pageIndex,
      paragraphHeight: surfaceChromeHeightPt,
      componentName: id,
      source: phase,
    })
  }, [
    nodeId,
    pageIndex,
    surfaceChromeHeightPt,
  ])

  return (
    <Profiler
      id={`flowdoc-draft-editor-island-surface-chrome-v2:${surfaceKey}`}
      onRender={handleChromeRender}
    >
      <g data-wysiwyg-island-static-chrome="true">
        <rect
          data-wysiwyg-out-of-canvas-cover="true"
          x={x}
          y={y}
          width={width}
          height={surfaceChromeHeightPt}
          fill="#ffffff"
          pointerEvents="none"
        />
        <rect
          data-wysiwyg-hit-area="true"
          data-wysiwyg-draft-editor-island-hit-area="true"
          x={x}
          y={y}
          width={width}
          height={surfaceHeightPt}
          fill="transparent"
          pointerEvents="all"
        />
        <rect
          data-wysiwyg-draft-editor-island-outline="true"
          x={x}
          y={y}
          width={width}
          height={surfaceChromeHeightPt}
          fill="none"
          stroke="#2563eb"
          strokeWidth={1}
          opacity={0.42}
          pointerEvents="none"
        />
      </g>
    </Profiler>
  )
}

const MemoizedDraftIslandSurfaceChrome = memo(DraftIslandSurfaceChrome, areDraftIslandSurfaceChromePropsEqual)
MemoizedDraftIslandSurfaceChrome.displayName = "MemoizedDraftIslandSurfaceChrome"

function areDraftIslandCaretGeometriesEqual(
  previous: DraftIslandCaretGeometry,
  next: DraftIslandCaretGeometry,
): boolean {
  if (previous === next) return true
  if (!previous || !next) return previous === next
  return (
    previous.x1 === next.x1 &&
    previous.y1 === next.y1 &&
    previous.x2 === next.x2 &&
    previous.y2 === next.y2
  )
}

export function areDraftIslandCaretOverlayPropsEqual(
  previous: DraftIslandCaretOverlayProps,
  next: DraftIslandCaretOverlayProps,
): boolean {
  return (
    previous.surfaceKey === next.surfaceKey &&
    previous.nodeId === next.nodeId &&
    previous.pageIndex === next.pageIndex &&
    areDraftIslandCaretGeometriesEqual(previous.caret, next.caret)
  )
}

function DraftIslandCaretOverlay({
  surfaceKey,
  nodeId,
  pageIndex,
  caret,
}: DraftIslandCaretOverlayProps) {
  const handleCaretRender = useCallback<ProfilerOnRenderCallback>((
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-caret-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      nodeId,
      pageIndex,
      active: caret != null,
      componentName: id,
      source: phase,
    })
  }, [
    caret,
    nodeId,
    pageIndex,
  ])

  return (
    <Profiler
      id={`flowdoc-draft-editor-island-caret-v2:${surfaceKey}`}
      onRender={handleCaretRender}
    >
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
    </Profiler>
  )
}

const MemoizedDraftIslandCaretOverlay = memo(DraftIslandCaretOverlay, areDraftIslandCaretOverlayPropsEqual)
MemoizedDraftIslandCaretOverlay.displayName = "MemoizedDraftIslandCaretOverlay"

export function resolveDraftIslandSurfaceLiveAttributes({
  lineCount,
  totalLineCount,
  draftTextLength,
  draftCaretOffset,
  selectionStart,
  selectionEnd,
  selectedDraftTextLength,
  selectionCollapsed,
  caretVisible,
  totalSelectionOverlayCount,
  surfaceSelectionOverlayCount,
  draftRevision,
}: DraftIslandSurfaceLiveAttributesInput): DraftIslandSurfaceLiveAttributes {
  return {
    "data-wysiwyg-line-count": lineCount,
    "data-wysiwyg-flowdoc-draft-line-count": lineCount,
    "data-wysiwyg-flowdoc-draft-total-line-count": totalLineCount,
    "data-wysiwyg-flowdoc-draft-text-length": draftTextLength,
    "data-wysiwyg-flowdoc-draft-caret-offset": draftCaretOffset ?? undefined,
    "data-wysiwyg-flowdoc-draft-selection-start": selectionStart,
    "data-wysiwyg-flowdoc-draft-selection-end": selectionEnd,
    "data-wysiwyg-flowdoc-draft-selected-text-length": selectedDraftTextLength,
    "data-wysiwyg-flowdoc-draft-selection-collapsed": String(selectionCollapsed),
    "data-wysiwyg-custom-caret-visible": caretVisible ? "true" : undefined,
    "data-wysiwyg-flowdoc-draft-selection-overlay-count": totalSelectionOverlayCount,
    "data-wysiwyg-flowdoc-draft-surface-selection-overlay-count": surfaceSelectionOverlayCount,
    "data-wysiwyg-island-revision": draftRevision,
  }
}

export function syncDraftIslandSurfaceLiveAttributes(
  target: DraftIslandSurfaceLiveAttributeSyncTarget,
  attributes: DraftIslandSurfaceLiveAttributes,
): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value == null) {
      target.removeAttribute(name)
      continue
    }
    target.setAttribute(name, String(value))
  }
}

function areDraftIslandSurfaceShellFragmentsEqual(
  previous: PageFragment,
  next: PageFragment,
): boolean {
  return (
    previous.nodeId === next.nodeId &&
    previous.nodeType === next.nodeType &&
    previous.pageIndex === next.pageIndex &&
    previous.fragmentIndex === next.fragmentIndex &&
    previous.lineStart === next.lineStart &&
    previous.lineEnd === next.lineEnd &&
    previous.continuesFrom === next.continuesFrom &&
    previous.isContinued === next.isContinued &&
    previous.x === next.x &&
    previous.y === next.y &&
    previous.width === next.width &&
    previous.height === next.height
  )
}

function areDraftIslandSourceShellFragmentsEqual(
  previous: PageFragment,
  next: PageFragment,
): boolean {
  return (
    previous.pageIndex === next.pageIndex &&
    previous.height === next.height
  )
}

function areDraftIslandSurfaceShellsEqual(
  previous: DraftIslandSurface,
  next: DraftIslandSurface,
): boolean {
  return (
    previous.key === next.key &&
    previous.pageKey === next.pageKey &&
    areDraftIslandSurfaceShellFragmentsEqual(previous.fragment, next.fragment)
  )
}

function areDraftIslandSurfaceViewPropsFullyEqual(
  previous: DraftIslandSurfaceViewProps,
  next: DraftIslandSurfaceViewProps,
): boolean {
  return (
    previous.surface === next.surface &&
    previous.surfaceIndex === next.surfaceIndex &&
    previous.sourceFragment === next.sourceFragment &&
    previous.renderProps === next.renderProps &&
    previous.scale === next.scale &&
    previous.nodeId === next.nodeId &&
    previous.draftRevision === next.draftRevision &&
    previous.draftTextLength === next.draftTextLength &&
    previous.draftCaretOffset === next.draftCaretOffset &&
    previous.selectionStart === next.selectionStart &&
    previous.selectionEnd === next.selectionEnd &&
    previous.selectionAnchorOffset === next.selectionAnchorOffset &&
    previous.selectionFocusOffset === next.selectionFocusOffset &&
    previous.selectedDraftTextLength === next.selectedDraftTextLength &&
    previous.totalSelectionOverlayCount === next.totalSelectionOverlayCount &&
    previous.totalLineCount === next.totalLineCount &&
    previous.draftSurfaceCount === next.draftSurfaceCount &&
    previous.isPageBoundaryPreview === next.isPageBoundaryPreview &&
    previous.reflowKind === next.reflowKind &&
    previous.reflowReason === next.reflowReason &&
    previous.committing === next.committing &&
    previous.anchorMode === next.anchorMode &&
    previous.textMeasurer === next.textMeasurer &&
    previous.onKeyDown === next.onKeyDown &&
    previous.onClick === next.onClick &&
    previous.onDoubleClick === next.onDoubleClick &&
    previous.onPointerDown === next.onPointerDown &&
    previous.onPointerMove === next.onPointerMove &&
    previous.onPointerUp === next.onPointerUp &&
    previous.onPointerCancel === next.onPointerCancel &&
    previous.onPaste === next.onPaste &&
    previous.onCopy === next.onCopy &&
    previous.onCut === next.onCut &&
    previous.onBlur === next.onBlur &&
    previous.onFocus === next.onFocus &&
    previous.onIslandSurfaceRender === next.onIslandSurfaceRender &&
    previous.liveLayerMode === next.liveLayerMode
  )
}

function areDraftIslandSurfaceViewShellPropsEqual(
  previous: DraftIslandSurfaceViewProps,
  next: DraftIslandSurfaceViewProps,
): boolean {
  return (
    areDraftIslandSurfaceShellsEqual(previous.surface, next.surface) &&
    previous.surfaceIndex === next.surfaceIndex &&
    areDraftIslandSourceShellFragmentsEqual(previous.sourceFragment, next.sourceFragment) &&
    previous.scale === next.scale &&
    previous.nodeId === next.nodeId &&
    previous.draftSurfaceCount === next.draftSurfaceCount &&
    previous.isPageBoundaryPreview === next.isPageBoundaryPreview &&
    previous.reflowKind === next.reflowKind &&
    previous.reflowReason === next.reflowReason &&
    previous.committing === next.committing &&
    previous.anchorMode === next.anchorMode &&
    previous.onKeyDown === next.onKeyDown &&
    previous.onClick === next.onClick &&
    previous.onDoubleClick === next.onDoubleClick &&
    previous.onPointerDown === next.onPointerDown &&
    previous.onPointerMove === next.onPointerMove &&
    previous.onPointerUp === next.onPointerUp &&
    previous.onPointerCancel === next.onPointerCancel &&
    previous.onPaste === next.onPaste &&
    previous.onCopy === next.onCopy &&
    previous.onCut === next.onCut &&
    previous.onBlur === next.onBlur &&
    previous.onFocus === next.onFocus &&
    previous.onIslandSurfaceRender === next.onIslandSurfaceRender &&
    previous.liveLayerMode === next.liveLayerMode
  )
}

export function areDraftIslandSurfaceViewPropsEqual(
  previous: DraftIslandSurfaceViewProps,
  next: DraftIslandSurfaceViewProps,
): boolean {
  if (previous.liveLayerMode !== "detached" || next.liveLayerMode !== "detached") {
    return areDraftIslandSurfaceViewPropsFullyEqual(previous, next)
  }
  return areDraftIslandSurfaceViewShellPropsEqual(previous, next)
}

function DraftIslandSurfaceLiveLayer({
  surface,
  renderProps,
  nodeId,
  draftRevision,
  draftTextLength,
  draftCaretOffset,
  selectionStart,
  selectionEnd,
  selectionAnchorOffset,
  selectionFocusOffset,
  selectedDraftTextLength,
  totalSelectionOverlayCount,
  totalLineCount,
  textMeasurer,
  surfaceElement,
  surfaceElementRef,
}: DraftIslandSurfaceLiveLayerProps) {
  const surfaceFragment = surface.fragment
  const selectionActive = selectionAnchorOffset != null &&
    selectionFocusOffset != null &&
    selectionAnchorOffset !== selectionFocusOffset
  const caret = resolveCollapsedCaretOverlayInFragment(
    surfaceFragment,
    draftCaretOffset ?? draftTextLength,
    { textMeasurer },
  )
  const selectionRects = selectionActive
    ? resolveSelectionOverlayRectsInFragment(surfaceFragment, selectionAnchorOffset, selectionFocusOffset, { textMeasurer })
    : []
  const selectionCollapsed = !selectionActive
  const liveAttributes = resolveDraftIslandSurfaceLiveAttributes({
    lineCount: surfaceFragment.lines?.length ?? 0,
    totalLineCount,
    draftTextLength,
    draftCaretOffset,
    selectionStart,
    selectionEnd,
    selectedDraftTextLength,
    selectionCollapsed,
    caretVisible: caret != null,
    totalSelectionOverlayCount,
    surfaceSelectionOverlayCount: selectionRects.length,
    draftRevision,
  })
  useLayoutEffect(() => {
    const element = surfaceElement ?? surfaceElementRef?.current ?? null
    if (!element) return
    syncDraftIslandSurfaceLiveAttributes(element, liveAttributes)
  }, [liveAttributes, surfaceElement, surfaceElementRef])
  const handleLiveLayerRender = useCallback<ProfilerOnRenderCallback>((
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-surface-live-layer-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      nodeId,
      pageIndex: surfaceFragment.pageIndex,
      draftVersion: draftRevision,
      textLength: draftTextLength,
      lineCount: surfaceFragment.lines?.length ?? 0,
      paragraphHeight: surfaceFragment.height,
      selectionCollapsed,
      selectionRangeLength: selectionCollapsed || selectionAnchorOffset == null || selectionFocusOffset == null
        ? 0
        : Math.abs(selectionFocusOffset - selectionAnchorOffset),
      overlayRectCount: selectionRects.length,
      componentName: id,
      source: phase,
    })
  }, [
    draftRevision,
    draftTextLength,
    nodeId,
    selectionAnchorOffset,
    selectionCollapsed,
    selectionFocusOffset,
    selectionRects.length,
    surfaceFragment.height,
    surfaceFragment.lines?.length,
    surfaceFragment.pageIndex,
  ])

  return (
    <Profiler
      id={`flowdoc-draft-editor-island-surface-live-layer-v2:${surface.key}`}
      onRender={handleLiveLayerRender}
    >
      <>
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
        <MemoizedDraftIslandVisualLines
          surfaceFragment={surfaceFragment}
          renderProps={renderProps}
        />
        <MemoizedDraftIslandCaretOverlay
          surfaceKey={surface.key}
          nodeId={nodeId}
          pageIndex={surfaceFragment.pageIndex}
          caret={caret}
        />
      </>
    </Profiler>
  )
}

function DraftIslandSurfaceLiveLayerContextConsumer({
  surfaceKey,
  surfaceElementRef,
}: {
  surfaceKey: string
  surfaceElementRef: { current: DraftIslandSurfaceLiveAttributeSyncTarget | null }
}) {
  const context = useContext(DraftIslandSurfaceLiveLayerContext)
  if (!context) return null
  const surface = context.surfacesByKey[surfaceKey]
  if (!surface) return null
  return (
    <DraftIslandSurfaceLiveLayer
      surface={surface}
      renderProps={context.renderProps}
      nodeId={context.nodeId}
      draftRevision={context.draftRevision}
      draftTextLength={context.draftTextLength}
      draftCaretOffset={context.draftCaretOffset}
      selectionStart={context.selectionStart}
      selectionEnd={context.selectionEnd}
      selectionAnchorOffset={context.selectionAnchorOffset}
      selectionFocusOffset={context.selectionFocusOffset}
      selectedDraftTextLength={context.selectedDraftTextLength}
      totalSelectionOverlayCount={context.totalSelectionOverlayCount}
      totalLineCount={context.totalLineCount}
      textMeasurer={context.textMeasurer}
      surfaceElementRef={surfaceElementRef}
    />
  )
}

function DraftIslandSurfaceView({
  surface,
  surfaceIndex,
  sourceFragment,
  renderProps,
  scale,
  nodeId,
  draftRevision,
  draftTextLength,
  draftCaretOffset,
  selectionStart,
  selectionEnd,
  selectionAnchorOffset,
  selectionFocusOffset,
  selectedDraftTextLength,
  totalSelectionOverlayCount,
  totalLineCount,
  draftSurfaceCount,
  isPageBoundaryPreview,
  reflowKind,
  reflowReason,
  committing,
  anchorMode,
  textMeasurer,
  onKeyDown,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPaste,
  onCopy,
  onCut,
  onBlur,
  onFocus,
  onIslandSurfaceRender,
  liveLayerMode,
}: DraftIslandSurfaceViewProps) {
  const surfaceElementRef = useRef<SVGSVGElement | null>(null)
  const surfaceFragment = surface.fragment
  const surfaceHeightPt = resolveDraftIslandSurfaceHeightPt(sourceFragment, surfaceFragment)
  const surfaceChromeHeightPt = resolveDraftIslandSurfaceChromeHeightPt(sourceFragment, surfaceFragment)
  const selectionActive = selectionAnchorOffset != null &&
    selectionFocusOffset != null &&
    selectionAnchorOffset !== selectionFocusOffset
  const caret = resolveCollapsedCaretOverlayInFragment(
    surfaceFragment,
    draftCaretOffset ?? draftTextLength,
    { textMeasurer },
  )
  const selectionRects = selectionActive
    ? resolveSelectionOverlayRectsInFragment(surfaceFragment, selectionAnchorOffset, selectionFocusOffset, { textMeasurer })
    : []
  const svgStyle: CSSProperties = {
    ...islandSvgStyle,
    left: surfaceFragment.x * scale,
    top: surfaceFragment.y * scale,
    width: Math.max(1, surfaceFragment.width * scale),
    height: Math.max(1, surfaceHeightPt * scale),
    display: "block",
  }
  const viewBox = `${surfaceFragment.x} ${surfaceFragment.y} ${surfaceFragment.width} ${surfaceHeightPt}`
  const selectionCollapsed = !selectionActive
  const liveAttributes = resolveDraftIslandSurfaceLiveAttributes({
    lineCount: surfaceFragment.lines?.length ?? 0,
    totalLineCount,
    draftTextLength,
    draftCaretOffset,
    selectionStart,
    selectionEnd,
    selectedDraftTextLength,
    selectionCollapsed,
    caretVisible: caret != null,
    totalSelectionOverlayCount,
    surfaceSelectionOverlayCount: selectionRects.length,
    draftRevision,
  })
  useLayoutEffect(() => {
    if (liveLayerMode === "detached") return
    const element = surfaceElementRef.current
    if (!element) return
    syncDraftIslandSurfaceLiveAttributes(element, liveAttributes)
  }, [liveAttributes, liveLayerMode])
  const reactLiveAttributes = WYSIWYG_ISLAND_REACT_LIVE_ATTRS_ENABLED
    ? liveAttributes
    : EMPTY_DRAFT_SURFACE_LIVE_ATTRIBUTES
  const surfaceChrome = (
    <MemoizedDraftIslandSurfaceChrome
      surfaceKey={surface.key}
      nodeId={nodeId}
      pageIndex={surfaceFragment.pageIndex}
      x={surfaceFragment.x}
      y={surfaceFragment.y}
      width={surfaceFragment.width}
      surfaceHeightPt={surfaceHeightPt}
      surfaceChromeHeightPt={surfaceChromeHeightPt}
    />
  )
  const inlineSurfaceLiveLayer = (
    <DraftIslandSurfaceLiveLayer
      surface={surface}
      renderProps={renderProps}
      nodeId={nodeId}
      draftRevision={draftRevision}
      draftTextLength={draftTextLength}
      draftCaretOffset={draftCaretOffset}
      selectionStart={selectionStart}
      selectionEnd={selectionEnd}
      selectionAnchorOffset={selectionAnchorOffset}
      selectionFocusOffset={selectionFocusOffset}
      selectedDraftTextLength={selectedDraftTextLength}
      totalSelectionOverlayCount={totalSelectionOverlayCount}
      totalLineCount={totalLineCount}
      textMeasurer={textMeasurer}
      surfaceElementRef={surfaceElementRef}
    />
  )
  const renderSurfaceSvg = (children: ReactNode) => (
      <svg
        ref={surfaceElementRef}
        data-wysiwyg-draft-editor-island="true"
        data-wysiwyg-out-of-canvas-island="true"
        data-wysiwyg-island-anchor={anchorMode}
        data-wysiwyg-text-engine-layer="true"
        data-wysiwyg-active-visual-mode="flowdoc-draft-editor-island"
        data-wysiwyg-active-visual-detail="out-of-canvas-v2"
        data-wysiwyg-island-surface-key={surface.key}
        data-wysiwyg-island-page-key={surface.pageKey}
        data-page-index={surfaceFragment.pageIndex}
        data-line-start={surfaceFragment.lineStart ?? undefined}
        data-line-end={surfaceFragment.lineEnd ?? undefined}
        data-wysiwyg-island-surface-index={surfaceIndex}
        data-wysiwyg-island-fragment-count={draftSurfaceCount}
        data-wysiwyg-pointer-fragment-count={draftSurfaceCount}
        data-wysiwyg-island-page-boundary-preview={isPageBoundaryPreview ? "true" : "false"}
        data-wysiwyg-island-reflow-kind={reflowKind}
        data-wysiwyg-island-reflow-reason={reflowReason}
        data-wysiwyg-island-committing={committing ? "true" : undefined}
        {...reactLiveAttributes}
        data-wysiwyg-native-visible-text="false"
        data-wysiwyg-hidden-input-bridge="true"
        data-wysiwyg-flowdoc-draft-clipboard="true"
        data-wysiwyg-visible-pointer-owner="flowdoc-draft-island-v2"
        data-wysiwyg-flowdoc-draft-pointer-selection="true"
        data-wysiwyg-live-echo-suppressed="true"
        data-wysiwyg-draft-text-replacement-active={undefined}
        data-inline-edit-node-id={nodeId}
        data-inline-edit-visual-mode="flowdoc-draft-editor-island"
        data-wysiwyg-island-parent-sync-debounce-ms={ISLAND_PARENT_SYNC_DEBOUNCE_MS}
        data-wysiwyg-island-text-parent-sync-debounce-ms={ISLAND_TEXT_INPUT_PARENT_SYNC_DEBOUNCE_MS}
        data-wysiwyg-island-boundary-height-preview-debounce-ms={ISLAND_BOUNDARY_HEIGHT_PREVIEW_DEBOUNCE_MS}
        data-wysiwyg-island-surface-height-pt={surfaceHeightPt}
        data-wysiwyg-island-surface-chrome-height-pt={surfaceChromeHeightPt}
        data-wysiwyg-island-continuation-boundary-clearance-pt={surfaceFragment.continuesFrom === true ? ISLAND_CONTINUATION_BOUNDARY_CLEARANCE_PT : undefined}
        viewBox={viewBox}
        style={svgStyle}
        tabIndex={surfaceIndex === 0 ? 0 : -1}
        role="textbox"
        aria-multiline="true"
        onKeyDown={onKeyDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onPaste={onPaste}
        onCopy={onCopy}
        onCut={onCut}
        onBlur={onBlur}
        onFocus={onFocus}
      >
        {children}
      </svg>
  )

  if (liveLayerMode === "detached") {
    return renderSurfaceSvg(
      <>
        {surfaceChrome}
        <DraftIslandSurfaceLiveLayerContextConsumer
          surfaceKey={surface.key}
          surfaceElementRef={surfaceElementRef}
        />
      </>,
    )
  }

  return (
    <Profiler
      id={`flowdoc-draft-editor-island-surface-v2:${surface.key}`}
      onRender={onIslandSurfaceRender}
    >
      {renderSurfaceSvg(
        <>
          {surfaceChrome}
          {inlineSurfaceLiveLayer}
        </>,
      )}
    </Profiler>
  )
}

const MemoizedDraftIslandSurfaceView = memo(DraftIslandSurfaceView, areDraftIslandSurfaceViewPropsEqual)
MemoizedDraftIslandSurfaceView.displayName = "MemoizedDraftIslandSurfaceView"

const islandSvgStyle: CSSProperties = {
  position: "absolute",
  overflow: "visible",
  pointerEvents: "auto",
  zIndex: 1,
  color: "#111827",
  cursor: "text",
  userSelect: "none",
}

const hiddenInputBridgeStyle: CSSProperties = {
  position: "fixed",
  left: -10000,
  top: -10000,
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

function draftIslandPageIndexes(fragments: PageFragment[]): number[] {
  return Array.from(new Set(
    fragments
      .map((fragment) => fragment.pageIndex)
      .filter((pageIndex) => Number.isFinite(pageIndex)),
  )).sort((a, b) => a - b)
}

function draftIslandPageIndexSummary(fragments: PageFragment[]): string | undefined {
  const pageIndexes = draftIslandPageIndexes(fragments)
  return pageIndexes.length > 0 ? pageIndexes.join(",") : undefined
}

function draftIslandPagesSplitSignature(pages: PaginatedPage[] | null | undefined): string {
  if (!pages || pages.length === 0) return "no-pages"
  return pages.map((page) => [
    page.index,
    numericDraftIslandSignatureValue(page.contentBox.y),
    numericDraftIslandSignatureValue(page.contentBox.height),
  ].join(":")).join(";")
}

function numericDraftIslandSignatureValue(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return String(Math.round(value * 1000) / 1000)
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

function isUndoShortcut(event: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; code?: string; key: string }): boolean {
  if (event.altKey || event.shiftKey || (!event.ctrlKey && !event.metaKey)) return false
  return event.code === "KeyZ" || event.key.toLowerCase() === "z"
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
  revision?: number
}): DraftIslandState {
  const baseText = getTextRunParagraphText(input.paragraph) ?? ""
  const text = input.draftText ?? baseText
  const caretOffset = input.caretOffset ?? text.length
  return {
    nodeId: input.nodeId,
    text,
    caretOffset,
    selection: input.selection ?? collapsedSelection(caretOffset),
    revision: input.revision ?? 0,
  }
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

export function shouldQueueDraftIslandPageBoundaryReflow(input: {
  active: boolean
  nodeId: string | null
  fragment: PageFragment | null
  reflow: WysiwygTextReflowDecision | null
  draftRevision: number | null | undefined
  hasReflowHandler: boolean
}): boolean {
  if (!input.active || !input.nodeId || !input.fragment || !input.hasReflowHandler) return false
  if (input.draftRevision == null || input.draftRevision <= 0) return false
  return (
    input.reflow?.kind === "hard-page-boundary" &&
    input.reflow.shouldQueueSettledPagination
  )
}

export function resolveDraftIslandParentSyncDelayMs(input: {
  textChanged: boolean
  source: string
}): number {
  if (!input.textChanged) return ISLAND_PARENT_SYNC_DEBOUNCE_MS
  if (
    input.source.startsWith("key:") ||
    input.source.startsWith("beforeinput:") ||
    input.source.startsWith("input:") ||
    input.source.startsWith("clipboard-paste")
  ) {
    return ISLAND_TEXT_INPUT_PARENT_SYNC_DEBOUNCE_MS
  }
  return ISLAND_PARENT_SYNC_DEBOUNCE_MS
}

export function resolveDraftIslandHeightPreviewDelayMs(input: {
  shouldPatchBoundaryHeight: boolean
  reflow?: WysiwygTextReflowDecision | null
}): number {
  return input.shouldPatchBoundaryHeight && input.reflow?.kind === "hard-page-boundary"
    ? ISLAND_BOUNDARY_HEIGHT_PREVIEW_DEBOUNCE_MS
    : 0
}

function resolveDraftIslandAnchorElement(
  pageKey: string,
  anchorElementsByPageKey: DraftIslandAnchorLookup,
  getPageElement: (pageKey: string) => HTMLElement | null,
): HTMLElement | null {
  return anchorElementsByPageKey[pageKey] ?? getPageElement(pageKey) ?? null
}

export function isFocusStillInsideDraftIsland(
  nodeId: string,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false

  const owner = target.closest(
    '[data-wysiwyg-draft-editor-island="true"], [data-wysiwyg-input-bridge="true"]',
  )

  return owner?.getAttribute("data-inline-edit-node-id") === nodeId
}

export function areDraftIslandRuntimePropsEqual(
  previous: FlowdocDraftEditorIslandRootProps,
  next: FlowdocDraftEditorIslandRootProps,
): boolean {
  return (
    previous.active === next.active &&
    previous.nodeId === next.nodeId &&
    previous.paragraph === next.paragraph &&
    previous.fragment === next.fragment &&
    previous.pageKey === next.pageKey &&
    previous.pages === next.pages &&
    previous.scale === next.scale &&
    previous.textMeasurer === next.textMeasurer &&
    previous.draftText === next.draftText &&
    previous.caretOffset === next.caretOffset &&
    previous.selection === next.selection &&
    previous.getPageElement === next.getPageElement &&
    previous.getPageKeyByPageIndex === next.getPageKeyByPageIndex &&
    previous.onDraftChange === next.onDraftChange &&
    previous.onHeightChange === next.onHeightChange &&
    previous.onReflowDecision === next.onReflowDecision &&
    previous.onRichTextShortcut === next.onRichTextShortcut &&
    previous.onEndEdit === next.onEndEdit &&
    previous.onSplitParagraph === next.onSplitParagraph &&
    previous.onMergeParagraph === next.onMergeParagraph &&
    previous.onRequestUndo === next.onRequestUndo &&
    previous.onCompositionChange === next.onCompositionChange &&
    previous.structuralRefocusStartedAt === next.structuralRefocusStartedAt &&
    previous.onStructuralRefocusPainted === next.onStructuralRefocusPainted &&
    previous.structuralEditRuntime === next.structuralEditRuntime
  )
}

function FlowdocDraftEditorIslandRuntime({
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
  onRichTextShortcut,
  onEndEdit,
  onSplitParagraph,
  onMergeParagraph,
  onRequestUndo,
  onCompositionChange,
  structuralRefocusStartedAt,
  onStructuralRefocusPainted,
  structuralEditRuntime,
}: FlowdocDraftEditorIslandRootProps) {
  const draftStoreSession = useWysiwygDraftStoreForNode(nodeId)
  const resolvedDraftText = draftStoreSession ? draftStoreSession.text : draftText
  const resolvedCaretOffset = draftStoreSession ? draftStoreSession.caretIndex : caretOffset
  const resolvedSelection = draftStoreSession ? draftStoreSession.selection : selection
  const inputBridgeRef = useRef<HTMLTextAreaElement | null>(null)
  const lastBeforeInputChangeRef = useRef<{ insertedText: string; nextText: string } | null>(null)
  const lastBeforeInputClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputBridgeEchoSuppressedRef = useRef(false)
  const inputBridgeEchoSuppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDraftRef = useRef<DraftIslandState | null>(null)
  const draftLayoutCacheRef = useRef(createWysiwygDraftParagraphLayoutCache())
  const lastDraftLayoutResultRef = useRef<{ cacheKey: string; layout: WysiwygDraftParagraphLayout | null } | null>(null)
  const lastDraftFragmentSplitResultRef = useRef<{ key: string; fragments: PageFragment[] } | null>(null)
  const draftFragmentSplitTraceRef = useRef<WysiwygDraftFragmentSplitTraceState | null>(null)
  const draftFragmentSplitReuseRef = useRef<WysiwygDraftFragmentSplitReuseState | null>(null)
  const draftIslandRootRenderTraceRef = useRef<WysiwygDraftIslandRootRenderTraceState | null>(null)
  const draftIslandSurfaceRenderTraceRef = useRef<Record<string, WysiwygDraftIslandSurfaceRenderTraceState>>({})
  const parentSyncedRevisionRef = useRef<number>(-1)
  const parentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const parentSyncScheduledDelayMsRef = useRef<number | null>(null)
  const suppressNextUnmountParentSyncRef = useRef(false)
  const lastHeightPreviewRef = useRef<DraftIslandHeightPreviewState | null>(null)
  const heightPreviewFrameRef = useRef<number | null>(null)
  const heightPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInputStartedAtRef = useRef<number | null>(null)
  const latestSurfacesRef = useRef<DraftIslandSurface[]>([])
  const pointerSelectionDragRef = useRef<DraftIslandPointerSelectionDrag | null>(null)
  const outsidePointerFlushPendingRef = useRef(false)
  const verticalCaretXRef = useRef<number | null>(null)
  const verticalCaretLineAffinityRef = useRef<WysiwygVerticalCaretLineAffinity | null>(null)
  const pageBoundaryReflowRequestRef = useRef<string | null>(null)
  const lastStructuralRefocusPaintKeyRef = useRef<string | null>(null)
  const structuralEditGuardRef = useRef<DraftIslandStructuralEditGuard | null>(null)
  const structuralEditGuardTokenRef = useRef(0)
  const structuralEditGuardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endEditRequestedRef = useRef(false)
  const onEndEditRef = useRef(onEndEdit)
  onEndEditRef.current = onEndEdit

  const activeInputEpochRef = useRef(0)
  const allowUnmountParentSyncRef = useRef(false)
  const lastInputAtRef = useRef(0)

  useEffect(() => {
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-lifecycle",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId,
      action: "mount",
      active: true,
    })
    return () => {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-island-lifecycle",
        startedAt: startWysiwygPerfSpan(),
        durationMs: 0,
        nodeId,
        action: "unmount",
        active: false,
      })
    }
  }, [nodeId])

  const [draftState, setDraftState] = useState<DraftIslandState | null>(() => (
    active && nodeId && paragraph
      ? createDraftIslandState({
          nodeId,
          paragraph,
          draftText: resolvedDraftText,
          caretOffset: resolvedCaretOffset,
          selection: resolvedSelection,
        })
      : null
  ))
  const [anchorElementsByPageKey, setAnchorElementsByPageKey] = useState<DraftIslandAnchorLookup>({})
  const anchorElementsByPageKeyRef = useRef<DraftIslandAnchorLookup>({})
  const draftSurfaceLiveLayerMode: DraftIslandSurfaceLiveLayerMode = (
    typeof window !== "undefined" && WYSIWYG_ISLAND_SURFACE_LIVE_LAYER_ENABLED
      ? "detached"
      : "inline"
  )
  const [committing, setCommitting] = useState(false)

  const recordStructuralGuardEvent = useCallback((input: {
    action: "engaged" | "accepted" | "dropped" | `unlocked-${DraftIslandStructuralEditGuardUnlockReason}`
    guard: DraftIslandStructuralEditGuard
    source: string
    key?: string
    attemptedOperation?: DraftIslandStructuralEditOperation
    nodeId?: string | null
  }) => {
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-structural-guard",
      startedAt: input.guard.startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - input.guard.startedAt),
      nodeId: input.nodeId ?? input.guard.sourceNodeId,
      sourceNodeId: input.guard.sourceNodeId,
      expectedActiveNodeId: input.guard.expectedActiveNodeId,
      removedNodeId: input.guard.removedNodeId,
      draftVersion: input.guard.draftRevision,
      operation: input.guard.operation,
      attemptedOperation: input.attemptedOperation ?? input.guard.operation,
      token: input.guard.token,
      source: input.source,
      key: input.key,
      action: input.action,
      active: input.action !== "dropped",
    })
  }, [])

  const clearStructuralEditGuard = useCallback((
    reason: DraftIslandStructuralEditGuardUnlockReason,
    source: string,
    nodeIdForEvent?: string | null,
  ) => {
    const guard = structuralEditGuardRef.current
    if (!guard) return false
    if (structuralEditGuardTimeoutRef.current) {
      clearTimeout(structuralEditGuardTimeoutRef.current)
      structuralEditGuardTimeoutRef.current = null
    }
    structuralEditGuardRef.current = null
    recordStructuralGuardEvent({
      action: `unlocked-${reason}`,
      guard,
      source,
      nodeId: nodeIdForEvent,
    })
    return true
  }, [recordStructuralGuardEvent])

  const engageStructuralEditGuard = useCallback((
    operation: DraftIslandStructuralEditOperation,
    current: DraftIslandState,
    source: string,
    key?: "Enter" | "Backspace",
  ) => {
    if (structuralEditGuardTimeoutRef.current) clearTimeout(structuralEditGuardTimeoutRef.current)
    const startedAt = startWysiwygPerfSpan()
    const transaction = structuralEditRuntime?.beginStructuralEdit({
      key,
      accepted: true,
      kind: operation,
      sourceNodeId: current.nodeId,
      removedNodeId: operation === "merge" || operation === "delete-empty" ? current.nodeId : undefined,
      startedAt,
    })
    const token = transaction?.generation ?? structuralEditGuardTokenRef.current + 1
    structuralEditGuardTokenRef.current = token
    const guard: DraftIslandStructuralEditGuard = {
      token,
      operation,
      sourceNodeId: current.nodeId,
      expectedActiveNodeId: null,
      removedNodeId: operation === "merge" || operation === "delete-empty" ? current.nodeId : null,
      draftRevision: current.revision,
      startedAt,
    }
    structuralEditGuardRef.current = guard
    recordStructuralGuardEvent({ action: "engaged", guard, source, nodeId: current.nodeId })
    recordStructuralGuardEvent({ action: "accepted", guard, source, nodeId: current.nodeId })
    structuralEditGuardTimeoutRef.current = setTimeout(() => {
      if (structuralEditGuardRef.current?.token !== token) return
      clearStructuralEditGuard("timeout", "timeout-fallback", current.nodeId)
    }, ISLAND_STRUCTURAL_EDIT_GUARD_TIMEOUT_MS)
    return guard
  }, [clearStructuralEditGuard, recordStructuralGuardEvent, structuralEditRuntime])

  const dropGuardedStructuralKey = useCallback((
    key: "Enter" | "Backspace",
    current: DraftIslandState,
    source: string,
    attemptedOperation: DraftIslandStructuralEditOperation,
    event?: KeyboardEvent<Element> | null,
  ) => {
    const guard = structuralEditGuardRef.current
    const runtimeDecision: StructuralGuardDecision | null = structuralEditRuntime
      ? structuralEditRuntime.canStartStructuralEdit({
          key,
          nodeId: current.nodeId,
          caretIndex: current.caretOffset ?? current.text.length,
          isComposing: event?.nativeEvent.isComposing ?? false,
          hasActiveComposition: event?.nativeEvent.isComposing ?? false,
          currentActiveNodeId: current.nodeId,
          expectedNodeExists: true,
          timestamp: startWysiwygPerfSpan(),
        } satisfies StructuralGuardInput)
      : null
    if (runtimeDecision?.type === "ignore-composition") return false
    if (runtimeDecision?.type === "guard") {
      if (runtimeDecision.transactionId) {
        structuralEditRuntime?.markKeyRepeatDropped({
          id: runtimeDecision.transactionId,
          generation: runtimeDecision.generation,
        }, runtimeDecision.reason)
      }
      if (guard) {
        recordStructuralGuardEvent({
          action: "dropped",
          guard,
          source,
          key,
          attemptedOperation,
          nodeId: current.nodeId,
        })
      }
      return true
    }
    if (runtimeDecision) return false
    const shouldDrop = shouldDropDraftIslandStructuralKeyForGuard(guard, {
      key,
      nodeId: current.nodeId,
      shiftKey: event?.shiftKey,
      altKey: event?.altKey,
      ctrlKey: event?.ctrlKey,
      metaKey: event?.metaKey,
      isComposing: event?.nativeEvent.isComposing,
    })
    if (!guard || !shouldDrop) return false
    recordStructuralGuardEvent({
      action: "dropped",
      guard,
      source,
      key,
      attemptedOperation,
      nodeId: current.nodeId,
    })
    return true
  }, [recordStructuralGuardEvent, structuralEditRuntime])

  useEffect(() => {
    if (!active || !nodeId || !paragraph) {
      clearStructuralEditGuard("inactive", "props-inactive", nodeId)
      latestDraftRef.current = null
      parentSyncedRevisionRef.current = -1
      lastDraftLayoutResultRef.current = null
      lastDraftFragmentSplitResultRef.current = null
      draftFragmentSplitTraceRef.current = null
      draftFragmentSplitReuseRef.current = null
      draftIslandRootRenderTraceRef.current = null
      draftIslandSurfaceRenderTraceRef.current = {}
      endEditRequestedRef.current = false
      allowUnmountParentSyncRef.current = false
      setCommitting(false)
      setDraftState(null)
      return
    }
    const unlockReason = resolveDraftIslandStructuralGuardUnlockReason(structuralEditGuardRef.current, {
      active,
      nodeId,
      now: startWysiwygPerfSpan(),
    })
    if (unlockReason && unlockReason !== "timeout") {
      clearStructuralEditGuard(unlockReason, "props-commit", nodeId)
    }
    setCommitting(false)
    setDraftState((current) => {
      const next = createDraftIslandState({
        nodeId,
        paragraph,
        draftText: resolvedDraftText,
        caretOffset: resolvedCaretOffset,
        selection: resolvedSelection,
      })
      if (
        current?.nodeId === nodeId &&
        current.text === next.text &&
        current.caretOffset === next.caretOffset &&
        areWysiwygTextSelectionsEqual(current.selection, next.selection)
      ) {
        return current
      }
      if (current?.nodeId === nodeId) {
        const synced = {
          ...next,
          revision: current.revision + 1,
        }
        latestDraftRef.current = synced
        parentSyncedRevisionRef.current = synced.revision
        return synced
      }
      endEditRequestedRef.current = false
      allowUnmountParentSyncRef.current = false
      latestDraftRef.current = next
      parentSyncedRevisionRef.current = next.revision
      return next
    })
  }, [
    active,
    clearStructuralEditGuard,
    nodeId,
    paragraph,
    resolvedCaretOffset,
    resolvedDraftText,
    resolvedSelection,
  ])

  useEffect(() => () => {
    clearStructuralEditGuard("unmount", "component-unmount", nodeId)
  }, [clearStructuralEditGuard, nodeId])

  useEffect(() => {
    pageBoundaryReflowRequestRef.current = null
  }, [active, nodeId])

  useEffect(() => {
    latestDraftRef.current = draftState
  }, [draftState])

  const draftLayoutResult = useMemo(() => {
    if (!active || !fragment || !paragraph || !draftState) return null
    if (draftState.nodeId !== nodeId) return null
    const startedAt = startWysiwygPerfSpan()
    const measureOptions = {
      allowContinuedFirstFragment: true,
      traceMeasure: true,
    }
    const cacheKey = createWysiwygDraftParagraphLayoutCacheKey(fragment, paragraph, draftState.text, measureOptions)
    const draftLayoutCache = draftLayoutCacheRef.current
    const draftLayoutCacheHit = (
      draftLayoutCache.nodeId === fragment.nodeId &&
      draftLayoutCache.textMeasurer === textMeasurer &&
      draftLayoutCache.entries.has(cacheKey)
    )
    const resolvedLayout = buildCachedWysiwygDraftParagraphLayout(
      draftLayoutCache,
      fragment,
      paragraph,
      draftState.text,
      textMeasurer,
      measureOptions,
    )
    const previousLayoutResult = lastDraftLayoutResultRef.current
    const draftLayoutIdentityReused = (
      draftLayoutCacheHit &&
      previousLayoutResult?.cacheKey === cacheKey
    )
    const layout = draftLayoutIdentityReused
      ? previousLayoutResult.layout
      : resolvedLayout
    if (!draftLayoutIdentityReused) {
      lastDraftLayoutResultRef.current = { cacheKey, layout }
    }
    const durationMs = Math.max(0, startWysiwygPerfSpan() - startedAt)
    const draftMeasureEvent = {
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
      draftLayoutCacheHit,
      draftLayoutIdentityReused,
      source: "out-of-canvas-v2",
    } as const
    if (draftLayoutCacheHit) {
      recordWysiwygPerfAttributionEvent(WYSIWYG_PERF_TRACE_ENABLED, draftMeasureEvent)
    } else {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, draftMeasureEvent)
    }
    return { cacheKey, layout }
  }, [active, draftState, fragment, nodeId, paragraph, textMeasurer])
  const draftLayout = draftLayoutResult?.layout ?? null

  const draftFragments = useMemo<PageFragment[]>(() => {
    if (!fragment || !draftLayout) return []
    const splitKey = [
      draftLayoutResult?.cacheKey ?? "no-layout-key",
      draftIslandPagesSplitSignature(pages),
    ].join("||")
    const previousSplitResult = lastDraftFragmentSplitResultRef.current
    if (previousSplitResult?.key === splitKey) return previousSplitResult.fragments
    const startedAt = startWysiwygPerfSpan()
    const fragments = pages && pages.length > 0
      ? splitWysiwygDraftVisualFragments({
        sourceFragment: fragment,
        draftLines: draftLayout.lines,
        draftHeight: draftLayout.height,
        pages,
      })
      : [{
        ...fragment,
        height: draftLayout.height,
        lines: draftLayout.lines,
      }]
    const source = pages && pages.length > 0 ? "split-pages" : "single-fragment-fallback"
    const surfaceKeySignature = fragments.map(draftIslandSurfaceKey).join(";")
    const splitTelemetry = classifyWysiwygDraftFragmentSplitTelemetry(
      draftFragmentSplitTraceRef.current,
      {
        nodeId: fragment.nodeId,
        draftVersion: draftState?.revision,
        textLength: draftState?.text.length,
        lineCount: draftLayout.lines.length,
        paragraphHeight: draftLayout.height,
        candidatePageCount: pages?.length ?? 0,
        source,
        sourceFragment: fragment,
        fragments,
        surfaceKeySignature,
      },
    )
    draftFragmentSplitTraceRef.current = splitTelemetry.nextState
    const reuseDecision = resolveWysiwygDraftFragmentSplitReuse(
      draftFragmentSplitReuseRef.current,
      splitTelemetry,
      fragments,
    )
    draftFragmentSplitReuseRef.current = reuseDecision.nextState
    const visualFragments = reuseDecision.fragments
    const pageIndexes = draftIslandPageIndexes(visualFragments)
    const fragmentSplitEvent = {
      kind: "flowdoc-island-fragment-split",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: fragment.nodeId,
      pageIndex: fragment.pageIndex,
      draftVersion: draftState?.revision,
      textLength: draftState?.text.length,
      lineCount: draftLayout.lines.length,
      paragraphHeight: draftLayout.height,
      draftFragmentCount: visualFragments.length,
      draftPageCount: pageIndexes.length,
      draftCandidatePageCount: pages?.length ?? 0,
      pageIndexes: pageIndexes.length > 0 ? pageIndexes.join(",") : undefined,
      source,
      ...splitTelemetry.metadata,
      ...reuseDecision.metadata,
    } as const
    if (splitTelemetry.shouldEmitEvent) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, fragmentSplitEvent)
    } else {
      recordWysiwygPerfAttributionEvent(WYSIWYG_PERF_TRACE_ENABLED, fragmentSplitEvent)
    }
    lastDraftFragmentSplitResultRef.current = { key: splitKey, fragments: visualFragments }
    return visualFragments
  }, [draftLayout, draftLayoutResult?.cacheKey, fragment, pages])

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

  const draftFragmentCount = draftFragments.length
  const draftPageCount = useMemo(() => draftIslandPageIndexes(draftFragments).length, [draftFragments])
  const draftPageIndexes = useMemo(() => draftIslandPageIndexSummary(draftFragments), [draftFragments])
  const draftSurfaceCount = draftSurfaces.length
  const draftMissingSurfaceCount = Math.max(0, draftFragmentCount - draftSurfaceCount)

  const draftSurfaceAnchorsReady = useMemo(() => (
    draftSurfaces.length > 0 &&
    draftSurfaces.every((surface) => (
      resolveDraftIslandAnchorElement(surface.pageKey, anchorElementsByPageKey, getPageElement) != null
    ))
  ), [anchorElementsByPageKey, draftSurfaces, getPageElement])

  useEffect(() => {
    latestSurfacesRef.current = draftSurfaces
  }, [draftSurfaces])

  const draftSurfaceSignature = useMemo(() => (
    draftSurfaces.map((surface) => [
      surface.key,
      surface.pageKey,
      surface.fragment.pageIndex,
      surface.fragment.fragmentIndex ?? "null",
      surface.fragment.lineStart ?? "null",
      surface.fragment.lineEnd ?? "null",
      surface.fragment.lines?.length ?? 0,
      surface.fragment.x,
      surface.fragment.y,
      surface.fragment.width,
      surface.fragment.height,
    ].join(":")).join(";")
  ), [draftSurfaces])

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

    const previous = lastHeightPreviewRef.current
    const isSameLineSamePage =
      previous?.key === key &&
      previous.lineCount === totalLineCount &&
      previous.draftPageCount === draftPageCount &&
      !draftReflowDecision

    if (isSameLineSamePage && Math.abs(previous.height - visualHeightPt) < 0.5) {
      return
    }

    if (!shouldReportDraftIslandHeightPreview({
      previous,
      key,
      nextHeight: visualHeightPt,
      fragmentHeight: fragment.height,
    })) {
      return
    }
    lastHeightPreviewRef.current = {
      key,
      height: visualHeightPt,
      lineCount: totalLineCount,
      draftPageCount,
      reflowKind: draftReflowDecision?.kind,
    }
    if (heightPreviewTimerRef.current !== null) {
      clearTimeout(heightPreviewTimerRef.current)
      heightPreviewTimerRef.current = null
    }
    if (heightPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(heightPreviewFrameRef.current)
      heightPreviewFrameRef.current = null
    }
    const dispatchHeightPreview = () => {
      heightPreviewFrameRef.current = null
      onHeightChange(nodeId, visualHeightPt, fragment.pageIndex, draftReflowDecision ?? undefined)
    }
    const delayMs = resolveDraftIslandHeightPreviewDelayMs({
      shouldPatchBoundaryHeight,
      reflow: draftReflowDecision,
    })
    if (delayMs > 0) {
      let delayedFrameId: number | null = null
      const timerId = setTimeout(() => {
        if (heightPreviewTimerRef.current !== timerId) return
        heightPreviewTimerRef.current = null
        delayedFrameId = window.requestAnimationFrame(dispatchHeightPreview)
        heightPreviewFrameRef.current = delayedFrameId
      }, delayMs)
      heightPreviewTimerRef.current = timerId
      return () => {
        if (heightPreviewTimerRef.current === timerId) {
          clearTimeout(timerId)
          heightPreviewTimerRef.current = null
        }
        if (delayedFrameId !== null && heightPreviewFrameRef.current === delayedFrameId) {
          window.cancelAnimationFrame(delayedFrameId)
          heightPreviewFrameRef.current = null
        }
      }
    }
    const frameId = window.requestAnimationFrame(dispatchHeightPreview)
    heightPreviewFrameRef.current = frameId
    return () => {
      if (heightPreviewFrameRef.current !== frameId) return
      window.cancelAnimationFrame(frameId)
      heightPreviewFrameRef.current = null
    }
  }, [active, draftReflowDecision, fragment, nodeId, onHeightChange, visualHeightPt])

  useLayoutEffect(() => {
    if (!active || draftSurfaces.length === 0) {
      if (Object.keys(anchorElementsByPageKeyRef.current).length === 0) return undefined
      anchorElementsByPageKeyRef.current = {}
      setAnchorElementsByPageKey({})
      return undefined
    }
    const nextRecord: Record<string, HTMLElement> = {}
    for (const surface of draftSurfaces) {
      const anchor = getPageElement(surface.pageKey)
      if (anchor) nextRecord[surface.pageKey] = anchor
    }
    const current = anchorElementsByPageKeyRef.current
    const currentKeys = Object.keys(current)
    const nextKeys = Object.keys(nextRecord)
    if (
      currentKeys.length === nextKeys.length &&
      nextKeys.every((key) => current[key] === nextRecord[key])
    ) {
      return undefined
    }
    anchorElementsByPageKeyRef.current = nextRecord
    setAnchorElementsByPageKey(nextRecord)
    return undefined
  }, [active, draftSurfaces, getPageElement])

  useEffect(() => {
    if (!active) return
    inputBridgeRef.current?.focus({ preventScroll: true })
  }, [active, nodeId])

  const flushParentDraft = useCallback((source: string): boolean => {
    const current = latestDraftRef.current
    if (!current || parentSyncedRevisionRef.current === current.revision) {
      parentSyncScheduledDelayMsRef.current = null
      return false
    }
    const startedAt = startWysiwygPerfSpan()
    const scheduledDelayMs = parentSyncScheduledDelayMsRef.current
    parentSyncScheduledDelayMsRef.current = null
    parentSyncedRevisionRef.current = current.revision
    onDraftChange(current.nodeId, current.text, current.caretOffset, current.selection, source, current.revision)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-island-parent-sync", startedAt, {
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: current.text.length,
      source,
      scheduledDelayMs: scheduledDelayMs ?? undefined,
    })
    return true
  }, [onDraftChange])

  useEffect(() => {
    if (!active) return
    return registerWysiwygDraftFlushHandler(() => {
      flushParentDraft("global-flush")
    })
  }, [active, flushParentDraft])


  useEffect(() => {
    if (!shouldQueueDraftIslandPageBoundaryReflow({
      active,
      nodeId,
      fragment,
      reflow: draftReflowDecision,
      draftRevision: draftState?.revision,
      hasReflowHandler: onReflowDecision != null,
    })) return
    if (!nodeId || !fragment || !draftReflowDecision || !onReflowDecision) return
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
    draftState?.revision,
    flushParentDraft,
    fragment,
    nodeId,
    onReflowDecision,
  ])

  const scheduleParentSync = useCallback((source: string, textChanged: boolean) => {
    const delayMs = resolveDraftIslandParentSyncDelayMs({ source, textChanged })
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncScheduledDelayMsRef.current = delayMs

    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-parent-sync",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId,
      action: "scheduled",
      source,
      active: true,
    })

    parentSyncTimerRef.current = setTimeout(() => {
      parentSyncTimerRef.current = null

      const now = performance.now()
      const timeSinceLastInput = now - lastInputAtRef.current
      const isQuiet = timeSinceLastInput >= 120

      if (activeInputEpochRef.current !== 0 || !isQuiet) {
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-island-parent-sync",
          startedAt: startWysiwygPerfSpan(),
          durationMs: 0,
          nodeId,
          action: "rescheduled-active-input",
          source,
          active: true,
        })
        scheduleParentSync("rescheduled-active-input", true)
        return
      }

      const flushed = flushParentDraft("idle-debounce")
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-island-parent-sync",
        startedAt: startWysiwygPerfSpan(),
        durationMs: 0,
        nodeId,
        action: "flushed-idle",
        source,
        active: flushed,
      })
    }, delayMs)
  }, [flushParentDraft, nodeId])

  useEffect(() => {
    if (!active || !nodeId) return undefined
    const isInsideCurrentIsland = (event: globalThis.PointerEvent): boolean => {
      const path = event.composedPath()
      return path.some((target) => {
        if (!(target instanceof Element)) return false
        const owner = target.closest?.('[data-wysiwyg-draft-editor-island="true"], [data-wysiwyg-input-bridge="true"]')
        return owner?.getAttribute("data-inline-edit-node-id") === nodeId
      })
    }
    const handleDocumentPointerDownCapture = (event: globalThis.PointerEvent) => {
      if (isInsideCurrentIsland(event)) return
      const currentBeforeFlush = latestDraftRef.current
      const startedAt = startWysiwygPerfSpan()
      if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
      parentSyncTimerRef.current = null
      parentSyncScheduledDelayMsRef.current = null
      const flushed = flushParentDraft("outside-pointerdown")
      if (flushed) outsidePointerFlushPendingRef.current = true
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-island-blur-handoff", startedAt, {
        nodeId: currentBeforeFlush?.nodeId,
        draftVersion: currentBeforeFlush?.revision,
        textLength: currentBeforeFlush?.text.length,
        action: "outside-pointerdown-parent-sync",
        active: flushed,
      })
    }
    document.addEventListener("pointerdown", handleDocumentPointerDownCapture, true)
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDownCapture, true)
    }
  }, [active, flushParentDraft, nodeId])

  useEffect(() => () => {
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncTimerRef.current = null
    parentSyncScheduledDelayMsRef.current = null
    if (lastBeforeInputClearTimerRef.current) clearTimeout(lastBeforeInputClearTimerRef.current)
    lastBeforeInputClearTimerRef.current = null
    if (inputBridgeEchoSuppressionTimerRef.current) clearTimeout(inputBridgeEchoSuppressionTimerRef.current)
    inputBridgeEchoSuppressionTimerRef.current = null

    if (!allowUnmountParentSyncRef.current) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-island-lifecycle",
        startedAt: startWysiwygPerfSpan(),
        durationMs: 0,
        nodeId,
        action: "unmount-parent-sync-suppressed",
        active: false,
      })
      return
    }

    if (suppressNextUnmountParentSyncRef.current) {
      suppressNextUnmountParentSyncRef.current = false
      return
    }

    const flushed = flushParentDraft("unmount")
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-lifecycle",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId,
      action: "unmount-parent-sync-flushed",
      active: flushed,
    })
  }, [flushParentDraft, nodeId])

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
    const textChanged = current.text !== change.text

    const isTextInputSource =
      (source.startsWith("key:") ||
       source.startsWith("beforeinput:") ||
       source.startsWith("input:") ||
       source.startsWith("clipboard-paste")) &&
      source !== "rescheduled-active-input"

    if (isTextInputSource) {
      lastInputAtRef.current = performance.now()
      activeInputEpochRef.current += 1
      const epoch = activeInputEpochRef.current

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (activeInputEpochRef.current === epoch) {
            activeInputEpochRef.current = 0
          }
        })
      })
    }

    const next = {
      ...current,
      text: change.text,
      caretOffset: nextCaretOffset,
      selection: nextSelection,
      revision: current.revision + 1,
    }
    if (draftStoreSession) {
      wysiwygDraftStore.setState({
        nodeId: current.nodeId,
        text: change.text,
        caretIndex: nextCaretOffset,
        selection: nextSelection,
        source,
      })
    }
    setDraftState(next)
    latestDraftRef.current = next
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
    scheduleParentSync(source, textChanged)
    return true
  }, [draftStoreSession, scheduleParentSync])

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
      if (isUndoShortcut(event) && onRequestUndo) {
        event.preventDefault()
        event.stopImmediatePropagation()
        onRequestUndo()
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
    onRequestUndo,
    readClipboardText,
    copyTextToClipboard,
  ])

  const clearPendingParentSync = useCallback(() => {
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncTimerRef.current = null
    parentSyncScheduledDelayMsRef.current = null
  }, [])

  const applyStructuralEnter = useCallback((event: KeyboardEvent<Element> | null, current: DraftIslandState, source: string) => {
    if (!onSplitParagraph) return false
    if (event && (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)) return false
    if (dropGuardedStructuralKey("Enter", current, source, "split", event)) return true
    const currentTextStartedAt = startWysiwygPerfSpan()
    const currentTextLength = current.text.length
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: currentTextStartedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - currentTextStartedAt),
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: currentTextLength,
      operation: "split",
      source,
      action: "current-text-resolve",
    })
    const caretStartedAt = startWysiwygPerfSpan()
    const range = draftSelectionRange(current)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: caretStartedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - caretStartedAt),
      nodeId: current.nodeId,
      draftVersion: current.revision,
      selectionCollapsed: range.isCollapsed,
      selectionRangeLength: Math.abs(range.end - range.start),
      operation: "split",
      source,
      action: "caret-resolve",
    })
    const draftResolveStartedAt = startWysiwygPerfSpan()
    const splitInput = buildSplitEditInput("", current.text, range.start, range.end)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: draftResolveStartedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - draftResolveStartedAt),
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: splitInput.text.length,
      selectionCollapsed: range.isCollapsed,
      selectionRangeLength: Math.abs(range.end - range.start),
      operation: "split",
      source,
      action: "draft-split-text-resolve",
    })
    engageStructuralEditGuard("split", current, source, "Enter")
    clearPendingParentSync()
    pointerSelectionDragRef.current = null
    suppressNextUnmountParentSyncRef.current = true
    parentSyncedRevisionRef.current = current.revision
    const startedAt = startWysiwygPerfSpan()
    onSplitParagraph(current.nodeId, splitInput.splitIndex, splitInput.text)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-structural-edit",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: current.text.length,
      source,
      action: "split-paragraph",
    })
    return true
  }, [clearPendingParentSync, dropGuardedStructuralKey, engageStructuralEditGuard, onSplitParagraph])

  const applyStructuralBackspace = useCallback((event: KeyboardEvent<Element>, current: DraftIslandState) => {
    if (!onMergeParagraph) return false
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false
    if (dropGuardedStructuralKey("Backspace", current, "key:Backspace", current.text.length === 0 ? "delete-empty" : "merge", event)) return true
    const currentTextStartedAt = startWysiwygPerfSpan()
    const currentTextLength = current.text.length
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: currentTextStartedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - currentTextStartedAt),
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: currentTextLength,
      operation: currentTextLength === 0 ? "delete-empty" : "merge",
      source: "key:Backspace",
      action: "current-text-resolve",
    })
    const caretStartedAt = startWysiwygPerfSpan()
    const range = draftSelectionRange(current)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: caretStartedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - caretStartedAt),
      nodeId: current.nodeId,
      draftVersion: current.revision,
      selectionCollapsed: range.isCollapsed,
      selectionRangeLength: Math.abs(range.end - range.start),
      operation: currentTextLength === 0 ? "delete-empty" : "merge",
      source: "key:Backspace",
      action: "caret-resolve",
    })
    if (!range.isCollapsed || range.start !== 0) return false
    const operation = current.text.length === 0 ? "delete-empty" : "merge"
    engageStructuralEditGuard(operation, current, "key:Backspace", "Backspace")
    clearPendingParentSync()
    pointerSelectionDragRef.current = null
    suppressNextUnmountParentSyncRef.current = true
    parentSyncedRevisionRef.current = current.revision
    const startedAt = startWysiwygPerfSpan()
    onMergeParagraph(current.nodeId, current.text)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-structural-edit",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: current.text.length,
      source: "key:Backspace",
      action: "merge-paragraph",
    })
    return true
  }, [clearPendingParentSync, dropGuardedStructuralKey, engageStructuralEditGuard, onMergeParagraph])

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
      allowUnmountParentSyncRef.current = true
      if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
      parentSyncTimerRef.current = null
      parentSyncScheduledDelayMsRef.current = null
      flushParentDraft("keyboard-exit")
      if (endEditRequestedRef.current) return
      endEditRequestedRef.current = true
      window.setTimeout(() => onEndEditRef.current(current.nodeId, "keyboard"), 0)
      return
    }
    if (isUndoShortcut(event) && onRequestUndo) {
      event.preventDefault()
      event.stopPropagation()
      onRequestUndo()
      return
    }
    if (handleClipboardShortcutKeyDown(event)) return

    if (onRichTextShortcut) {
      const keyInput = {
        key: event.key,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.nativeEvent.isComposing,
      }
      const snapshot: WysiwygLocalDraftSnapshot = {
        nodeId: current.nodeId,
        draftText: current.text,
        selection: current.selection ?? { anchorOffset: current.caretOffset ?? current.text.length, focusOffset: current.caretOffset ?? current.text.length },
        caretIndex: current.caretOffset,
        draftVersion: current.revision,
      }
      if (onRichTextShortcut(current.nodeId, keyInput, snapshot)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }

    if (event.key === "Enter") {
      const keydownStartedAt = startWysiwygPerfSpan()
      const handled = applyStructuralEnter(event, current, "key:Enter")
      if (!handled) {
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-structural-attribution",
          startedAt: keydownStartedAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - keydownStartedAt),
          nodeId: current.nodeId,
          draftVersion: current.revision,
          operation: "split",
          source: "key:Enter",
          action: "keydown-total",
          active: false,
        })
      }
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-structural-attribution",
          startedAt: keydownStartedAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - keydownStartedAt),
          nodeId: current.nodeId,
          draftVersion: current.revision,
          operation: "split",
          source: "key:Enter",
          action: "keydown-total",
          active: true,
        })
        return
      }
    }
    if (event.key === "Backspace") {
      const keydownStartedAt = startWysiwygPerfSpan()
      const handled = applyStructuralBackspace(event, current)
      if (!handled) {
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-structural-attribution",
          startedAt: keydownStartedAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - keydownStartedAt),
          nodeId: current.nodeId,
          draftVersion: current.revision,
          operation: current.text.length === 0 ? "delete-empty" : "merge",
          source: "key:Backspace",
          action: "keydown-total",
          active: false,
        })
      }
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-structural-attribution",
          startedAt: keydownStartedAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - keydownStartedAt),
          nodeId: current.nodeId,
          draftVersion: current.revision,
          operation: current.text.length === 0 ? "delete-empty" : "merge",
          source: "key:Backspace",
          action: "keydown-total",
          active: true,
        })
        return
      }
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
    onRequestUndo,
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
    lastBeforeInputChangeRef.current = {
      insertedText: nativeEvent.data ?? "",
      nextText: change.text,
    }
    if (lastBeforeInputClearTimerRef.current) clearTimeout(lastBeforeInputClearTimerRef.current)
    lastBeforeInputClearTimerRef.current = setTimeout(() => {
      lastBeforeInputChangeRef.current = null
      lastBeforeInputClearTimerRef.current = null
    }, INPUT_BRIDGE_BEFOREINPUT_SUPPRESSION_MS)
    applyDraftChange(change, `beforeinput:${inputType}`)
  }, [applyDraftChange, applyStructuralEnter])

  const handleInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent
    if (nativeEvent.isComposing || nativeEvent.inputType === "insertCompositionText") {
      event.currentTarget.value = ""
      if (event.currentTarget.textContent) event.currentTarget.textContent = ""
      return
    }
    const bridgeValue = event.currentTarget.value
    const nativeInsertedText = !nativeEvent.isComposing && nativeEvent.inputType === "insertText"
      ? nativeEvent.data ?? ""
      : ""
    const insertedText = nativeInsertedText || bridgeValue
    event.currentTarget.value = ""
    if (event.currentTarget.textContent) event.currentTarget.textContent = ""
    if (inputBridgeEchoSuppressedRef.current) return
    if (!insertedText) return
    if (lastBeforeInputChangeRef.current) {
      return
    }
    if (!nativeInsertedText && bridgeValue) {
      inputBridgeEchoSuppressedRef.current = true
      if (inputBridgeEchoSuppressionTimerRef.current) clearTimeout(inputBridgeEchoSuppressionTimerRef.current)
      inputBridgeEchoSuppressionTimerRef.current = setTimeout(() => {
        inputBridgeEchoSuppressedRef.current = false
        inputBridgeEchoSuppressionTimerRef.current = null
      }, INPUT_BRIDGE_BEFOREINPUT_SUPPRESSION_MS)
    }
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
    const currentTargetElement = input.currentTarget instanceof SVGSVGElement ? input.currentTarget : null
    if (!currentTargetElement) return null
    const pointerTargetElement = Array.from(
      currentTargetElement.ownerDocument.querySelectorAll<SVGSVGElement>('[data-wysiwyg-text-engine-layer="true"]'),
    ).find((candidate) => {
      if (candidate.getAttribute("data-inline-edit-node-id") !== fragment.nodeId) return false
      const rect = candidate.getBoundingClientRect()
      return (
        input.clientX >= rect.left &&
        input.clientX <= rect.right &&
        input.clientY >= rect.top &&
        input.clientY <= rect.bottom
      )
    }) ?? currentTargetElement
    const targetSurfaceKey = pointerTargetElement.getAttribute("data-wysiwyg-island-surface-key")
    const targetPageKey = pointerTargetElement.getAttribute("data-wysiwyg-island-page-key")
    const surfaces = latestSurfacesRef.current
    const surface = (targetSurfaceKey ? surfaces.find((candidate) => candidate.key === targetSurfaceKey) : null) ??
      (targetPageKey ? surfaces.find((candidate) => candidate.pageKey === targetPageKey) : null) ??
      surfaces[0] ??
      null
    if (!surface) return null
    const svgRect = pointerTargetElement.getBoundingClientRect()
    if (svgRect.width <= 0 || svgRect.height <= 0) return null
    const viewBoxWidth = surface.fragment.width
    const viewBoxHeight = resolveDraftIslandSurfaceHeightPt(fragment, surface.fragment)
    const point = {
      x: surface.fragment.x + ((input.clientX - svgRect.left) / svgRect.width) * viewBoxWidth,
      y: surface.fragment.y + ((input.clientY - svgRect.top) / svgRect.height) * viewBoxHeight,
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
  }, [fragment, textMeasurer])

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

  const selectWordFromPointerEvent = useCallback((event: MouseEvent<SVGSVGElement>, source: string) => {
    focusInputBridge()
    pointerSelectionDragRef.current = null
    const candidate = resolvePointerCandidate(event, source)
    const current = latestDraftRef.current
    if (!candidate || !current) return false
    const wordSelection = resolveWysiwygWordSelectionRange(current.text, candidate.offset)
    if (!wordSelection) return false
    return applyPointerSelection(wordSelection.anchorOffset, wordSelection.focusOffset, source)
  }, [applyPointerSelection, focusInputBridge, resolvePointerCandidate])

  const handleDoubleClick = useCallback((event: MouseEvent<SVGSVGElement>) => {
    event.preventDefault()
    event.stopPropagation()
    selectWordFromPointerEvent(event, "pointer-select-word-double-click")
  }, [selectWordFromPointerEvent])

  const handleClick = useCallback((event: MouseEvent<SVGSVGElement>) => {
    if (event.detail < 2) return
    event.preventDefault()
    event.stopPropagation()
    selectWordFromPointerEvent(event, "pointer-select-word-click-detail")
  }, [selectWordFromPointerEvent])

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

  const runRealBlurHandoff = useCallback((source: string) => {
    const blurStartedAt = startWysiwygPerfSpan()
    const currentBeforeFlush = latestDraftRef.current
    setCommitting(true)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-blur-handoff",
      startedAt: blurStartedAt,
      durationMs: 0,
      nodeId: currentBeforeFlush?.nodeId,
      draftVersion: currentBeforeFlush?.revision,
      textLength: currentBeforeFlush?.text.length,
      action: "blur-start",
      source,
    })
    pointerSelectionDragRef.current = null
    if (parentSyncTimerRef.current) clearTimeout(parentSyncTimerRef.current)
    parentSyncTimerRef.current = null
    parentSyncScheduledDelayMsRef.current = null

    // We are confirmed to be blurring outside the island/ending the edit session
    allowUnmountParentSyncRef.current = true

    if (suppressNextUnmountParentSyncRef.current) {
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-island-blur-handoff", blurStartedAt, {
        nodeId: currentBeforeFlush?.nodeId,
        draftVersion: currentBeforeFlush?.revision,
        textLength: currentBeforeFlush?.text.length,
        action: "blur-suppressed",
      })
      return
    }
    const flushed = flushParentDraft("blur")
    const current = latestDraftRef.current
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-island-blur-handoff", blurStartedAt, {
      nodeId: current?.nodeId ?? currentBeforeFlush?.nodeId,
      draftVersion: current?.revision ?? currentBeforeFlush?.revision,
      textLength: current?.text.length ?? currentBeforeFlush?.text.length,
      action: "after-parent-sync",
      active: flushed,
    })
    if (!current) return
    const runEndEdit = () => {
      if (endEditRequestedRef.current) {
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-island-blur-handoff",
          startedAt: startWysiwygPerfSpan(),
          durationMs: 0,
          nodeId: current.nodeId,
          draftVersion: current.revision,
          textLength: current.text.length,
          action: "end-edit-suppressed",
          source: "already-requested",
          active: false,
        })
        return
      }
      endEditRequestedRef.current = true
      const callbackStartedAt = startWysiwygPerfSpan()
      onEndEditRef.current(current.nodeId, "blur")
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-island-blur-handoff", callbackStartedAt, {
        nodeId: current.nodeId,
        draftVersion: current.revision,
        textLength: current.text.length,
        action: "end-edit-callback",
      })
    }
    const hadOutsidePointerFlush = outsidePointerFlushPendingRef.current
    outsidePointerFlushPendingRef.current = false
    const scheduleAfterPaint = () => {
      const scheduleCallback = () => {
        window.setTimeout(runEndEdit, 0)
      }
      if (typeof window.requestAnimationFrame !== "function") {
        scheduleCallback()
        return
      }
      window.requestAnimationFrame(scheduleCallback)
    }
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-blur-handoff",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: current.nodeId,
      draftVersion: current.revision,
      textLength: current.text.length,
      action: "end-edit-scheduled-after-paint",
      source: hadOutsidePointerFlush ? "outside-pointerdown-parent-sync" : "blur",
      active: true,
    })
    scheduleAfterPaint()
  }, [flushParentDraft])

  const handleBlur = useCallback((event: FocusEvent<Element>) => {
    const nextTarget = event.relatedTarget
    const currentBeforeFlush = latestDraftRef.current
    const currentParagraphNodeId = currentBeforeFlush?.nodeId ?? nodeId

    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-focus",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: currentParagraphNodeId,
      action: "focusout",
      active: true,
    })

    if (currentParagraphNodeId && isFocusStillInsideDraftIsland(currentParagraphNodeId, nextTarget)) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-island-focus",
        startedAt: startWysiwygPerfSpan(),
        durationMs: 0,
        nodeId: currentParagraphNodeId,
        action: "blur-ignored-intra-island",
        source: "related-target-inside-island",
        active: false,
      })
      return
    }

    if (currentParagraphNodeId && nextTarget == null) {
      window.requestAnimationFrame(() => {
        const activeElement = document.activeElement
        if (isFocusStillInsideDraftIsland(currentParagraphNodeId, activeElement)) {
          recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
            kind: "flowdoc-island-focus",
            startedAt: startWysiwygPerfSpan(),
            durationMs: 0,
            nodeId: currentParagraphNodeId,
            action: "blur-ignored-active-element-inside-island",
            source: "active-element-inside-island",
            active: false,
          })
          return
        }
        runRealBlurHandoff("active-element-outside-island")
      })
      return
    }

    runRealBlurHandoff("related-target-outside-island")
  }, [nodeId, runRealBlurHandoff])

  const handleFocusIn = useCallback(() => {
    const currentBeforeFlush = latestDraftRef.current
    const currentParagraphNodeId = currentBeforeFlush?.nodeId ?? nodeId
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-focus",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: currentParagraphNodeId,
      action: "focusin",
      active: true,
    })
  }, [nodeId])

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
    const rootRenderTelemetry = classifyWysiwygDraftIslandRootRenderTelemetry(
      draftIslandRootRenderTraceRef.current,
      {
        nodeId: current?.nodeId ?? null,
        draftRevision: current?.revision,
        textLength: current?.text.length,
        caretOffset: current?.caretOffset,
        selectionAnchorOffset: current?.selection?.anchorOffset,
        selectionFocusOffset: current?.selection?.focusOffset,
        lineCount: totalLineCount,
        paragraphHeight: activeDraftFragment?.height,
        draftFragmentCount,
        draftPageCount,
        draftSurfaceCount,
        draftMissingSurfaceCount,
        pageIndexes: draftPageIndexes,
        surfaceSignature: draftSurfaceSignature,
        anchorsReady: draftSurfaceAnchorsReady,
        inputToVisibleActive: inputStartedAt !== null,
      },
    )
    draftIslandRootRenderTraceRef.current = rootRenderTelemetry.nextState
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
      draftFragmentCount,
      draftPageCount,
      draftSurfaceCount,
      draftMissingSurfaceCount,
      pageIndexes: draftPageIndexes,
      source: phase,
      ...rootRenderTelemetry.metadata,
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
        draftFragmentCount,
        draftPageCount,
        draftSurfaceCount,
        draftMissingSurfaceCount,
        pageIndexes: draftPageIndexes,
        source: "input-to-island-visible-lines",
      })
      lastInputStartedAtRef.current = null
    }
  }, [
    activeDraftFragment?.height,
    draftFragmentCount,
    draftMissingSurfaceCount,
    draftPageCount,
    draftPageIndexes,
    draftSurfaceAnchorsReady,
    draftSurfaceCount,
    draftSurfaceSignature,
    totalLineCount,
  ])

  const handleIslandSurfaceRender = useCallback<ProfilerOnRenderCallback>((
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    const current = latestDraftRef.current
    const selectionAnchorOffset = current?.selection?.anchorOffset ?? null
    const selectionFocusOffset = current?.selection?.focusOffset ?? null
    const selectionCollapsed = (
      selectionAnchorOffset == null ||
      selectionFocusOffset == null ||
      selectionAnchorOffset === selectionFocusOffset
    )
    const surfaceRenderTelemetry = classifyWysiwygDraftIslandSurfaceRenderTelemetry(
      draftIslandSurfaceRenderTraceRef.current[id] ?? null,
      {
        nodeId: current?.nodeId ?? null,
        componentName: id,
        draftRevision: current?.revision,
        textLength: current?.text.length,
        caretOffset: current?.caretOffset,
        selectionAnchorOffset,
        selectionFocusOffset,
        lineCount: totalLineCount,
        paragraphHeight: activeDraftFragment?.height,
        draftFragmentCount,
        draftPageCount,
        draftSurfaceCount,
        draftMissingSurfaceCount,
        pageIndexes: draftPageIndexes,
        surfaceSignature: draftSurfaceSignature,
        anchorsReady: draftSurfaceAnchorsReady,
        inputToVisibleActive: lastInputStartedAtRef.current !== null,
      },
    )
    draftIslandSurfaceRenderTraceRef.current[id] = surfaceRenderTelemetry.nextState
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-surface-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      nodeId: current?.nodeId,
      draftVersion: current?.revision,
      textLength: current?.text.length,
      lineCount: totalLineCount,
      paragraphHeight: activeDraftFragment?.height,
      draftFragmentCount,
      draftPageCount,
      draftSurfaceCount,
      draftMissingSurfaceCount,
      pageIndexes: draftPageIndexes,
      componentName: id,
      selectionCollapsed,
      selectionRangeLength: selectionCollapsed || selectionAnchorOffset == null || selectionFocusOffset == null
        ? 0
        : Math.abs(selectionFocusOffset - selectionAnchorOffset),
      source: phase,
      ...surfaceRenderTelemetry.metadata,
    })
  }, [
    activeDraftFragment?.height,
    draftFragmentCount,
    draftMissingSurfaceCount,
    draftPageCount,
    draftPageIndexes,
    draftSurfaceAnchorsReady,
    draftSurfaceCount,
    draftSurfaceSignature,
    totalLineCount,
  ])

  useLayoutEffect(() => {
    if (!active || !nodeId || structuralRefocusStartedAt == null || !draftSurfaceAnchorsReady) return
    const paintKey = `${nodeId}:${structuralRefocusStartedAt}`
    if (lastStructuralRefocusPaintKeyRef.current === paintKey) return
    lastStructuralRefocusPaintKeyRef.current = paintKey
    const durationMs = Math.max(0, startWysiwygPerfSpan() - structuralRefocusStartedAt)
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "enter-key-to-optimistic-island-visible",
      startedAt: structuralRefocusStartedAt,
      durationMs,
      nodeId,
      pageIndex: activeDraftFragment?.pageIndex ?? fragment?.pageIndex,
      textLength: draftState?.text.length,
      lineCount: totalLineCount,
      paragraphHeight: activeDraftFragment?.height,
      source: "out-of-canvas-v2",
      active: true,
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "enter-key-to-new-caret-visible",
      startedAt: structuralRefocusStartedAt,
      durationMs,
      nodeId,
      pageIndex: activeDraftFragment?.pageIndex ?? fragment?.pageIndex,
      textLength: draftState?.text.length,
      lineCount: totalLineCount,
      paragraphHeight: activeDraftFragment?.height,
      source: "out-of-canvas-v2",
      active: true,
    })
    onStructuralRefocusPainted?.(nodeId)
  }, [
    active,
    activeDraftFragment?.height,
    activeDraftFragment?.pageIndex,
    draftState?.text.length,
    draftSurfaceAnchorsReady,
    fragment?.pageIndex,
    nodeId,
    onStructuralRefocusPainted,
    structuralRefocusStartedAt,
    totalLineCount,
  ])

  if (
    !active ||
    !nodeId ||
    !paragraph ||
    !fragment ||
    !pageKey ||
    !draftState ||
    draftState.nodeId !== nodeId ||
    draftSurfaces.length === 0 ||
    !draftLayout
  ) {
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
  const draftSurfaceLiveLayerContextValue: DraftIslandSurfaceLiveLayerContextValue = {
    surfacesByKey: Object.fromEntries(
      draftSurfaces.map((surface) => [surface.key, surface]),
    ),
    renderProps,
    nodeId,
    draftRevision: draftState.revision,
    draftTextLength: draftState.text.length,
    draftCaretOffset: draftState.caretOffset,
    selectionStart,
    selectionEnd,
    selectionAnchorOffset: draftState.selection?.anchorOffset ?? null,
    selectionFocusOffset: draftState.selection?.focusOffset ?? null,
    selectedDraftTextLength,
    totalSelectionOverlayCount,
    totalLineCount,
    textMeasurer,
  }
  const inputBridgeStyle: CSSProperties = {
    ...hiddenInputBridgeStyle,
  }
  const allowInlineFallback = typeof window === "undefined"

  return (
    <Profiler id="flowdoc-draft-editor-island-v2" onRender={handleIslandRender}>
      <DraftIslandSurfaceLiveLayerContext.Provider value={draftSurfaceLiveLayerContextValue}>
        <textarea
          ref={inputBridgeRef}
          data-wysiwyg-input-bridge="true"
          data-wysiwyg-input-bridge-mode="hidden-flowdoc-draft-editor-island-v2"
          data-wysiwyg-island-committing={committing ? "true" : undefined}
          data-wysiwyg-visible-area-pointer-target="false"
          data-inline-edit-node-id={nodeId}
          spellCheck={false}
          readOnly={committing}
          role="textbox"
          aria-label="WYSIWYG text input"
          style={inputBridgeStyle}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleBeforeInput}
          onInput={handleInput}
          onCompositionStart={() => {
            onCompositionChange?.(nodeId, true)
          }}
          onCompositionEnd={() => {
            onCompositionChange?.(nodeId, false)
          }}
          onPaste={handlePaste}
          onCopy={handleCopy}
          onCut={handleCut}
          onBlur={handleBlur}
          onFocus={handleFocusIn}
        />
        {draftSurfaces.map((surface, surfaceIndex) => {
          const anchorElement = resolveDraftIslandAnchorElement(surface.pageKey, anchorElementsByPageKey, getPageElement)
          if (!anchorElement && !allowInlineFallback) return null

          const islandSurface = (
            <MemoizedDraftIslandSurfaceView
              key={surface.key}
              surface={surface}
              surfaceIndex={surfaceIndex}
              sourceFragment={fragment}
              renderProps={renderProps}
              scale={scale}
              nodeId={nodeId}
              draftRevision={draftState.revision}
              draftTextLength={draftState.text.length}
              draftCaretOffset={draftState.caretOffset}
              selectionStart={selectionStart}
              selectionEnd={selectionEnd}
              selectionAnchorOffset={draftState.selection?.anchorOffset ?? null}
              selectionFocusOffset={draftState.selection?.focusOffset ?? null}
              selectedDraftTextLength={selectedDraftTextLength}
              totalSelectionOverlayCount={totalSelectionOverlayCount}
              totalLineCount={totalLineCount}
              draftSurfaceCount={draftSurfaces.length}
              isPageBoundaryPreview={isPageBoundaryPreview}
              reflowKind={draftReflowDecision?.kind ?? undefined}
              reflowReason={draftReflowDecision?.reason ?? undefined}
              committing={committing}
              anchorMode={anchorElement ? "page-overlay" : "inline-fallback"}
              textMeasurer={textMeasurer}
              onKeyDown={handleKeyDown}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onPaste={handlePaste}
              onCopy={handleCopy}
              onCut={handleCut}
              onBlur={handleBlur}
              onFocus={handleFocusIn}
              onIslandSurfaceRender={handleIslandSurfaceRender}
              liveLayerMode={draftSurfaceLiveLayerMode}
            />
          )
          return anchorElement ? createPortal(islandSurface, anchorElement, surface.key) : islandSurface
        })}
      </DraftIslandSurfaceLiveLayerContext.Provider>
    </Profiler>
  )
}

const MemoizedFlowdocDraftEditorIslandRuntime = memo(
  FlowdocDraftEditorIslandRuntime,
  areDraftIslandRuntimePropsEqual,
)
MemoizedFlowdocDraftEditorIslandRuntime.displayName = "MemoizedFlowdocDraftEditorIslandRuntime"

export function FlowdocDraftEditorIslandRoot(props: FlowdocDraftEditorIslandRootProps) {
  return <MemoizedFlowdocDraftEditorIslandRuntime {...props} />
}
