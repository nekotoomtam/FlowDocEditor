"use client"

import { Profiler, memo, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ProfilerOnRenderCallback, type WheelEvent as ReactWheelEvent } from "react"
import type { TextMeasurer } from "@/layout"
import {
  resolveFragmentBoxLayoutPrimitives,
  resolveHeaderFooterHorizontalBox,
  type PaginatedDocument,
  type PageFragment,
  type PaginatedLine,
  type PaginatedPage,
  type ParagraphRenderProps,
  type ResolvedBorderSide,
} from "@/pagination"
import { canRemoveFlowTableColumn, canRemoveFlowTableRow, getTextRunParagraphText, isPlainTextParagraph, isTextRunOnlyParagraph } from "@/document"
import { tryResolveFlowTableGrid } from "@/document/flowTableGrid"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, FlowTableRowNode, LayoutNode, ParagraphNode } from "@/schema"
import type { DragSource } from "@/placement/types"
import type { DragState, ResizeDrag, MinHeightDrag, MarginDrag, MarginEditMode, HeaderFooterEditMode, HeaderFooterReservedDrag } from "./editorInteractionTypes"
import type { FragmentDrift } from "./comparePagination"
import { getRowGeometry } from "@/placement/geometry"
import { buildWysiwygDraftParagraphLayout } from "./wysiwygDraftParagraphLayout"
import { ParagraphTextSurface } from "./ParagraphTextSurface"
import type { WysiwygTextPointerFragmentTarget } from "./wysiwygTextSelectionState"
import type { ParagraphTextSurfaceStructuralEditGuard } from "./structuralEdit/paragraphTextSurfaceFallbackBridge"
import { getWysiwygFragmentTextRange, resolveCaretOffsetFromPointInFragment } from "./wysiwygCaretMapping"
import {
  classifyWysiwygTextReflow,
  shouldPrepareWysiwygTableCellDraftVisualPreview,
  shouldQueueSettledTableCellDraftPaginationFromVisualPreview,
  WYSIWYG_TABLE_CELL_VISUAL_PREVIEW_REFLOW_DECISION,
  type WysiwygTextReflowDecision,
} from "./wysiwygReflow"
import {
  createWysiwygDraftVisualPreview,
  shiftPageFragmentY,
  shiftWysiwygDraftPreviewDownstreamFragments,
  shiftWysiwygDraftPreviewSourcePageFragments,
  splitWysiwygDraftVisualFragments,
  type WysiwygDraftVisualPreview,
} from "./wysiwygDraftVisualPreview"
import { isParagraphInsideFlowStack, isParagraphInsideRowStack, isParagraphInsideTableCell } from "./wysiwygTextEligibility"
import { resolveActiveInlineEditPageIndex } from "./editorPageFollow"
import { buildSelectionContext, type SelectionContextItem } from "./selectionContext"
import type { WysiwygTextInputKey } from "./useWysiwygTextSession"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"
import { recordWysiwygPerfEvent, startWysiwygPerfSpan, type WysiwygPerfEvent } from "./wysiwygPerformance"
import {
  canvasViewportPageHasAnyNodeFragmentBridge,
  canvasViewportPageHasNodeFragmentBridge,
  createCanvasViewportMetricsBridge,
  createCanvasViewportRenderScopePerfFields,
  getCanvasViewportStructuralRenderScopeBridge,
  pageHasSuppressedBoundarySafePageBreakBridge,
  pageIsAffectedByStructuralIslandBridge,
  pageViewScopedEditPropsAffectPageBridge,
  pageViewStructuralTransitionAffectsPageBridge,
  shouldRenderLazyPageFrameBridge,
  shouldSuppressStalePageBreakForActiveWysiwygIslandBridge,
  type CanvasViewportBridgeStructuralIsland,
} from "./canvasViewportBridge"

// ─── Constants ────────────────────────────────────────────────────────────────

const INLINE_EDIT_CHROME_FILL = "#dbeafe"
const WYSIWYG_TABLE_CELL_DRAFT_CHROME_FILL = "#dbeafe"
const EMPTY_PAGE_FRAGMENTS: PageFragment[] = []
const EMPTY_SUPPRESSED_NODE_IDS: ReadonlySet<string> = new Set()
type HeaderFooterZone = "header" | "footer"

function useStableEvent<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  return useCallback((...args: TArgs) => callbackRef.current(...args), [])
}

function useStableOptionalEvent<TArgs extends unknown[], TResult>(
  callback: ((...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const stableCallback = useCallback((...args: TArgs): TResult => {
    const current = callbackRef.current
    return current?.(...args) as TResult
  }, [])
  return callback ? stableCallback : undefined
}

interface HeaderFooterZoneScrollState {
  sectionIndex: number
  zone: HeaderFooterZone
  offsetPt: number
}

interface ActiveEditFragmentRef {
  nodeId: string
  pageKey: string
  fragment: PageFragment
  visualOffsetY: number
}

export function resolveInlineEditVisualOffsetY({
  isInlineEditing,
  storedVisualOffsetY,
  currentVisualOffsetY,
}: {
  isInlineEditing: boolean
  storedVisualOffsetY: number | null | undefined
  currentVisualOffsetY: number
}): number {
  return isInlineEditing && storedVisualOffsetY != null
    ? storedVisualOffsetY
    : currentVisualOffsetY
}

function displayFragmentNodeType(nodeType: PageFragment["nodeType"]): string {
  if (nodeType === "flow-row") return "row"
  if (nodeType === "flow-stack") return "stack"
  if (nodeType === "flow-table") return "flow table"
  if (nodeType === "flow-table-row") return "flow row"
  if (nodeType === "flow-table-cell") return "flow cell"
  if (nodeType === "page-break") return "page break"
  return nodeType
}

export function shouldStartInlineEditOnSingleClick(input: {
  canInlineEditParagraph: boolean
  isTableCellParagraph: boolean
}): boolean {
  return input.canInlineEditParagraph
}

const DRAGGABLE_TYPES = new Set(["paragraph", "spacer", "divider", "page-break", "row", "flow-row", "flow-stack", "flow-table", "toc"])
const SELECTABLE_NODE_TYPES = new Set(["paragraph", "spacer", "divider", "page-break", "row", "flow-row", "flow-stack", "flow-table", "flow-table-row", "flow-table-cell", "toc"])
const PARAGRAPH_CHROME_Y = 3
const FLOW_STACK_PARAGRAPH_CHROME_Y = 0
const PARAGRAPH_LIVE_PREVIEW_GAP_Y = 2
const PAGE_BREAK_MARKER_HEIGHT = 18
const DROP_PREVIEW_FILL = "#99f6e4"
const DROP_PREVIEW_STROKE = "#0f766e"
const DROP_INSERTION_STROKE = "#0d9488"
const DROP_BLOCKED_FILL = "#fee2e2"
const DROP_BLOCKED_STROKE = "#dc2626"
const CANVAS_PATH_HOVER_DELAY_MS = 240
const CANVAS_PATH_BAR_HEIGHT = 18
const CANVAS_PATH_BAR_GAP = 4
const CANVAS_PATH_MIN_EDGE_GAP = 4
const CANVAS_ACTION_RAIL_BUTTON_SIZE = 22
const CANVAS_ACTION_RAIL_GAP = 4
const CANVAS_ACTION_RAIL_PADDING = 4
const CANVAS_ACTION_RAIL_OFFSET = 8
const LAZY_PAGE_RENDER_THRESHOLD = 24
const LAZY_PAGE_RENDER_ROOT_MARGIN_PX = 800
const LAZY_PAGE_RENDER_INITIAL_COUNT = 4
const BOUNDARY_SAFE_PAGE_BREAK_SUPPRESSION_FALLBACK_RANGE_PT = 96

const CANVAS_PATH_LABELS: Record<SelectionContextItem["type"], string> = {
  body: "BODY",
  paragraph: "PARAGRAPH",
  spacer: "SPACER",
  divider: "DIVIDER",
  "page-break": "PAGE BREAK",
  row: "ROW",
  stack: "STACK",
  "flow-row": "ROW",
  "flow-stack": "STACK",
  "flow-table": "TABLE",
  "flow-table-row": "ROW",
  "flow-table-cell": "CELL",
  toc: "TOC",
}

export type CanvasTableAction = "add-column" | "add-row" | "delete-column" | "delete-row" | "delete-table"

export type ActiveOutOfCanvasStructuralIsland = CanvasViewportBridgeStructuralIsland

function fragmentSliceIdentity(fragment: PageFragment): string {
  return [
    fragment.nodeType,
    fragment.nodeId,
    fragment.pageIndex,
    fragment.fragmentIndex ?? fragment.lineStart ?? "x",
    fragment.parentNodeId ?? "root",
  ].join("-")
}

export function buildEditorFragmentRenderKey(
  fragment: PageFragment,
  index: number,
  isInlineEditing: boolean,
): string {
  const sliceKey = `${fragmentSliceIdentity(fragment)}-${index}`
  return isInlineEditing
    ? `inline-edit-${sliceKey}`
    : `${sliceKey}-${fragment.lineStart ?? "x"}-${fragment.lineEnd ?? "x"}`
}

export function buildEditorFragmentClipPathId(pageKey: string, fragment: PageFragment, index?: number): string {
  return `cp-${pageKey}-${fragmentSliceIdentity(fragment)}${index == null ? "" : `-${index}`}`
}

function fragmentContainsInlineEditCaret(fragment: PageFragment, caretIndex: number | null): boolean {
  if (caretIndex == null) return false
  const range = getWysiwygFragmentTextRange(fragment)
  if (!range) return false
  if (caretIndex < range.start || caretIndex > range.end) return false
  return caretIndex < range.end || fragment.isContinued !== true
}

function isTableCellFragment(fragment: PageFragment | null | undefined): boolean {
  return fragment?.nodeType === "flow-table-cell"
}

function isTableRowFragment(fragment: PageFragment | null | undefined): boolean {
  return fragment?.nodeType === "flow-table-row"
}

function isTableRootFragment(fragment: PageFragment | null | undefined): boolean {
  return fragment?.nodeType === "flow-table"
}

function isTableStructureFragment(fragment: PageFragment, siblings: PageFragment[]): boolean {
  if (isTableRootFragment(fragment)) return true
  if (!isTableRowFragment(fragment) || !fragment.parentNodeId) return false
  return siblings.some((candidate) =>
    candidate.nodeId === fragment.parentNodeId &&
    isTableRootFragment(candidate)
  )
}

function findPageByIndex(paginated: PaginatedDocument, pageIndex: number): PaginatedPage | null {
  for (const section of paginated.sections) {
    const page = section.pages.find((candidate) => candidate.index === pageIndex)
    if (page) return page
  }
  return null
}

function tableCellDraftVisualChromeKey(fragment: PageFragment): string {
  return [
    fragment.nodeType,
    fragment.nodeId,
    fragment.parentNodeId ?? "root",
    fragment.pageIndex,
  ].join(":")
}

export function buildWysiwygTableCellDraftVisualChromeFragments(input: {
  paginated: PaginatedDocument
  preview: WysiwygDraftVisualPreview | null
}): Map<number, PageFragment[]> {
  const byPageIndex = new Map<number, PageFragment[]>()
  if (!input.preview) return byPageIndex

  const sourceParagraph = input.preview.fragments.find((fragment) => !fragment.continuesFrom)
  if (!sourceParagraph?.parentNodeId) return byPageIndex

  const sourcePage = findPageByIndex(input.paginated, sourceParagraph.pageIndex)
  if (!sourcePage) return byPageIndex

  const sourceCell = sourcePage.fragments.find((fragment) =>
    fragment.nodeId === sourceParagraph.parentNodeId &&
    isTableCellFragment(fragment)
  )
  if (!sourceCell?.parentNodeId) return byPageIndex

  const sourceRow = sourcePage.fragments.find((fragment) =>
    fragment.nodeId === sourceCell.parentNodeId &&
    isTableRowFragment(fragment)
  )
  if (!sourceRow?.parentNodeId) return byPageIndex

  const sourceTable = sourcePage.fragments.find((fragment) =>
    fragment.nodeId === sourceRow.parentNodeId &&
    isTableRootFragment(fragment)
  )
  if (!sourceTable) return byPageIndex

  const sourceCells = sourcePage.fragments.filter((fragment) =>
    fragment.parentNodeId === sourceRow.nodeId &&
    isTableCellFragment(fragment)
  )
  if (sourceCells.length === 0) return byPageIndex

  for (const draftFragment of input.preview.fragments) {
    const targetPage = findPageByIndex(input.paginated, draftFragment.pageIndex)
    if (!targetPage) continue
    const hasRealParagraphFragment = targetPage.fragments.some((fragment) =>
      fragment.nodeId === draftFragment.nodeId &&
      fragment.nodeType === "paragraph"
    )
    if (draftFragment.continuesFrom && hasRealParagraphFragment) continue

    const continuedSliceHeight = Math.max(1, targetPage.contentBox.y + targetPage.contentBox.height - draftFragment.y)
    const rowHeight = draftFragment.isContinued
      ? continuedSliceHeight
      : Math.max(1, draftFragment.height, draftFragment.continuesFrom ? 0 : sourceRow.height)
    const tableHeight = draftFragment.continuesFrom
      ? rowHeight
      : sourceTable.height + Math.max(0, rowHeight - sourceRow.height)
    const pageIndex = draftFragment.pageIndex
    const continuationFlags = {
      continuesFrom: draftFragment.continuesFrom,
      isContinued: draftFragment.isContinued,
    }
    const fragments: PageFragment[] = [
      {
        ...sourceTable,
        pageIndex,
        y: draftFragment.continuesFrom ? draftFragment.y : sourceTable.y,
        height: tableHeight,
        ...continuationFlags,
      },
      {
        ...sourceRow,
        pageIndex,
        y: draftFragment.continuesFrom ? draftFragment.y : sourceRow.y,
        height: rowHeight,
        ...continuationFlags,
      },
      ...sourceCells.map((cell): PageFragment => ({
        ...cell,
        pageIndex,
        y: draftFragment.continuesFrom ? draftFragment.y : cell.y,
        height: rowHeight,
        ...continuationFlags,
      })),
    ]

    byPageIndex.set(pageIndex, fragments)
  }

  return byPageIndex
}

type WysiwygTableCellLifecycleTraceState = {
  signature: string
  nodeId: string
}

function formatPageIndexList(indexes: Iterable<number>): string {
  return Array.from(indexes)
    .sort((a, b) => a - b)
    .join(",")
}

function summarizeWysiwygDraftVisualPreview(preview: WysiwygDraftVisualPreview | null): {
  previewFragmentCount: number
  previewPageCount: number
  pageIndexes: string
} {
  if (!preview) {
    return {
      previewFragmentCount: 0,
      previewPageCount: 0,
      pageIndexes: "",
    }
  }
  return {
    previewFragmentCount: preview.fragments.length,
    previewPageCount: preview.fragmentsByPageIndex.size,
    pageIndexes: formatPageIndexList(preview.fragmentsByPageIndex.keys()),
  }
}

function summarizeWysiwygTableCellDraftVisualChrome(chromeByPageIndex: ReadonlyMap<number, PageFragment[]>): {
  visualChromeCount: number
  visualChromePageCount: number
  pageIndexes: string
} {
  let visualChromeCount = 0
  for (const fragments of chromeByPageIndex.values()) {
    visualChromeCount += fragments.length
  }
  return {
    visualChromeCount,
    visualChromePageCount: chromeByPageIndex.size,
    pageIndexes: formatPageIndexList(chromeByPageIndex.keys()),
  }
}

type PendingClickAction = {
  type: "inline-edit"
  nodeId: string
  selectNodeId?: string
  caretIndex: number | null
  pageIndex: number | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function canvasPathLabel(item: SelectionContextItem): string {
  if (item.zone === "header") return "HEADER"
  if (item.zone === "footer") return "FOOTER"
  return CANVAS_PATH_LABELS[item.type] ?? item.label.toUpperCase()
}

function canvasPathSegmentWidth(label: string): number {
  return Math.max(32, label.length * 6 + 12)
}

function findCanvasPathFragment(
  fragments: PageFragment[],
  primaryNodeId: string | null | undefined,
  fallbackNodeId?: string | null,
): PageFragment | null {
  const ids = [primaryNodeId, fallbackNodeId].filter((id): id is string => Boolean(id))
  for (const nodeId of ids) {
    const fragment = fragments.find((candidate) => candidate.nodeId === nodeId)
    if (fragment) return fragment
  }
  return null
}

function CanvasNodePathOverlay({
  items,
  activeNodeId,
  anchorFragment,
  pageWidth,
  pageHeight,
  scale,
  variant,
  onSelectNode,
}: {
  items: SelectionContextItem[]
  activeNodeId: string | null
  anchorFragment: PageFragment
  pageWidth: number
  pageHeight: number
  scale: number
  variant: "selected" | "hover"
  onSelectNode?: (nodeId: string) => void
}) {
  if (items.length === 0) return null

  const labels = items.map(canvasPathLabel)
  const segmentWidths = labels.map(canvasPathSegmentWidth)
  const separatorWidth = 8
  const innerPadding = 4
  const totalWidth = segmentWidths.reduce((sum, width) => sum + width, innerPadding * 2) +
    Math.max(0, items.length - 1) * separatorWidth
  const maxX = Math.max(CANVAS_PATH_MIN_EDGE_GAP, pageWidth * scale - totalWidth - CANVAS_PATH_MIN_EDGE_GAP)
  const x = clamp(anchorFragment.x * scale, CANVAS_PATH_MIN_EDGE_GAP, maxX)
  const aboveY = anchorFragment.y * scale - CANVAS_PATH_BAR_HEIGHT - CANVAS_PATH_BAR_GAP
  const maxY = Math.max(CANVAS_PATH_MIN_EDGE_GAP, pageHeight * scale - CANVAS_PATH_BAR_HEIGHT - CANVAS_PATH_MIN_EDGE_GAP)
  const y = clamp(aboveY, CANVAS_PATH_MIN_EDGE_GAP, maxY)
  const interactive = variant === "selected" && onSelectNode != null
  const bg = variant === "selected" ? "#0f172a" : "#334155"
  const textFill = variant === "selected" ? "#e5edf6" : "#e2e8f0"
  let cursorX = x + innerPadding

  return (
    <g
      data-testid={variant === "selected" ? "canvas-selected-path" : "canvas-hover-path"}
      data-variant={variant}
      opacity={variant === "selected" ? 1 : 0.78}
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      onPointerDown={interactive ? (e) => {
        e.stopPropagation()
        e.preventDefault()
      } : undefined}
      onPointerUp={interactive ? (e) => {
        e.stopPropagation()
      } : undefined}
    >
      <rect
        x={x}
        y={y}
        width={totalWidth}
        height={CANVAS_PATH_BAR_HEIGHT}
        rx={3}
        fill={bg}
        stroke={variant === "selected" ? "#38bdf8" : "#64748b"}
        strokeWidth={0.75}
      />
      {items.map((item, index) => {
        const label = labels[index]
        const width = segmentWidths[index]
        const segmentX = cursorX
        const active = item.nodeId === activeNodeId
        cursorX += width
        const separatorX = cursorX + separatorWidth / 2
        if (index < items.length - 1) cursorX += separatorWidth
        return (
          <g key={item.nodeId}>
            <g
              data-testid="canvas-path-item"
              data-node-id={item.nodeId}
              data-node-type={item.type}
              data-active={active ? "true" : undefined}
              role={interactive ? "button" : undefined}
              aria-label={interactive ? `Select ${item.label}` : item.label}
              style={{ cursor: interactive ? "pointer" : "default" }}
              onPointerDown={interactive ? (e) => {
                e.stopPropagation()
                e.preventDefault()
                onSelectNode(item.nodeId)
              } : undefined}
            >
              <title>{item.label}</title>
              <rect
                x={segmentX}
                y={y + 3}
                width={width}
                height={CANVAS_PATH_BAR_HEIGHT - 6}
                rx={2}
                fill={active ? "#0ea5e9" : "transparent"}
                opacity={active ? 1 : 0}
              />
              <text
                x={segmentX + width / 2}
                y={y + 12}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={active ? "white" : textFill}
                letterSpacing={0}
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {label}
              </text>
            </g>
            {index < items.length - 1 && (
              <text
                x={separatorX}
                y={y + 12}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill="#94a3b8"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                ·
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function CanvasActionButton({
  label,
  testId,
  x,
  y,
  cursor = "pointer",
  onPointerDown,
  children,
}: {
  label: string
  testId: string
  x: number
  y: number
  cursor?: string
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void
  children: React.ReactNode
}) {
  return (
    <g
      data-testid={testId}
      role="button"
      aria-label={label}
      style={{ cursor }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onPointerDown(e)
      }}
    >
      <title>{label}</title>
      <rect
        x={x}
        y={y}
        width={CANVAS_ACTION_RAIL_BUTTON_SIZE}
        height={CANVAS_ACTION_RAIL_BUTTON_SIZE}
        rx={4}
        fill="white"
        stroke="#cbd5e1"
        strokeWidth={0.75}
      />
      {children}
    </g>
  )
}

function DragHandleIcon({ x, y }: { x: number; y: number }) {
  const dots = [0, 1, 2].flatMap((row) => [0, 1].map((col) => ({
    cx: x + 8 + col * 6,
    cy: y + 7 + row * 5,
  })))
  return (
    <g fill="#475569" style={{ pointerEvents: "none" }}>
      {dots.map((dot) => <circle key={`${dot.cx}-${dot.cy}`} cx={dot.cx} cy={dot.cy} r={1.15} />)}
    </g>
  )
}

function DuplicateIcon({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke="#475569" strokeWidth={1.35} style={{ pointerEvents: "none" }}>
      <rect x={x + 7} y={y + 6} width={8} height={8} rx={1.5} />
      <path d={`M ${x + 10} ${y + 9} H ${x + 17} V ${y + 16} H ${x + 10} Z`} />
    </g>
  )
}

function DeleteIcon({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke="#475569" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
      <path d={`M ${x + 7} ${y + 8} H ${x + 15}`} />
      <path d={`M ${x + 9} ${y + 8} V ${y + 6} H ${x + 13} V ${y + 8}`} />
      <path d={`M ${x + 8} ${y + 10} L ${x + 9} ${y + 17} H ${x + 13} L ${x + 14} ${y + 10}`} />
    </g>
  )
}

function AddColumnIcon({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke="#475569" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
      <rect x={x + 5.5} y={y + 6} width={5} height={10} rx={1} />
      <rect x={x + 11.5} y={y + 6} width={5} height={10} rx={1} />
      <path d={`M ${x + 11} ${y + 18} H ${x + 16}`} />
      <path d={`M ${x + 13.5} ${y + 15.5} V ${y + 20.5}`} />
    </g>
  )
}

function AddRowIcon({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke="#475569" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
      <rect x={x + 6} y={y + 5.5} width={10} height={5} rx={1} />
      <rect x={x + 6} y={y + 11.5} width={10} height={5} rx={1} />
      <path d={`M ${x + 18} ${y + 11} V ${y + 16}`} />
      <path d={`M ${x + 15.5} ${y + 13.5} H ${x + 20.5}`} />
    </g>
  )
}

function CanvasNodeActionRail({
  nodeId,
  anchorFragment,
  pageWidth,
  pageHeight,
  scale,
  canDrag,
  canDuplicate,
  canDelete,
  tableActions,
  allowOutsideLeft = false,
  onStartDrag,
  onStartCloneDrag,
  onDeleteNode,
  onTableAction,
}: {
  nodeId: string
  anchorFragment: PageFragment
  pageWidth: number
  pageHeight: number
  scale: number
  canDrag: boolean
  canDuplicate: boolean
  canDelete: boolean
  tableActions: CanvasTableAction[]
  allowOutsideLeft?: boolean
  onStartDrag: (nodeId: string, e: React.PointerEvent<SVGGElement>) => void
  onStartCloneDrag: (nodeId: string, e: React.PointerEvent<SVGGElement>) => void
  onDeleteNode: (nodeId: string) => void
  onTableAction: (nodeId: string, action: CanvasTableAction) => void
}) {
  const actions = [
    canDrag ? "drag" as const : null,
    ...tableActions,
    canDuplicate ? "duplicate" as const : null,
    canDelete ? "delete" as const : null,
  ].filter((action): action is "drag" | CanvasTableAction | "duplicate" | "delete" => action !== null)
  if (actions.length === 0) return null

  const railWidth = CANVAS_ACTION_RAIL_BUTTON_SIZE + CANVAS_ACTION_RAIL_PADDING * 2
  const railHeight = actions.length * CANVAS_ACTION_RAIL_BUTTON_SIZE +
    Math.max(0, actions.length - 1) * CANVAS_ACTION_RAIL_GAP +
    CANVAS_ACTION_RAIL_PADDING * 2
  const preferredX = anchorFragment.x * scale - railWidth - CANVAS_ACTION_RAIL_OFFSET
  const fallbackX = anchorFragment.x * scale + CANVAS_ACTION_RAIL_OFFSET
  const maxX = Math.max(CANVAS_PATH_MIN_EDGE_GAP, pageWidth * scale - railWidth - CANVAS_PATH_MIN_EDGE_GAP)
  const x = preferredX >= CANVAS_PATH_MIN_EDGE_GAP
    ? preferredX
    : allowOutsideLeft
      ? preferredX
    : clamp(fallbackX, CANVAS_PATH_MIN_EDGE_GAP, maxX)
  const maxY = Math.max(CANVAS_PATH_MIN_EDGE_GAP, pageHeight * scale - railHeight - CANVAS_PATH_MIN_EDGE_GAP)
  const y = clamp(anchorFragment.y * scale, CANVAS_PATH_MIN_EDGE_GAP, maxY)

  return (
    <g
      data-testid="canvas-action-rail"
      data-node-id={nodeId}
      style={{ pointerEvents: "auto" }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      <rect
        x={x}
        y={y}
        width={railWidth}
        height={railHeight}
        rx={5}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth={0.75}
      />
      {actions.map((action, index) => {
        const buttonX = x + CANVAS_ACTION_RAIL_PADDING
        const buttonY = y + CANVAS_ACTION_RAIL_PADDING + index * (CANVAS_ACTION_RAIL_BUTTON_SIZE + CANVAS_ACTION_RAIL_GAP)
        if (action === "drag") {
          return (
            <CanvasActionButton
              key={action}
              label="Drag block"
              testId="canvas-action-drag"
              x={buttonX}
              y={buttonY}
              cursor="grab"
              onPointerDown={(e) => onStartDrag(nodeId, e)}
            >
              <DragHandleIcon x={buttonX} y={buttonY} />
            </CanvasActionButton>
          )
        }
        if (action === "duplicate") {
          return (
            <CanvasActionButton
              key={action}
              label="Drag copy"
              testId="canvas-action-clone-drag"
              x={buttonX}
              y={buttonY}
              cursor="copy"
              onPointerDown={(e) => onStartCloneDrag(nodeId, e)}
            >
              <DuplicateIcon x={buttonX} y={buttonY} />
            </CanvasActionButton>
          )
        }
        if (action === "add-column") {
          return (
            <CanvasActionButton
              key={action}
              label="Add table column"
              testId="canvas-action-add-column"
              x={buttonX}
              y={buttonY}
              onPointerDown={() => onTableAction(nodeId, action)}
            >
              <AddColumnIcon x={buttonX} y={buttonY} />
            </CanvasActionButton>
          )
        }
        if (action === "add-row") {
          return (
            <CanvasActionButton
              key={action}
              label="Add table row"
              testId="canvas-action-add-row"
              x={buttonX}
              y={buttonY}
              onPointerDown={() => onTableAction(nodeId, action)}
            >
              <AddRowIcon x={buttonX} y={buttonY} />
            </CanvasActionButton>
          )
        }
        if (action === "delete-column") {
          return (
            <CanvasActionButton
              key={action}
              label="Delete table column"
              testId="canvas-action-delete-column"
              x={buttonX}
              y={buttonY}
              onPointerDown={() => onTableAction(nodeId, action)}
            >
              <DeleteIcon x={buttonX} y={buttonY} />
            </CanvasActionButton>
          )
        }
        if (action === "delete-row") {
          return (
            <CanvasActionButton
              key={action}
              label="Delete table row"
              testId="canvas-action-delete-row"
              x={buttonX}
              y={buttonY}
              onPointerDown={() => onTableAction(nodeId, action)}
            >
              <DeleteIcon x={buttonX} y={buttonY} />
            </CanvasActionButton>
          )
        }
        if (action === "delete-table") {
          return (
            <CanvasActionButton
              key={action}
              label="Delete table"
              testId="canvas-action-delete-table"
              x={buttonX}
              y={buttonY}
              onPointerDown={() => onTableAction(nodeId, action)}
            >
              <DeleteIcon x={buttonX} y={buttonY} />
            </CanvasActionButton>
          )
        }
        return (
          <CanvasActionButton
            key={action}
            label="Delete block"
            testId="canvas-action-delete"
            x={buttonX}
            y={buttonY}
            onPointerDown={() => onDeleteNode(nodeId)}
          >
            <DeleteIcon x={buttonX} y={buttonY} />
          </CanvasActionButton>
        )
      })}
    </g>
  )
}

// line.x now contains the alignment offset (baked in by buildPaginatedLines).
function lineVisualLeft(line: PaginatedLine): number {
  return line.x
}

type TableLikeNode = FlowTableNode
type PageViewDocNode = LayoutNode | FlowTableRowNode | FlowTableCellNode
type TableCellLikeNode = FlowTableCellNode

interface TableColumnResizeHandle {
  tableId: string
  leftColIndex: number
  handleDocX: number
  pairX: number
  pairWidth: number
  leftWidthOriginal: number
  rightWidthOriginal: number
  tableFragY: number
  tableFragHeight: number
}

function isTableLikeNode(node: LayoutNode): node is LayoutNode & TableLikeNode {
  return node.type === "flow-table"
}

function isTableCellLikeNode(node: TableLikeNode["nodes"][string] | undefined): node is TableCellLikeNode {
  return node?.type === "flow-table-cell"
}

function unitValueToPt(width: { value: number; unit: "pt" | "mm" } | undefined): number {
  if (!width) return 0
  return width.unit === "mm" ? width.value * 72 / 25.4 : width.value
}

function resolvePageMarginsPt(
  page: PaginatedPage,
  settings: DocumentNode["document"]["sections"][number]["page"] | null | undefined,
): { top: number; right: number; bottom: number; left: number } {
  if (settings) {
    return {
      top: unitValueToPt(settings.margin.top),
      right: unitValueToPt(settings.margin.right),
      bottom: unitValueToPt(settings.margin.bottom),
      left: unitValueToPt(settings.margin.left),
    }
  }
  return {
    left: page.contentBox.x,
    top: page.contentBox.y,
    right: page.width - page.contentBox.x - page.contentBox.width,
    bottom: page.height - page.contentBox.y - page.contentBox.height,
  }
}

function findTableNode(doc: DocumentNode, tableId: string): TableLikeNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[tableId]
    if (node?.type === "flow-table") return node as unknown as TableLikeNode
  }
  return null
}

function resolveSelectedTableId(doc: DocumentNode, selectedNodeId: string | null): string | null {
  if (!selectedNodeId) return null
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (!isTableLikeNode(node)) continue
      const table = node as unknown as TableLikeNode
      if (table.id === selectedNodeId || table.nodes[selectedNodeId] != null) return table.id
    }
  }
  return null
}

function resolveRenderedTableColumnWidths(table: TableLikeNode, availableWidth: number): number[] {
  const rawWidths = table.columns.map((column) => unitValueToPt(column.width))
  const totalWidth = rawWidths.reduce((sum, width) => sum + width, 0)
  const safeAvailableWidth = Math.max(0, availableWidth)

  if (rawWidths.length === 0) return []
  if (totalWidth <= 0) {
    const equalWidth = safeAvailableWidth / rawWidths.length
    return rawWidths.map(() => equalWidth)
  }
  if (totalWidth <= safeAvailableWidth + 0.01) return rawWidths

  let assigned = 0
  return rawWidths.map((rawWidth, index) => {
    if (index === rawWidths.length - 1) return Math.max(0, safeAvailableWidth - assigned)
    const width = safeAvailableWidth * (rawWidth / totalWidth)
    assigned += width
    return width
  })
}

function resolveTableColumnResizeHandles(input: {
  doc: DocumentNode
  selectedNodeId: string | null
  fragments: PageFragment[]
}): TableColumnResizeHandle[] {
  const tableId = resolveSelectedTableId(input.doc, input.selectedNodeId)
  if (!tableId) return []
  const table = findTableNode(input.doc, tableId)
  if (!table || table.columns.length < 2) return []
  const tableFragment = input.fragments.find((fragment) =>
    fragment.nodeId === tableId &&
    isTableRootFragment(fragment)
  )
  if (!tableFragment) return []

  const renderedWidths = resolveRenderedTableColumnWidths(table, tableFragment.width)
  const authoredWidths = table.columns.map((column, index) => {
    const authoredWidth = unitValueToPt(column.width)
    return authoredWidth > 0 ? authoredWidth : renderedWidths[index] ?? 0
  })
  if (renderedWidths.length !== table.columns.length) return []

  let cursorX = tableFragment.x
  const handles: TableColumnResizeHandle[] = []
  for (let leftColIndex = 0; leftColIndex < renderedWidths.length - 1; leftColIndex++) {
    const leftRenderedWidth = renderedWidths[leftColIndex] ?? 0
    const rightRenderedWidth = renderedWidths[leftColIndex + 1] ?? 0
    const pairWidth = leftRenderedWidth + rightRenderedWidth
    if (pairWidth <= 0) {
      cursorX += leftRenderedWidth
      continue
    }
    handles.push({
      tableId,
      leftColIndex,
      handleDocX: cursorX + leftRenderedWidth,
      pairX: cursorX,
      pairWidth,
      leftWidthOriginal: authoredWidths[leftColIndex] ?? leftRenderedWidth,
      rightWidthOriginal: authoredWidths[leftColIndex + 1] ?? rightRenderedWidth,
      tableFragY: tableFragment.y,
      tableFragHeight: tableFragment.height,
    })
    cursorX += leftRenderedWidth
  }
  return handles
}

interface PageViewDocLookup {
  nodeById: Map<string, PageViewDocNode>
  plainTextParagraphIds: Set<string>
  textRunParagraphIds: Set<string>
  tableCellIds: Set<string>
  flowStackParagraphIds: Set<string>
}

function buildPageViewDocLookup(doc: DocumentNode): PageViewDocLookup {
  const nodeById = new Map<string, PageViewDocNode>()
  const plainTextParagraphIds = new Set<string>()
  const textRunParagraphIds = new Set<string>()
  const tableCellIds = new Set<string>()
  const flowStackParagraphIds = new Set<string>()

  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      nodeById.set(node.id, node)
      if (node.type === "paragraph" && isPlainTextParagraph(node as ParagraphNode)) {
        plainTextParagraphIds.add(node.id)
      }
      if (node.type === "paragraph" && isTextRunOnlyParagraph(node as ParagraphNode)) {
        textRunParagraphIds.add(node.id)
      }
      if (node.type === "flow-stack") {
        for (const childId of node.childIds) flowStackParagraphIds.add(childId)
      }
      if (!isTableLikeNode(node)) continue
      for (const inner of Object.values((node as unknown as TableLikeNode).nodes)) {
        if (inner?.type === "flow-table-row" || inner?.type === "flow-table-cell") {
          nodeById.set(inner.id, inner)
        }
        if (isTableCellLikeNode(inner)) tableCellIds.add(inner.id)
        if (inner?.type === "paragraph" && isPlainTextParagraph(inner as ParagraphNode)) {
          plainTextParagraphIds.add(inner.id)
        }
        if (inner?.type === "paragraph" && isTextRunOnlyParagraph(inner as ParagraphNode)) {
          textRunParagraphIds.add(inner.id)
        }
      }
    }
  }

  return { nodeById, plainTextParagraphIds, textRunParagraphIds, tableCellIds, flowStackParagraphIds }
}

function resolveCanvasTableActions(doc: DocumentNode, node: PageViewDocNode | null): CanvasTableAction[] {
  if (!node) return []
  if (node.type === "flow-table") {
    const gridOk = tryResolveFlowTableGrid(node as unknown as FlowTableNode).ok
    return gridOk ? ["add-column", "add-row", "delete-table"] : ["delete-table"]
  }

  for (const section of doc.document.sections) {
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const table = candidate as unknown as FlowTableNode
      const inner = table.nodes[node.id]
      if (!inner) continue

      const resolved = tryResolveFlowTableGrid(table)
      if (!resolved.ok) return []
      if (inner.type === "flow-table-row") {
        const rowIndex = table.rowIds.indexOf(inner.id)
        const actions: CanvasTableAction[] = ["add-row"]
        if (rowIndex >= 0 && canRemoveFlowTableRow(table, rowIndex)) actions.push("delete-row")
        return actions
      }
      if (inner.type === "flow-table-cell") {
        const placement = resolved.grid.placementsByCellId.get(inner.id)
        if (!placement) return []
        const actions: CanvasTableAction[] = ["add-column"]
        if (canRemoveFlowTableColumn(table, placement.columnIndex)) actions.push("delete-column")
        return actions
      }
    }
  }

  return []
}

function cssHex(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`
}

function paragraphBoxStrokeDashArray(border: ResolvedBorderSide, scale: number): string | undefined {
  const strokeWidth = Math.max(border.width * scale, 0.5)
  if (border.style === "dashed") return `${Math.max(strokeWidth * 3, 3)} ${Math.max(strokeWidth * 2, 2)}`
  if (border.style === "dotted") return `0 ${Math.max(strokeWidth * 2.2, 2)}`
  return undefined
}

function fragmentInteractionHeight(fragment: PageFragment): number {
  return fragment.nodeType === "page-break"
    ? PAGE_BREAK_MARKER_HEIGHT
    : fragment.height
}

function fragmentVisibleInteractionHeight(fragment: PageFragment, page: PaginatedPage): number {
  const height = fragmentInteractionHeight(fragment)
  if (fragment.nodeType !== "toc") return height

  const pageContentBottom = page.contentBox.y + page.contentBox.height
  return Math.max(1, Math.min(height, pageContentBottom - fragment.y))
}

export function shouldSuppressStalePageBreakForActiveWysiwygIsland(input: {
  fragment: PageFragment
  activeInlineEditIsPlainNativeParagraph: boolean
  activeInlineEditDisplayFragment: PageFragment | null
  activeOutOfCanvasStructuralIsland?: ActiveOutOfCanvasStructuralIsland | null
}): boolean {
  return shouldSuppressStalePageBreakForActiveWysiwygIslandBridge({
    ...input,
    fallbackRangePt: BOUNDARY_SAFE_PAGE_BREAK_SUPPRESSION_FALLBACK_RANGE_PT,
    pageBreakMarkerHeight: PAGE_BREAK_MARKER_HEIGHT,
  })
}

function fragmentClipPathRect(fragment: PageFragment, page: PaginatedPage, scale: number): {
  x: number
  y: number
  width: number
  height: number
} {
  if (fragment.nodeType === "toc") {
    return {
      x: fragment.x * scale,
      y: fragment.y * scale,
      width: fragment.width * scale,
      height: fragmentVisibleInteractionHeight(fragment, page) * scale,
    }
  }

  return {
    x: fragment.x * scale,
    y: -9999,
    width: fragment.width * scale,
    height: 19998,
  }
}

function renderDividerFragment(fragment: PageFragment, scale: number) {
  const props = fragment.dividerRenderProps
  if (!props || props.thickness <= 0) return null
  const y = (fragment.y + props.marginBefore + props.thickness / 2) * scale
  const strokeWidth = Math.max(props.thickness * scale, 0.75)
  return (
    <line
      data-testid="editor-divider-line"
      x1={fragment.x * scale}
      y1={y}
      x2={(fragment.x + fragment.width) * scale}
      y2={y}
      stroke={cssHex(props.color)}
      strokeWidth={strokeWidth}
      strokeDasharray={paragraphBoxStrokeDashArray({
        style: props.style,
        width: props.thickness,
        color: props.color,
      }, scale)}
      strokeLinecap={props.style === "dotted" ? "round" : "butt"}
      style={{ pointerEvents: "none" }}
    />
  )
}

function renderPageBreakMarker(fragment: PageFragment, scale: number) {
  const markerY = fragment.y * scale + PAGE_BREAK_MARKER_HEIGHT * scale / 2
  const label = "PAGE BREAK"
  return (
    <g data-testid="editor-page-break-marker" style={{ pointerEvents: "none" }}>
      <line
        x1={fragment.x * scale}
        y1={markerY}
        x2={(fragment.x + fragment.width) * scale}
        y2={markerY}
        stroke="#94a3b8"
        strokeWidth={1}
        strokeDasharray="5 4"
      />
      <rect
        x={(fragment.x + fragment.width / 2) * scale - 36}
        y={markerY - 7}
        width={72}
        height={14}
        rx={3}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth={0.75}
      />
      <text
        x={(fragment.x + fragment.width / 2) * scale}
        y={markerY + 3}
        textAnchor="middle"
        fontSize={7}
        fill="#64748b"
        fontWeight={700}
        style={{ userSelect: "none" }}
      >
        {label}
      </text>
    </g>
  )
}

function renderPageBreakBlockedDropArea(
  fragment: PageFragment,
  scale: number,
  contentBox: { x: number; y: number; width: number; height: number },
) {
  const blockTop = Math.max(contentBox.y, fragment.y + PAGE_BREAK_MARKER_HEIGHT)
  const blockBottom = contentBox.y + contentBox.height
  const blockHeight = Math.max(0, blockBottom - blockTop)
  if (blockHeight <= 0) return null

  const label = "Starts on next page"
  const x = contentBox.x * scale
  const y = blockTop * scale
  const width = contentBox.width * scale
  const height = blockHeight * scale
  const labelWidth = Math.min(132, Math.max(94, width - 16))
  const labelX = x + width / 2
  const labelY = y + Math.min(22, Math.max(13, height / 2))

  return (
    <g data-testid="drop-highlight-page-break-blocked" style={{ pointerEvents: "none" }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={DROP_BLOCKED_FILL}
        fillOpacity={0.42}
        stroke={DROP_BLOCKED_STROKE}
        strokeWidth={1.2}
        strokeDasharray="6 4"
        rx={3}
      />
      <line
        x1={x}
        y1={y}
        x2={x + width}
        y2={y}
        stroke={DROP_BLOCKED_STROKE}
        strokeWidth={2}
      />
      <rect
        x={labelX - labelWidth / 2}
        y={labelY - 8}
        width={labelWidth}
        height={16}
        rx={4}
        fill="#fff1f2"
        stroke="#fb7185"
        strokeWidth={0.8}
      />
      <text
        x={labelX}
        y={labelY + 3}
        textAnchor="middle"
        fontSize={8}
        fontWeight={700}
        fill="#be123c"
        style={{ userSelect: "none" }}
      >
        {label}
      </text>
    </g>
  )
}

function renderFragmentBox(fragment: PageFragment, scale: number) {
  const primitives = resolveFragmentBoxLayoutPrimitives(fragment)
  if (!primitives) return null

  return (
    <g
      data-fragment-box="true"
      data-paragraph-box={fragment.nodeType === "paragraph" ? "true" : undefined}
      data-flow-stack-box={fragment.nodeType === "flow-stack" ? "true" : undefined}
      data-flow-table-cell-box={fragment.nodeType === "flow-table-cell" ? "true" : undefined}
      style={{ pointerEvents: "none" }}
    >
      {primitives.fill && (
        <rect
          data-paragraph-box-fill="true"
          x={primitives.fill.x * scale}
          y={primitives.fill.y * scale}
          width={primitives.fill.width * scale}
          height={primitives.fill.height * scale}
          fill={cssHex(primitives.fill.color)}
        />
      )}
      {primitives.borders.map((line) => {
        if (line.border.style === "none" || line.border.width <= 0) return null
        const strokeWidth = Math.max(line.border.width * scale, 0.5)
        return (
          <line
            key={line.side}
            data-paragraph-box-side={line.side}
            x1={line.x1 * scale}
            y1={line.y1 * scale}
            x2={line.x2 * scale}
            y2={line.y2 * scale}
            stroke={cssHex(line.border.color)}
            strokeWidth={strokeWidth}
            strokeDasharray={paragraphBoxStrokeDashArray(line.border, scale)}
            strokeLinecap={line.border.style === "dotted" ? "round" : "butt"}
          />
        )
      })}
    </g>
  )
}

function isFlowTableCellContinuationFragment(fragment: PageFragment): boolean {
  return fragment.nodeType === "flow-table-cell" &&
    (fragment.continuesFrom === true || fragment.isContinued === true)
}

function renderFlowTableCellSelectionOutline(
  fragment: PageFragment,
  scale: number,
  chromeY: number,
  chromeHeight: number,
  selectionPad: number,
) {
  const xLeft = fragment.x * scale - selectionPad
  const xRight = (fragment.x + fragment.width) * scale + selectionPad
  const yTop = chromeY - selectionPad
  const yBottom = chromeY + chromeHeight + selectionPad
  const lines = [
    fragment.continuesFrom === true ? null : { side: "top", x1: xLeft, y1: yTop, x2: xRight, y2: yTop },
    fragment.isContinued === true ? null : { side: "bottom", x1: xLeft, y1: yBottom, x2: xRight, y2: yBottom },
    { side: "left", x1: xLeft, y1: yTop, x2: xLeft, y2: yBottom },
    { side: "right", x1: xRight, y1: yTop, x2: xRight, y2: yBottom },
  ].filter((line): line is { side: string; x1: number; y1: number; x2: number; y2: number } => Boolean(line))

  return (
    <g data-flow-table-cell-selection-outline="true" style={{ pointerEvents: "none" }}>
      {lines.map((line) => (
        <line
          key={line.side}
          data-selection-outline-side={line.side}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#2563eb"
          strokeWidth={1.5}
        />
      ))}
    </g>
  )
}

function renderBodyFragmentSelectionOutline(input: {
  fragment: PageFragment
  page: PaginatedPage
  scale: number
  isFlowStackParagraph: boolean
}) {
  const { fragment, page, scale, isFlowStackParagraph } = input
  const fragHeight = fragmentVisibleInteractionHeight(fragment, page)
  const paragraphChromeY = isFlowStackParagraph ? FLOW_STACK_PARAGRAPH_CHROME_Y : PARAGRAPH_CHROME_Y
  const chromeTop = fragment.nodeType === "paragraph" ? paragraphChromeY : 0
  const chromeBottom = fragment.nodeType === "paragraph" ? paragraphChromeY : 0
  const chromeY = fragment.y * scale - chromeTop
  const chromeHeight = Math.max(fragHeight * scale + chromeTop + chromeBottom, 2)
  const selectionPad = isFlowStackParagraph ? 0 : 1

  if (isFlowTableCellContinuationFragment(fragment)) {
    return renderFlowTableCellSelectionOutline(fragment, scale, chromeY, chromeHeight, selectionPad)
  }

  return (
    <rect
      x={fragment.x * scale - selectionPad}
      y={chromeY - selectionPad}
      width={fragment.width * scale + selectionPad * 2}
      height={chromeHeight + selectionPad * 2}
      fill="none"
      stroke="#2563eb"
      strokeWidth={1.5}
      style={{ pointerEvents: "none" }}
    />
  )
}

function caretIndexFromPointer(
  fragment: PageFragment,
  event: React.PointerEvent | React.MouseEvent,
  scale: number,
  textMeasurer: TextMeasurer,
  useWysiwygMapping: boolean,
): number | null {
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement
  const lines = fragment.lines ?? []
  if (!svg || lines.length === 0) return null

  const rect = svg.getBoundingClientRect()
  const docX = (event.clientX - rect.left) / scale
  const docY = (event.clientY - rect.top) / scale
  if (useWysiwygMapping) {
    const mappedCaret = resolveCaretOffsetFromPointInFragment(fragment, { x: docX, y: docY }, { textMeasurer })
    if (mappedCaret) return mappedCaret.offset
  }

  const directLineIndex = lines.findIndex((line) => docY >= line.y && docY <= line.y + line.height)
  const lineIndex = directLineIndex >= 0
    ? directLineIndex
    : lines.reduce((nearest, line, index) => {
      const distance = Math.abs(docY - (line.y + line.height / 2))
      const nearestLine = lines[nearest]
      const nearestDistance = Math.abs(docY - (nearestLine.y + nearestLine.height / 2))
      return distance < nearestDistance ? index : nearest
    }, 0)

  const line = lines[lineIndex]
  const visualLeft = lineVisualLeft(line)
  const ratio = line.width > 0 ? clamp((docX - visualLeft) / line.width, 0, 1) : 0
  const lineOffset = Math.round(ratio * line.text.length)
  const previousChars = lines.slice(0, lineIndex).reduce((sum, previousLine) => sum + previousLine.text.length, 0)
  return previousChars + lineOffset
}

function isParagraphEditableForInlineText(paragraph: ParagraphNode, allowStyledTextRuns: boolean): boolean {
  return allowStyledTextRuns ? isTextRunOnlyParagraph(paragraph) : isPlainTextParagraph(paragraph)
}

function findFirstParagraphInCell(doc: DocumentNode, cellId: string, allowStyledTextRuns: boolean): string | null {
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (!isTableLikeNode(node)) continue
      const table = node as unknown as TableLikeNode
      const cell = table.nodes[cellId]
      if (!isTableCellLikeNode(cell)) continue
      const paragraphId = cell.childIds.find((id) => {
        const paragraph = table.nodes[id]
        return paragraph?.type === "paragraph" &&
          isParagraphEditableForInlineText(paragraph as ParagraphNode, allowStyledTextRuns)
      })
      if (paragraphId) return paragraphId
    }
  }
  return null
}

function findParagraphNode(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") return node
    for (const candidate of Object.values(section.nodes)) {
      if (!isTableLikeNode(candidate)) continue
      const inner = (candidate as unknown as TableLikeNode).nodes[nodeId]
      if (inner?.type === "paragraph") return inner as ParagraphNode
    }
  }
  return null
}

function canInlineEditParagraph(doc: DocumentNode, nodeId: string, allowStyledTextRuns: boolean): boolean {
  const paragraph = findParagraphNode(doc, nodeId)
  return paragraph !== null && isParagraphEditableForInlineText(paragraph, allowStyledTextRuns)
}

function getEditableParagraphText(doc: DocumentNode, nodeId: string): string | null {
  const paragraph = findParagraphNode(doc, nodeId)
  if (!paragraph) return null
  return getTextRunParagraphText(paragraph)
}

function countParagraphFragments(paginated: PaginatedDocument, nodeId: string): number {
  return paginated.sections
    .flatMap((section) => section.pages)
    .flatMap((page) => page.fragments)
    .filter((fragment) => fragment.nodeId === nodeId && fragment.nodeType === "paragraph")
    .length
}

export interface WysiwygTextPointerFragmentIndex {
  targetsByNodeId: Map<string, WysiwygTextPointerFragmentTarget[]>
  bodyParagraphFragmentCountByNodeId: Map<string, number>
}

function addWysiwygTextPointerFragmentTarget(
  targetsByNodeId: Map<string, WysiwygTextPointerFragmentTarget[]>,
  fragment: PageFragment,
  pageKeyByPageIndex: ReadonlyMap<number, string>,
): void {
  if (fragment.nodeType !== "paragraph") return
  const pageKey = pageKeyByPageIndex.get(fragment.pageIndex)
  if (!pageKey) return
  const targets = targetsByNodeId.get(fragment.nodeId)
  if (targets) {
    targets.push({ pageKey, fragment })
  } else {
    targetsByNodeId.set(fragment.nodeId, [{ pageKey, fragment }])
  }
}

export function buildWysiwygTextPointerFragmentIndex(
  paginated: PaginatedDocument,
  pageKeyByPageIndex: ReadonlyMap<number, string>,
): WysiwygTextPointerFragmentIndex {
  const targetsByNodeId = new Map<string, WysiwygTextPointerFragmentTarget[]>()
  const bodyParagraphFragmentCountByNodeId = new Map<string, number>()

  for (const section of paginated.sections) {
    for (const page of section.pages) {
      for (const fragment of page.fragments) {
        addWysiwygTextPointerFragmentTarget(targetsByNodeId, fragment, pageKeyByPageIndex)
        if (fragment.nodeType === "paragraph") {
          bodyParagraphFragmentCountByNodeId.set(
            fragment.nodeId,
            (bodyParagraphFragmentCountByNodeId.get(fragment.nodeId) ?? 0) + 1,
          )
        }
      }
      for (const fragment of page.headerFragments) {
        addWysiwygTextPointerFragmentTarget(targetsByNodeId, fragment, pageKeyByPageIndex)
      }
      for (const fragment of page.footerFragments) {
        addWysiwygTextPointerFragmentTarget(targetsByNodeId, fragment, pageKeyByPageIndex)
      }
    }
  }

  return {
    targetsByNodeId,
    bodyParagraphFragmentCountByNodeId,
  }
}

function isTableCellId(doc: DocumentNode, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (!isTableLikeNode(node)) continue
      const table = node as unknown as TableLikeNode
      const inner = table.nodes[nodeId]
      if (inner?.type === "flow-table-cell") return true
    }
  }
  return false
}

function isStackInsideRow(doc: DocumentNode, stackId: string | null | undefined): boolean {
  if (!stackId) return false
  for (const section of doc.document.sections) {
    const stack = section.nodes[stackId]
    if (stack?.type !== "stack") continue
    if (Object.values(section.nodes).some((node) => (
      node.type === "row" && node.childIds.includes(stackId)
    ))) return true
  }
  return false
}

function fragmentVisualBottom(fragment: PageFragment): number {
  const fragmentBottom = fragment.y + Math.max(fragmentInteractionHeight(fragment), 1)
  const lineBottom = fragment.lines?.reduce((bottom, line) => (
    Math.max(bottom, line.y + line.height)
  ), fragmentBottom) ?? fragmentBottom
  return Math.max(fragmentBottom, lineBottom)
}

function fragmentsVisualBottom(fragments: PageFragment[]): number | null {
  if (fragments.length === 0) return null
  return fragments.reduce((bottom, fragment) => Math.max(bottom, fragmentVisualBottom(fragment)), -Infinity)
}

function zoneFragmentsContainActiveInlineEdit(
  fragments: PageFragment[],
  inlineEditNodeId: string | null,
  activeInlineEditPageIndex: number | null,
): boolean {
  if (!inlineEditNodeId) return false
  return fragments.some((fragment) => (
    fragment.nodeId === inlineEditNodeId &&
    (activeInlineEditPageIndex == null || fragment.pageIndex === activeInlineEditPageIndex)
  ))
}

function normalizeHeaderFooterWheelDeltaPt(event: ReactWheelEvent, scale: number): number {
  const unit = event.deltaMode === 1
    ? 16
    : event.deltaMode === 2
      ? 120
      : 1
  return (event.deltaY * unit) / Math.max(scale, 0.01)
}

function ZoneFragments({
  fragments,
  zone,
  active,
  doc,
  pageKey,
  scale,
  pageContentBottom,
  textMeasurer,
  inlineEditVisualFresh,
  inlineEditNodeId,
  inlineEditCaretIndex,
  activeInlineEditPageIndex,
  editFragmentRef,
  dragActive,
  wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled,
  wysiwygTextDraftNodeId,
  wysiwygTextDraftText,
  wysiwygTextCaretOffset,
  wysiwygTextSelection,
  wysiwygTextDraftPaginationActive,
  suppressedCanvasTextNodeIds = EMPTY_SUPPRESSED_NODE_IDS,
  wysiwygTextPointerFragments,
  showTextSegments,
  onInlineEditStart,
  onInlineEditChange,
  onInlineEditCaretChange,
  onInlineEditUserInteraction,
  onInlineEditHeightChange,
  onInlineEditEnd,
  onSplitParagraph,
  onMergeParagraph,
  onCanStartStructuralEdit,
  onExitListItem,
  onChangeListItemLevel,
  onBackspaceListItemAtStart,
  onWysiwygTextDraftChange,
  onWysiwygRichTextShortcut,
  onWysiwygTextReflowDecision,
  clipPathIndexOffset = 0,
  visualOffsetY = 0,
}: {
  fragments: PageFragment[]
  zone: "header" | "footer"
  active: boolean
  doc: DocumentNode
  pageKey: string
  scale: number
  pageContentBottom?: number | null
  textMeasurer: TextMeasurer
  inlineEditVisualFresh: boolean
  inlineEditNodeId: string | null
  inlineEditCaretIndex: number | null
  activeInlineEditPageIndex: number | null
  editFragmentRef: { current: ActiveEditFragmentRef | null }
  dragActive: boolean
  wysiwygInlineEditEnabled: boolean
  wysiwygTextEngineEnabled: boolean
  wysiwygTextDraftNodeId: string | null
  wysiwygTextDraftText: string | null
  wysiwygTextCaretOffset: number | null
  wysiwygTextSelection: { anchorOffset: number; focusOffset: number } | null
  wysiwygTextDraftPaginationActive: boolean
  suppressedCanvasTextNodeIds?: ReadonlySet<string>
  wysiwygTextPointerFragments: WysiwygTextPointerFragmentTarget[]
  showTextSegments: boolean
  onInlineEditStart: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => void
  onInlineEditChange: (nodeId: string, text: string, caretIndex: number | null) => void
  onInlineEditCaretChange: (nodeId: string, caretIndex: number | null) => void
  onInlineEditUserInteraction: (nodeId: string) => void
  onInlineEditHeightChange: (nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => void
  onInlineEditEnd: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph: (nodeId: string, text?: string) => void
  onCanStartStructuralEdit?: ParagraphTextSurfaceStructuralEditGuard
  onExitListItem?: (nodeId: string, text?: string) => void
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  onWysiwygTextDraftChange: (nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => void
  onWysiwygRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onWysiwygTextReflowDecision: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
  clipPathIndexOffset?: number
  visualOffsetY?: number
}) {
  return fragments.map((fragment, index) => {
    const canRenderText = fragment.nodeType === "paragraph" || fragment.nodeType === "toc"
    const editableParagraph = active &&
      fragment.nodeType === "paragraph" &&
      canInlineEditParagraph(doc, fragment.nodeId, wysiwygTextEngineEnabled)
    const isCanvasTextSuppressed = fragment.nodeType === "paragraph" &&
      suppressedCanvasTextNodeIds.has(fragment.nodeId)
    const isInlineEditing = editableParagraph &&
      inlineEditNodeId === fragment.nodeId &&
      (activeInlineEditPageIndex == null || fragment.pageIndex === activeInlineEditPageIndex)
    if (isInlineEditing) {
      const frozenVisualOffsetY =
        editFragmentRef.current?.nodeId === fragment.nodeId &&
        editFragmentRef.current?.pageKey === pageKey
          ? editFragmentRef.current.visualOffsetY
          : visualOffsetY
      if (
        editFragmentRef.current?.nodeId !== fragment.nodeId ||
        editFragmentRef.current?.pageKey !== pageKey
      ) {
        editFragmentRef.current = {
          nodeId: fragment.nodeId,
          pageKey,
          fragment: { ...fragment },
          visualOffsetY: frozenVisualOffsetY,
        }
      } else {
        editFragmentRef.current = {
          ...editFragmentRef.current,
          fragment: { ...fragment },
          visualOffsetY: frozenVisualOffsetY,
        }
      }
    }
    const displayFragment = isInlineEditing
      ? editFragmentRef.current?.fragment ?? fragment
      : fragment
    const fragmentVisualOffsetY = resolveInlineEditVisualOffsetY({
      isInlineEditing,
      storedVisualOffsetY: editFragmentRef.current?.visualOffsetY,
      currentVisualOffsetY: visualOffsetY,
    })
    const visualDisplayFragment = fragmentVisualOffsetY === 0
      ? displayFragment
      : shiftPageFragmentY(displayFragment, fragmentVisualOffsetY)
    const clipPathId = buildEditorFragmentClipPathId(pageKey, displayFragment, clipPathIndexOffset + index)
    return (
      <g
        key={`${zone}-${fragment.nodeId}-${fragment.pageIndex}-${index}`}
        data-testid="editor-zone-fragment"
        data-zone={zone}
        data-zone-editable={editableParagraph ? "true" : undefined}
        data-inline-editable={editableParagraph ? "true" : undefined}
        data-node-id={fragment.nodeId}
        data-node-type={fragment.nodeType}
        data-page-index={fragment.pageIndex}
        style={{ pointerEvents: editableParagraph || isInlineEditing ? undefined : "none" }}
        onPointerDown={editableParagraph ? (event) => {
          event.stopPropagation()
          if (dragActive || isInlineEditing) return
          if (!shouldStartInlineEditOnSingleClick({
            canInlineEditParagraph: editableParagraph,
            isTableCellParagraph: false,
          })) return
          event.preventDefault()
          onInlineEditStart(
            fragment.nodeId,
            wysiwygInlineEditEnabled || wysiwygTextEngineEnabled
              ? caretIndexFromPointer(visualDisplayFragment, event, scale, textMeasurer, true)
              : null,
            displayFragment.pageIndex,
          )
        } : undefined}
        onDoubleClick={editableParagraph && !dragActive ? (event) => {
          event.stopPropagation()
          event.preventDefault()
          onInlineEditStart(
            fragment.nodeId,
            wysiwygInlineEditEnabled || wysiwygTextEngineEnabled
              ? caretIndexFromPointer(visualDisplayFragment, event, scale, textMeasurer, true)
              : null,
            displayFragment.pageIndex,
          )
        } : undefined}
      >
        <rect
          x={visualDisplayFragment.x * scale}
          y={visualDisplayFragment.y * scale}
          width={visualDisplayFragment.width * scale}
          height={Math.max(visualDisplayFragment.height * scale, 2)}
          fill={isCanvasTextSuppressed ? "transparent" : isInlineEditing ? INLINE_EDIT_CHROME_FILL : "transparent"}
          stroke={isCanvasTextSuppressed ? "transparent" : isInlineEditing ? "#2563eb" : editableParagraph ? "#64748b" : "#cbd5e1"}
          strokeWidth={isInlineEditing ? 1.25 : editableParagraph ? 0.9 : 0.5}
          opacity={isCanvasTextSuppressed ? 0 : canRenderText ? (active ? 0.72 : 0.5) : 0.45}
        />
        {canRenderText && !isCanvasTextSuppressed && (
          <ParagraphTextSurface
            fragment={displayFragment}
            doc={doc}
            pageKey={pageKey}
            clipPathId={clipPathId}
            scale={scale}
            visualOffsetY={fragmentVisualOffsetY}
            pageContentBottom={pageContentBottom}
            textMeasurer={textMeasurer}
            isEditing={isInlineEditing}
            isVisualFresh={isInlineEditing && inlineEditVisualFresh}
            wysiwygInlineEditEnabled={wysiwygInlineEditEnabled}
            wysiwygTextEngineEnabled={wysiwygTextEngineEnabled}
            wysiwygTextDraftText={wysiwygTextDraftNodeId === fragment.nodeId ? wysiwygTextDraftText : null}
            wysiwygTextCaretOffset={wysiwygTextDraftNodeId === fragment.nodeId ? wysiwygTextCaretOffset : null}
            wysiwygTextSelection={wysiwygTextDraftNodeId === fragment.nodeId ? wysiwygTextSelection : null}
            wysiwygTextPointerFragments={wysiwygTextDraftNodeId === fragment.nodeId ? wysiwygTextPointerFragments : undefined}
            wysiwygTextDraftPaginationActive={wysiwygTextDraftNodeId === fragment.nodeId && wysiwygTextDraftPaginationActive}
            showTextSegments={showTextSegments}
            initialCaretIndex={isInlineEditing ? inlineEditCaretIndex : null}
            onChange={onInlineEditChange}
            onCaretChange={onInlineEditCaretChange}
            onUserEditInteraction={onInlineEditUserInteraction}
            onHeightChange={onInlineEditHeightChange}
            onEndEdit={onInlineEditEnd}
            onSplitParagraph={onSplitParagraph}
            onMergeParagraph={onMergeParagraph}
            onCanStartStructuralEdit={onCanStartStructuralEdit}
            onExitListItem={onExitListItem}
            onChangeListItemLevel={onChangeListItemLevel}
            onBackspaceListItemAtStart={onBackspaceListItemAtStart}
            onWysiwygTextDraftChange={onWysiwygTextDraftChange}
            onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
            onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
          />
        )}
        {fragment.nodeType === "divider" && renderDividerFragment(visualDisplayFragment, scale)}
      </g>
    )
  })
}

function HeaderFooterZoneLayer({
  zone,
  active,
  x,
  y,
  width,
  height,
  onEnter,
  onActivePointerDown,
  onActiveWheel,
}: {
  zone: HeaderFooterZone
  active: boolean
  x: number
  y: number
  width: number
  height: number
  onEnter: () => void
  onActivePointerDown: () => void
  onActiveWheel?: (event: ReactWheelEvent<SVGRectElement>) => void
}) {
  if (width <= 0 || height <= 0) return null
  return (
    <g data-testid="header-footer-zone-layer" data-zone={zone} data-active={active ? "true" : "false"}>
      <rect
        data-testid="header-footer-zone-hit-area"
        data-zone={zone}
        x={x}
        y={y}
        width={width}
        height={height}
        fill="transparent"
        opacity={1}
        stroke={active ? "#94a3b8" : "transparent"}
        strokeWidth={active ? 1 : 0}
        strokeDasharray={active ? "5 3" : "none"}
        style={{ cursor: active ? "default" : "pointer", touchAction: "none" }}
        onDoubleClick={(event) => {
          if (active) return
          event.stopPropagation()
          event.preventDefault()
          onEnter()
        }}
        onPointerDown={(event) => {
          if (!active) return
          event.stopPropagation()
          event.preventDefault()
          onActivePointerDown()
        }}
        onWheel={active ? onActiveWheel : undefined}
      />
      {active && (
        <text
          x={x + 8}
          y={y + 14}
          fontSize={10}
          fill="#475569"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {zone === "header" ? "HEADER" : "FOOTER"}
        </text>
      )}
      {active && (
        <rect
          data-testid="header-footer-zone-exit-band"
          x={x}
          y={y}
          width={width}
          height={height}
          fill="transparent"
          style={{ cursor: "default", touchAction: "none" }}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onActivePointerDown()
          }}
          onWheel={onActiveWheel}
        />
      )}
    </g>
  )
}

function HeaderFooterZoneResizeHandle({
  zone,
  x,
  y,
  width,
  active,
  onPointerDown,
}: {
  zone: HeaderFooterZone
  x: number
  y: number
  width: number
  active: boolean
  onPointerDown: (event: ReactPointerEvent<SVGRectElement>) => void
}) {
  if (width <= 0) return null
  const stroke = zone === "header" ? "#2563eb" : "#db2777"
  const handleY = zone === "footer" ? y - 14 : y - 7
  return (
    <g data-testid="header-footer-zone-resize-layer" data-zone={zone} data-active={active ? "true" : "false"}>
      <line
        data-testid="header-footer-zone-resize-line"
        data-zone={zone}
        x1={x}
        y1={y}
        x2={x + width}
        y2={y}
        stroke={stroke}
        strokeWidth={active ? 2 : 1.25}
        strokeDasharray={active ? "none" : "4 3"}
        style={{ pointerEvents: "none" }}
      />
      <rect
        data-testid="header-footer-zone-resize-handle"
        data-zone={zone}
        x={x}
        y={handleY}
        width={width}
        height={14}
        fill="transparent"
        style={{ cursor: "ns-resize", touchAction: "none" }}
        onPointerDown={onPointerDown}
      />
    </g>
  )
}

function HeaderFooterOverflowMarker({
  zone,
  edge = "bottom",
  x,
  y,
  width,
  overflowPt,
  hiddenPt = overflowPt,
  scale,
}: {
  zone: HeaderFooterZone
  edge?: "top" | "bottom"
  x: number
  y: number
  width: number
  overflowPt: number
  hiddenPt?: number
  scale: number
}) {
  if (width <= 0 || hiddenPt <= 0.5) return null
  const stroke = zone === "header" ? "#2563eb" : "#db2777"
  const bandHeight = Math.max(4, 4 * scale)
  return (
    <g
      data-testid="header-footer-zone-overflow-marker"
      data-zone={zone}
      data-edge={edge}
      data-overflow-pt={Math.round(overflowPt * 100) / 100}
      data-hidden-pt={Math.round(hiddenPt * 100) / 100}
      style={{ pointerEvents: "none" }}
    >
      <line
        x1={x}
        y1={y}
        x2={x + width}
        y2={y}
        stroke={stroke}
        strokeWidth={1.4}
        strokeDasharray="3 3"
      />
      <rect
        x={x}
        y={edge === "top" ? y : y - bandHeight}
        width={width}
        height={bandHeight}
        fill={stroke}
        opacity={0.12}
      />
    </g>
  )
}

function HeaderFooterOverflowScrollIndicator({
  zone,
  x,
  y,
  width,
  height,
  overflowPt,
  scrollPt,
  scale,
  onScrollTo,
  onWheel,
}: {
  zone: HeaderFooterZone
  x: number
  y: number
  width: number
  height: number
  overflowPt: number
  scrollPt: number
  scale: number
  onScrollTo: (offsetPt: number, maxOffsetPt: number) => void
  onWheel: (event: ReactWheelEvent<SVGRectElement | SVGGElement>) => void
}) {
  const pointerDragRef = useRef<{ pointerId: number } | null>(null)
  if (width <= 0 || height <= 0 || overflowPt <= 0.5) return null
  const color = zone === "header" ? "#2563eb" : "#db2777"
  const overflowPx = Math.max(0, overflowPt * scale)
  const totalHeight = height + overflowPx
  const trackInset = Math.min(4, Math.max(0, height / 4))
  const trackY = y + trackInset
  const trackHeight = Math.max(0, height - trackInset * 2)
  const thumbHeight = Math.max(Math.min(16, trackHeight), Math.min(trackHeight, (height / totalHeight) * trackHeight))
  const maxThumbTravel = Math.max(0, trackHeight - thumbHeight)
  const scrollRatio = overflowPt > 0 ? clamp(scrollPt / overflowPt, 0, 1) : 0
  const trackWidth = Math.max(6, 5 * scale)
  const trackPadding = Math.max(2, 2 * scale)
  const trackX = x + width - Math.max(13, 12 * scale)
  const thumbY = trackY + maxThumbTravel * scrollRatio
  const hitWidth = Math.max(28, 24 * scale)
  const hitX = trackX - (hitWidth - trackWidth) / 2

  const scrollOffsetFromPointer = (event: ReactPointerEvent<SVGRectElement>): number => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg || maxThumbTravel <= 0) return 0
    const rect = svg.getBoundingClientRect()
    const pointerY = event.clientY - rect.top
    const ratio = clamp((pointerY - trackY - thumbHeight / 2) / maxThumbTravel, 0, 1)
    return ratio * overflowPt
  }

  const startPointerDrag = (event: ReactPointerEvent<SVGRectElement>) => {
    event.stopPropagation()
    event.preventDefault()
    pointerDragRef.current = { pointerId: event.pointerId }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture keeps zone scrolling isolated while dragging the thumb.
    }
    onScrollTo(scrollOffsetFromPointer(event), overflowPt)
  }

  const updatePointerDrag = (event: ReactPointerEvent<SVGRectElement>) => {
    if (pointerDragRef.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    event.preventDefault()
    onScrollTo(scrollOffsetFromPointer(event), overflowPt)
  }

  const endPointerDrag = (event: ReactPointerEvent<SVGRectElement>) => {
    if (pointerDragRef.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    event.preventDefault()
    pointerDragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // The browser may already have released capture.
    }
  }

  return (
    <g
      data-testid="header-footer-zone-scroll-indicator"
      data-zone={zone}
      data-scroll-pt={Math.round(scrollPt * 100) / 100}
      data-overflow-pt={Math.round(overflowPt * 100) / 100}
    >
      <rect
        data-testid="header-footer-zone-scroll-rail"
        x={trackX - trackPadding}
        y={trackY - trackPadding}
        width={trackWidth + trackPadding * 2}
        height={trackHeight + trackPadding * 2}
        rx={(trackWidth + trackPadding * 2) / 2}
        fill="#ffffff"
        opacity={0.76}
        stroke={color}
        strokeOpacity={0.22}
        strokeWidth={Math.max(0.75, 0.75 * scale)}
        style={{ pointerEvents: "none" }}
      />
      <rect
        data-testid="header-footer-zone-scroll-track"
        x={trackX}
        y={trackY}
        width={trackWidth}
        height={trackHeight}
        rx={trackWidth / 2}
        fill={color}
        opacity={0.2}
        style={{ pointerEvents: "none" }}
      />
      <rect
        data-testid="header-footer-zone-scroll-thumb"
        x={trackX}
        y={thumbY}
        width={trackWidth}
        height={thumbHeight}
        rx={trackWidth / 2}
        fill={color}
        opacity={0.82}
        style={{ pointerEvents: "none" }}
      />
      <rect
        data-testid="header-footer-zone-scroll-hit-area"
        data-zone={zone}
        x={hitX}
        y={y}
        width={hitWidth}
        height={height}
        fill="transparent"
        style={{ cursor: "ns-resize", touchAction: "none" }}
        onPointerDown={startPointerDrag}
        onPointerMove={updatePointerDrag}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onWheel={(event) => {
          event.stopPropagation()
          event.preventDefault()
          onWheel(event)
        }}
      />
    </g>
  )
}

// ─── Drop Highlight ───────────────────────────────────────────────────────────

function DropHighlight({ doc, drag, fragments, scale, contentBox }: {
  doc: DocumentNode; drag: DragState | null; fragments: PageFragment[]; scale: number
  contentBox: { x: number; y: number; width: number; height: number }
}) {
  if (!drag?.preview) return null
  if (!drag.preview.isValid) {
    const blocker = drag.preview.hoverNodeId
      ? fragments.find((fragment) => fragment.nodeId === drag.preview?.hoverNodeId && fragment.nodeType === "page-break")
      : null
    return blocker ? renderPageBreakBlockedDropArea(blocker, scale, contentBox) : null
  }
  if (!drag.preview.placement) return null
  const { hoverNodeId, zone, target } = drag.preview
  if (!hoverNodeId || !zone || !target) return null

  // body drop: ไม่มี fragment → แสดง line ที่ตำแหน่ง insert
  if (target.kind === "node" && target.nodeType === "body") {
    const cx = contentBox.x * scale
    const cw = contentBox.width * scale
    if (fragments.length === 0) {
      // empty body: line ที่ top ของ content
      return <rect x={cx} y={contentBox.y * scale} width={cw} height={2} fill={DROP_INSERTION_STROKE} rx={1} style={{ pointerEvents: "none" }} />
    }
    // มี content: line ล่างสุดของ fragment สุดท้าย
    const bottomY = Math.max(...fragments.map((f) => f.y + f.height)) * scale
    return <rect x={cx} y={bottomY + 2} width={cw} height={2} fill={DROP_INSERTION_STROKE} rx={1} style={{ pointerEvents: "none" }} />
  }

  if (target.kind === "node" && (target.nodeType === "stack" || target.nodeType === "flow-stack") && zone === "center") {
    const containerFragment = fragments.find((f) => f.nodeId === target.nodeId)
    const box = containerFragment ?? contentBox
    const childFragments = fragments.filter((candidate) => candidate.parentNodeId === target.nodeId)
    const childBottom = childFragments.length > 0
      ? Math.max(...childFragments.map((candidate) => candidate.y + candidate.height))
      : box.y + Math.min(Math.max(box.height / 2, 2), 8)
    const lineY = Math.min(
      (contentBox.y + contentBox.height) * scale - 2,
      Math.max(contentBox.y * scale, childBottom * scale + (childFragments.length > 0 ? 2 : 0)),
    )
    return <rect data-testid="drop-highlight-container-insert" x={box.x * scale} y={lineY} width={Math.max(box.width * scale, 2)} height={2} fill={DROP_INSERTION_STROKE} rx={1} style={{ pointerEvents: "none" }} />
  }

  const frag = fragments.find((f) => f.nodeId === hoverNodeId)
  if (!frag) return null
  const x = frag.x * scale, y = frag.y * scale, w = frag.width * scale, h = frag.height * scale

  if (target.kind === "row-stack-inner") {
    const rowFrag = fragments.find((f) => f.nodeId === target.rowId)
    if (rowFrag) {
      const geom = getRowGeometry(doc, target.rowId, rowFrag.width, rowFrag.height)
      const sr = geom?.stackRects.find((r) => r.stackId === target.stackId)
      if (sr) {
        const sx = (rowFrag.x + sr.left) * scale
        const sy = (rowFrag.y + sr.top) * scale
        const sw = sr.width * scale
        const sh = sr.height * scale
        if (zone === "left" || zone === "right") {
          const halfW = sw / 2
          return <rect x={zone === "left" ? sx : sx + halfW} y={sy} width={halfW} height={sh} fill={DROP_PREVIEW_FILL} fillOpacity={0.18} stroke={DROP_PREVIEW_STROKE} strokeWidth={1.2} strokeDasharray="4 3" rx={2} style={{ pointerEvents: "none" }} />
        }
        const childBottom = fragments
          .filter((candidate) => candidate.parentNodeId === target.stackId)
          .reduce<number | null>((bottom, candidate) => {
            const candidateBottom = candidate.y + candidate.height
            return bottom == null ? candidateBottom : Math.max(bottom, candidateBottom)
          }, null)
        const lineY = childBottom == null
          ? sy + 8
          : Math.min(sy + sh - 2, Math.max(sy + 3, childBottom * scale + 2))
        return <rect x={sx + 4} y={lineY} width={Math.max(sw - 8, 2)} height={2} fill={DROP_INSERTION_STROKE} rx={1} style={{ pointerEvents: "none" }} />
      }
    }
  }

  if (zone === "top" || zone === "row-outer-top")
    return <rect x={x} y={y - 1} width={w} height={2} fill={DROP_INSERTION_STROKE} rx={1} style={{ pointerEvents: "none" }} />
  if (zone === "bottom" || zone === "row-outer-bottom")
    return <rect x={x} y={y + h - 1} width={w} height={2} fill={DROP_INSERTION_STROKE} rx={1} style={{ pointerEvents: "none" }} />
  if (zone === "center")
    return <rect x={x + 3} y={y + 3} width={Math.max(w - 6, 2)} height={Math.max(h - 6, 2)} fill={DROP_PREVIEW_FILL} fillOpacity={0.16} stroke={DROP_PREVIEW_STROKE} strokeWidth={1.2} strokeDasharray="5 3" rx={2} style={{ pointerEvents: "none" }} />
  if (zone === "left" || zone === "right") {
    const halfW = w / 2
    return <rect x={zone === "left" ? x : x + halfW} y={y} width={halfW} height={h} fill={DROP_PREVIEW_FILL} fillOpacity={0.18} stroke={DROP_PREVIEW_STROKE} strokeWidth={1.2} strokeDasharray="4 3" rx={2} style={{ pointerEvents: "none" }} />
  }
  return null
}

// ─── Page View ────────────────────────────────────────────────────────────────

function PageView({
  page, doc, drag, scale, selectedNodeId, selectionAnchorNodeId, isLayoutLoading, inlineEditVisualFresh,
  inlineEditNodeId, inlineEditCaretIndex, inlineEditPageIndex, inlineEditVisualLocked, onInlineEditStart, onInlineEditChange, onInlineEditCaretChange, onInlineEditUserInteraction, onInlineEditHeightChange, onInlineEditEnd, onSplitParagraph, onMergeParagraph, onCanStartStructuralEdit, onExitListItem, onChangeListItemLevel, onBackspaceListItemAtStart,
  pageKey, textMeasurer, onNodePointerDown, onBackgroundPointerDown, onSelectContextNode, onStartCloneDrag, onDeleteNode, onTableAction,
  resizeDrag, onResizeStart, onTableColumnResizeStart, minHeightDrag, onMinHeightResizeStart,
  sectionIndex, marginDrag, marginEditMode, headerFooterEditMode, headerFooterReservedDrag, headerFooterZoneScroll, onMarginEditModeEnter, onMarginEditModeExit, onHeaderFooterEditModeEnter, onHeaderFooterEditModeExit, onHeaderFooterZonePointerDown, onHeaderFooterReservedResizeStart, onHeaderFooterZoneScroll, onHeaderFooterZoneScrollTo, onMarginResizeStart, showTextSegments, showDrift, driftMap, wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled, wysiwygTextDraftNodeId, wysiwygTextDraftText, wysiwygTextCaretOffset, wysiwygTextSelection, wysiwygTextDraftPaginationActive, suppressedCanvasTextNodeIds = EMPTY_SUPPRESSED_NODE_IDS, activeOutOfCanvasStructuralIsland, wysiwygDraftVisualPreview, wysiwygTableCellDraftVisualChromeByPageIndex, wysiwygTextPointerFragments, onWysiwygTextDraftChange, onWysiwygRichTextShortcut, onWysiwygTextReflowDecision,
}: {
  page: PaginatedPage; doc: DocumentNode; drag: DragState | null
  scale: number; selectedNodeId: string | null; selectionAnchorNodeId: string | null; isLayoutLoading: boolean
  textMeasurer: TextMeasurer
  inlineEditVisualFresh: boolean
  showTextSegments: boolean
  showDrift: boolean
  driftMap: Map<string, FragmentDrift> | null
  wysiwygInlineEditEnabled: boolean
  wysiwygTextEngineEnabled: boolean
  wysiwygTextDraftNodeId: string | null
  wysiwygTextDraftText: string | null
  wysiwygTextCaretOffset: number | null
  wysiwygTextSelection: { anchorOffset: number; focusOffset: number } | null
  wysiwygTextDraftPaginationActive: boolean
  suppressedCanvasTextNodeIds?: ReadonlySet<string>
  activeOutOfCanvasStructuralIsland: ActiveOutOfCanvasStructuralIsland | null
  wysiwygDraftVisualPreview: WysiwygDraftVisualPreview | null
  wysiwygTableCellDraftVisualChromeByPageIndex: Map<number, PageFragment[]>
  wysiwygTextPointerFragments: WysiwygTextPointerFragmentTarget[]
  inlineEditNodeId: string | null
  inlineEditCaretIndex: number | null
  inlineEditPageIndex: number | null
  inlineEditVisualLocked: boolean
  onInlineEditStart: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => void
  onInlineEditChange: (nodeId: string, text: string, caretIndex: number | null) => void
  onInlineEditCaretChange: (nodeId: string, caretIndex: number | null) => void
  onInlineEditUserInteraction: (nodeId: string) => void
  onInlineEditHeightChange: (nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => void
  onInlineEditEnd: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph: (nodeId: string, text?: string) => void
  onCanStartStructuralEdit?: ParagraphTextSurfaceStructuralEditGuard
  onExitListItem?: (nodeId: string, text?: string) => void
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  onWysiwygTextDraftChange: (nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => void
  onWysiwygRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onWysiwygTextReflowDecision: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
  pageKey: string
  onNodePointerDown: (source: DragSource, e: React.PointerEvent, clickAction?: PendingClickAction) => void
  onBackgroundPointerDown: () => void
  onSelectContextNode: (nodeId: string) => void
  onStartCloneDrag: (nodeId: string, e: React.PointerEvent<SVGGElement>) => void
  onDeleteNode: (nodeId: string) => void
  onTableAction: (nodeId: string, action: CanvasTableAction) => void
  resizeDrag: ResizeDrag | null
  onResizeStart: (rowId: string, leftStackId: string, rightStackId: string, pairX: number, pairWidth: number, gapWidthPt: number, startClientX: number, pageKey: string, rowFragY: number, rowFragHeight: number) => void
  onTableColumnResizeStart: (tableId: string, leftColIndex: number, pairX: number, pairWidth: number, leftWidthOriginal: number, rightWidthOriginal: number, startClientX: number, pageKey: string, tableFragY: number, tableFragHeight: number) => void
  minHeightDrag: MinHeightDrag | null
  onMinHeightResizeStart: (rowId: string, rowFragY: number, pageKey: string) => void
  sectionIndex: number
  marginDrag: MarginDrag | null
  marginEditMode: MarginEditMode | null
  headerFooterEditMode: HeaderFooterEditMode | null
  headerFooterReservedDrag: HeaderFooterReservedDrag | null
  headerFooterZoneScroll: HeaderFooterZoneScrollState | null
  onMarginEditModeEnter: (sectionIndex: number) => void
  onMarginEditModeExit: () => void
  onHeaderFooterEditModeEnter: (sectionIndex: number, zone: "header" | "footer") => void
  onHeaderFooterEditModeExit: () => void
  onHeaderFooterZonePointerDown: () => void
  onHeaderFooterReservedResizeStart: (sectionIndex: number, zone: "header" | "footer", currentReserved: { headerReserved: number; footerReserved: number }, pageHeightPt: number, marginTopPt: number, marginBottomPt: number, pageKey: string) => void
  onHeaderFooterZoneScroll: (sectionIndex: number, zone: HeaderFooterZone, deltaPt: number, maxOffsetPt: number) => void
  onHeaderFooterZoneScrollTo: (sectionIndex: number, zone: HeaderFooterZone, offsetPt: number, maxOffsetPt: number) => void
  onMarginResizeStart: (sectionIndex: number, side: "top" | "right" | "bottom" | "left", currentMargins: { top: number; right: number; bottom: number; left: number }, pageWidthPt: number, pageHeightPt: number, pageKey: string, altKey: boolean) => void
}) {
  const W = page.width * scale
  const H = page.height * scale
  const dragHoverNodeId = drag?.preview?.hoverNodeId ?? null
  const [hoverPathTarget, setHoverPathTarget] = useState<{ nodeId: string; pageKey: string } | null>(null)
  const hoverPathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docLookup = useMemo(() => buildPageViewDocLookup(doc), [doc])
  const { nodeById, plainTextParagraphIds, textRunParagraphIds, tableCellIds, flowStackParagraphIds } = docLookup
  const editFragmentRef = useRef<ActiveEditFragmentRef | null>(null)
  const sectionPageSettings = doc.document.sections[sectionIndex]?.page ?? null

  const clearHoverPathTimer = useCallback(() => {
    if (hoverPathTimerRef.current == null) return
    clearTimeout(hoverPathTimerRef.current)
    hoverPathTimerRef.current = null
  }, [])

  const queueHoverPath = useCallback((nodeId: string) => {
    if (drag || resizeDrag || minHeightDrag || marginDrag || marginEditMode || headerFooterEditMode) return
    clearHoverPathTimer()
    hoverPathTimerRef.current = setTimeout(() => {
      setHoverPathTarget({ nodeId, pageKey })
      hoverPathTimerRef.current = null
    }, CANVAS_PATH_HOVER_DELAY_MS)
  }, [clearHoverPathTimer, drag, headerFooterEditMode, marginDrag, marginEditMode, minHeightDrag, pageKey, resizeDrag])

  const clearHoverPath = useCallback((nodeId?: string) => {
    clearHoverPathTimer()
    setHoverPathTarget((current) => {
      if (!current) return null
      if (nodeId && current.nodeId !== nodeId) return current
      return null
    })
  }, [clearHoverPathTimer])

  useEffect(() => () => clearHoverPathTimer(), [clearHoverPathTimer])
  useEffect(() => {
    if (!drag && !resizeDrag && !minHeightDrag && !marginDrag && !marginEditMode && !headerFooterEditMode) return
    clearHoverPath()
  }, [clearHoverPath, drag, resizeDrag, minHeightDrag, marginDrag, marginEditMode, headerFooterEditMode])

  useEffect(() => {
    if (inlineEditNodeId == null) editFragmentRef.current = null
  }, [inlineEditNodeId])
  const wysiwygCaretMappingEnabled = wysiwygInlineEditEnabled || wysiwygTextEngineEnabled
  const visualDraftFragmentForPage = wysiwygDraftVisualPreview?.fragmentsByPageIndex.get(page.index) ?? null
  const tableCellDraftVisualChromeFragments = visualDraftFragmentForPage
    ? wysiwygTableCellDraftVisualChromeByPageIndex.get(page.index) ?? []
    : EMPTY_PAGE_FRAGMENTS
  const tableCellDraftVisualChromeSet = useMemo(
    () => new Set(tableCellDraftVisualChromeFragments),
    [tableCellDraftVisualChromeFragments],
  )
  const allTableCellDraftVisualChromeByKey = useMemo(
    () => new Map(
      tableCellDraftVisualChromeFragments.map((fragment) => [tableCellDraftVisualChromeKey(fragment), fragment] as const),
    ),
    [tableCellDraftVisualChromeFragments],
  )
  const hasRealVisualDraftFragment = visualDraftFragmentForPage
    ? page.fragments.some((fragment) =>
      fragment.nodeId === visualDraftFragmentForPage.nodeId &&
      fragment.nodeType === "paragraph"
    )
    : false
  const realVisualDraftFragment = visualDraftFragmentForPage
    ? page.fragments.find((fragment) =>
      fragment.nodeId === visualDraftFragmentForPage.nodeId &&
      fragment.nodeType === "paragraph"
    ) ?? null
    : null
  const sourceTableCellDraftVisualChromeByKey = useMemo(
    () => hasRealVisualDraftFragment
      ? allTableCellDraftVisualChromeByKey
      : new Map<string, PageFragment>(),
    [allTableCellDraftVisualChromeByKey, hasRealVisualDraftFragment],
  )
  const tableCellDraftVisualRowChrome = tableCellDraftVisualChromeFragments.find(isTableRowFragment)
  const realTableCellDraftVisualRow = tableCellDraftVisualRowChrome
    ? page.fragments.find((fragment) =>
      fragment.nodeId === tableCellDraftVisualRowChrome.nodeId &&
      fragment.nodeType === tableCellDraftVisualRowChrome.nodeType &&
      fragment.parentNodeId === tableCellDraftVisualRowChrome.parentNodeId
    ) ?? null
    : null
  const tableCellDraftSourceShiftY = hasRealVisualDraftFragment && tableCellDraftVisualRowChrome && realTableCellDraftVisualRow
    ? Math.max(0, tableCellDraftVisualRowChrome.height - realTableCellDraftVisualRow.height)
    : 0
  const sourceShiftStartY = realTableCellDraftVisualRow
    ? realTableCellDraftVisualRow.y + realTableCellDraftVisualRow.height
    : null
  const sourceShiftYWithGap = tableCellDraftSourceShiftY > 0
    ? tableCellDraftSourceShiftY + (PARAGRAPH_LIVE_PREVIEW_GAP_Y / scale)
    : 0
  const sourceShiftedPageFragments = sourceShiftYWithGap > 0 && sourceShiftStartY !== null
    ? page.fragments.map((fragment) => {
      if (sourceTableCellDraftVisualChromeByKey.has(tableCellDraftVisualChromeKey(fragment))) return fragment
      if (fragment.nodeId === visualDraftFragmentForPage?.nodeId && fragment.nodeType === "paragraph") return fragment
      if (fragment.y < sourceShiftStartY - 0.5) return fragment
      return shiftPageFragmentY(fragment, sourceShiftYWithGap)
    })
    : visualDraftFragmentForPage && realVisualDraftFragment && !tableCellDraftVisualRowChrome
      ? shiftWysiwygDraftPreviewSourcePageFragments({
          fragments: page.fragments,
          sourceFragment: realVisualDraftFragment,
          draftFragment: visualDraftFragmentForPage,
        })
    : page.fragments
  const shiftedPageFragments = visualDraftFragmentForPage && !hasRealVisualDraftFragment
    ? shiftWysiwygDraftPreviewDownstreamFragments({
      fragments: page.fragments,
      draftFragment: {
        ...visualDraftFragmentForPage,
        height: tableCellDraftVisualRowChrome?.height ?? visualDraftFragmentForPage.height,
      },
      extraShiftY: (PARAGRAPH_CHROME_Y * 2 + PARAGRAPH_LIVE_PREVIEW_GAP_Y) / scale,
    })
    : sourceShiftedPageFragments
  const renderFragments = visualDraftFragmentForPage && !hasRealVisualDraftFragment
    ? [...tableCellDraftVisualChromeFragments, visualDraftFragmentForPage, ...shiftedPageFragments]
    : shiftedPageFragments
  const headerFragments = page.headerFragments ?? []
  const footerFragments = page.footerFragments ?? []
  const zoneFragments = [...headerFragments, ...footerFragments]
  const activeInlineEditPageIndex = resolveActiveInlineEditPageIndex({
    inlineEditPageIndex,
    previewCaretPageIndex: wysiwygDraftVisualPreview?.caretPageIndex,
    isVisualLocked: inlineEditVisualLocked,
  })

  const resolveDisplayFragment = (fragment: PageFragment): PageFragment => (
    visualDraftFragmentForPage &&
    fragment.nodeId === visualDraftFragmentForPage.nodeId &&
    fragment.nodeType === "paragraph"
      ? visualDraftFragmentForPage
      : sourceTableCellDraftVisualChromeByKey.get(tableCellDraftVisualChromeKey(fragment)) ?? fragment
  )
  const activeInlineEditRenderIndex = (() => {
    if (!inlineEditNodeId) return -1
    const candidates = renderFragments
      .map((fragment, index) => ({ fragment, index, displayFragment: resolveDisplayFragment(fragment) }))
      .filter(({ fragment }) =>
        fragment.nodeId === inlineEditNodeId &&
        (activeInlineEditPageIndex == null || fragment.pageIndex === activeInlineEditPageIndex)
      )
    if (candidates.length === 0) return -1
    const caretCandidate = candidates.find(({ displayFragment }) =>
      fragmentContainsInlineEditCaret(displayFragment, inlineEditCaretIndex)
    )
    return (caretCandidate ?? candidates[0]).index
  })()
  const activeInlineEditSourceFragment = activeInlineEditRenderIndex >= 0
    ? renderFragments[activeInlineEditRenderIndex] ?? null
    : null
  const activeInlineEditDisplayFragment = activeInlineEditSourceFragment
    ? resolveDisplayFragment(activeInlineEditSourceFragment)
    : null
  const activeInlineEditIsPlainNativeParagraph = Boolean(
    wysiwygTextEngineEnabled &&
    activeInlineEditSourceFragment?.nodeType === "paragraph" &&
    !tableCellIds.has(activeInlineEditSourceFragment.parentNodeId ?? "") &&
    !flowStackParagraphIds.has(activeInlineEditSourceFragment.nodeId) &&
    !isParagraphInsideRowStack(doc, activeInlineEditSourceFragment.nodeId) &&
    (
      !activeInlineEditSourceFragment.parentNodeId ||
      nodeById.get(activeInlineEditSourceFragment.parentNodeId)?.type !== "flow-stack"
    ),
  )
  const shouldSuppressStalePageBreakFragment = useCallback((fragment: PageFragment) => shouldSuppressStalePageBreakForActiveWysiwygIsland({
    fragment,
    activeInlineEditIsPlainNativeParagraph,
    activeInlineEditDisplayFragment,
    activeOutOfCanvasStructuralIsland,
  }), [
    activeInlineEditDisplayFragment,
    activeInlineEditIsPlainNativeParagraph,
    activeOutOfCanvasStructuralIsland,
  ])
  const tableColumnResizeHandles = resolveTableColumnResizeHandles({
    doc,
    selectedNodeId,
    fragments: renderFragments,
  })
  const hoverPathNodeId = hoverPathTarget?.pageKey === pageKey ? hoverPathTarget.nodeId : null
  const normalHoverNodeId = hoverPathNodeId
  const selectedPathAnchorNodeId = selectionAnchorNodeId ?? selectedNodeId
  const selectedPathItems = useMemo(
    () => buildSelectionContext(doc, selectedPathAnchorNodeId),
    [doc, selectedPathAnchorNodeId],
  )
  const hoverPathItems = useMemo(
    () => buildSelectionContext(doc, hoverPathNodeId),
    [doc, hoverPathNodeId],
  )
  const isMarginDragSection = marginDrag?.sectionIndex === sectionIndex
  const isMarginEditSection = marginEditMode?.sectionIndex === sectionIndex
  const isHeaderFooterEditSection = headerFooterEditMode?.sectionIndex === sectionIndex
  const isHeaderEditActive = isHeaderFooterEditSection && headerFooterEditMode?.zone === "header"
  const isFooterEditActive = isHeaderFooterEditSection && headerFooterEditMode?.zone === "footer"
  const isMarginGuideEditable = !isHeaderFooterEditSection && (isMarginDragSection || isMarginEditSection)
  const pageMargins = resolvePageMarginsPt(page, sectionPageSettings)
  const liveMargins = isMarginDragSection ? marginDrag!.currentMargins : pageMargins
  const marginGuide = {
    lx: liveMargins.left * scale,
    rx: (page.width - liveMargins.right) * scale,
    ty: liveMargins.top * scale,
    by: (page.height - liveMargins.bottom) * scale,
  }
  const marginSides = [
    { side: "left"   as const, x1: marginGuide.lx, y1: 0,              x2: marginGuide.lx, y2: H,              hx: marginGuide.lx - 7, hy: 0,                  hw: 14, hh: H,  cur: "ew-resize" },
    { side: "right"  as const, x1: marginGuide.rx, y1: 0,              x2: marginGuide.rx, y2: H,              hx: marginGuide.rx - 7, hy: 0,                  hw: 14, hh: H,  cur: "ew-resize" },
    { side: "top"    as const, x1: 0,              y1: marginGuide.ty, x2: W,              y2: marginGuide.ty, hx: 0,                  hy: marginGuide.ty - 7, hw: W,  hh: 14, cur: "ns-resize" },
    { side: "bottom" as const, x1: 0,              y1: marginGuide.by, x2: W,              y2: marginGuide.by, hx: 0,                  hy: marginGuide.by - 7, hw: W,  hh: 14, cur: "ns-resize" },
  ]
  const marginActivationBands = [
    { side: "left" as const, x: 0, y: 0, width: Math.max(marginGuide.lx, 1), height: H },
    { side: "right" as const, x: marginGuide.rx, y: 0, width: Math.max(W - marginGuide.rx, 1), height: H },
    { side: "top" as const, x: 0, y: 0, width: W, height: Math.max(marginGuide.ty, 1) },
    { side: "bottom" as const, x: 0, y: marginGuide.by, width: W, height: Math.max(H - marginGuide.by, 1) },
  ]
  const isMarginSideActive = (side: string) => isMarginDragSection && marginDrag!.side === side
  const isMarginSideMirror = (side: string) =>
    isMarginDragSection && !marginDrag!.altKey && (
      (marginDrag!.side === "left" && side === "right") ||
      (marginDrag!.side === "right" && side === "left") ||
      (marginDrag!.side === "top" && side === "bottom") ||
      (marginDrag!.side === "bottom" && side === "top")
    )
  const marginLineStroke = (side: string) => (
    isMarginSideActive(side) ? "#2563eb" : isMarginSideMirror(side) ? "#93c5fd" : isMarginGuideEditable ? "#3b82f6" : "#e5e7eb"
  )
  const marginLineWidth = (side: string) => (
    isMarginSideActive(side) ? 1.75 : isMarginSideMirror(side) ? 1.25 : isMarginGuideEditable ? 1.25 : 0.5
  )
  const pageMarginTopPt = pageMargins.top
  const pageMarginBottomPt = pageMargins.bottom
  const liveHeaderFooterReserved = headerFooterReservedDrag?.sectionIndex === sectionIndex
    ? headerFooterReservedDrag.currentReserved
    : null
  const headerReservedPt = sectionPageSettings ? Math.max(0, liveHeaderFooterReserved?.headerReserved ?? sectionPageSettings.headerReserved ?? 0) : 0
  const footerReservedPt = sectionPageSettings ? Math.max(0, liveHeaderFooterReserved?.footerReserved ?? sectionPageSettings.footerReserved ?? 0) : 0
  const zoneHorizontalBox = sectionPageSettings
    ? resolveHeaderFooterHorizontalBox(sectionPageSettings, page.contentBox, page.width)
    : { x: page.contentBox.x, width: page.contentBox.width }
  const headerZoneDoc = {
    x: zoneHorizontalBox.x,
    y: pageMarginTopPt,
    width: zoneHorizontalBox.width,
    height: Math.max(headerReservedPt, headerFragments.length > 0 ? 12 / scale : 0),
  }
  const footerZoneDoc = {
    x: zoneHorizontalBox.x,
    y: page.height - pageMarginBottomPt - footerReservedPt,
    width: zoneHorizontalBox.width,
    height: Math.max(footerReservedPt, footerFragments.length > 0 ? 12 / scale : 0),
  }
  const dropHighlightBox = isHeaderEditActive
    ? headerZoneDoc
    : isFooterEditActive
      ? footerZoneDoc
      : page.contentBox
  const dropHighlightFragments = isHeaderFooterEditSection
    ? [...page.fragments, ...zoneFragments]
    : page.fragments
  const headerZone = {
    x: headerZoneDoc.x * scale,
    y: headerZoneDoc.y * scale,
    width: headerZoneDoc.width * scale,
    height: headerZoneDoc.height * scale,
  }
  const footerZone = {
    x: footerZoneDoc.x * scale,
    y: footerZoneDoc.y * scale,
    width: footerZoneDoc.width * scale,
    height: footerZoneDoc.height * scale,
  }
  const currentReservedForResize = {
    headerReserved: headerReservedPt,
    footerReserved: footerReservedPt,
  }
  const headerZoneBottomDoc = headerZoneDoc.y + headerZoneDoc.height
  const footerZoneBottomDoc = footerZoneDoc.y + footerZoneDoc.height
  const headerOverflowPt = Math.max(0, (fragmentsVisualBottom(headerFragments) ?? headerZoneBottomDoc) - headerZoneBottomDoc)
  const footerOverflowPt = Math.max(0, (fragmentsVisualBottom(footerFragments) ?? footerZoneBottomDoc) - footerZoneBottomDoc)
  const headerScrollPt = isHeaderEditActive && headerFooterZoneScroll?.sectionIndex === sectionIndex && headerFooterZoneScroll.zone === "header"
    ? clamp(headerFooterZoneScroll.offsetPt, 0, headerOverflowPt)
    : 0
  const footerScrollPt = isFooterEditActive && headerFooterZoneScroll?.sectionIndex === sectionIndex && headerFooterZoneScroll.zone === "footer"
    ? clamp(headerFooterZoneScroll.offsetPt, 0, footerOverflowPt)
    : 0
  const headerZoneScrollLockedByInlineEdit = isHeaderEditActive &&
    zoneFragmentsContainActiveInlineEdit(headerFragments, inlineEditNodeId, activeInlineEditPageIndex)
  const footerZoneScrollLockedByInlineEdit = isFooterEditActive &&
    zoneFragmentsContainActiveInlineEdit(footerFragments, inlineEditNodeId, activeInlineEditPageIndex)
  const headerZoneClipPathId = `${pageKey}-header-footer-header-zone-clip`
  const footerZoneClipPathId = `${pageKey}-header-footer-footer-zone-clip`
  const handleHeaderZoneWheel = (event: ReactWheelEvent<SVGRectElement | SVGGElement>) => {
    if (!isHeaderEditActive || headerOverflowPt <= 0.5) return
    if (headerZoneScrollLockedByInlineEdit) {
      event.stopPropagation()
      event.preventDefault()
      return
    }
    event.stopPropagation()
    event.preventDefault()
    onHeaderFooterZoneScroll(sectionIndex, "header", normalizeHeaderFooterWheelDeltaPt(event, scale), headerOverflowPt)
  }
  const handleFooterZoneWheel = (event: ReactWheelEvent<SVGRectElement | SVGGElement>) => {
    if (!isFooterEditActive || footerOverflowPt <= 0.5) return
    if (footerZoneScrollLockedByInlineEdit) {
      event.stopPropagation()
      event.preventDefault()
      return
    }
    event.stopPropagation()
    event.preventDefault()
    onHeaderFooterZoneScroll(sectionIndex, "footer", normalizeHeaderFooterWheelDeltaPt(event, scale), footerOverflowPt)
  }
  const headerFooterChromePageIsActive = !isHeaderFooterEditSection ||
    activeInlineEditPageIndex == null ||
    page.index === activeInlineEditPageIndex
  const activeHeaderFooterChromeFragments = !headerFooterChromePageIsActive
    ? []
    : isHeaderEditActive
    ? headerFragments.map((fragment) => headerScrollPt === 0 ? fragment : shiftPageFragmentY(fragment, -headerScrollPt))
    : isFooterEditActive
      ? footerFragments.map((fragment) => footerScrollPt === 0 ? fragment : shiftPageFragmentY(fragment, -footerScrollPt))
      : []
  const selectedOverlayFragments = isHeaderFooterEditSection
    ? activeHeaderFooterChromeFragments
    : renderFragments
  const visibleSelectedOverlayFragments = selectedOverlayFragments.filter((fragment) =>
    !shouldSuppressStalePageBreakFragment(fragment)
  )
  const suppressPathOverlays = Boolean(
    drag ||
    resizeDrag ||
    minHeightDrag ||
    marginDrag ||
    marginEditMode ||
    (headerFooterEditMode && !isHeaderFooterEditSection),
  )
  const selectedPathFragment = suppressPathOverlays ? null : findCanvasPathFragment(
    visibleSelectedOverlayFragments,
    selectedNodeId,
    selectedPathAnchorNodeId,
  )
  const hoverPathFragment = suppressPathOverlays || isHeaderFooterEditSection || hoverPathNodeId === selectedPathAnchorNodeId
    ? null
    : findCanvasPathFragment(renderFragments.filter((fragment) => !shouldSuppressStalePageBreakFragment(fragment)), hoverPathNodeId)
  const selectedActionNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null
  const selectedActionFragment = suppressPathOverlays || !selectedActionNode
    ? null
    : findCanvasPathFragment(visibleSelectedOverlayFragments, selectedNodeId)
  const selectedActionIsHeaderFooterZone = isHeaderFooterEditSection && selectedActionFragment != null
  const selectedActionTableActions = selectedActionIsHeaderFooterZone
    ? []
    : resolveCanvasTableActions(doc, selectedActionNode)
  const selectedActionUsesTableScope = selectedActionTableActions.length > 0
  const selectedActionIsInternalTableScope =
    selectedActionNode?.type === "flow-table-row" ||
    selectedActionNode?.type === "flow-table-cell"
  const selectedActionCanDrag = Boolean(
    selectedActionNode &&
    !selectedActionIsHeaderFooterZone &&
    !selectedActionIsInternalTableScope &&
    DRAGGABLE_TYPES.has(selectedActionNode.type),
  )
  const selectedActionCanDuplicate = Boolean(
    selectedActionNode &&
    !selectedActionIsHeaderFooterZone &&
    !selectedActionUsesTableScope &&
    selectedActionNode.type !== "body",
  )
  const selectedActionCanDelete = selectedActionIsHeaderFooterZone
    ? Boolean(selectedActionNode && selectedActionNode.type !== "body")
    : selectedActionCanDuplicate
  const bodyFragmentElements = useMemo(() => renderFragments.map((f, i) => {
    const isWysiwygTableCellDraftVisualChrome = tableCellDraftVisualChromeSet.has(f) ||
      sourceTableCellDraftVisualChromeByKey.has(tableCellDraftVisualChromeKey(f))
    const isWysiwygTableCellDraftStructureChrome = isWysiwygTableCellDraftVisualChrome && !isTableCellFragment(f)
    const isTableStructureChrome = isTableStructureFragment(f, renderFragments)
    const isHovered = f.nodeId === dragHoverNodeId || f.nodeId === normalHoverNodeId
    const isFlowTableRowVisualOnly = f.nodeType === "flow-table-row"
    const isLayoutNode = nodeById.has(f.nodeId)
    const isDraggable = DRAGGABLE_TYPES.has(f.nodeType) && isLayoutNode
    const isSelectable = SELECTABLE_NODE_TYPES.has(f.nodeType)
    const selectNodeId = f.nodeId
    const isTableCellParagraph = f.nodeType === "paragraph" && tableCellIds.has(f.parentNodeId ?? "")
    const editableParagraphIds = wysiwygTextEngineEnabled ? textRunParagraphIds : plainTextParagraphIds
    const canInlineEditThisParagraph = f.nodeType === "paragraph" && editableParagraphIds.has(f.nodeId)
    const visualDisplayFragment = resolveDisplayFragment(f)
    const isInlineEditing = i === activeInlineEditRenderIndex
    if (isInlineEditing) {
      if (
        editFragmentRef.current?.nodeId !== f.nodeId ||
        editFragmentRef.current?.pageKey !== pageKey
      ) {
        editFragmentRef.current = {
          nodeId: f.nodeId,
          pageKey,
          fragment: { ...visualDisplayFragment },
          visualOffsetY: 0,
        }
      } else {
        editFragmentRef.current = {
          ...editFragmentRef.current,
          fragment: { ...visualDisplayFragment },
          visualOffsetY: 0,
        }
      }
    }
    const displayFragment = isInlineEditing
      ? editFragmentRef.current?.fragment ?? visualDisplayFragment
      : visualDisplayFragment
    const isFlowStackParagraph = f.nodeType === "paragraph" && (
      flowStackParagraphIds.has(f.nodeId) ||
      (f.parentNodeId ? nodeById.get(f.parentNodeId)?.type === "flow-stack" : false)
    )
    const isContinuationParagraphFragment = f.nodeType === "paragraph" &&
      (displayFragment.continuesFrom === true || displayFragment.isContinued === true)
    const isContinuationFlowTableCellFragment = isFlowTableCellContinuationFragment(displayFragment)
    const isCanvasTextSuppressed = f.nodeType === "paragraph" && suppressedCanvasTextNodeIds.has(f.nodeId)
    const shouldSuppressNativeInlineEditFragmentChrome = (isInlineEditing && activeInlineEditIsPlainNativeParagraph) || isCanvasTextSuppressed
    const shouldSuppressActiveInlineEditTextSurface = shouldSuppressNativeInlineEditFragmentChrome
    const shouldSuppressStalePageBreakForActiveIsland = shouldSuppressStalePageBreakFragment(f)
    const shouldShowFragmentTypeLabel = !isFlowTableRowVisualOnly &&
      !shouldSuppressStalePageBreakForActiveIsland &&
      !isTableStructureChrome &&
      !isWysiwygTableCellDraftVisualChrome &&
      !isContinuationParagraphFragment &&
      !isContinuationFlowTableCellFragment
    const docNode = nodeById.get(f.nodeId)
    const isEmpty = (f.nodeType === "stack" || f.nodeType === "flow-stack") && docNode && "childIds" in docNode && (docNode as { childIds: string[] }).childIds.length === 0
    let fragX = displayFragment.x, fragWidth = displayFragment.width, fragHeight = fragmentVisibleInteractionHeight(displayFragment, page)
    if (resizeDrag?.type === "stack" && (f.nodeType === "stack" || f.nodeType === "flow-stack")) {
      if (f.nodeId === resizeDrag.leftStackId) {
        fragWidth = resizeDrag.currentDocX - f.x
      } else if (f.nodeId === resizeDrag.rightStackId) {
        fragX = resizeDrag.currentDocX + resizeDrag.gapWidthPt
        fragWidth = (f.x + f.width) - fragX
      }
    }
    if (minHeightDrag && !minHeightDrag.committed) {
      if (f.nodeId === minHeightDrag.rowId || f.parentNodeId === minHeightDrag.rowId) {
        fragHeight = Math.max(fragHeight, minHeightDrag.currentMinHeight)
      }
    }
    const resizedDisplayFragment = fragX !== displayFragment.x || fragWidth !== displayFragment.width || fragHeight !== displayFragment.height
      ? { ...displayFragment, x: fragX, width: fragWidth, height: fragHeight }
      : displayFragment
    const paragraphChromeY = isFlowStackParagraph ? FLOW_STACK_PARAGRAPH_CHROME_Y : PARAGRAPH_CHROME_Y
    const chromeTop = f.nodeType === "paragraph" ? paragraphChromeY : 0
    const chromeBottom = f.nodeType === "paragraph" ? paragraphChromeY : 0
    const chromeY = displayFragment.y * scale - chromeTop
    const chromeHeight = Math.max(fragHeight * scale + chromeTop + chromeBottom, 2)
    const hasAuthoredFragmentBox = (f.nodeType === "paragraph" && Boolean(displayFragment.renderProps?.box)) ||
      ((f.nodeType === "flow-stack" || f.nodeType === "flow-table-cell") && Boolean(displayFragment.boxRenderProps))
    const chromeFill = isFlowTableRowVisualOnly
      ? "transparent"
      : isTableStructureChrome ? "transparent"
      : isWysiwygTableCellDraftStructureChrome ? "transparent"
      : isWysiwygTableCellDraftVisualChrome ? WYSIWYG_TABLE_CELL_DRAFT_CHROME_FILL
      : shouldSuppressStalePageBreakForActiveIsland ? "transparent"
      : shouldSuppressNativeInlineEditFragmentChrome ? "transparent"
      : hasAuthoredFragmentBox && !isInlineEditing ? "transparent" : isInlineEditing ? INLINE_EDIT_CHROME_FILL : "transparent"
    const chromeStroke = isFlowTableRowVisualOnly || (hasAuthoredFragmentBox && !isInlineEditing && !isHovered)
      ? "transparent"
      : isTableStructureChrome ? "transparent"
      : isWysiwygTableCellDraftStructureChrome ? "transparent"
      : isWysiwygTableCellDraftVisualChrome ? "#60a5fa"
      : shouldSuppressStalePageBreakForActiveIsland ? "transparent"
      : shouldSuppressNativeInlineEditFragmentChrome ? "transparent"
      : isInlineEditing ? "#2563eb" : isHovered ? "#4b5563" : "#9ca3af"
    const chromeOpacity = isFlowTableRowVisualOnly
      ? 0
      : isTableStructureChrome ? 0
      : isWysiwygTableCellDraftStructureChrome ? 0
      : isWysiwygTableCellDraftVisualChrome ? 0.34
      : shouldSuppressStalePageBreakForActiveIsland ? 0
      : shouldSuppressNativeInlineEditFragmentChrome ? 0
      : hasAuthoredFragmentBox && !isInlineEditing ? 1 : isInlineEditing ? 0.35 : 0.75
    const fragmentKey = buildEditorFragmentRenderKey(displayFragment, i, isInlineEditing)
    const clipPathId = buildEditorFragmentClipPathId(pageKey, displayFragment, i)

    return (
      <g
        key={fragmentKey}
        data-testid="editor-fragment"
        data-node-id={f.nodeId}
        data-node-type={f.nodeType}
        data-inline-editable={canInlineEditThisParagraph ? "true" : undefined}
        data-page-index={displayFragment.pageIndex}
        data-fragment-index={displayFragment.fragmentIndex ?? undefined}
        data-line-start={displayFragment.lineStart ?? undefined}
        data-line-end={displayFragment.lineEnd ?? undefined}
        data-parent-node-id={displayFragment.parentNodeId ?? undefined}
        data-table-structure-chrome={isTableStructureChrome ? "true" : undefined}
        data-wysiwyg-table-cell-visual-chrome={isWysiwygTableCellDraftVisualChrome ? "true" : undefined}
        data-wysiwyg-table-cell-structure-chrome={isWysiwygTableCellDraftStructureChrome ? "true" : undefined}
        data-wysiwyg-active-canvas-text-suppressed={shouldSuppressActiveInlineEditTextSurface ? "true" : undefined}
        data-wysiwyg-out-of-canvas-island-suppressed={isCanvasTextSuppressed ? "true" : undefined}
        data-wysiwyg-boundary-safe-page-break-suppressed={shouldSuppressStalePageBreakForActiveIsland ? "true" : undefined}
        onPointerEnter={!shouldSuppressStalePageBreakForActiveIsland && !isFlowTableRowVisualOnly && !drag && !resizeDrag && !minHeightDrag && !marginDrag && !marginEditMode && !headerFooterEditMode && !isInlineEditing
          ? () => queueHoverPath(f.nodeId)
          : undefined}
        onPointerLeave={!shouldSuppressStalePageBreakForActiveIsland && !isFlowTableRowVisualOnly
          ? () => clearHoverPath(f.nodeId)
          : undefined}
        onPointerDown={!shouldSuppressStalePageBreakForActiveIsland && !isFlowTableRowVisualOnly && (isSelectable || f.nodeType === "stack") && !drag && !resizeDrag && !marginEditMode && !headerFooterEditMode && !isInlineEditing
          ? (e) => {
            e.stopPropagation()
            const clickAction = shouldStartInlineEditOnSingleClick({
              canInlineEditParagraph: canInlineEditThisParagraph,
              isTableCellParagraph,
            })
              ? {
                  type: "inline-edit" as const,
                  nodeId: f.nodeId,
                  selectNodeId: isTableCellParagraph && f.parentNodeId ? f.parentNodeId : f.nodeId,
                  caretIndex: wysiwygCaretMappingEnabled
                    ? caretIndexFromPointer(displayFragment, e, scale, textMeasurer, true)
                    : null,
                  pageIndex: displayFragment.pageIndex,
                }
              : undefined
            const nodeId = isTableCellParagraph && f.parentNodeId ? f.parentNodeId : selectNodeId
            onNodePointerDown({ source: "document", nodeId }, e, clickAction)
          }
          : undefined}
        onDoubleClick={(f.nodeType === "paragraph" || f.nodeType === "flow-table-cell") && !drag && !marginEditMode && !headerFooterEditMode
          ? (e) => {
            e.stopPropagation()
            const paragraphId = f.nodeType === "flow-table-cell"
              ? findFirstParagraphInCell(doc, f.nodeId, wysiwygTextEngineEnabled)
              : f.nodeId
            if (!paragraphId || !canInlineEditParagraph(doc, paragraphId, wysiwygTextEngineEnabled)) return
            onInlineEditStart(
              paragraphId,
              f.nodeType === "paragraph" && wysiwygCaretMappingEnabled
                ? caretIndexFromPointer(displayFragment, e, scale, textMeasurer, true)
                : null,
              displayFragment.pageIndex,
            )
          }
          : undefined}
        style={{
          pointerEvents: shouldSuppressStalePageBreakForActiveIsland || isFlowTableRowVisualOnly || isWysiwygTableCellDraftVisualChrome ? "none" : undefined,
          cursor: isInlineEditing ? "text" : isDraggable && !drag ? "grab" : "default",
        }}
      >
        <rect
          data-wysiwyg-native-edit-fragment-chrome-suppressed={shouldSuppressNativeInlineEditFragmentChrome ? "true" : undefined}
          x={fragX * scale} y={chromeY}
          width={Math.max(fragWidth * scale, 2)} height={chromeHeight}
          fill={chromeFill}
          stroke={chromeStroke}
          strokeWidth={isInlineEditing ? 1.5 : isHovered ? 1 : 0.5}
          opacity={chromeOpacity}
        />
        {(f.nodeType === "paragraph" || f.nodeType === "flow-stack" || f.nodeType === "flow-table-cell") && renderFragmentBox(resizedDisplayFragment, scale)}
        {f.nodeType === "divider" && renderDividerFragment(displayFragment, scale)}
        {f.nodeType === "page-break" && !shouldSuppressStalePageBreakForActiveIsland && renderPageBreakMarker(displayFragment, scale)}
        {showDrift && f.nodeType === "paragraph" && (() => {
          const drift = driftMap?.get(f.nodeId)
          if (!drift) return null
          const driftColor = drift.lineDelta !== 0
            ? (drift.lineDelta > 0 ? "#f97316" : "#3b82f6")
            : "#a855f7"
          const label = drift.lineDelta !== 0
            ? `${drift.lineDelta > 0 ? "+" : ""}${drift.lineDelta}L`
            : "PG"
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect
                x={f.x * scale} y={f.y * scale}
                width={f.width * scale} height={Math.max(fragHeight * scale, 2)}
                fill={driftColor} opacity={0.18}
              />
              <rect
                x={f.x * scale} y={f.y * scale}
                width={f.width * scale} height={Math.max(fragHeight * scale, 2)}
                fill="none" stroke={driftColor} strokeWidth={1} opacity={0.6}
              />
              <text
                x={(f.x + f.width) * scale - 3} y={(f.y + 7) * scale}
                textAnchor="end" fontSize={6} fill={driftColor} fontWeight="bold"
                style={{ userSelect: "none" }}
              >
                {label}
              </text>
            </g>
          )
        })()}
        {shouldShowFragmentTypeLabel && (
          <text x={displayFragment.x * scale + 3} y={displayFragment.y * scale + 8} fontSize={6} fill="#374151"
            style={{ pointerEvents: "none", userSelect: "none" }}>
            {displayFragmentNodeType(f.nodeType)}
          </text>
        )}
        {isEmpty && (
          <text
            x={(resizedDisplayFragment.x + resizedDisplayFragment.width / 2) * scale} y={(resizedDisplayFragment.y + fragHeight / 2 + 3) * scale}
            textAnchor="middle" fontSize={8 * scale} fill="#9ca3af"
            style={{ pointerEvents: "none", userSelect: "none" }}>
            วางที่นี่
          </text>
        )}
        {(f.nodeType === "paragraph" || f.nodeType === "toc") && !shouldSuppressActiveInlineEditTextSurface && (
          <ParagraphTextSurface
            fragment={displayFragment}
            doc={doc}
            pageKey={pageKey}
            clipPathId={clipPathId}
            scale={scale}
            pageContentBottom={page.contentBox.y + page.contentBox.height}
            textMeasurer={textMeasurer}
            isEditing={isInlineEditing}
            isVisualFresh={isInlineEditing && inlineEditVisualFresh}
            wysiwygInlineEditEnabled={wysiwygInlineEditEnabled}
            wysiwygTextEngineEnabled={wysiwygTextEngineEnabled}
            wysiwygTextDraftText={wysiwygTextDraftNodeId === f.nodeId ? wysiwygTextDraftText : null}
            wysiwygTextCaretOffset={wysiwygTextDraftNodeId === f.nodeId ? wysiwygTextCaretOffset : null}
            wysiwygTextSelection={wysiwygTextDraftNodeId === f.nodeId ? wysiwygTextSelection : null}
            wysiwygTextVisualDraftLines={wysiwygTextDraftNodeId === f.nodeId ? visualDraftFragmentForPage?.lines ?? null : null}
            wysiwygTextPointerFragments={wysiwygTextDraftNodeId === f.nodeId ? wysiwygTextPointerFragments : undefined}
            wysiwygTextDraftPaginationActive={wysiwygTextDraftNodeId === f.nodeId && (wysiwygTextDraftPaginationActive || visualDraftFragmentForPage !== null)}
            showTextSegments={showTextSegments}
            initialCaretIndex={isInlineEditing ? inlineEditCaretIndex : null}
            onChange={onInlineEditChange}
            onCaretChange={onInlineEditCaretChange}
            onUserEditInteraction={onInlineEditUserInteraction}
            onHeightChange={onInlineEditHeightChange}
            onEndEdit={onInlineEditEnd}
            onSplitParagraph={onSplitParagraph}
            onMergeParagraph={onMergeParagraph}
            onCanStartStructuralEdit={onCanStartStructuralEdit}
            onExitListItem={onExitListItem}
            onChangeListItemLevel={onChangeListItemLevel}
            onBackspaceListItemAtStart={onBackspaceListItemAtStart}
            onWysiwygTextDraftChange={onWysiwygTextDraftChange}
            onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
            onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
          />
        )}
      </g>
    )
  }), [
    activeInlineEditDisplayFragment,
    activeInlineEditIsPlainNativeParagraph,
    activeInlineEditRenderIndex,
    clearHoverPath,
    doc,
    drag,
    dragHoverNodeId,
    driftMap,
    flowStackParagraphIds,
    headerFooterEditMode,
    inlineEditCaretIndex,
    inlineEditVisualFresh,
    marginDrag,
    marginEditMode,
    minHeightDrag,
    nodeById,
    normalHoverNodeId,
    onBackspaceListItemAtStart,
    onChangeListItemLevel,
    onExitListItem,
    onInlineEditCaretChange,
    onInlineEditChange,
    onInlineEditEnd,
    onInlineEditHeightChange,
    onInlineEditStart,
    onInlineEditUserInteraction,
    onMergeParagraph,
    onNodePointerDown,
    onSplitParagraph,
    onWysiwygRichTextShortcut,
    onWysiwygTextDraftChange,
    onWysiwygTextReflowDecision,
    page,
    pageKey,
    plainTextParagraphIds,
    queueHoverPath,
    renderFragments,
    resizeDrag,
    scale,
    showDrift,
    showTextSegments,
    shouldSuppressStalePageBreakFragment,
    sourceTableCellDraftVisualChromeByKey,
    suppressedCanvasTextNodeIds,
    tableCellDraftVisualChromeSet,
    tableCellIds,
    textMeasurer,
    textRunParagraphIds,
    visualDraftFragmentForPage,
    wysiwygCaretMappingEnabled,
    wysiwygInlineEditEnabled,
    wysiwygTextCaretOffset,
    wysiwygTextDraftNodeId,
    wysiwygTextDraftPaginationActive,
    wysiwygTextDraftText,
    wysiwygTextEngineEnabled,
    wysiwygTextPointerFragments,
    wysiwygTextSelection,
  ])
  const selectedBodyFragmentOutline = useMemo(() => {
    if (!selectedNodeId || isHeaderFooterEditSection) return null
    const selectedIndex = renderFragments.findIndex((fragment) => fragment.nodeId === selectedNodeId)
    if (selectedIndex < 0 || selectedIndex === activeInlineEditRenderIndex) return null
    const selectedFragment = renderFragments[selectedIndex]
    if (!selectedFragment || selectedFragment.nodeType === "flow-table-row") return null
    if (shouldSuppressStalePageBreakFragment(selectedFragment)) return null
    const displayFragment = visualDraftFragmentForPage &&
      selectedFragment.nodeId === visualDraftFragmentForPage.nodeId &&
      selectedFragment.nodeType === "paragraph"
      ? visualDraftFragmentForPage
      : sourceTableCellDraftVisualChromeByKey.get(tableCellDraftVisualChromeKey(selectedFragment)) ?? selectedFragment
    const isFlowStackParagraph = selectedFragment.nodeType === "paragraph" && (
      flowStackParagraphIds.has(selectedFragment.nodeId) ||
      (selectedFragment.parentNodeId ? nodeById.get(selectedFragment.parentNodeId)?.type === "flow-stack" : false)
    )

    return (
      <g data-testid="editor-fragment-selection-overlay" style={{ pointerEvents: "none" }}>
        {renderBodyFragmentSelectionOutline({
          fragment: displayFragment,
          page,
          scale,
          isFlowStackParagraph,
        })}
      </g>
    )
  }, [
    activeInlineEditRenderIndex,
    flowStackParagraphIds,
    isHeaderFooterEditSection,
    nodeById,
    page,
    renderFragments,
    scale,
    selectedNodeId,
    shouldSuppressStalePageBreakFragment,
    sourceTableCellDraftVisualChromeByKey,
    visualDraftFragmentForPage,
  ])

  return (
    // overflow: visible — ให้ inline editor ขยายเกิน SVG boundary ได้
    <svg
      data-testid="editor-page"
      data-page-key={pageKey}
      data-page-index={page.index}
      width={W} height={H}
      overflow="visible"
      style={{ border: "1px solid #d1d5db", background: "white", display: "block" }}
      onPointerDown={!drag ? onBackgroundPointerDown : undefined}
    >
      {/* clipPaths — ป้องกัน text overflow ออกนอก fragment width */}
      <defs>
        <clipPath id={headerZoneClipPathId}>
          <rect x={headerZone.x} y={headerZone.y} width={headerZone.width} height={headerZone.height} />
        </clipPath>
        <clipPath id={footerZoneClipPathId}>
          <rect x={footerZone.x} y={footerZone.y} width={footerZone.width} height={footerZone.height} />
        </clipPath>
        {[...renderFragments, ...zoneFragments].map((f, i) => {
          const displayFragment = resolveDisplayFragment(f)
          const clipPathId = buildEditorFragmentClipPathId(pageKey, displayFragment, i)
          const clipRect = fragmentClipPathRect(displayFragment, page, scale)
          return (
          <clipPath key={`${clipPathId}-${i}`} id={clipPathId}>
            <rect x={clipRect.x} y={clipRect.y} width={clipRect.width} height={clipRect.height} />
          </clipPath>
          )
        })}
      </defs>

      {/* margin guides are passive until the user intentionally enters margin edit mode */}
      <g data-testid="page-margin-guides" data-margin-edit-active={isMarginGuideEditable ? "true" : "false"}>
        {!isMarginGuideEditable && !isHeaderFooterEditSection && marginActivationBands.map(({ side, x, y, width, height }) => (
          <rect
            key={`margin-activate-${side}`}
            data-testid="page-margin-activation-band"
            data-side={side}
            x={x}
            y={y}
            width={width}
            height={height}
            fill="transparent"
            style={{ cursor: "default", touchAction: "none" }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onMarginEditModeEnter(sectionIndex)
            }}
          />
        ))}
        {marginSides.map(({ side, x1, y1, x2, y2 }) => (
          <line
            key={`margin-guide-${side}`}
            data-testid="page-margin-guide-line"
            data-side={side}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={marginLineStroke(side)}
            strokeWidth={marginLineWidth(side)}
            strokeDasharray={isMarginGuideEditable ? "none" : "4 2"}
            style={{ pointerEvents: "none" }}
          />
        ))}
      </g>

      {/* empty body placeholder */}
      {page.fragments.length === 0 && (() => {
        const cb = page.contentBox
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={cb.x * scale} y={cb.y * scale} width={cb.width * scale} height={48 * scale}
              fill="none" stroke="#d1d5db" strokeDasharray="6 3" strokeWidth={1} rx={4} />
            <text x={(cb.x + cb.width / 2) * scale} y={(cb.y + 28) * scale}
              textAnchor="middle" fontSize={10 * scale} fill="#9ca3af" style={{ userSelect: "none" }}>
              วางที่นี่
            </text>
          </g>
        )
      })()}

      {/* fragments */}
      {bodyFragmentElements}
      {selectedBodyFragmentOutline}

      <HeaderFooterZoneLayer
        zone="header"
        active={isHeaderEditActive}
        x={headerZone.x}
        y={headerZone.y}
        width={headerZone.width}
        height={headerZone.height}
        onEnter={() => onHeaderFooterEditModeEnter(sectionIndex, "header")}
        onActivePointerDown={onHeaderFooterZonePointerDown}
        onActiveWheel={handleHeaderZoneWheel}
      />
      <HeaderFooterZoneLayer
        zone="footer"
        active={isFooterEditActive}
        x={footerZone.x}
        y={footerZone.y}
        width={footerZone.width}
        height={footerZone.height}
        onEnter={() => onHeaderFooterEditModeEnter(sectionIndex, "footer")}
        onActivePointerDown={onHeaderFooterZonePointerDown}
        onActiveWheel={handleFooterZoneWheel}
      />

      <g
        data-testid="header-footer-zone-clip"
        data-zone="header"
        data-scroll-pt={Math.round(headerScrollPt * 100) / 100}
        clipPath={`url(#${headerZoneClipPathId})`}
        onWheel={handleHeaderZoneWheel}
      >
        <ZoneFragments
          fragments={headerFragments}
          zone="header"
          active={isHeaderEditActive}
          doc={doc}
          pageKey={pageKey}
          scale={scale}
          pageContentBottom={headerZoneDoc.y + headerZoneDoc.height}
          textMeasurer={textMeasurer}
          inlineEditVisualFresh={inlineEditVisualFresh}
          inlineEditNodeId={inlineEditNodeId}
          inlineEditCaretIndex={inlineEditCaretIndex}
          activeInlineEditPageIndex={activeInlineEditPageIndex}
          editFragmentRef={editFragmentRef}
          dragActive={Boolean(drag)}
          wysiwygInlineEditEnabled={wysiwygInlineEditEnabled}
          wysiwygTextEngineEnabled={wysiwygTextEngineEnabled}
          wysiwygTextDraftNodeId={wysiwygTextDraftNodeId}
          wysiwygTextDraftText={wysiwygTextDraftText}
          wysiwygTextCaretOffset={wysiwygTextCaretOffset}
          wysiwygTextSelection={wysiwygTextSelection}
          wysiwygTextDraftPaginationActive={wysiwygTextDraftPaginationActive}
          suppressedCanvasTextNodeIds={suppressedCanvasTextNodeIds}
          wysiwygTextPointerFragments={wysiwygTextPointerFragments}
          showTextSegments={showTextSegments}
          onInlineEditStart={onInlineEditStart}
          onInlineEditChange={onInlineEditChange}
          onInlineEditCaretChange={onInlineEditCaretChange}
          onInlineEditUserInteraction={onInlineEditUserInteraction}
          onInlineEditHeightChange={onInlineEditHeightChange}
          onInlineEditEnd={onInlineEditEnd}
          onSplitParagraph={onSplitParagraph}
          onMergeParagraph={onMergeParagraph}
          onCanStartStructuralEdit={onCanStartStructuralEdit}
          onExitListItem={onExitListItem}
          onChangeListItemLevel={onChangeListItemLevel}
          onBackspaceListItemAtStart={onBackspaceListItemAtStart}
          onWysiwygTextDraftChange={onWysiwygTextDraftChange}
          onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
          onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
          clipPathIndexOffset={renderFragments.length}
          visualOffsetY={-headerScrollPt}
        />
      </g>
      <g
        data-testid="header-footer-zone-clip"
        data-zone="footer"
        data-scroll-pt={Math.round(footerScrollPt * 100) / 100}
        clipPath={`url(#${footerZoneClipPathId})`}
        onWheel={handleFooterZoneWheel}
      >
        <ZoneFragments
          fragments={footerFragments}
          zone="footer"
          active={isFooterEditActive}
          doc={doc}
          pageKey={pageKey}
          scale={scale}
          pageContentBottom={footerZoneDoc.y + footerZoneDoc.height}
          textMeasurer={textMeasurer}
          inlineEditVisualFresh={inlineEditVisualFresh}
          inlineEditNodeId={inlineEditNodeId}
          inlineEditCaretIndex={inlineEditCaretIndex}
          activeInlineEditPageIndex={activeInlineEditPageIndex}
          editFragmentRef={editFragmentRef}
          dragActive={Boolean(drag)}
          wysiwygInlineEditEnabled={wysiwygInlineEditEnabled}
          wysiwygTextEngineEnabled={wysiwygTextEngineEnabled}
          wysiwygTextDraftNodeId={wysiwygTextDraftNodeId}
          wysiwygTextDraftText={wysiwygTextDraftText}
          wysiwygTextCaretOffset={wysiwygTextCaretOffset}
          wysiwygTextSelection={wysiwygTextSelection}
          wysiwygTextDraftPaginationActive={wysiwygTextDraftPaginationActive}
          suppressedCanvasTextNodeIds={suppressedCanvasTextNodeIds}
          wysiwygTextPointerFragments={wysiwygTextPointerFragments}
          showTextSegments={showTextSegments}
          onInlineEditStart={onInlineEditStart}
          onInlineEditChange={onInlineEditChange}
          onInlineEditCaretChange={onInlineEditCaretChange}
          onInlineEditUserInteraction={onInlineEditUserInteraction}
          onInlineEditHeightChange={onInlineEditHeightChange}
          onInlineEditEnd={onInlineEditEnd}
          onSplitParagraph={onSplitParagraph}
          onMergeParagraph={onMergeParagraph}
          onCanStartStructuralEdit={onCanStartStructuralEdit}
          onExitListItem={onExitListItem}
          onChangeListItemLevel={onChangeListItemLevel}
          onBackspaceListItemAtStart={onBackspaceListItemAtStart}
          onWysiwygTextDraftChange={onWysiwygTextDraftChange}
          onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
          onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
          clipPathIndexOffset={renderFragments.length + headerFragments.length}
          visualOffsetY={-footerScrollPt}
        />
      </g>

      {isHeaderFooterEditSection && (
        <rect
          data-testid="header-footer-body-exit-overlay"
          x={page.contentBox.x * scale}
          y={page.contentBox.y * scale}
          width={page.contentBox.width * scale}
          height={page.contentBox.height * scale}
          fill="#f8fafc"
          opacity={0.32}
          style={{ cursor: "default", touchAction: "none" }}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onHeaderFooterEditModeExit()
          }}
        />
      )}

      {isHeaderEditActive && (
        <>
          <HeaderFooterOverflowMarker
            zone="header"
            edge="top"
            x={headerZone.x}
            y={headerZone.y}
            width={headerZone.width}
            overflowPt={headerOverflowPt}
            hiddenPt={headerScrollPt}
            scale={scale}
          />
          <HeaderFooterOverflowMarker
            zone="header"
            edge="bottom"
            x={headerZone.x}
            y={headerZone.y + headerZone.height}
            width={headerZone.width}
            overflowPt={headerOverflowPt}
            hiddenPt={Math.max(0, headerOverflowPt - headerScrollPt)}
            scale={scale}
          />
          {!headerZoneScrollLockedByInlineEdit && (
            <HeaderFooterOverflowScrollIndicator
              zone="header"
              x={headerZone.x}
              y={headerZone.y}
              width={headerZone.width}
              height={headerZone.height}
              overflowPt={headerOverflowPt}
              scrollPt={headerScrollPt}
              scale={scale}
              onScrollTo={(offsetPt, maxOffsetPt) => onHeaderFooterZoneScrollTo(sectionIndex, "header", offsetPt, maxOffsetPt)}
              onWheel={handleHeaderZoneWheel}
            />
          )}
        </>
      )}
      {isFooterEditActive && (
        <>
          <HeaderFooterOverflowMarker
            zone="footer"
            edge="top"
            x={footerZone.x}
            y={footerZone.y}
            width={footerZone.width}
            overflowPt={footerOverflowPt}
            hiddenPt={footerScrollPt}
            scale={scale}
          />
          <HeaderFooterOverflowMarker
            zone="footer"
            edge="bottom"
            x={footerZone.x}
            y={footerZone.y + footerZone.height}
            width={footerZone.width}
            overflowPt={footerOverflowPt}
            hiddenPt={Math.max(0, footerOverflowPt - footerScrollPt)}
            scale={scale}
          />
          {!footerZoneScrollLockedByInlineEdit && (
            <HeaderFooterOverflowScrollIndicator
              zone="footer"
              x={footerZone.x}
              y={footerZone.y}
              width={footerZone.width}
              height={footerZone.height}
              overflowPt={footerOverflowPt}
              scrollPt={footerScrollPt}
              scale={scale}
              onScrollTo={(offsetPt, maxOffsetPt) => onHeaderFooterZoneScrollTo(sectionIndex, "footer", offsetPt, maxOffsetPt)}
              onWheel={handleFooterZoneWheel}
            />
          )}
        </>
      )}

      {isHeaderEditActive && (
        <HeaderFooterZoneResizeHandle
          zone="header"
          x={headerZone.x}
          y={headerZone.y + headerZone.height}
          width={headerZone.width}
          active={headerFooterReservedDrag?.sectionIndex === sectionIndex && headerFooterReservedDrag.zone === "header"}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            onHeaderFooterReservedResizeStart(
              sectionIndex,
              "header",
              currentReservedForResize,
              page.height,
              pageMarginTopPt,
              pageMarginBottomPt,
              pageKey,
            )
          }}
        />
      )}
      {isFooterEditActive && (
        <HeaderFooterZoneResizeHandle
          zone="footer"
          x={footerZone.x}
          y={footerZone.y}
          width={footerZone.width}
          active={headerFooterReservedDrag?.sectionIndex === sectionIndex && headerFooterReservedDrag.zone === "footer"}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            onHeaderFooterReservedResizeStart(
              sectionIndex,
              "footer",
              currentReservedForResize,
              page.height,
              pageMarginTopPt,
              pageMarginBottomPt,
              pageKey,
            )
          }}
        />
      )}

      {/* resize handles — แสดงระหว่าง stacks ของแต่ละ row */}
      {!drag && !marginEditMode && !headerFooterEditMode && page.fragments.filter((f) => f.nodeType === "row" || f.nodeType === "flow-row").map((rowFrag) => {
        const rowNode = nodeById.get(rowFrag.nodeId)
        if (rowNode?.type !== "row" && rowNode?.type !== "flow-row") return null
        if (rowNode.type !== rowFrag.nodeType) return null
        const rowChildIds = rowNode.childIds
        return rowChildIds.slice(0, -1).map((leftStackId: string, i: number) => {
          const rightStackId = rowChildIds[i + 1]
          const leftFrag = page.fragments.find((f) => f.nodeId === leftStackId)
          const rightFrag = page.fragments.find((f) => f.nodeId === rightStackId)
          if (!leftFrag || !rightFrag) return null
          const isActive = resizeDrag?.type === "stack" && resizeDrag.leftStackId === leftStackId
          const handleDocX = leftFrag.x + leftFrag.width
          const hx = handleDocX * scale
          const hy = rowFrag.y * scale
          const hh = Math.max(rowFrag.height * scale, 8)
          return (
            <g key={`rh-${leftStackId}`}>
              {/* hit area */}
              <rect x={hx - 6} y={hy} width={12} height={hh}
                data-testid="column-resize-handle"
                data-row-type={rowFrag.nodeType}
                data-row-id={rowFrag.nodeId}
                data-left-stack-id={leftStackId}
                data-right-stack-id={rightStackId}
                fill="transparent" style={{ cursor: "col-resize", touchAction: "none" }}
                onPointerDown={(e) => {
                  e.stopPropagation(); e.preventDefault()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  const gapWidthPt = Math.max(0, rightFrag.x - (leftFrag.x + leftFrag.width))
                  onResizeStart(rowFrag.nodeId, leftStackId, rightStackId, leftFrag.x, leftFrag.width + rightFrag.width, gapWidthPt, e.clientX, pageKey, rowFrag.y, rowFrag.height)
                }}
              />
              {/* visual line */}
              <rect x={hx - 0.5} y={hy} width={1} height={hh}
                fill="#9ca3af" opacity={isActive ? 0 : 0.5}
                style={{ pointerEvents: "none" }} />
            </g>
          )
        })
      })}

      {/* table column resize handles — internal column boundaries only */}
      {!drag && !marginEditMode && !headerFooterEditMode && tableColumnResizeHandles.map((handle) => {
        const isActive = resizeDrag?.type === "table-column" &&
          resizeDrag.tableId === handle.tableId &&
          resizeDrag.leftColIndex === handle.leftColIndex
        const hx = handle.handleDocX * scale
        const hy = handle.tableFragY * scale
        const hh = Math.max(handle.tableFragHeight * scale, 8)
        return (
          <g key={`table-rh-${handle.tableId}-${handle.leftColIndex}`}>
            <rect
              x={hx - 6}
              y={hy}
              width={12}
              height={hh}
              data-testid="table-column-resize-handle"
              data-table-id={handle.tableId}
              data-left-col-index={handle.leftColIndex}
              fill="transparent"
              style={{ cursor: "col-resize", touchAction: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation(); e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                onTableColumnResizeStart(
                  handle.tableId,
                  handle.leftColIndex,
                  handle.pairX,
                  handle.pairWidth,
                  handle.leftWidthOriginal,
                  handle.rightWidthOriginal,
                  e.clientX,
                  pageKey,
                  handle.tableFragY,
                  handle.tableFragHeight,
                )
              }}
            />
            <rect
              x={hx - 0.5}
              y={hy}
              width={1}
              height={hh}
              fill="#2563eb"
              opacity={isActive ? 0 : 0.55}
              style={{ pointerEvents: "none" }}
            />
          </g>
        )
      })}

      {/* minHeight resize handles — แสดงด้านล่างของ row */}
      {!drag && !marginEditMode && !headerFooterEditMode && page.fragments.filter((f) => f.nodeType === "row").map((rowFrag) => {
        const isActive = minHeightDrag?.rowId === rowFrag.nodeId
        const rowNode = nodeById.get(rowFrag.nodeId)
        if (rowNode?.type !== "row") return null
        const currentMinH = isActive ? minHeightDrag!.currentMinHeight : (rowNode.props.minHeight ?? 0)
        const visualHeight = isActive ? Math.max(rowFrag.height, currentMinH) : rowFrag.height
        const ghostY = (rowFrag.y + currentMinH) * scale
        const hx = rowFrag.x * scale
        const hw = rowFrag.width * scale
        const rowBottomY = (rowFrag.y + visualHeight) * scale
        return (
          <g key={`mh-${rowFrag.nodeId}`}>
            {/* hit area at row bottom */}
            <rect x={hx} y={rowBottomY - 5} width={hw} height={10}
              fill="transparent" style={{ cursor: "row-resize", touchAction: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation(); e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                onMinHeightResizeStart(rowFrag.nodeId, rowFrag.y, pageKey)
              }}
            />
            {/* ghost line แสดง minHeight ที่จะ set */}
            {(isActive || (currentMinH > 0 && ghostY < rowBottomY - 2)) && (
              <line x1={hx} y1={ghostY} x2={hx + hw} y2={ghostY}
                stroke={isActive ? "#2563eb" : "#c4b5fd"}
                strokeWidth={isActive ? 1.5 : 1}
                strokeDasharray={isActive ? "none" : "4 3"}
                style={{ pointerEvents: "none" }} />
            )}
            {/* visual handle line at bottom */}
            <rect x={hx} y={rowBottomY - (isActive ? 1 : 0.5)} width={hw} height={isActive ? 2 : 1}
              fill={isActive ? "#2563eb" : "#9ca3af"} opacity={isActive ? 1 : 0.4}
              style={{ pointerEvents: "none" }} />
          </g>
        )
      })}

      {isMarginGuideEditable && (
        <g data-testid="page-margin-edit-layer">
          {marginActivationBands.map(({ side, x, y, width, height }) => (
            <rect
              key={`margin-edit-outer-${side}`}
              data-testid="page-margin-edit-outer-band"
              data-side={side}
              x={x}
              y={y}
              width={width}
              height={height}
              fill="#dbeafe"
              opacity={0.12}
              style={{ cursor: "default", touchAction: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onMarginEditModeExit()
              }}
            />
          ))}
          <rect
            data-testid="page-margin-edit-content-overlay"
            x={marginGuide.lx}
            y={marginGuide.ty}
            width={Math.max(0, marginGuide.rx - marginGuide.lx)}
            height={Math.max(0, marginGuide.by - marginGuide.ty)}
            fill="#eff6ff"
            opacity={0.18}
            style={{ cursor: "default", touchAction: "none" }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onMarginEditModeExit()
            }}
          />
          {marginSides.map(({ side, x1, y1, x2, y2, hx, hy, hw, hh, cur }) => (
            <g key={`margin-edit-${side}`}>
              <rect
                data-testid="page-margin-drag-handle"
                data-side={side}
                x={hx}
                y={hy}
                width={hw}
                height={hh}
                fill="transparent"
                style={{ cursor: cur, touchAction: "none" }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  onMarginResizeStart(sectionIndex, side, pageMargins, page.width, page.height, pageKey, e.altKey)
                }}
              />
              <line
                data-testid="page-margin-edit-line"
                data-side={side}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={marginLineStroke(side)}
                strokeWidth={marginLineWidth(side)}
                strokeDasharray="none"
                style={{ pointerEvents: "none" }}
              />
            </g>
          ))}
        </g>
      )}

      {selectedNodeId && selectedActionFragment && (
        <CanvasNodeActionRail
          nodeId={selectedNodeId}
          anchorFragment={resolveDisplayFragment(selectedActionFragment)}
          pageWidth={page.width}
          pageHeight={page.height}
          scale={scale}
          canDrag={selectedActionCanDrag}
          canDuplicate={selectedActionCanDuplicate}
          canDelete={selectedActionCanDelete}
          tableActions={selectedActionTableActions}
          allowOutsideLeft={selectedActionIsHeaderFooterZone}
          onStartDrag={(nodeId, e) => onNodePointerDown({ source: "document", nodeId }, e)}
          onStartCloneDrag={onStartCloneDrag}
          onDeleteNode={onDeleteNode}
          onTableAction={onTableAction}
        />
      )}
      {selectedPathFragment && selectedPathItems.length > 0 && (
        <CanvasNodePathOverlay
          items={selectedPathItems}
          activeNodeId={selectedNodeId}
          anchorFragment={resolveDisplayFragment(selectedPathFragment)}
          pageWidth={page.width}
          pageHeight={page.height}
          scale={scale}
          variant="selected"
          onSelectNode={onSelectContextNode}
        />
      )}
      {hoverPathFragment && hoverPathItems.length > 0 && (
        <CanvasNodePathOverlay
          items={hoverPathItems}
          activeNodeId={null}
          anchorFragment={resolveDisplayFragment(hoverPathFragment)}
          pageWidth={page.width}
          pageHeight={page.height}
          scale={scale}
          variant="hover"
        />
      )}

      <DropHighlight doc={doc} drag={drag} fragments={dropHighlightFragments} scale={scale} contentBox={dropHighlightBox} />

      {isLayoutLoading && !inlineEditNodeId && !drag && !resizeDrag?.committed && !minHeightDrag?.committed && (
        <rect x={0} y={0} width={W} height={H} fill="white" opacity={0.15}
          style={{ pointerEvents: "none" }} />
      )}
    </svg>
  )
}

type PageViewProps = Parameters<typeof PageView>[0]
const PAGE_VIEW_TRANSIENT_PROP_KEYS: Array<keyof PageViewProps> = ["resizeDrag", "minHeightDrag", "marginDrag", "marginEditMode", "headerFooterEditMode", "headerFooterReservedDrag", "headerFooterZoneScroll"]
const PAGE_VIEW_SCOPED_EDIT_PROP_KEYS: Array<keyof PageViewProps> = [
  "selectedNodeId",
  "selectionAnchorNodeId",
  "inlineEditVisualFresh",
  "inlineEditNodeId",
  "inlineEditCaretIndex",
  "inlineEditPageIndex",
  "inlineEditVisualLocked",
  "wysiwygTextDraftNodeId",
  "wysiwygTextDraftText",
  "wysiwygTextCaretOffset",
  "wysiwygTextSelection",
  "wysiwygTextDraftPaginationActive",
  "suppressedCanvasTextNodeIds",
  "activeOutOfCanvasStructuralIsland",
  "wysiwygDraftVisualPreview",
  "wysiwygTableCellDraftVisualChromeByPageIndex",
  "wysiwygTextPointerFragments",
  "onWysiwygTextDraftChange",
  "onWysiwygTextReflowDecision",
]

interface PageViewScopedEditProps {
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  inlineEditNodeId: string | null
  inlineEditPageIndex: number | null
  wysiwygTextDraftNodeId: string | null
  wysiwygDraftVisualPreview: WysiwygDraftVisualPreview | null
  suppressedCanvasTextNodeIds?: ReadonlySet<string>
  activeOutOfCanvasStructuralIsland?: ActiveOutOfCanvasStructuralIsland | null
  wysiwygTableCellDraftVisualChromeByPageIndex: Map<number, PageFragment[]>
  wysiwygTextPointerFragments: WysiwygTextPointerFragmentTarget[]
}

function resizeDragAffectsPage(page: PaginatedPage, drag: ResizeDrag | null): boolean {
  if (!drag) return false
  if (drag.type === "table-column") {
    return page.fragments.some((fragment) =>
      fragment.nodeId === drag.tableId ||
      fragment.parentNodeId === drag.tableId
    )
  }
  return page.fragments.some((fragment) =>
    fragment.nodeId === drag.rowId ||
    fragment.nodeId === drag.leftStackId ||
    fragment.nodeId === drag.rightStackId
  )
}

function minHeightDragAffectsPage(page: PaginatedPage, drag: MinHeightDrag | null): boolean {
  if (!drag) return false
  return page.fragments.some((fragment) =>
    fragment.nodeId === drag.rowId ||
    fragment.parentNodeId === drag.rowId
  )
}

function marginDragAffectsPage(sectionIndex: number, drag: MarginDrag | null): boolean {
  return drag?.sectionIndex === sectionIndex
}

function marginEditModeAffectsPage(sectionIndex: number, mode: MarginEditMode | null): boolean {
  return mode?.sectionIndex === sectionIndex
}

function headerFooterEditModeAffectsPage(sectionIndex: number, mode: HeaderFooterEditMode | null): boolean {
  return mode?.sectionIndex === sectionIndex
}

function headerFooterReservedDragAffectsPage(sectionIndex: number, drag: HeaderFooterReservedDrag | null): boolean {
  return drag?.sectionIndex === sectionIndex
}

function headerFooterZoneScrollAffectsPage(sectionIndex: number, scroll: HeaderFooterZoneScrollState | null): boolean {
  return scroll?.sectionIndex === sectionIndex
}

function pageHasNodeFragment(page: PaginatedPage, nodeId: string | null): boolean {
  return canvasViewportPageHasNodeFragmentBridge(page, nodeId)
}

function pageHasAnyNodeFragment(page: PaginatedPage, nodeId: string | null): boolean {
  return canvasViewportPageHasAnyNodeFragmentBridge(page, nodeId)
}

function pageHasSuppressedBoundarySafePageBreak(
  page: PaginatedPage,
  activeIsland: ActiveOutOfCanvasStructuralIsland | null | undefined,
): boolean {
  return pageHasSuppressedBoundarySafePageBreakBridge(page, activeIsland)
}

function pageIsAffectedByStructuralIsland(
  page: PaginatedPage,
  activeIsland: ActiveOutOfCanvasStructuralIsland | null | undefined,
): boolean {
  return pageIsAffectedByStructuralIslandBridge(page, activeIsland)
}

export function pageViewScopedEditPropsAffectPage(
  page: PaginatedPage,
  props: PageViewScopedEditProps,
): boolean {
  return pageViewScopedEditPropsAffectPageBridge(page, props)
}

export function pageViewStructuralTransitionAffectsPage(
  page: PaginatedPage,
  props: PageViewScopedEditProps,
): boolean {
  return pageViewStructuralTransitionAffectsPageBridge(page, props)
}

function canIgnoreStructuralSnapshotChangeForUnrelatedPage(
  prev: Readonly<PageViewProps>,
  next: Readonly<PageViewProps>,
): boolean {
  if (!prev.activeOutOfCanvasStructuralIsland && !next.activeOutOfCanvasStructuralIsland) return false
  return !pageViewStructuralTransitionAffectsPage(prev.page, prev) &&
    !pageViewStructuralTransitionAffectsPage(next.page, next)
}

function recordStructuralPageMemoMiss(
  prev: Readonly<PageViewProps>,
  next: Readonly<PageViewProps>,
  reason: string,
): void {
  const activeIsland = next.activeOutOfCanvasStructuralIsland ?? prev.activeOutOfCanvasStructuralIsland
  if (!activeIsland) return
  const page = next.page ?? prev.page
  const affected = pageViewStructuralTransitionAffectsPage(prev.page, prev) ||
    pageViewStructuralTransitionAffectsPage(next.page, next)
  recordWysiwygPerfEvent(false, {
    kind: "flowdoc-structural-render-attribution",
    startedAt: startWysiwygPerfSpan(),
    durationMs: 0,
    nodeId: activeIsland.nodeId,
    pageIndex: page.index,
    affectedPageIndex: activeIsland.pageIndex,
    componentName: "PageViewMemo",
    source: "PageViewMemo",
    action: "memo-miss",
    renderReason: reason,
    optimisticMode: activeIsland.mode,
    active: affected,
    unaffectedPage: !affected,
  })
}

function recordStructuralPageComparatorTiming(
  prev: Readonly<PageViewProps>,
  next: Readonly<PageViewProps>,
  componentName: string,
  startedAt: number,
  reason: string,
): void {
  const activeIsland = next.activeOutOfCanvasStructuralIsland ?? prev.activeOutOfCanvasStructuralIsland
  if (!activeIsland) return
  const page = next.page ?? prev.page
  const affected = pageViewStructuralTransitionAffectsPage(prev.page, prev) ||
    pageViewStructuralTransitionAffectsPage(next.page, next)
  recordWysiwygPerfEvent(false, {
    kind: "flowdoc-structural-render-attribution",
    startedAt,
    durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
    nodeId: activeIsland.nodeId,
    pageIndex: page.index,
    affectedPageIndex: activeIsland.pageIndex,
    componentName,
    source: componentName,
    action: "memo-comparator",
    renderReason: reason,
    optimisticMode: activeIsland.mode,
    comparatorCount: 1,
    active: affected,
    unaffectedPage: !affected,
  })
}

function arePageViewPropsEqual(prev: Readonly<PageViewProps>, next: Readonly<PageViewProps>): boolean {
  const comparatorStartedAt = startWysiwygPerfSpan()
  const finishComparator = (equal: boolean, reason: string): boolean => {
    recordStructuralPageComparatorTiming(prev, next, "PageViewMemo", comparatorStartedAt, reason)
    return equal
  }
  const ignoreStructuralSnapshotChange = canIgnoreStructuralSnapshotChangeForUnrelatedPage(prev, next)
  for (const key of Object.keys(prev) as Array<keyof PageViewProps>) {
    if ((key === "doc" || key === "page") && ignoreStructuralSnapshotChange) continue
    if (key === "isLayoutLoading" && ignoreStructuralSnapshotChange) continue
    if (PAGE_VIEW_TRANSIENT_PROP_KEYS.includes(key)) continue
    if (PAGE_VIEW_SCOPED_EDIT_PROP_KEYS.includes(key)) continue
    if (prev[key] !== next[key]) {
      const reason = `prop:${String(key)}`
      recordStructuralPageMemoMiss(prev, next, reason)
      return finishComparator(false, reason)
    }
  }

  const scopedEditPropsChanged = PAGE_VIEW_SCOPED_EDIT_PROP_KEYS.some((key) => prev[key] !== next[key])
  if (scopedEditPropsChanged && (
    pageViewScopedEditPropsAffectPage(prev.page, prev) ||
    pageViewScopedEditPropsAffectPage(next.page, next)
  )) {
    recordStructuralPageMemoMiss(prev, next, "scoped-edit-props")
    return finishComparator(false, "scoped-edit-props")
  }

  if (prev.resizeDrag !== next.resizeDrag && (
    resizeDragAffectsPage(prev.page, prev.resizeDrag) ||
    resizeDragAffectsPage(next.page, next.resizeDrag)
  )) {
    recordStructuralPageMemoMiss(prev, next, "resize-drag")
    return finishComparator(false, "resize-drag")
  }

  if (prev.minHeightDrag !== next.minHeightDrag && (
    minHeightDragAffectsPage(prev.page, prev.minHeightDrag) ||
    minHeightDragAffectsPage(next.page, next.minHeightDrag)
  )) {
    recordStructuralPageMemoMiss(prev, next, "min-height-drag")
    return finishComparator(false, "min-height-drag")
  }

  if (prev.marginDrag !== next.marginDrag && (
    marginDragAffectsPage(prev.sectionIndex, prev.marginDrag) ||
    marginDragAffectsPage(next.sectionIndex, next.marginDrag)
  )) {
    recordStructuralPageMemoMiss(prev, next, "margin-drag")
    return finishComparator(false, "margin-drag")
  }

  if (prev.marginEditMode !== next.marginEditMode && (
    marginEditModeAffectsPage(prev.sectionIndex, prev.marginEditMode) ||
    marginEditModeAffectsPage(next.sectionIndex, next.marginEditMode)
  )) {
    recordStructuralPageMemoMiss(prev, next, "margin-edit-mode")
    return finishComparator(false, "margin-edit-mode")
  }

  if (prev.headerFooterEditMode !== next.headerFooterEditMode && (
    headerFooterEditModeAffectsPage(prev.sectionIndex, prev.headerFooterEditMode) ||
    headerFooterEditModeAffectsPage(next.sectionIndex, next.headerFooterEditMode)
  )) {
    recordStructuralPageMemoMiss(prev, next, "header-footer-edit-mode")
    return finishComparator(false, "header-footer-edit-mode")
  }

  if (prev.headerFooterReservedDrag !== next.headerFooterReservedDrag && (
    headerFooterReservedDragAffectsPage(prev.sectionIndex, prev.headerFooterReservedDrag) ||
    headerFooterReservedDragAffectsPage(next.sectionIndex, next.headerFooterReservedDrag)
  )) {
    recordStructuralPageMemoMiss(prev, next, "header-footer-reserved-drag")
    return finishComparator(false, "header-footer-reserved-drag")
  }

  if (prev.headerFooterZoneScroll !== next.headerFooterZoneScroll && (
    headerFooterZoneScrollAffectsPage(prev.sectionIndex, prev.headerFooterZoneScroll) ||
    headerFooterZoneScrollAffectsPage(next.sectionIndex, next.headerFooterZoneScroll)
  )) {
    recordStructuralPageMemoMiss(prev, next, "header-footer-zone-scroll")
    return finishComparator(false, "header-footer-zone-scroll")
  }

  return finishComparator(true, "equal")
}

const MemoizedPageView = memo(PageView, arePageViewPropsEqual)

// ─── Canvas ───────────────────────────────────────────────────────────────────

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

export function shouldRenderLazyPageFrame(input: {
  lazyEnabled: boolean
  pageKey: string
  visiblePageKeys: ReadonlySet<string>
  forcedPageKeys: ReadonlySet<string>
}): boolean {
  return shouldRenderLazyPageFrameBridge(input)
}

function LazyPagePlaceholder({ page, scale }: { page: PaginatedPage; scale: number }) {
  const W = page.width * scale
  const H = page.height * scale

  return (
    <div
      data-testid="editor-page-placeholder"
      data-page-index={page.index}
      style={{
        width: W,
        height: H,
        border: "1px solid #d1d5db",
        background: "white",
        display: "grid",
        placeItems: "center",
        color: "#cbd5e1",
        fontSize: 11,
        fontWeight: 700,
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      Page {page.index + 1}
    </div>
  )
}

function LazyPageFrame({
  page,
  pageKey,
  scale,
  rendered,
  setPageFrameRef,
  setPageOverlayRef,
  children,
}: {
  page: PaginatedPage
  pageKey: string
  scale: number
  rendered: boolean
  setPageFrameRef: (key: string, el: HTMLDivElement | null) => void
  setPageOverlayRef: (key: string, el: HTMLDivElement | null) => void
  children: React.ReactNode
}) {
  const setFrameRef = useCallback((el: HTMLDivElement | null) => {
    setPageFrameRef(pageKey, el)
  }, [pageKey, setPageFrameRef])
  const setOverlayRef = useCallback((el: HTMLDivElement | null) => {
    setPageOverlayRef(pageKey, el)
  }, [pageKey, setPageOverlayRef])
  const W = page.width * scale
  const H = page.height * scale

  return (
    <div
      ref={setFrameRef}
      data-testid="editor-page-frame"
      data-page-key={pageKey}
      data-page-index={page.index}
      data-page-rendered={rendered ? "true" : "false"}
      style={{
        width: W,
        height: H,
        position: "relative",
      }}
    >
      {rendered ? children : <LazyPagePlaceholder page={page} scale={scale} />}
      <div
        ref={setOverlayRef}
        data-testid="editor-page-flowdoc-island-overlay"
        data-page-key={pageKey}
        data-page-index={page.index}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: W,
          height: H,
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 30,
        }}
      />
    </div>
  )
}

type EditorCanvasPageSlotProps = PageViewProps & {
  rendered: boolean
  setPageFrameRef: (key: string, el: HTMLDivElement | null) => void
  setPageOverlayRef: (key: string, el: HTMLDivElement | null) => void
}

function EditorCanvasPageSlot({
  rendered,
  setPageFrameRef,
  setPageOverlayRef,
  ...pageViewProps
}: EditorCanvasPageSlotProps) {
  const { page, pageKey, scale } = pageViewProps
  const structuralIsland = pageViewProps.activeOutOfCanvasStructuralIsland
  const structuralTraceActive = structuralIsland !== null
  const pageAffectedByStructuralIsland = pageIsAffectedByStructuralIsland(page, structuralIsland)
  const handlePageViewProfilerRender = useCallback<ProfilerOnRenderCallback>((
    _id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    if (!structuralIsland) return
    recordWysiwygPerfEvent(false, {
      kind: "flowdoc-structural-render-attribution",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      nodeId: structuralIsland.nodeId,
      pageIndex: page.index,
      affectedPageIndex: structuralIsland.pageIndex,
      fragmentCount: page.fragments.length,
      componentName: "PageView",
      source: "PageView",
      action: phase,
      optimisticMode: structuralIsland.mode,
      active: pageAffectedByStructuralIsland,
      unaffectedPage: !pageAffectedByStructuralIsland,
    })
  }, [page.fragments.length, page.index, pageAffectedByStructuralIsland, structuralIsland])
  const pageView = <MemoizedPageView {...pageViewProps} />

  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>Page {page.index + 1}</div>
      <LazyPageFrame
        page={page}
        pageKey={pageKey}
        scale={scale}
        rendered={rendered}
        setPageFrameRef={setPageFrameRef}
        setPageOverlayRef={setPageOverlayRef}
      >
        {structuralTraceActive ? (
          <Profiler id={`page-view-${page.index}`} onRender={handlePageViewProfilerRender}>
            {pageView}
          </Profiler>
        ) : pageView}
      </LazyPageFrame>
    </div>
  )
}

function areEditorCanvasPageSlotPropsEqual(
  prev: Readonly<EditorCanvasPageSlotProps>,
  next: Readonly<EditorCanvasPageSlotProps>,
): boolean {
  const comparatorStartedAt = startWysiwygPerfSpan()
  const finishComparator = (equal: boolean, reason: string): boolean => {
    recordStructuralPageComparatorTiming(prev, next, "EditorCanvasPageSlotMemo", comparatorStartedAt, reason)
    return equal
  }
  if (prev.rendered !== next.rendered) {
    recordStructuralPageMemoMiss(prev, next, "slot-rendered")
    return finishComparator(false, "slot-rendered")
  }
  const ignoreStructuralSnapshotChange = canIgnoreStructuralSnapshotChangeForUnrelatedPage(prev, next)
  if (prev.page !== next.page && !ignoreStructuralSnapshotChange) {
    recordStructuralPageMemoMiss(prev, next, "slot-page")
    return finishComparator(false, "slot-page")
  }
  if (prev.pageKey !== next.pageKey) {
    recordStructuralPageMemoMiss(prev, next, "slot-page-key")
    return finishComparator(false, "slot-page-key")
  }
  if (prev.scale !== next.scale) {
    recordStructuralPageMemoMiss(prev, next, "slot-scale")
    return finishComparator(false, "slot-scale")
  }
  if (prev.setPageFrameRef !== next.setPageFrameRef) {
    recordStructuralPageMemoMiss(prev, next, "slot-frame-ref")
    return finishComparator(false, "slot-frame-ref")
  }
  if (prev.setPageOverlayRef !== next.setPageOverlayRef) {
    recordStructuralPageMemoMiss(prev, next, "slot-overlay-ref")
    return finishComparator(false, "slot-overlay-ref")
  }
  if (!prev.rendered && !next.rendered) return finishComparator(true, "slot-unrendered-equal")
  return finishComparator(arePageViewPropsEqual(prev, next), "page-view-props")
}

const MemoizedEditorCanvasPageSlot = memo(EditorCanvasPageSlot, areEditorCanvasPageSlotPropsEqual)

interface Props {
  paginated: PaginatedDocument
  doc: DocumentNode
  drag: DragState | null
  resizeDrag: ResizeDrag | null
  minHeightDrag: MinHeightDrag | null
  scale: number
  activePageIndex: number | null
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  isLayoutLoading: boolean
  textMeasurer: TextMeasurer
  inlineEditVisualFresh: boolean
  inlineEditNodeId: string | null
  inlineEditCaretIndex: number | null
  inlineEditPageIndex: number | null
  inlineEditVisualLocked: boolean
  onInlineEditStart: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => void
  onInlineEditChange: (nodeId: string, text: string, caretIndex: number | null) => void
  onInlineEditCaretChange: (nodeId: string, caretIndex: number | null) => void
  onInlineEditUserInteraction: (nodeId: string) => void
  onInlineEditHeightChange: (nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => void
  onInlineEditEnd: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph: (nodeId: string, text?: string) => void
  onCanStartStructuralEdit?: ParagraphTextSurfaceStructuralEditGuard
  onExitListItem?: (nodeId: string, text?: string) => void
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  setPageRef: (key: string, el: HTMLElement | null) => void
  setPageOverlayRef: (key: string, el: HTMLElement | null) => void
  onNodePointerDown: (source: DragSource, e: React.PointerEvent, clickAction?: PendingClickAction) => void
  onBackgroundPointerDown: () => void
  onSelectContextNode: (nodeId: string) => void
  onStartCloneDrag: (nodeId: string, e: React.PointerEvent<SVGGElement>) => void
  onDeleteNode: (nodeId: string) => void
  onTableAction: (nodeId: string, action: CanvasTableAction) => void
  onResizeStart: (rowId: string, leftStackId: string, rightStackId: string, pairX: number, pairWidth: number, gapWidthPt: number, startClientX: number, pageKey: string, rowFragY: number, rowFragHeight: number) => void
  onTableColumnResizeStart: (tableId: string, leftColIndex: number, pairX: number, pairWidth: number, leftWidthOriginal: number, rightWidthOriginal: number, startClientX: number, pageKey: string, tableFragY: number, tableFragHeight: number) => void
  onMinHeightResizeStart: (rowId: string, rowFragY: number, pageKey: string) => void
  marginDrag: MarginDrag | null
  marginEditMode: MarginEditMode | null
  headerFooterEditMode: HeaderFooterEditMode | null
  headerFooterReservedDrag: HeaderFooterReservedDrag | null
  onMarginEditModeEnter: (sectionIndex: number) => void
  onMarginEditModeExit: () => void
  onHeaderFooterEditModeEnter: (sectionIndex: number, zone: "header" | "footer") => void
  onHeaderFooterEditModeExit: () => void
  onHeaderFooterZonePointerDown: () => void
  onHeaderFooterReservedResizeStart: (sectionIndex: number, zone: "header" | "footer", currentReserved: { headerReserved: number; footerReserved: number }, pageHeightPt: number, marginTopPt: number, marginBottomPt: number, pageKey: string) => void
  onMarginResizeStart: (sectionIndex: number, side: "top" | "right" | "bottom" | "left", currentMargins: { top: number; right: number; bottom: number; left: number }, pageWidthPt: number, pageHeightPt: number, pageKey: string, altKey: boolean) => void
  onScaleChange: (scale: number) => void
  autoFitScale: boolean
  showTextSegments: boolean
  showDrift: boolean
  driftMap: Map<string, FragmentDrift> | null
  wysiwygInlineEditEnabled: boolean
  wysiwygTextEngineEnabled: boolean
  wysiwygTextDraftNodeId: string | null
  wysiwygTextDraftText: string | null
  wysiwygTextDraftParagraph?: ParagraphNode | null
  wysiwygTextDraftDirtyVersion?: number
  wysiwygTextCaretOffset: number | null
  wysiwygTextSelection: { anchorOffset: number; focusOffset: number } | null
  wysiwygTextDraftPaginationActive: boolean
  suppressedCanvasTextNodeIds?: ReadonlySet<string>
  activeOutOfCanvasStructuralIsland?: ActiveOutOfCanvasStructuralIsland | null
  onWysiwygTextDraftChange: (nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => void
  onWysiwygRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onWysiwygTextReflowDecision: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
}

export function buildWysiwygDraftVisualPreview(input: {
  paginated: PaginatedDocument
  doc: DocumentNode
  nodeId: string
  draftText: string
  draftParagraph?: ParagraphNode | null
  caretOffset: number | null
  textMeasurer: TextMeasurer
  draftPaginationActive?: boolean
}): WysiwygDraftVisualPreview | null {
  const paragraph = input.draftParagraph ?? findParagraphNode(input.doc, input.nodeId)
  if (!paragraph || !isTextRunOnlyParagraph(paragraph)) return null
  const draftText = input.draftParagraph
    ? getTextRunParagraphText(input.draftParagraph) ?? input.draftText
    : input.draftText
  if (isParagraphInsideRowStack(input.doc, input.nodeId)) return null
  if (isParagraphInsideFlowStack(input.doc, input.nodeId)) return null

  for (const section of input.paginated.sections) {
    const pageIndex = section.pages.findIndex((page) =>
      page.fragments.some((fragment) =>
        fragment.nodeId === input.nodeId &&
        fragment.nodeType === "paragraph" &&
        !fragment.continuesFrom
      )
    )
    if (pageIndex < 0) continue

    const sourcePage = section.pages[pageIndex]
    const sourceFragment = sourcePage.fragments.find((fragment) =>
      fragment.nodeId === input.nodeId &&
      fragment.nodeType === "paragraph" &&
      !fragment.continuesFrom
    )
    if (!sourceFragment) return null
    if (isStackInsideRow(input.doc, sourceFragment.parentNodeId)) return null
    if (isParagraphInsideFlowStack(input.doc, input.nodeId, sourceFragment.parentNodeId)) return null
    const isTableCellParagraph = isTableCellId(input.doc, sourceFragment.parentNodeId)

    const draftLayout = buildWysiwygDraftParagraphLayout(
      sourceFragment,
      paragraph,
      draftText,
      input.textMeasurer,
      { allowContinuedFirstFragment: true },
    )
    if (!draftLayout) return null

    const draftFragments = splitWysiwygDraftVisualFragments({
      sourceFragment,
      draftLines: draftLayout.lines,
      draftHeight: draftLayout.height,
      pages: section.pages,
      preserveBoundarySingleLines: isTableCellParagraph,
    })

    if (isTableCellParagraph) {
      const settledSplitActive = countParagraphFragments(input.paginated, input.nodeId) > 1
      const reflow = classifyWysiwygTextReflow({
        fragment: sourceFragment,
        draftLines: draftLayout.lines,
        draftHeight: draftLayout.height,
        pageContentBottom: sourcePage.contentBox.y + sourcePage.contentBox.height,
        supportsLocalDraftLayout: !sourceFragment.continuesFrom && !sourceFragment.isContinued,
      })
      if (!shouldPrepareWysiwygTableCellDraftVisualPreview({
        reflow,
        isTableCellParagraph,
        isFlowStackParagraph: false,
        draftPaginationActive: input.draftPaginationActive === true || settledSplitActive,
      })) return null
      if (draftFragments.length < 2) return null
    }

    return createWysiwygDraftVisualPreview({
      nodeId: input.nodeId,
      fragments: draftFragments,
      caretOffset: input.caretOffset,
      textMeasurer: input.textMeasurer,
      preferPreviousPageAtFragmentEnd: isTableCellParagraph,
    })
  }

  return null
}

export function EditorCanvas({
  paginated, doc, drag, resizeDrag, minHeightDrag, marginDrag, marginEditMode, headerFooterEditMode, headerFooterReservedDrag, scale, activePageIndex, selectedNodeId, selectionAnchorNodeId, isLayoutLoading,
  textMeasurer,
  inlineEditVisualFresh, inlineEditNodeId, inlineEditCaretIndex, inlineEditPageIndex, inlineEditVisualLocked, onInlineEditStart, onInlineEditChange, onInlineEditCaretChange, onInlineEditUserInteraction, onInlineEditHeightChange, onInlineEditEnd, onSplitParagraph, onMergeParagraph, onCanStartStructuralEdit, onExitListItem, onChangeListItemLevel, onBackspaceListItemAtStart,
  setPageRef, setPageOverlayRef, onNodePointerDown, onBackgroundPointerDown, onSelectContextNode, onStartCloneDrag, onDeleteNode, onTableAction, onResizeStart, onTableColumnResizeStart, onMinHeightResizeStart, onMarginEditModeEnter, onMarginEditModeExit, onHeaderFooterEditModeEnter, onHeaderFooterEditModeExit, onHeaderFooterZonePointerDown, onHeaderFooterReservedResizeStart, onMarginResizeStart, onScaleChange,
  autoFitScale, showTextSegments, showDrift, driftMap,
  wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled,
  wysiwygTextDraftNodeId,
  wysiwygTextDraftText,
  wysiwygTextDraftParagraph,
  wysiwygTextDraftDirtyVersion = 0,
  wysiwygTextCaretOffset,
  wysiwygTextSelection,
  wysiwygTextDraftPaginationActive,
  suppressedCanvasTextNodeIds = EMPTY_SUPPRESSED_NODE_IDS,
  activeOutOfCanvasStructuralIsland = null,
  onWysiwygTextDraftChange,
  onWysiwygRichTextShortcut,
  onWysiwygTextReflowDecision,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageFrameRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pageVisibilityObserverRef = useRef<IntersectionObserver | null>(null)
  const [headerFooterZoneScroll, setHeaderFooterZoneScroll] = useState<HeaderFooterZoneScrollState | null>(null)
  const [lazyVisiblePageKeys, setLazyVisiblePageKeys] = useState<Set<string>>(() => new Set())
  const tableCellVisualPreviewTraceRef = useRef<WysiwygTableCellLifecycleTraceState | null>(null)
  const tableCellVisualChromeTraceRef = useRef<WysiwygTableCellLifecycleTraceState | null>(null)
  const stableOnInlineEditStart = useStableEvent(onInlineEditStart)
  const stableOnInlineEditChange = useStableEvent(onInlineEditChange)
  const stableOnInlineEditCaretChange = useStableEvent(onInlineEditCaretChange)
  const stableOnInlineEditUserInteraction = useStableEvent(onInlineEditUserInteraction)
  const stableOnInlineEditHeightChange = useStableEvent(onInlineEditHeightChange)
  const stableOnInlineEditEnd = useStableEvent(onInlineEditEnd)
  const stableOnSplitParagraph = useStableEvent(onSplitParagraph)
  const stableOnMergeParagraph = useStableEvent(onMergeParagraph)
  const stableOnCanStartStructuralEdit = useStableOptionalEvent(onCanStartStructuralEdit)
  const stableOnExitListItem = useStableOptionalEvent(onExitListItem)
  const stableOnChangeListItemLevel = useStableOptionalEvent(onChangeListItemLevel)
  const stableOnBackspaceListItemAtStart = useStableOptionalEvent(onBackspaceListItemAtStart)
  const stableOnNodePointerDown = useStableEvent(onNodePointerDown)
  const stableOnBackgroundPointerDown = useStableEvent(onBackgroundPointerDown)
  const stableOnSelectContextNode = useStableEvent(onSelectContextNode)
  const stableOnStartCloneDrag = useStableEvent(onStartCloneDrag)
  const stableOnDeleteNode = useStableEvent(onDeleteNode)
  const stableOnTableAction = useStableEvent(onTableAction)
  const stableOnResizeStart = useStableEvent(onResizeStart)
  const stableOnTableColumnResizeStart = useStableEvent(onTableColumnResizeStart)
  const stableOnMinHeightResizeStart = useStableEvent(onMinHeightResizeStart)
  const stableOnMarginEditModeEnter = useStableEvent(onMarginEditModeEnter)
  const stableOnMarginEditModeExit = useStableEvent(onMarginEditModeExit)
  const stableOnHeaderFooterEditModeEnter = useStableEvent(onHeaderFooterEditModeEnter)
  const stableOnHeaderFooterEditModeExit = useStableEvent(onHeaderFooterEditModeExit)
  const stableOnHeaderFooterZonePointerDown = useStableEvent(onHeaderFooterZonePointerDown)
  const stableOnHeaderFooterReservedResizeStart = useStableEvent(onHeaderFooterReservedResizeStart)
  const stableOnMarginResizeStart = useStableEvent(onMarginResizeStart)
  const stableOnWysiwygTextDraftChange = useStableEvent(onWysiwygTextDraftChange)
  const stableOnWysiwygRichTextShortcut = useStableOptionalEvent(onWysiwygRichTextShortcut)
  const stableOnWysiwygTextReflowDecision = useStableEvent(onWysiwygTextReflowDecision)
  const sections = Array.isArray(paginated.sections) ? paginated.sections : []
  const structuralCanvasRenderAttributionActive = activeOutOfCanvasStructuralIsland !== null
  const pushStructuralCanvasRenderAttributionEvent = (
    action: string,
    startedAt: number,
    metadata: Partial<Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs" | "action">> = {},
  ): void => {
    const activeIsland = activeOutOfCanvasStructuralIsland
    if (!activeIsland) return
    const endedAt = startWysiwygPerfSpan()
    recordWysiwygPerfEvent(false, {
      kind: "flowdoc-structural-render-attribution",
      startedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      nodeId: activeIsland.nodeId,
      pageIndex: activeIsland.pageIndex,
      affectedPageIndex: activeIsland.pageIndex,
      componentName: "EditorCanvas",
      source: "EditorCanvas",
      action,
      optimisticMode: activeIsland.mode,
      active: true,
      derivedValueCount: 1,
      ...metadata,
    })
  }
  const captureStructuralCanvasRenderValue = <T,>(
    action: string,
    compute: () => T,
    metadata: (value: T) => Partial<Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs" | "action">> = () => ({}),
  ): T => {
    if (!structuralCanvasRenderAttributionActive) return compute()
    const startedAt = startWysiwygPerfSpan()
    const value = compute()
    pushStructuralCanvasRenderAttributionEvent(action, startedAt, metadata(value))
    return value
  }
  useLayoutEffect(() => {
    if (!activeOutOfCanvasStructuralIsland) return
    const startedAt = startWysiwygPerfSpan()
    recordWysiwygPerfEvent(false, {
      kind: "flowdoc-structural-render-attribution",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: activeOutOfCanvasStructuralIsland.nodeId,
      pageIndex: activeOutOfCanvasStructuralIsland.pageIndex,
      affectedPageIndex: activeOutOfCanvasStructuralIsland.pageIndex,
      componentName: "EditorCanvas",
      source: "EditorCanvas",
      action: "canvas-layout-effect",
      optimisticMode: activeOutOfCanvasStructuralIsland.mode,
      active: true,
    })
  })
  const pageKeyEntries = useMemo(() =>
    captureStructuralCanvasRenderValue(
      "canvas-derived:page-key-entries",
      () => sections.flatMap((section, sectionIndex) =>
        section.pages.map((page, pageArrayIndex) => ({
          key: `${sectionIndex}-${pageArrayIndex}`,
          pageIndex: page.index,
        })),
      ),
      (entries) => ({
        renderReason: "pageKeyEntries",
        pageCount: entries.length,
      }),
    ),
  [sections])
  const pageKeySignature = useMemo(() =>
    captureStructuralCanvasRenderValue(
      "canvas-derived:page-key-signature",
      () => pageKeyEntries.map((entry) => `${entry.key}:${entry.pageIndex}`).join("|"),
      (signature) => ({
        renderReason: "pageKeySignature",
        textLength: signature.length,
      }),
    ),
  [pageKeyEntries])
  const allPageKeySet = useMemo(() =>
    new Set(pageKeyEntries.map((entry) => entry.key)),
  [pageKeyEntries])
  const totalPageCount = pageKeyEntries.length
  const pageWidth = sections[0]?.pages[0]?.width ?? 595
  const scaledPageWidth = pageWidth * scale
  const pageKeyByPageIndex = useMemo(() => (
    captureStructuralCanvasRenderValue(
      "canvas-derived:page-key-by-page-index",
      () => {
        const byPageIndex = new Map<number, string>()
        for (const [sectionIndex, section] of sections.entries()) {
          for (const [pageArrayIndex, page] of section.pages.entries()) {
            byPageIndex.set(page.index, `${sectionIndex}-${pageArrayIndex}`)
          }
        }
        return byPageIndex
      },
      (byPageIndex) => ({
        renderReason: "pageKeyByPageIndex",
        pageCount: byPageIndex.size,
      }),
    )
  ), [sections])
  const wysiwygTextPointerFragmentIndex = useMemo(() => (
    captureStructuralCanvasRenderValue(
      "canvas-derived:pointer-fragment-index",
      () => buildWysiwygTextPointerFragmentIndex(paginated, pageKeyByPageIndex),
      (index) => ({
        renderReason: "buildWysiwygTextPointerFragmentIndex",
        pointerTargetCount: index.targetsByNodeId.size,
        fragmentCount: index.bodyParagraphFragmentCountByNodeId.size,
      }),
    )
  ), [paginated, pageKeyByPageIndex])
  const shouldLazyRenderPages = typeof IntersectionObserver !== "undefined" && totalPageCount > LAZY_PAGE_RENDER_THRESHOLD
  const setPageFrameRef = useCallback((key: string, el: HTMLDivElement | null) => {
    const previous = pageFrameRefs.current.get(key)
    if (previous && previous !== el) {
      pageVisibilityObserverRef.current?.unobserve(previous)
    }

    if (el) {
      pageFrameRefs.current.set(key, el)
      pageVisibilityObserverRef.current?.observe(el)
      setPageRef(key, el)
      return
    }

    if (previous) {
      pageVisibilityObserverRef.current?.unobserve(previous)
      pageFrameRefs.current.delete(key)
    }
    setPageRef(key, null)
  }, [setPageRef])
  const wysiwygTextExistingSplitActive = Boolean(
    wysiwygTextEngineEnabled &&
    wysiwygTextDraftNodeId &&
    inlineEditNodeId === wysiwygTextDraftNodeId &&
    (wysiwygTextPointerFragmentIndex.bodyParagraphFragmentCountByNodeId.get(wysiwygTextDraftNodeId) ?? 0) > 1,
  )
  const wysiwygTextDraftIsTableCellParagraph = useMemo(() =>
    Boolean(
      wysiwygTextEngineEnabled &&
      wysiwygTextDraftNodeId &&
      isParagraphInsideTableCell(doc, wysiwygTextDraftNodeId),
    ),
  [doc, wysiwygTextDraftNodeId, wysiwygTextEngineEnabled])
  const wysiwygDraftVisualPreview = useMemo(() => (
    captureStructuralCanvasRenderValue(
      "canvas-derived:draft-visual-preview",
      () => {
        if (!wysiwygTextEngineEnabled) return null
        if (!wysiwygTextDraftNodeId || wysiwygTextDraftText == null) return null
        if (inlineEditNodeId !== wysiwygTextDraftNodeId) return null
        const hasDraftTextChange = getEditableParagraphText(doc, wysiwygTextDraftNodeId) !== wysiwygTextDraftText
        const hasDraftParagraphChange = Boolean(
          wysiwygTextDraftParagraph &&
          wysiwygTextDraftDirtyVersion > 0 &&
          getTextRunParagraphText(wysiwygTextDraftParagraph) !== null,
        )
        if (!hasDraftTextChange && !hasDraftParagraphChange) return null
        return buildWysiwygDraftVisualPreview({
          paginated,
          doc,
          nodeId: wysiwygTextDraftNodeId,
          draftText: wysiwygTextDraftText,
          draftParagraph: hasDraftParagraphChange ? wysiwygTextDraftParagraph ?? null : null,
          caretOffset: wysiwygTextCaretOffset,
          textMeasurer,
          draftPaginationActive: wysiwygTextDraftPaginationActive || wysiwygTextExistingSplitActive,
        })
      },
      (preview) => ({
        renderReason: "wysiwygDraftVisualPreview",
        previewFragmentCount: preview?.fragments.length ?? 0,
        previewPageCount: preview?.fragmentsByPageIndex.size ?? 0,
        pageIndex: preview?.caretPageIndex ?? activeOutOfCanvasStructuralIsland?.pageIndex ?? null,
      }),
    )
  ), [
    doc,
    inlineEditNodeId,
    paginated,
    textMeasurer,
    wysiwygTextCaretOffset,
    wysiwygTextDraftDirtyVersion,
    wysiwygTextDraftPaginationActive,
    wysiwygTextDraftNodeId,
    wysiwygTextDraftParagraph,
    wysiwygTextDraftText,
    wysiwygTextEngineEnabled,
    wysiwygTextExistingSplitActive,
  ])
  const shouldQueueSettledTableCellDraftPagination = shouldQueueSettledTableCellDraftPaginationFromVisualPreview({
    hasVisualPreview: wysiwygDraftVisualPreview !== null,
    draftPaginationActive: wysiwygTextDraftPaginationActive,
    existingSplitActive: wysiwygTextExistingSplitActive,
  })
  useEffect(() => {
    if (!wysiwygTextDraftNodeId || !shouldQueueSettledTableCellDraftPagination) return
    onWysiwygTextReflowDecision(
      wysiwygTextDraftNodeId,
      WYSIWYG_TABLE_CELL_VISUAL_PREVIEW_REFLOW_DECISION,
    )
  }, [
    onWysiwygTextReflowDecision,
    shouldQueueSettledTableCellDraftPagination,
    wysiwygTextDraftNodeId,
  ])
  const wysiwygTableCellDraftVisualChromeByPageIndex = useMemo(() =>
    buildWysiwygTableCellDraftVisualChromeFragments({
      paginated,
      preview: wysiwygDraftVisualPreview,
    }),
  [paginated, wysiwygDraftVisualPreview])
  useEffect(() => {
    const previous = tableCellVisualPreviewTraceRef.current
    const currentNodeId = wysiwygTextDraftNodeId
    const shouldTraceActiveTableCellDraft = Boolean(
      currentNodeId &&
      wysiwygTextDraftIsTableCellParagraph,
    )
    if (!shouldTraceActiveTableCellDraft || !currentNodeId || !wysiwygDraftVisualPreview) {
      if (previous) {
        recordWysiwygPerfEvent(false, {
          kind: "table-cell-visual-preview",
          startedAt: startWysiwygPerfSpan(),
          durationMs: 0,
          nodeId: previous.nodeId,
          draftVersion: wysiwygTextDraftDirtyVersion,
          textLength: wysiwygTextDraftText?.length ?? undefined,
          source: "cleared",
          previewFragmentCount: 0,
          previewPageCount: 0,
          pageIndexes: "",
          draftPaginationActive: wysiwygTextDraftPaginationActive,
          existingSplitActive: wysiwygTextExistingSplitActive,
          responsiveDraftPaginationRequested: false,
        })
        tableCellVisualPreviewTraceRef.current = null
      }
      return
    }

    const summary = summarizeWysiwygDraftVisualPreview(wysiwygDraftVisualPreview)
    const signature = [
      currentNodeId,
      wysiwygTextDraftDirtyVersion,
      summary.previewFragmentCount,
      summary.pageIndexes,
      wysiwygDraftVisualPreview.caretPageIndex ?? "none",
    ].join(":")
    if (previous?.signature === signature) return

    recordWysiwygPerfEvent(false, {
      kind: "table-cell-visual-preview",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: currentNodeId,
      pageIndex: wysiwygDraftVisualPreview.caretPageIndex,
      draftVersion: wysiwygTextDraftDirtyVersion,
      textLength: wysiwygTextDraftText?.length ?? undefined,
      source: previous ? "updated" : "created",
      ...summary,
      draftPaginationActive: wysiwygTextDraftPaginationActive,
      existingSplitActive: wysiwygTextExistingSplitActive,
      responsiveDraftPaginationRequested: shouldQueueSettledTableCellDraftPagination,
    })
    tableCellVisualPreviewTraceRef.current = {
      signature,
      nodeId: currentNodeId,
    }
  }, [
    shouldQueueSettledTableCellDraftPagination,
    wysiwygDraftVisualPreview,
    wysiwygTextDraftDirtyVersion,
    wysiwygTextDraftIsTableCellParagraph,
    wysiwygTextDraftNodeId,
    wysiwygTextDraftPaginationActive,
    wysiwygTextDraftText,
    wysiwygTextExistingSplitActive,
  ])
  useEffect(() => {
    const previous = tableCellVisualChromeTraceRef.current
    const currentNodeId = wysiwygTextDraftNodeId
    const summary = summarizeWysiwygTableCellDraftVisualChrome(wysiwygTableCellDraftVisualChromeByPageIndex)
    const shouldTraceActiveTableCellDraft = Boolean(
      currentNodeId &&
      wysiwygTextDraftIsTableCellParagraph &&
      summary.visualChromeCount > 0,
    )
    if (!shouldTraceActiveTableCellDraft || !currentNodeId) {
      if (previous) {
        recordWysiwygPerfEvent(false, {
          kind: "table-cell-visual-chrome",
          startedAt: startWysiwygPerfSpan(),
          durationMs: 0,
          nodeId: previous.nodeId,
          draftVersion: wysiwygTextDraftDirtyVersion,
          textLength: wysiwygTextDraftText?.length ?? undefined,
          source: "cleared",
          visualChromeCount: 0,
          visualChromePageCount: 0,
          pageIndexes: "",
          draftPaginationActive: wysiwygTextDraftPaginationActive,
          existingSplitActive: wysiwygTextExistingSplitActive,
        })
        tableCellVisualChromeTraceRef.current = null
      }
      return
    }

    const signature = [
      currentNodeId,
      wysiwygTextDraftDirtyVersion,
      summary.visualChromeCount,
      summary.pageIndexes,
    ].join(":")
    if (previous?.signature === signature) return

    recordWysiwygPerfEvent(false, {
      kind: "table-cell-visual-chrome",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: currentNodeId,
      draftVersion: wysiwygTextDraftDirtyVersion,
      textLength: wysiwygTextDraftText?.length ?? undefined,
      source: previous ? "updated" : "created",
      ...summary,
      draftPaginationActive: wysiwygTextDraftPaginationActive,
      existingSplitActive: wysiwygTextExistingSplitActive,
    })
    tableCellVisualChromeTraceRef.current = {
      signature,
      nodeId: currentNodeId,
    }
  }, [
    wysiwygTableCellDraftVisualChromeByPageIndex,
    wysiwygTextDraftDirtyVersion,
    wysiwygTextDraftIsTableCellParagraph,
    wysiwygTextDraftNodeId,
    wysiwygTextDraftPaginationActive,
    wysiwygTextDraftText,
    wysiwygTextExistingSplitActive,
  ])
  const wysiwygTextPointerFragments = useMemo<WysiwygTextPointerFragmentTarget[]>(() => {
    if (!wysiwygTextEngineEnabled || !wysiwygTextDraftNodeId) return []
    const sourceFragments = wysiwygDraftVisualPreview?.fragments ?? null
    if (!sourceFragments) {
      return wysiwygTextPointerFragmentIndex.targetsByNodeId.get(wysiwygTextDraftNodeId) ?? []
    }

    return sourceFragments
      .map((fragment): WysiwygTextPointerFragmentTarget | null => {
        const targetPageKey = pageKeyByPageIndex.get(fragment.pageIndex)
        return targetPageKey ? { pageKey: targetPageKey, fragment } : null
      })
      .filter((target): target is WysiwygTextPointerFragmentTarget => target !== null)
  }, [
    pageKeyByPageIndex,
    wysiwygTextPointerFragmentIndex,
    wysiwygDraftVisualPreview,
    wysiwygTextDraftNodeId,
    wysiwygTextEngineEnabled,
  ])

  const forcedPageKeys = useMemo(() => (
    captureStructuralCanvasRenderValue(
      "canvas-derived:forced-page-keys",
      () => {
        const keys = new Set<string>()
        for (const entry of pageKeyEntries.slice(0, LAZY_PAGE_RENDER_INITIAL_COUNT)) {
          keys.add(entry.key)
        }
        if (activePageIndex != null) {
          const key = pageKeyByPageIndex.get(activePageIndex)
          if (key) keys.add(key)
        }
        if (inlineEditPageIndex != null) {
          const key = pageKeyByPageIndex.get(inlineEditPageIndex)
          if (key) keys.add(key)
        }
        if (wysiwygDraftVisualPreview?.caretPageIndex != null) {
          const key = pageKeyByPageIndex.get(wysiwygDraftVisualPreview.caretPageIndex)
          if (key) keys.add(key)
        }
        if (activeOutOfCanvasStructuralIsland) {
          const key = pageKeyByPageIndex.get(activeOutOfCanvasStructuralIsland.pageIndex)
          if (key) keys.add(key)
        }
        if (resizeDrag?.pageKey) keys.add(resizeDrag.pageKey)
        if (minHeightDrag?.pageKey) keys.add(minHeightDrag.pageKey)
        if (marginDrag?.pageKey) keys.add(marginDrag.pageKey)
        if (headerFooterReservedDrag?.pageKey) keys.add(headerFooterReservedDrag.pageKey)
        for (const target of wysiwygTextPointerFragments) {
          keys.add(target.pageKey)
        }
        return keys
      },
      (keys) => ({
        renderReason: "forcedPageKeys",
        pageCount: keys.size,
      }),
    )
  ), [
    activePageIndex,
    activeOutOfCanvasStructuralIsland,
    headerFooterReservedDrag,
    inlineEditPageIndex,
    marginDrag,
    minHeightDrag,
    pageKeyByPageIndex,
    pageKeyEntries,
    resizeDrag,
    wysiwygDraftVisualPreview,
    wysiwygTextPointerFragments,
  ])
  const structuralRenderScope = useMemo(() => (
    captureStructuralCanvasRenderValue(
      "canvas-derived:structural-render-scope",
      () => {
        const pages = sections.flatMap((section) => section.pages)
        return getCanvasViewportStructuralRenderScopeBridge({
          pages,
          activeOutOfCanvasStructuralIsland,
        })
      },
      (scope) => ({
        renderReason: "structuralRenderScope",
        ...createCanvasViewportRenderScopePerfFields(scope, totalPageCount),
      }),
    )
  ), [activeOutOfCanvasStructuralIsland, sections, totalPageCount])

  useEffect(() => {
    if (!structuralRenderScope) return
    const canvasViewportMetrics = createCanvasViewportMetricsBridge(structuralRenderScope)
    recordWysiwygPerfEvent(false, {
      kind: "flowdoc-structural-render-attribution",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: structuralRenderScope.nodeId,
      pageIndex: structuralRenderScope.pageIndex,
      pageIndexes: structuralRenderScope.affectedPageIndexes.join(","),
      totalPageCount: structuralRenderScope.totalPageCount,
      affectedPageCount: structuralRenderScope.affectedPageCount,
      canvasViewportAffectedPageCount: canvasViewportMetrics.canvasViewportAffectedPageCount,
      canvasViewportAffectedPages: canvasViewportMetrics.canvasViewportAffectedPages.join(","),
      canvasViewportSuppressedPageBreakCount: canvasViewportMetrics.canvasViewportSuppressedPageBreakCount,
      canvasViewportUnrelatedPageBreakSuppressedCount: canvasViewportMetrics.canvasViewportUnrelatedPageBreakSuppressedCount,
      componentName: "EditorCanvas",
      source: "EditorCanvas",
      action: "render-scope",
      optimisticMode: structuralRenderScope.mode,
      active: true,
    })
  })

  useEffect(() => {
    setLazyVisiblePageKeys((current) => {
      const next = new Set<string>()
      for (const key of current) {
        if (allPageKeySet.has(key)) next.add(key)
      }
      for (const key of forcedPageKeys) next.add(key)
      return setsEqual(current, next) ? current : next
    })
  }, [allPageKeySet, forcedPageKeys, pageKeySignature])

  useEffect(() => {
    if (!shouldLazyRenderPages) {
      pageVisibilityObserverRef.current?.disconnect()
      pageVisibilityObserverRef.current = null
      return
    }

    const root = containerRef.current
    if (!root) return

    const observer = new IntersectionObserver((entries) => {
      setLazyVisiblePageKeys((current) => {
        const next = new Set(current)
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.pageKey
          if (!key) continue
          if (entry.isIntersecting) next.add(key)
          else next.delete(key)
        }
        for (const key of forcedPageKeys) next.add(key)
        return setsEqual(current, next) ? current : next
      })
    }, {
      root,
      rootMargin: `${LAZY_PAGE_RENDER_ROOT_MARGIN_PX}px 0px`,
    })

    pageVisibilityObserverRef.current = observer
    for (const el of pageFrameRefs.current.values()) {
      observer.observe(el)
    }

    return () => {
      observer.disconnect()
      if (pageVisibilityObserverRef.current === observer) {
        pageVisibilityObserverRef.current = null
      }
    }
  }, [forcedPageKeys, pageKeySignature, shouldLazyRenderPages])

  useEffect(() => {
    if (!autoFitScale) return
    const el = containerRef.current
    if (!el) return
    const fitToContainer = () => {
      const available = el.clientWidth - 96
      onScaleChange(Math.max(0.3, Math.min(2, available / pageWidth)))
    }
    fitToContainer()
    const observer = new ResizeObserver(fitToContainer)
    observer.observe(el)
    return () => observer.disconnect()
  }, [autoFitScale, onScaleChange, pageWidth])

  useEffect(() => {
    if (!headerFooterEditMode) {
      setHeaderFooterZoneScroll(null)
      return
    }
    setHeaderFooterZoneScroll((current) => {
      if (
        current?.sectionIndex === headerFooterEditMode.sectionIndex &&
        current.zone === headerFooterEditMode.zone
      ) return current
      return { sectionIndex: headerFooterEditMode.sectionIndex, zone: headerFooterEditMode.zone, offsetPt: 0 }
    })
  }, [headerFooterEditMode])

  const handleHeaderFooterZoneScroll = useCallback((
    sectionIndex: number,
    zone: HeaderFooterZone,
    deltaPt: number,
    maxOffsetPt: number,
  ) => {
    if (maxOffsetPt <= 0.5 || Math.abs(deltaPt) < 0.01) return
    setHeaderFooterZoneScroll((current) => {
      const currentOffset = current?.sectionIndex === sectionIndex && current.zone === zone
        ? current.offsetPt
        : 0
      const nextOffset = clamp(currentOffset + deltaPt, 0, maxOffsetPt)
      if (Math.abs(nextOffset - currentOffset) < 0.01 && current) return current
      return { sectionIndex, zone, offsetPt: nextOffset }
    })
  }, [])

  const handleHeaderFooterZoneScrollTo = useCallback((
    sectionIndex: number,
    zone: HeaderFooterZone,
    offsetPt: number,
    maxOffsetPt: number,
  ) => {
    const nextOffset = clamp(offsetPt, 0, Math.max(0, maxOffsetPt))
    setHeaderFooterZoneScroll((current) => {
      if (
        current?.sectionIndex === sectionIndex &&
        current.zone === zone &&
        Math.abs(current.offsetPt - nextOffset) < 0.01
      ) return current
      return { sectionIndex, zone, offsetPt: nextOffset }
    })
  }, [])

  return (
    <div
      ref={containerRef}
      data-testid="editor-canvas"
      onPointerDown={(event) => {
        if (!marginEditMode && !headerFooterEditMode) return
        const target = event.target
        if (!(target instanceof Element)) return
        if (target.closest('[data-testid="editor-page"]')) return
        if (headerFooterEditMode) onHeaderFooterEditModeExit()
        else onMarginEditModeExit()
      }}
      style={{
        flex: 1,
        overflow: "auto",
        padding: "24px 30px 24px 24px",
        background: "#f3f4f6",
        scrollbarWidth: "thin",
        scrollbarColor: "#cbd5e1 transparent",
        overscrollBehavior: "contain",
      }}
    >
      <div style={{ minWidth: scaledPageWidth + 96 }}>
        {sections.map((section, si) => (
          <div key={section.sectionId ?? si} style={{ margin: "0 auto 32px", width: scaledPageWidth }}>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 10 }}>
            Section {si + 1} · {section.pages.length} page{section.pages.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", justifyContent: "center" }}>
            {section.pages.map((page, pi) => {
              const pageKey = `${si}-${pi}`
              const rendered = shouldRenderLazyPageFrame({
                lazyEnabled: shouldLazyRenderPages,
                pageKey,
                visiblePageKeys: lazyVisiblePageKeys,
                forcedPageKeys,
              })

              return (
                <MemoizedEditorCanvasPageSlot
                  key={`${section.sectionId}-${page.index}-${pi}`}
                  page={page} doc={doc} drag={drag} scale={scale}
                  selectedNodeId={selectedNodeId} selectionAnchorNodeId={selectionAnchorNodeId} isLayoutLoading={isLayoutLoading}
                  textMeasurer={textMeasurer}
                  inlineEditVisualFresh={inlineEditVisualFresh}
                  inlineEditNodeId={inlineEditNodeId}
                  inlineEditCaretIndex={inlineEditCaretIndex}
                  inlineEditPageIndex={inlineEditPageIndex}
                  inlineEditVisualLocked={inlineEditVisualLocked}
                  onInlineEditStart={stableOnInlineEditStart}
                  onInlineEditChange={stableOnInlineEditChange}
                  onInlineEditCaretChange={stableOnInlineEditCaretChange}
                  onInlineEditUserInteraction={stableOnInlineEditUserInteraction}
                  onInlineEditHeightChange={stableOnInlineEditHeightChange}
                  onInlineEditEnd={stableOnInlineEditEnd}
                  onSplitParagraph={stableOnSplitParagraph}
                  onMergeParagraph={stableOnMergeParagraph}
                  onCanStartStructuralEdit={stableOnCanStartStructuralEdit}
                  onExitListItem={stableOnExitListItem}
                  onChangeListItemLevel={stableOnChangeListItemLevel}
                  onBackspaceListItemAtStart={stableOnBackspaceListItemAtStart}
                  pageKey={pageKey}
                  onNodePointerDown={stableOnNodePointerDown}
                  onBackgroundPointerDown={stableOnBackgroundPointerDown}
                  onSelectContextNode={stableOnSelectContextNode}
                  onStartCloneDrag={stableOnStartCloneDrag}
                  onDeleteNode={stableOnDeleteNode}
                  onTableAction={stableOnTableAction}
                  resizeDrag={resizeDrag}
                  onResizeStart={stableOnResizeStart}
                  onTableColumnResizeStart={stableOnTableColumnResizeStart}
                  minHeightDrag={minHeightDrag}
                  onMinHeightResizeStart={stableOnMinHeightResizeStart}
                  sectionIndex={si}
                  marginDrag={marginDrag}
                  marginEditMode={marginEditMode}
                  headerFooterEditMode={headerFooterEditMode}
                  headerFooterReservedDrag={headerFooterReservedDrag}
                  headerFooterZoneScroll={headerFooterZoneScroll}
                  onMarginEditModeEnter={stableOnMarginEditModeEnter}
                  onMarginEditModeExit={stableOnMarginEditModeExit}
                  onHeaderFooterEditModeEnter={stableOnHeaderFooterEditModeEnter}
                  onHeaderFooterEditModeExit={stableOnHeaderFooterEditModeExit}
                  onHeaderFooterZonePointerDown={stableOnHeaderFooterZonePointerDown}
                  onHeaderFooterReservedResizeStart={stableOnHeaderFooterReservedResizeStart}
                  onHeaderFooterZoneScroll={handleHeaderFooterZoneScroll}
                  onHeaderFooterZoneScrollTo={handleHeaderFooterZoneScrollTo}
                  onMarginResizeStart={stableOnMarginResizeStart}
                  showTextSegments={showTextSegments}
                  showDrift={showDrift}
                  driftMap={driftMap}
                  wysiwygInlineEditEnabled={wysiwygInlineEditEnabled}
                  wysiwygTextEngineEnabled={wysiwygTextEngineEnabled}
                  wysiwygTextDraftNodeId={wysiwygTextDraftNodeId}
                  wysiwygTextDraftText={wysiwygTextDraftText}
                  wysiwygTextCaretOffset={wysiwygTextCaretOffset}
                  wysiwygTextSelection={wysiwygTextSelection}
                  wysiwygTextDraftPaginationActive={wysiwygTextDraftPaginationActive || wysiwygTextExistingSplitActive}
                  suppressedCanvasTextNodeIds={suppressedCanvasTextNodeIds}
                  activeOutOfCanvasStructuralIsland={activeOutOfCanvasStructuralIsland}
                  wysiwygDraftVisualPreview={wysiwygDraftVisualPreview}
                  wysiwygTableCellDraftVisualChromeByPageIndex={wysiwygTableCellDraftVisualChromeByPageIndex}
                  wysiwygTextPointerFragments={wysiwygTextPointerFragments}
                  onWysiwygTextDraftChange={stableOnWysiwygTextDraftChange}
                  onWysiwygRichTextShortcut={stableOnWysiwygRichTextShortcut}
                  onWysiwygTextReflowDecision={stableOnWysiwygTextReflowDecision}
                  rendered={rendered}
                  setPageFrameRef={setPageFrameRef}
                  setPageOverlayRef={setPageOverlayRef}
                />
              )
            })}
          </div>
        </div>
        ))}
      </div>
    </div>
  )
}
