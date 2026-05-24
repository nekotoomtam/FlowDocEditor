"use client"

import { memo, useRef, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react"
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
import { getTextRunParagraphText, isPlainTextParagraph, isTextRunOnlyParagraph } from "@/document"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, LayoutNode, ParagraphNode } from "@/schema"
import type { DragSource } from "@/placement/types"
import type { DragState, ResizeDrag, MinHeightDrag, MarginDrag, MarginEditMode, HeaderFooterEditMode, HeaderFooterReservedDrag } from "./EditorShell"
import type { FragmentDrift } from "./comparePagination"
import { getRowGeometry } from "@/placement/geometry"
import {
  buildWysiwygDraftParagraphLayout,
  ParagraphTextSurface,
  type WysiwygTextPointerFragmentTarget,
} from "./ParagraphTextSurface"
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
import { isParagraphInsideFlowStack, isParagraphInsideRowStack } from "./wysiwygTextEligibility"
import { resolveActiveInlineEditPageIndex } from "./editorPageFollow"
import { buildSelectionContext, type SelectionContextItem } from "./selectionContext"
import type { WysiwygTextInputKey } from "./useWysiwygTextSession"

// ─── Constants ────────────────────────────────────────────────────────────────

const INLINE_EDIT_CHROME_FILL = "#dbeafe"
const WYSIWYG_TABLE_CELL_DRAFT_CHROME_FILL = "#dbeafe"

function displayFragmentNodeType(nodeType: PageFragment["nodeType"]): string {
  if (nodeType === "flow-row") return "row"
  if (nodeType === "flow-stack") return "stack"
  if (nodeType === "flow-table") return "flow table"
  if (nodeType === "flow-table-row") return "flow row"
  if (nodeType === "flow-table-cell") return "flow cell"
  return nodeType
}

export function shouldStartInlineEditOnSingleClick(input: {
  canInlineEditParagraph: boolean
  isTableCellParagraph: boolean
}): boolean {
  return input.canInlineEditParagraph
}

const DRAGGABLE_TYPES = new Set(["paragraph", "spacer", "row", "flow-row", "flow-stack", "flow-table", "toc"])
const SELECTABLE_NODE_TYPES = new Set(["paragraph", "spacer", "row", "flow-row", "flow-stack", "flow-table", "flow-table-row", "flow-table-cell", "toc"])
const PARAGRAPH_CHROME_Y = 3
const FLOW_STACK_PARAGRAPH_CHROME_Y = 0
const PARAGRAPH_LIVE_PREVIEW_GAP_Y = 2
const DROP_PREVIEW_FILL = "#99f6e4"
const DROP_PREVIEW_STROKE = "#0f766e"
const DROP_INSERTION_STROKE = "#0d9488"
const READ_ONLY_ZONE_FILL: Record<"header" | "footer", string> = {
  header: "#fef9c3",
  footer: "#fce7f3",
}
const CANVAS_PATH_HOVER_DELAY_MS = 240
const CANVAS_PATH_BAR_HEIGHT = 18
const CANVAS_PATH_BAR_GAP = 4
const CANVAS_PATH_MIN_EDGE_GAP = 4
const CANVAS_ACTION_RAIL_BUTTON_SIZE = 22
const CANVAS_ACTION_RAIL_GAP = 4
const CANVAS_ACTION_RAIL_PADDING = 4
const CANVAS_ACTION_RAIL_OFFSET = 8

const CANVAS_PATH_LABELS: Record<SelectionContextItem["type"], string> = {
  body: "BODY",
  paragraph: "PARAGRAPH",
  spacer: "SPACER",
  row: "ROW",
  stack: "STACK",
  "flow-row": "ROW",
  "flow-stack": "STACK",
  "flow-table": "TABLE",
  "flow-table-row": "ROW",
  "flow-table-cell": "CELL",
  toc: "TOC",
}

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
  const belowY = (anchorFragment.y + anchorFragment.height) * scale + CANVAS_PATH_BAR_GAP
  const maxY = Math.max(CANVAS_PATH_MIN_EDGE_GAP, pageHeight * scale - CANVAS_PATH_BAR_HEIGHT - CANVAS_PATH_MIN_EDGE_GAP)
  const y = clamp(aboveY >= CANVAS_PATH_MIN_EDGE_GAP ? aboveY : belowY, CANVAS_PATH_MIN_EDGE_GAP, maxY)
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

function CanvasNodeActionRail({
  nodeId,
  anchorFragment,
  pageWidth,
  pageHeight,
  scale,
  canDrag,
  canDuplicate,
  canDelete,
  onStartDrag,
  onDuplicateNode,
  onDeleteNode,
}: {
  nodeId: string
  anchorFragment: PageFragment
  pageWidth: number
  pageHeight: number
  scale: number
  canDrag: boolean
  canDuplicate: boolean
  canDelete: boolean
  onStartDrag: (nodeId: string, e: React.PointerEvent<SVGGElement>) => void
  onDuplicateNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}) {
  const actions = [
    canDrag ? "drag" as const : null,
    canDuplicate ? "duplicate" as const : null,
    canDelete ? "delete" as const : null,
  ].filter((action): action is "drag" | "duplicate" | "delete" => action !== null)
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
              label="Duplicate block"
              testId="canvas-action-duplicate"
              x={buttonX}
              y={buttonY}
              onPointerDown={() => onDuplicateNode(nodeId)}
            >
              <DuplicateIcon x={buttonX} y={buttonY} />
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
  nodeById: Map<string, LayoutNode>
  plainTextParagraphIds: Set<string>
  textRunParagraphIds: Set<string>
  tableCellIds: Set<string>
  flowStackParagraphIds: Set<string>
}

function buildPageViewDocLookup(doc: DocumentNode): PageViewDocLookup {
  const nodeById = new Map<string, LayoutNode>()
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

function cssHex(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`
}

function paragraphBoxStrokeDashArray(border: ResolvedBorderSide, scale: number): string | undefined {
  const strokeWidth = Math.max(border.width * scale, 0.5)
  if (border.style === "dashed") return `${Math.max(strokeWidth * 3, 3)} ${Math.max(strokeWidth * 2, 2)}`
  if (border.style === "dotted") return `0 ${Math.max(strokeWidth * 2.2, 2)}`
  return undefined
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
  onWysiwygTextDraftChange,
  onWysiwygRichTextShortcut,
  onWysiwygTextReflowDecision,
  clipPathIndexOffset = 0,
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
  editFragmentRef: { current: { nodeId: string; pageKey: string; fragment: PageFragment } | null }
  dragActive: boolean
  wysiwygInlineEditEnabled: boolean
  wysiwygTextEngineEnabled: boolean
  wysiwygTextDraftNodeId: string | null
  wysiwygTextDraftText: string | null
  wysiwygTextCaretOffset: number | null
  wysiwygTextSelection: { anchorOffset: number; focusOffset: number } | null
  wysiwygTextDraftPaginationActive: boolean
  wysiwygTextPointerFragments: WysiwygTextPointerFragmentTarget[]
  showTextSegments: boolean
  onInlineEditStart: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => void
  onInlineEditChange: (nodeId: string, text: string, caretIndex: number | null) => void
  onInlineEditCaretChange: (nodeId: string, caretIndex: number | null) => void
  onInlineEditUserInteraction: (nodeId: string) => void
  onInlineEditHeightChange: (nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => void
  onInlineEditEnd: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph: (nodeId: string, splitIndex: number) => void
  onMergeParagraph: (nodeId: string) => void
  onWysiwygTextDraftChange: (nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => void
  onWysiwygRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onWysiwygTextReflowDecision: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
  clipPathIndexOffset?: number
}) {
  return fragments.map((fragment, index) => {
    const canRenderText = fragment.nodeType === "paragraph" || fragment.nodeType === "toc"
    const editableParagraph = active &&
      fragment.nodeType === "paragraph" &&
      canInlineEditParagraph(doc, fragment.nodeId, wysiwygTextEngineEnabled)
    const isInlineEditing = editableParagraph &&
      inlineEditNodeId === fragment.nodeId &&
      (activeInlineEditPageIndex == null || fragment.pageIndex === activeInlineEditPageIndex)
    if (isInlineEditing) {
      if (
        editFragmentRef.current?.nodeId !== fragment.nodeId ||
        editFragmentRef.current?.pageKey !== pageKey
      ) {
        editFragmentRef.current = { nodeId: fragment.nodeId, pageKey, fragment: { ...fragment } }
      } else {
        editFragmentRef.current = { ...editFragmentRef.current, fragment: { ...fragment } }
      }
    }
    const displayFragment = isInlineEditing
      ? editFragmentRef.current?.fragment ?? fragment
      : fragment
    const clipPathId = buildEditorFragmentClipPathId(pageKey, displayFragment, clipPathIndexOffset + index)
    return (
      <g
        key={`${zone}-${fragment.nodeId}-${fragment.pageIndex}-${index}`}
        data-testid="editor-zone-fragment"
        data-zone={zone}
        data-zone-editable={editableParagraph ? "true" : undefined}
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
              ? caretIndexFromPointer(displayFragment, event, scale, textMeasurer, true)
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
              ? caretIndexFromPointer(displayFragment, event, scale, textMeasurer, true)
              : null,
            displayFragment.pageIndex,
          )
        } : undefined}
      >
        <rect
          x={displayFragment.x * scale}
          y={displayFragment.y * scale}
          width={displayFragment.width * scale}
          height={Math.max(displayFragment.height * scale, 2)}
          fill={isInlineEditing ? INLINE_EDIT_CHROME_FILL : READ_ONLY_ZONE_FILL[zone]}
          stroke={isInlineEditing ? "#2563eb" : editableParagraph ? "#38bdf8" : "#9ca3af"}
          strokeWidth={isInlineEditing ? 1.25 : editableParagraph ? 0.9 : 0.5}
          opacity={canRenderText ? (active ? 0.34 : 0.24) : 0.45}
        />
        {canRenderText && (
          <ParagraphTextSurface
            fragment={displayFragment}
            doc={doc}
            pageKey={pageKey}
            clipPathId={clipPathId}
            scale={scale}
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
            onWysiwygTextDraftChange={onWysiwygTextDraftChange}
            onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
            onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
          />
        )}
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
}: {
  zone: "header" | "footer"
  active: boolean
  x: number
  y: number
  width: number
  height: number
  onEnter: () => void
  onActivePointerDown: () => void
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
        fill={active ? "#e0f2fe" : "transparent"}
        opacity={active ? 0.2 : 1}
        stroke={active ? "#0284c7" : "transparent"}
        strokeWidth={active ? 1.25 : 0}
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
      />
      {active && (
        <text
          x={x + 8}
          y={y + 14}
          fontSize={10}
          fill="#0369a1"
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
  zone: "header" | "footer"
  x: number
  y: number
  width: number
  active: boolean
  onPointerDown: (event: ReactPointerEvent<SVGRectElement>) => void
}) {
  if (width <= 0) return null
  const stroke = zone === "header" ? "#2563eb" : "#db2777"
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
        y={y - 7}
        width={width}
        height={14}
        fill="transparent"
        style={{ cursor: "ns-resize", touchAction: "none" }}
        onPointerDown={onPointerDown}
      />
    </g>
  )
}

// ─── Drop Highlight ───────────────────────────────────────────────────────────

function DropHighlight({ doc, drag, fragments, scale, contentBox }: {
  doc: DocumentNode; drag: DragState | null; fragments: PageFragment[]; scale: number
  contentBox: { x: number; y: number; width: number; height: number }
}) {
  if (!drag?.preview?.isValid || !drag.preview.placement) return null
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
  inlineEditNodeId, inlineEditCaretIndex, inlineEditPageIndex, inlineEditVisualLocked, onInlineEditStart, onInlineEditChange, onInlineEditCaretChange, onInlineEditUserInteraction, onInlineEditHeightChange, onInlineEditEnd, onSplitParagraph, onMergeParagraph,
  pageKey, setPageRef, textMeasurer, onNodePointerDown, onBackgroundPointerDown, onSelectContextNode, onDuplicateNode, onDeleteNode,
  resizeDrag, onResizeStart, onTableColumnResizeStart, minHeightDrag, onMinHeightResizeStart,
  sectionIndex, marginDrag, marginEditMode, headerFooterEditMode, headerFooterReservedDrag, onMarginEditModeEnter, onMarginEditModeExit, onHeaderFooterEditModeEnter, onHeaderFooterEditModeExit, onHeaderFooterZonePointerDown, onHeaderFooterReservedResizeStart, onMarginResizeStart, showTextSegments, showDrift, driftMap, wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled, wysiwygTextDraftNodeId, wysiwygTextDraftText, wysiwygTextCaretOffset, wysiwygTextSelection, wysiwygTextDraftPaginationActive, wysiwygDraftVisualPreview, wysiwygTableCellDraftVisualChromeByPageIndex, wysiwygTextPointerFragments, onWysiwygTextDraftChange, onWysiwygRichTextShortcut, onWysiwygTextReflowDecision,
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
  onSplitParagraph: (nodeId: string, splitIndex: number) => void
  onMergeParagraph: (nodeId: string) => void
  onWysiwygTextDraftChange: (nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => void
  onWysiwygRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onWysiwygTextReflowDecision: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
  pageKey: string; setPageRef: (key: string, el: SVGSVGElement | null) => void
  onNodePointerDown: (source: DragSource, e: React.PointerEvent, clickAction?: PendingClickAction) => void
  onBackgroundPointerDown: () => void
  onSelectContextNode: (nodeId: string) => void
  onDuplicateNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
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
  onMarginEditModeEnter: (sectionIndex: number) => void
  onMarginEditModeExit: () => void
  onHeaderFooterEditModeEnter: (sectionIndex: number, zone: "header" | "footer") => void
  onHeaderFooterEditModeExit: () => void
  onHeaderFooterZonePointerDown: () => void
  onHeaderFooterReservedResizeStart: (sectionIndex: number, zone: "header" | "footer", currentReserved: { headerReserved: number; footerReserved: number }, pageHeightPt: number, marginTopPt: number, marginBottomPt: number, pageKey: string) => void
  onMarginResizeStart: (sectionIndex: number, side: "top" | "right" | "bottom" | "left", currentMargins: { top: number; right: number; bottom: number; left: number }, pageWidthPt: number, pageHeightPt: number, pageKey: string, altKey: boolean) => void
}) {
  const W = page.width * scale
  const H = page.height * scale
  const dragHoverNodeId = drag?.preview?.hoverNodeId ?? null
  const [hoverPathTarget, setHoverPathTarget] = useState<{ nodeId: string; pageKey: string } | null>(null)
  const hoverPathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docLookup = useMemo(() => buildPageViewDocLookup(doc), [doc])
  const { nodeById, plainTextParagraphIds, textRunParagraphIds, tableCellIds, flowStackParagraphIds } = docLookup
  const editFragmentRef = useRef<{ nodeId: string; pageKey: string; fragment: PageFragment } | null>(null)
  const sectionPageSettings = doc.document.sections[sectionIndex]?.page ?? null

  function clearHoverPathTimer() {
    if (hoverPathTimerRef.current == null) return
    clearTimeout(hoverPathTimerRef.current)
    hoverPathTimerRef.current = null
  }

  function queueHoverPath(nodeId: string) {
    if (drag || resizeDrag || minHeightDrag || marginDrag || marginEditMode || headerFooterEditMode) return
    clearHoverPathTimer()
    hoverPathTimerRef.current = setTimeout(() => {
      setHoverPathTarget({ nodeId, pageKey })
      hoverPathTimerRef.current = null
    }, CANVAS_PATH_HOVER_DELAY_MS)
  }

  function clearHoverPath(nodeId?: string) {
    clearHoverPathTimer()
    setHoverPathTarget((current) => {
      if (!current) return null
      if (nodeId && current.nodeId !== nodeId) return current
      return null
    })
  }

  useEffect(() => () => clearHoverPathTimer(), [])
  useEffect(() => {
    if (!drag && !resizeDrag && !minHeightDrag && !marginDrag && !marginEditMode && !headerFooterEditMode) return
    clearHoverPath()
  }, [drag, resizeDrag, minHeightDrag, marginDrag, marginEditMode, headerFooterEditMode])

  useEffect(() => {
    if (inlineEditNodeId == null) editFragmentRef.current = null
  }, [inlineEditNodeId])
  const wysiwygCaretMappingEnabled = wysiwygInlineEditEnabled || wysiwygTextEngineEnabled
  const visualDraftFragmentForPage = wysiwygDraftVisualPreview?.fragmentsByPageIndex.get(page.index) ?? null
  const tableCellDraftVisualChromeFragments = visualDraftFragmentForPage
    ? wysiwygTableCellDraftVisualChromeByPageIndex.get(page.index) ?? []
    : []
  const tableCellDraftVisualChromeSet = new Set(tableCellDraftVisualChromeFragments)
  const allTableCellDraftVisualChromeByKey = new Map(
    tableCellDraftVisualChromeFragments.map((fragment) => [tableCellDraftVisualChromeKey(fragment), fragment] as const),
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
  const sourceTableCellDraftVisualChromeByKey = hasRealVisualDraftFragment
    ? allTableCellDraftVisualChromeByKey
    : new Map<string, PageFragment>()
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
  const suppressPathOverlays = Boolean(drag || resizeDrag || minHeightDrag || marginDrag || marginEditMode || headerFooterEditMode)
  const selectedPathFragment = suppressPathOverlays ? null : findCanvasPathFragment(
    renderFragments,
    selectedNodeId,
    selectedPathAnchorNodeId,
  )
  const hoverPathFragment = suppressPathOverlays || hoverPathNodeId === selectedPathAnchorNodeId
    ? null
    : findCanvasPathFragment(renderFragments, hoverPathNodeId)
  const selectedActionNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null
  const selectedActionFragment = suppressPathOverlays || !selectedActionNode
    ? null
    : findCanvasPathFragment(renderFragments, selectedNodeId)
  const selectedActionCanDrag = Boolean(selectedActionNode && DRAGGABLE_TYPES.has(selectedActionNode.type))
  const selectedActionCanDuplicate = Boolean(selectedActionNode && selectedActionNode.type !== "body")
  const selectedActionCanDelete = selectedActionCanDuplicate
  const isMarginDragSection = marginDrag?.sectionIndex === sectionIndex
  const isMarginEditSection = marginEditMode?.sectionIndex === sectionIndex
  const isHeaderFooterEditSection = headerFooterEditMode?.sectionIndex === sectionIndex
  const isHeaderEditActive = isHeaderFooterEditSection && headerFooterEditMode?.zone === "header"
  const isFooterEditActive = isHeaderFooterEditSection && headerFooterEditMode?.zone === "footer"
  const isMarginGuideEditable = !isHeaderFooterEditSection && (isMarginDragSection || isMarginEditSection)
  const liveMargins = isMarginDragSection ? marginDrag!.currentMargins : {
    left: page.contentBox.x,
    top: page.contentBox.y,
    right: page.width - page.contentBox.x - page.contentBox.width,
    bottom: page.height - page.contentBox.y - page.contentBox.height,
  }
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
  const pageMarginTopPt = sectionPageSettings ? unitValueToPt(sectionPageSettings.margin.top) : Math.max(0, page.contentBox.y)
  const pageMarginBottomPt = sectionPageSettings ? unitValueToPt(sectionPageSettings.margin.bottom) : Math.max(0, page.height - page.contentBox.y - page.contentBox.height)
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

  return (
    // overflow: visible — ให้ inline editor ขยายเกิน SVG boundary ได้
    <svg
      ref={(el) => setPageRef(pageKey, el)}
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
        {[...renderFragments, ...zoneFragments].map((f, i) => {
          const displayFragment = resolveDisplayFragment(f)
          const clipPathId = buildEditorFragmentClipPathId(pageKey, displayFragment, i)
          return (
          <clipPath key={`${clipPathId}-${i}`} id={clipPathId}>
            <rect x={displayFragment.x * scale} y={displayFragment.y * scale} width={displayFragment.width * scale} height={9999} />
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
      {renderFragments.map((f, i) => {
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
        const isSelected = f.nodeId === selectedNodeId
        const isTableCellParagraph = f.nodeType === "paragraph" && tableCellIds.has(f.parentNodeId ?? "")
        const editableParagraphIds = wysiwygTextEngineEnabled ? textRunParagraphIds : plainTextParagraphIds
        const canInlineEditThisParagraph = f.nodeType === "paragraph" && editableParagraphIds.has(f.nodeId)
        const visualDisplayFragment = resolveDisplayFragment(f)
        // For split paragraphs: only the active fragment slice enters edit mode.
        // Otherwise same-node continuation fragments can render duplicate editors.
        const isInlineEditing = i === activeInlineEditRenderIndex
        if (isInlineEditing) {
          if (
            editFragmentRef.current?.nodeId !== f.nodeId ||
            editFragmentRef.current?.pageKey !== pageKey
          ) {
            editFragmentRef.current = { nodeId: f.nodeId, pageKey, fragment: { ...visualDisplayFragment } }
          } else {
            editFragmentRef.current = { ...editFragmentRef.current, fragment: { ...visualDisplayFragment } }
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
        const shouldShowFragmentTypeLabel = !isFlowTableRowVisualOnly &&
          !isTableStructureChrome &&
          !isWysiwygTableCellDraftVisualChrome &&
          !isContinuationParagraphFragment &&
          !isContinuationFlowTableCellFragment
        const docNode = nodeById.get(f.nodeId)
        const isEmpty = (f.nodeType === "stack" || f.nodeType === "flow-stack") && docNode && "childIds" in docNode && (docNode as { childIds: string[] }).childIds.length === 0
        // visual override ระหว่าง resize
        let fragX = displayFragment.x, fragWidth = displayFragment.width, fragHeight = displayFragment.height
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
          : hasAuthoredFragmentBox && !isInlineEditing ? "transparent" : isInlineEditing ? INLINE_EDIT_CHROME_FILL : "transparent"
        const chromeStroke = isFlowTableRowVisualOnly || (hasAuthoredFragmentBox && !isInlineEditing && !isHovered)
          ? "transparent"
          : isTableStructureChrome ? "transparent"
          : isWysiwygTableCellDraftStructureChrome ? "transparent"
          : isWysiwygTableCellDraftVisualChrome ? "#60a5fa"
          : isInlineEditing ? "#2563eb" : isHovered ? "#4b5563" : "#9ca3af"
        const chromeOpacity = isFlowTableRowVisualOnly
          ? 0
          : isTableStructureChrome ? 0
          : isWysiwygTableCellDraftStructureChrome ? 0
          : isWysiwygTableCellDraftVisualChrome ? 0.34
          : hasAuthoredFragmentBox && !isInlineEditing ? 1 : isInlineEditing ? 0.35 : 0.75
        const selectionPad = isFlowStackParagraph ? 0 : 1
        const fragmentKey = buildEditorFragmentRenderKey(displayFragment, i, isInlineEditing)
        const clipPathId = buildEditorFragmentClipPathId(pageKey, displayFragment, i)

        return (
          <g
            key={fragmentKey}
            data-testid="editor-fragment"
            data-node-id={f.nodeId}
            data-node-type={f.nodeType}
            data-page-index={displayFragment.pageIndex}
            data-fragment-index={displayFragment.fragmentIndex ?? undefined}
            data-line-start={displayFragment.lineStart ?? undefined}
            data-line-end={displayFragment.lineEnd ?? undefined}
            data-parent-node-id={displayFragment.parentNodeId ?? undefined}
            data-table-structure-chrome={isTableStructureChrome ? "true" : undefined}
            data-wysiwyg-table-cell-visual-chrome={isWysiwygTableCellDraftVisualChrome ? "true" : undefined}
            data-wysiwyg-table-cell-structure-chrome={isWysiwygTableCellDraftStructureChrome ? "true" : undefined}
            onPointerEnter={!isFlowTableRowVisualOnly && !drag && !resizeDrag && !minHeightDrag && !marginDrag && !marginEditMode && !headerFooterEditMode && !isInlineEditing
              ? () => queueHoverPath(f.nodeId)
              : undefined}
            onPointerLeave={!isFlowTableRowVisualOnly
              ? () => clearHoverPath(f.nodeId)
              : undefined}
            onPointerDown={!isFlowTableRowVisualOnly && (isSelectable || f.nodeType === "stack") && !drag && !resizeDrag && !marginEditMode && !headerFooterEditMode && !isInlineEditing
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
              pointerEvents: isFlowTableRowVisualOnly || isWysiwygTableCellDraftVisualChrome ? "none" : undefined,
              cursor: isInlineEditing ? "text" : isDraggable && !drag ? "grab" : "default",
            }}
          >
            <rect
              x={fragX * scale} y={chromeY}
              width={Math.max(fragWidth * scale, 2)} height={chromeHeight}
              fill={chromeFill}
              stroke={chromeStroke}
              strokeWidth={isInlineEditing ? 1.5 : isHovered ? 1 : 0.5}
              opacity={chromeOpacity}
            />
            {(f.nodeType === "paragraph" || f.nodeType === "flow-stack" || f.nodeType === "flow-table-cell") && renderFragmentBox(resizedDisplayFragment, scale)}
            {isSelected && !isInlineEditing && !isFlowTableRowVisualOnly && (
              isContinuationFlowTableCellFragment
                ? renderFlowTableCellSelectionOutline(displayFragment, scale, chromeY, chromeHeight, selectionPad)
                : (
                  <rect
                    x={resizedDisplayFragment.x * scale - selectionPad} y={chromeY - selectionPad}
                    width={resizedDisplayFragment.width * scale + selectionPad * 2} height={chromeHeight + selectionPad * 2}
                    fill="none" stroke="#2563eb" strokeWidth={1.5}
                    style={{ pointerEvents: "none" }}
                  />
                )
            )}
            {showDrift && f.nodeType === "paragraph" && (() => {
              const drift = driftMap?.get(f.nodeId)
              if (!drift) return null
              // page-break-only drift: purple; line-count drift: orange (+) or blue (-)
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

            {/* ── text lines หรือ inline editor ── */}
            {f.nodeType === "paragraph" && (
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
                onWysiwygTextDraftChange={onWysiwygTextDraftChange}
                onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
                onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
              />
            )}
          </g>
        )
      })}

      <HeaderFooterZoneLayer
        zone="header"
        active={isHeaderEditActive}
        x={headerZone.x}
        y={headerZone.y}
        width={headerZone.width}
        height={headerZone.height}
        onEnter={() => onHeaderFooterEditModeEnter(sectionIndex, "header")}
        onActivePointerDown={onHeaderFooterZonePointerDown}
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
      />

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
        onWysiwygTextDraftChange={onWysiwygTextDraftChange}
        onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
        onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
        clipPathIndexOffset={renderFragments.length}
      />
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
        onWysiwygTextDraftChange={onWysiwygTextDraftChange}
        onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
        onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
        clipPathIndexOffset={renderFragments.length + headerFragments.length}
      />

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
                  onMarginResizeStart(sectionIndex, side, {
                    left: page.contentBox.x,
                    top: page.contentBox.y,
                    right: page.width - page.contentBox.x - page.contentBox.width,
                    bottom: page.height - page.contentBox.y - page.contentBox.height,
                  }, page.width, page.height, pageKey, e.altKey)
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
          onStartDrag={(nodeId, e) => onNodePointerDown({ source: "document", nodeId }, e)}
          onDuplicateNode={onDuplicateNode}
          onDeleteNode={onDeleteNode}
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
const PAGE_VIEW_TRANSIENT_PROP_KEYS: Array<keyof PageViewProps> = ["resizeDrag", "minHeightDrag", "marginDrag", "marginEditMode", "headerFooterEditMode", "headerFooterReservedDrag"]
const PAGE_VIEW_SCOPED_EDIT_PROP_KEYS: Array<keyof PageViewProps> = [
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
  "wysiwygDraftVisualPreview",
  "wysiwygTableCellDraftVisualChromeByPageIndex",
  "wysiwygTextPointerFragments",
  "onWysiwygTextDraftChange",
  "onWysiwygTextReflowDecision",
]

interface PageViewScopedEditProps {
  inlineEditNodeId: string | null
  inlineEditPageIndex: number | null
  wysiwygTextDraftNodeId: string | null
  wysiwygDraftVisualPreview: WysiwygDraftVisualPreview | null
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

function pageHasNodeFragment(page: PaginatedPage, nodeId: string | null): boolean {
  if (!nodeId) return false
  return [
    ...page.fragments,
    ...(page.headerFragments ?? []),
    ...(page.footerFragments ?? []),
  ].some((fragment) =>
    fragment.nodeId === nodeId &&
    fragment.nodeType === "paragraph"
  )
}

export function pageViewScopedEditPropsAffectPage(
  page: PaginatedPage,
  props: PageViewScopedEditProps,
): boolean {
  if (pageHasNodeFragment(page, props.inlineEditNodeId)) return true
  if (pageHasNodeFragment(page, props.wysiwygTextDraftNodeId)) return true
  if (props.inlineEditPageIndex === page.index && props.inlineEditNodeId !== null) return true
  if (props.wysiwygDraftVisualPreview?.fragmentsByPageIndex.has(page.index)) return true
  if (props.wysiwygDraftVisualPreview?.caretPageIndex === page.index) return true
  if (props.wysiwygTableCellDraftVisualChromeByPageIndex.has(page.index)) return true
  return props.wysiwygTextPointerFragments.some((target) => target.fragment.pageIndex === page.index)
}

function arePageViewPropsEqual(prev: Readonly<PageViewProps>, next: Readonly<PageViewProps>): boolean {
  for (const key of Object.keys(prev) as Array<keyof PageViewProps>) {
    if (PAGE_VIEW_TRANSIENT_PROP_KEYS.includes(key)) continue
    if (PAGE_VIEW_SCOPED_EDIT_PROP_KEYS.includes(key)) continue
    if (prev[key] !== next[key]) return false
  }

  const scopedEditPropsChanged = PAGE_VIEW_SCOPED_EDIT_PROP_KEYS.some((key) => prev[key] !== next[key])
  if (scopedEditPropsChanged && (
    pageViewScopedEditPropsAffectPage(prev.page, prev) ||
    pageViewScopedEditPropsAffectPage(next.page, next)
  )) return false

  if (prev.resizeDrag !== next.resizeDrag && (
    resizeDragAffectsPage(prev.page, prev.resizeDrag) ||
    resizeDragAffectsPage(next.page, next.resizeDrag)
  )) return false

  if (prev.minHeightDrag !== next.minHeightDrag && (
    minHeightDragAffectsPage(prev.page, prev.minHeightDrag) ||
    minHeightDragAffectsPage(next.page, next.minHeightDrag)
  )) return false

  if (prev.marginDrag !== next.marginDrag && (
    marginDragAffectsPage(prev.sectionIndex, prev.marginDrag) ||
    marginDragAffectsPage(next.sectionIndex, next.marginDrag)
  )) return false

  if (prev.marginEditMode !== next.marginEditMode && (
    marginEditModeAffectsPage(prev.sectionIndex, prev.marginEditMode) ||
    marginEditModeAffectsPage(next.sectionIndex, next.marginEditMode)
  )) return false

  if (prev.headerFooterEditMode !== next.headerFooterEditMode && (
    headerFooterEditModeAffectsPage(prev.sectionIndex, prev.headerFooterEditMode) ||
    headerFooterEditModeAffectsPage(next.sectionIndex, next.headerFooterEditMode)
  )) return false

  if (prev.headerFooterReservedDrag !== next.headerFooterReservedDrag && (
    headerFooterReservedDragAffectsPage(prev.sectionIndex, prev.headerFooterReservedDrag) ||
    headerFooterReservedDragAffectsPage(next.sectionIndex, next.headerFooterReservedDrag)
  )) return false

  return true
}

const MemoizedPageView = memo(PageView, arePageViewPropsEqual)

// ─── Canvas ───────────────────────────────────────────────────────────────────

interface Props {
  paginated: PaginatedDocument
  doc: DocumentNode
  drag: DragState | null
  resizeDrag: ResizeDrag | null
  minHeightDrag: MinHeightDrag | null
  scale: number
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
  onSplitParagraph: (nodeId: string, splitIndex: number) => void
  onMergeParagraph: (nodeId: string) => void
  setPageRef: (key: string, el: SVGSVGElement | null) => void
  onNodePointerDown: (source: DragSource, e: React.PointerEvent, clickAction?: PendingClickAction) => void
  onBackgroundPointerDown: () => void
  onSelectContextNode: (nodeId: string) => void
  onDuplicateNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
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
  paginated, doc, drag, resizeDrag, minHeightDrag, marginDrag, marginEditMode, headerFooterEditMode, headerFooterReservedDrag, scale, selectedNodeId, selectionAnchorNodeId, isLayoutLoading,
  textMeasurer,
  inlineEditVisualFresh, inlineEditNodeId, inlineEditCaretIndex, inlineEditPageIndex, inlineEditVisualLocked, onInlineEditStart, onInlineEditChange, onInlineEditCaretChange, onInlineEditUserInteraction, onInlineEditHeightChange, onInlineEditEnd, onSplitParagraph, onMergeParagraph,
  setPageRef, onNodePointerDown, onBackgroundPointerDown, onSelectContextNode, onDuplicateNode, onDeleteNode, onResizeStart, onTableColumnResizeStart, onMinHeightResizeStart, onMarginEditModeEnter, onMarginEditModeExit, onHeaderFooterEditModeEnter, onHeaderFooterEditModeExit, onHeaderFooterZonePointerDown, onHeaderFooterReservedResizeStart, onMarginResizeStart, onScaleChange,
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
  onWysiwygTextDraftChange,
  onWysiwygRichTextShortcut,
  onWysiwygTextReflowDecision,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sections = Array.isArray(paginated.sections) ? paginated.sections : []
  const pageWidth = sections[0]?.pages[0]?.width ?? 595
  const scaledPageWidth = pageWidth * scale
  const pageKeyByPageIndex = useMemo(() => {
    const byPageIndex = new Map<number, string>()
    for (const [sectionIndex, section] of sections.entries()) {
      for (const [pageArrayIndex, page] of section.pages.entries()) {
        byPageIndex.set(page.index, `${sectionIndex}-${pageArrayIndex}`)
      }
    }
    return byPageIndex
  }, [sections])
  const wysiwygTextExistingSplitActive = Boolean(
    wysiwygTextEngineEnabled &&
    wysiwygTextDraftNodeId &&
    inlineEditNodeId === wysiwygTextDraftNodeId &&
    countParagraphFragments(paginated, wysiwygTextDraftNodeId) > 1,
  )
  const wysiwygDraftVisualPreview = useMemo(() => {
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
  }, [
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
  const wysiwygTextPointerFragments = useMemo<WysiwygTextPointerFragmentTarget[]>(() => {
    if (!wysiwygTextEngineEnabled || !wysiwygTextDraftNodeId) return []
    const sourceFragments = wysiwygDraftVisualPreview?.fragments ?? sections.flatMap((section) =>
      section.pages.flatMap((page) =>
        [...page.fragments, ...page.headerFragments, ...page.footerFragments].filter((fragment) =>
          fragment.nodeId === wysiwygTextDraftNodeId &&
          fragment.nodeType === "paragraph"
        ),
      ),
    )

    return sourceFragments
      .map((fragment): WysiwygTextPointerFragmentTarget | null => {
        const targetPageKey = pageKeyByPageIndex.get(fragment.pageIndex)
        return targetPageKey ? { pageKey: targetPageKey, fragment } : null
      })
      .filter((target): target is WysiwygTextPointerFragmentTarget => target !== null)
  }, [
    pageKeyByPageIndex,
    sections,
    wysiwygDraftVisualPreview,
    wysiwygTextDraftNodeId,
    wysiwygTextEngineEnabled,
  ])

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
            {section.pages.map((page, pi) => (
              <div key={`${section.sectionId}-${page.index}-${pi}`}>
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>Page {page.index + 1}</div>
                <MemoizedPageView
                  page={page} doc={doc} drag={drag} scale={scale}
                  selectedNodeId={selectedNodeId} selectionAnchorNodeId={selectionAnchorNodeId} isLayoutLoading={isLayoutLoading}
                  textMeasurer={textMeasurer}
                  inlineEditVisualFresh={inlineEditVisualFresh}
                  inlineEditNodeId={inlineEditNodeId}
                  inlineEditCaretIndex={inlineEditCaretIndex}
                  inlineEditPageIndex={inlineEditPageIndex}
                  inlineEditVisualLocked={inlineEditVisualLocked}
                  onInlineEditStart={onInlineEditStart}
                  onInlineEditChange={onInlineEditChange}
                  onInlineEditCaretChange={onInlineEditCaretChange}
                  onInlineEditUserInteraction={onInlineEditUserInteraction}
                  onInlineEditHeightChange={onInlineEditHeightChange}
                  onInlineEditEnd={onInlineEditEnd}
                  onSplitParagraph={onSplitParagraph}
                  onMergeParagraph={onMergeParagraph}
                  pageKey={`${si}-${pi}`}
                  setPageRef={setPageRef}
                  onNodePointerDown={onNodePointerDown}
                  onBackgroundPointerDown={onBackgroundPointerDown}
                  onSelectContextNode={onSelectContextNode}
                  onDuplicateNode={onDuplicateNode}
                  onDeleteNode={onDeleteNode}
                  resizeDrag={resizeDrag}
                  onResizeStart={onResizeStart}
                  onTableColumnResizeStart={onTableColumnResizeStart}
                  minHeightDrag={minHeightDrag}
                  onMinHeightResizeStart={onMinHeightResizeStart}
                  sectionIndex={si}
                  marginDrag={marginDrag}
                  marginEditMode={marginEditMode}
                  headerFooterEditMode={headerFooterEditMode}
                  headerFooterReservedDrag={headerFooterReservedDrag}
                  onMarginEditModeEnter={onMarginEditModeEnter}
                  onMarginEditModeExit={onMarginEditModeExit}
                  onHeaderFooterEditModeEnter={onHeaderFooterEditModeEnter}
                  onHeaderFooterEditModeExit={onHeaderFooterEditModeExit}
                  onHeaderFooterZonePointerDown={onHeaderFooterZonePointerDown}
                  onHeaderFooterReservedResizeStart={onHeaderFooterReservedResizeStart}
                  onMarginResizeStart={onMarginResizeStart}
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
                  wysiwygDraftVisualPreview={wysiwygDraftVisualPreview}
                  wysiwygTableCellDraftVisualChromeByPageIndex={wysiwygTableCellDraftVisualChromeByPageIndex}
                  wysiwygTextPointerFragments={wysiwygTextPointerFragments}
                  onWysiwygTextDraftChange={onWysiwygTextDraftChange}
                  onWysiwygRichTextShortcut={onWysiwygRichTextShortcut}
                  onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
                />
              </div>
            ))}
          </div>
        </div>
        ))}
      </div>
    </div>
  )
}
