"use client"

import { useRef, useEffect, useMemo } from "react"
import type { TextMeasurer } from "@/layout"
import {
  resolveFragmentBoxLayoutPrimitives,
  type PaginatedDocument,
  type PageFragment,
  type PaginatedLine,
  type PaginatedPage,
  type ParagraphRenderProps,
  type ResolvedBorderSide,
} from "@/pagination"
import { isPlainTextParagraph } from "@/document"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, LayoutNode, ParagraphNode, TableCellNode, TableNode } from "@/schema"
import type { DragSource } from "@/placement/types"
import type { DragState, ResizeDrag, MinHeightDrag, MarginDrag } from "./EditorShell"
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
import { isParagraphInsideFlowStack } from "./wysiwygTextEligibility"
import { resolveActiveInlineEditPageIndex } from "./editorPageFollow"

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  paragraph: "#c7ddf2",
  spacer:    "#d1d5db",
  row:       "#fed7aa",
  stack:     "#e9d5ff",
  "flow-row":   "#dbeafe",
  "flow-stack": "#d7f4ef",
  "flow-table": "#eef2ff",
  "flow-table-row": "#e0e7ff",
  "flow-table-cell": "#fef9c3",
  body:      "#bbf7d0",
  table:     "#fde68a",
  "table-cell": "#fef3c7",
  toc:       "#d1fae5",
}

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

const DRAGGABLE_TYPES = new Set(["paragraph", "spacer", "row", "flow-row", "table", "flow-table", "toc"])
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
  return fragment?.nodeType === "table-cell" || fragment?.nodeType === "flow-table-cell"
}

function isTableRowFragment(fragment: PageFragment | null | undefined): boolean {
  return fragment?.nodeType === "row" || fragment?.nodeType === "flow-table-row"
}

function isTableRootFragment(fragment: PageFragment | null | undefined): boolean {
  return fragment?.nodeType === "table" || fragment?.nodeType === "flow-table"
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

// line.x now contains the alignment offset (baked in by buildPaginatedLines).
function lineVisualLeft(line: PaginatedLine): number {
  return line.x
}

type TableLikeNode = TableNode | FlowTableNode
type TableCellLikeNode = TableCellNode | FlowTableCellNode

function isTableLikeNode(node: LayoutNode): node is LayoutNode & TableLikeNode {
  return node.type === "table" || node.type === "flow-table"
}

function isTableCellLikeNode(node: TableLikeNode["nodes"][string] | undefined): node is TableCellLikeNode {
  return node?.type === "table-cell" || node?.type === "flow-table-cell"
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

function findFirstParagraphInCell(doc: DocumentNode, cellId: string): string | null {
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (!isTableLikeNode(node)) continue
      const table = node as unknown as TableLikeNode
      const cell = table.nodes[cellId]
      if (!isTableCellLikeNode(cell)) continue
      const paragraphId = cell.childIds.find((id) => {
        const paragraph = table.nodes[id]
        return paragraph?.type === "paragraph" && isPlainTextParagraph(paragraph as ParagraphNode)
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

function canInlineEditParagraph(doc: DocumentNode, nodeId: string): boolean {
  const paragraph = findParagraphNode(doc, nodeId)
  return paragraph !== null && isPlainTextParagraph(paragraph)
}

function getPlainParagraphText(doc: DocumentNode, nodeId: string): string | null {
  const paragraph = findParagraphNode(doc, nodeId)
  if (!paragraph || !isPlainTextParagraph(paragraph)) return null
  return paragraph.children
    .map((child) => child.type === "text" ? child.text : "")
    .join("")
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
      if (inner?.type === "table-cell" || inner?.type === "flow-table-cell") return true
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

function isParagraphInsideRowStack(doc: DocumentNode, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false
  for (const section of doc.document.sections) {
    const paragraph = section.nodes[nodeId]
    if (paragraph?.type !== "paragraph") continue
    const stack = Object.values(section.nodes).find((node) => (
      node.type === "stack" && node.childIds.includes(nodeId)
    ))
    if (stack && isStackInsideRow(doc, stack.id)) return true
  }
  return false
}

function ReadOnlyZoneFragments({
  fragments,
  zone,
  doc,
  pageKey,
  scale,
  textMeasurer,
  showTextSegments,
  clipPathIndexOffset = 0,
}: {
  fragments: PageFragment[]
  zone: "header" | "footer"
  doc: DocumentNode
  pageKey: string
  scale: number
  textMeasurer: TextMeasurer
  showTextSegments: boolean
  clipPathIndexOffset?: number
}) {
  return fragments.map((fragment, index) => {
    const canRenderText = fragment.nodeType === "paragraph" || fragment.nodeType === "toc"
    return (
      <g
        key={`${zone}-${fragment.nodeId}-${fragment.pageIndex}-${index}`}
        data-testid="editor-zone-fragment"
        data-zone={zone}
        data-node-id={fragment.nodeId}
        data-node-type={fragment.nodeType}
        data-page-index={fragment.pageIndex}
        style={{ pointerEvents: "none" }}
      >
        <rect
          x={fragment.x * scale}
          y={fragment.y * scale}
          width={fragment.width * scale}
          height={Math.max(fragment.height * scale, 2)}
          fill={READ_ONLY_ZONE_FILL[zone]}
          stroke="#9ca3af"
          strokeWidth={0.5}
          opacity={canRenderText ? 0.24 : 0.45}
        />
        {canRenderText && (
          <ParagraphTextSurface
            fragment={fragment}
            doc={doc}
            pageKey={pageKey}
            clipPathId={buildEditorFragmentClipPathId(pageKey, fragment, clipPathIndexOffset + index)}
            scale={scale}
            textMeasurer={textMeasurer}
            isEditing={false}
            isVisualFresh={false}
            wysiwygInlineEditEnabled={false}
            wysiwygTextEngineEnabled={false}
            showTextSegments={showTextSegments}
            initialCaretIndex={null}
            onChange={() => undefined}
            onCaretChange={() => undefined}
            onUserEditInteraction={() => undefined}
            onHeightChange={() => undefined}
            onEndEdit={() => undefined}
            onSplitParagraph={() => undefined}
            onMergeParagraph={() => undefined}
          />
        )}
      </g>
    )
  })
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
  page, doc, drag, scale, selectedNodeId, isLayoutLoading, inlineEditVisualFresh,
  inlineEditNodeId, inlineEditCaretIndex, inlineEditPageIndex, inlineEditVisualLocked, onInlineEditStart, onInlineEditChange, onInlineEditCaretChange, onInlineEditUserInteraction, onInlineEditHeightChange, onInlineEditEnd, onSplitParagraph, onMergeParagraph,
  pageKey, setPageRef, textMeasurer, onNodePointerDown, onBackgroundPointerDown,
  resizeDrag, onResizeStart, minHeightDrag, onMinHeightResizeStart,
  sectionIndex, marginDrag, onMarginResizeStart, showTextSegments, showDrift, driftMap, wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled, wysiwygTextDraftNodeId, wysiwygTextDraftText, wysiwygTextCaretOffset, wysiwygTextSelection, wysiwygTextDraftPaginationActive, wysiwygDraftVisualPreview, wysiwygTableCellDraftVisualChromeByPageIndex, wysiwygTextPointerFragments, onWysiwygTextDraftChange, onWysiwygTextReflowDecision,
}: {
  page: PaginatedPage; doc: DocumentNode; drag: DragState | null
  scale: number; selectedNodeId: string | null; isLayoutLoading: boolean
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
  onWysiwygTextReflowDecision: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
  pageKey: string; setPageRef: (key: string, el: SVGSVGElement | null) => void
  onNodePointerDown: (source: DragSource, e: React.PointerEvent, clickAction?: PendingClickAction) => void
  onBackgroundPointerDown: () => void
  resizeDrag: ResizeDrag | null
  onResizeStart: (rowId: string, leftStackId: string, rightStackId: string, pairX: number, pairWidth: number, gapWidthPt: number, startClientX: number, pageKey: string) => void
  minHeightDrag: MinHeightDrag | null
  onMinHeightResizeStart: (rowId: string, rowFragY: number, pageKey: string) => void
  sectionIndex: number
  marginDrag: MarginDrag | null
  onMarginResizeStart: (sectionIndex: number, side: "top" | "right" | "bottom" | "left", currentMargins: { top: number; right: number; bottom: number; left: number }, pageWidthPt: number, pageHeightPt: number, pageKey: string, altKey: boolean) => void
}) {
  const W = page.width * scale
  const H = page.height * scale
  const hoverNodeId = drag?.preview?.hoverNodeId ?? null
  const SELECTABLE = new Set(["paragraph", "spacer", "row", "flow-row", "flow-stack", "table", "table-cell", "flow-table", "flow-table-row", "flow-table-cell", "toc"])
  const editFragmentRef = useRef<{ nodeId: string; pageKey: string; fragment: PageFragment } | null>(null)

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

      {/* margin handles — 4 drag lines แทน content box guide */}
      {(() => {
        const isThisSection = marginDrag?.sectionIndex === sectionIndex
        const liveMargins = isThisSection ? marginDrag!.currentMargins : {
          left: page.contentBox.x,
          top: page.contentBox.y,
          right: page.width - page.contentBox.x - page.contentBox.width,
          bottom: page.height - page.contentBox.y - page.contentBox.height,
        }
        const lx = liveMargins.left * scale
        const rx = (page.width - liveMargins.right) * scale
        const ty = liveMargins.top * scale
        const by = (page.height - liveMargins.bottom) * scale

        const sides = [
          { side: "left"   as const, x1: lx, y1: 0,  x2: lx, y2: H,  hx: lx - 6, hy: 0,     hw: 12, hh: H,  cur: "ew-resize" },
          { side: "right"  as const, x1: rx, y1: 0,  x2: rx, y2: H,  hx: rx - 6, hy: 0,     hw: 12, hh: H,  cur: "ew-resize" },
          { side: "top"    as const, x1: 0,  y1: ty, x2: W,  y2: ty, hx: 0,      hy: ty - 6, hw: W,  hh: 12, cur: "ns-resize" },
          { side: "bottom" as const, x1: 0,  y1: by, x2: W,  y2: by, hx: 0,      hy: by - 6, hw: W,  hh: 12, cur: "ns-resize" },
        ]

        const isActive = (s: string) => isThisSection && marginDrag!.side === s
        const isMirror = (s: string) =>
          isThisSection && !marginDrag!.altKey && (
            (marginDrag!.side === "left" && s === "right") ||
            (marginDrag!.side === "right" && s === "left") ||
            (marginDrag!.side === "top" && s === "bottom") ||
            (marginDrag!.side === "bottom" && s === "top")
          )

        return sides.map(({ side, x1, y1, x2, y2, hx, hy, hw, hh, cur }) => (
          <g key={`mg-${side}`}>
            <rect x={hx} y={hy} width={hw} height={hh}
              fill="transparent" style={{ cursor: cur }}
              onPointerDown={(e) => {
                e.stopPropagation(); e.preventDefault()
                onMarginResizeStart(sectionIndex, side, {
                  left: page.contentBox.x,
                  top: page.contentBox.y,
                  right: page.width - page.contentBox.x - page.contentBox.width,
                  bottom: page.height - page.contentBox.y - page.contentBox.height,
                }, page.width, page.height, pageKey, e.altKey)
              }}
            />
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isActive(side) ? "#2563eb" : isMirror(side) ? "#93c5fd" : "#e5e7eb"}
              strokeWidth={isActive(side) ? 1.5 : isMirror(side) ? 1 : 0.5}
              strokeDasharray={isActive(side) || isMirror(side) ? "none" : "4 2"}
              style={{ pointerEvents: "none" }}
            />
          </g>
        ))
      })()}

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
        const color = NODE_COLORS[f.nodeType] ?? "#f3f4f6"
        const isWysiwygTableCellDraftVisualChrome = tableCellDraftVisualChromeSet.has(f) ||
          sourceTableCellDraftVisualChromeByKey.has(tableCellDraftVisualChromeKey(f))
        const isWysiwygTableCellDraftStructureChrome = isWysiwygTableCellDraftVisualChrome && !isTableCellFragment(f)
        const isTableStructureChrome = isTableStructureFragment(f, renderFragments)
        const isHovered = f.nodeId === hoverNodeId
        const isFlowTableRowVisualOnly = f.nodeType === "flow-table-row"
        const isLayoutNode = doc.document.sections.some((s) => s.nodes[f.nodeId] != null)
        const isDraggable = DRAGGABLE_TYPES.has(f.nodeType) && isLayoutNode
        const isSelectable = SELECTABLE.has(f.nodeType)
        const selectNodeId = f.nodeId
        const isSelected = f.nodeId === selectedNodeId
        const isTableCellParagraph = f.nodeType === "paragraph" && isTableCellId(doc, f.parentNodeId)
        const canInlineEditThisParagraph = f.nodeType === "paragraph" && canInlineEditParagraph(doc, f.nodeId)
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
        const isFlowStackParagraph = f.nodeType === "paragraph" &&
          isParagraphInsideFlowStack(doc, f.nodeId, f.parentNodeId)
        const isContinuationParagraphFragment = f.nodeType === "paragraph" &&
          (displayFragment.continuesFrom === true || displayFragment.isContinued === true)
        const isContinuationFlowTableCellFragment = isFlowTableCellContinuationFragment(displayFragment)
        const shouldShowFragmentTypeLabel = !isFlowTableRowVisualOnly &&
          !isTableStructureChrome &&
          !isWysiwygTableCellDraftVisualChrome &&
          !isContinuationParagraphFragment &&
          !isContinuationFlowTableCellFragment
        const docNode = doc.document.sections.flatMap((s) => Object.values(s.nodes)).find((n) => n.id === f.nodeId)
        const isEmpty = (f.nodeType === "stack" || f.nodeType === "flow-stack") && docNode && "childIds" in docNode && (docNode as { childIds: string[] }).childIds.length === 0
        // visual override ระหว่าง resize
        let fragX = displayFragment.x, fragWidth = displayFragment.width, fragHeight = displayFragment.height
        if (resizeDrag && (f.nodeType === "stack" || f.nodeType === "flow-stack")) {
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
          : isWysiwygTableCellDraftVisualChrome ? color
          : hasAuthoredFragmentBox && !isInlineEditing ? "transparent" : isInlineEditing ? "#dbeafe" : color
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
            onPointerDown={!isFlowTableRowVisualOnly && (isSelectable || f.nodeType === "stack") && !drag && !resizeDrag && !isInlineEditing
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
            onDoubleClick={(f.nodeType === "paragraph" || f.nodeType === "table-cell" || f.nodeType === "flow-table-cell") && !drag
              ? (e) => {
                e.stopPropagation()
                const paragraphId = f.nodeType === "table-cell" || f.nodeType === "flow-table-cell"
                  ? findFirstParagraphInCell(doc, f.nodeId)
                  : f.nodeId
                if (!paragraphId || !canInlineEditParagraph(doc, paragraphId)) return
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
                onWysiwygTextReflowDecision={onWysiwygTextReflowDecision}
              />
            )}
          </g>
        )
      })}

      <ReadOnlyZoneFragments
        fragments={headerFragments}
        zone="header"
        doc={doc}
        pageKey={pageKey}
        scale={scale}
        textMeasurer={textMeasurer}
        showTextSegments={showTextSegments}
        clipPathIndexOffset={renderFragments.length}
      />
      <ReadOnlyZoneFragments
        fragments={footerFragments}
        zone="footer"
        doc={doc}
        pageKey={pageKey}
        scale={scale}
        textMeasurer={textMeasurer}
        showTextSegments={showTextSegments}
        clipPathIndexOffset={renderFragments.length + headerFragments.length}
      />

      {/* resize handles — แสดงระหว่าง stacks ของแต่ละ row */}
      {!drag && page.fragments.filter((f) => f.nodeType === "row" || f.nodeType === "flow-row").map((rowFrag) => {
        const rowNode = doc.document.sections.flatMap((s) => Object.values(s.nodes)).find((n) => n.id === rowFrag.nodeId)
        if (rowNode?.type !== "row" && rowNode?.type !== "flow-row") return null
        if (rowNode.type !== rowFrag.nodeType) return null
        const rowChildIds = rowNode.childIds
        return rowChildIds.slice(0, -1).map((leftStackId: string, i: number) => {
          const rightStackId = rowChildIds[i + 1]
          const leftFrag = page.fragments.find((f) => f.nodeId === leftStackId)
          const rightFrag = page.fragments.find((f) => f.nodeId === rightStackId)
          if (!leftFrag || !rightFrag) return null
          const isActive = resizeDrag?.leftStackId === leftStackId
          const handleDocX = isActive ? resizeDrag!.currentDocX : leftFrag.x + leftFrag.width
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
                fill="transparent" style={{ cursor: "col-resize" }}
                onPointerDown={(e) => {
                  e.stopPropagation(); e.preventDefault()
                  const gapWidthPt = Math.max(0, rightFrag.x - (leftFrag.x + leftFrag.width))
                  onResizeStart(rowFrag.nodeId, leftStackId, rightStackId, leftFrag.x, leftFrag.width + rightFrag.width, gapWidthPt, e.clientX, pageKey)
                }}
              />
              {/* visual line */}
              <rect x={hx - (isActive ? 1 : 0.5)} y={hy} width={isActive ? 2 : 1} height={hh}
                fill={isActive ? "#2563eb" : "#9ca3af"} opacity={isActive ? 1 : 0.5}
                style={{ pointerEvents: "none" }} />
            </g>
          )
        })
      })}

      {/* minHeight resize handles — แสดงด้านล่างของ row */}
      {!drag && page.fragments.filter((f) => f.nodeType === "row").map((rowFrag) => {
        const isActive = minHeightDrag?.rowId === rowFrag.nodeId
        const rowNode = doc.document.sections.flatMap((s) => Object.values(s.nodes)).find((n) => n.id === rowFrag.nodeId)
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
              fill="transparent" style={{ cursor: "row-resize" }}
              onPointerDown={(e) => {
                e.stopPropagation(); e.preventDefault()
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

      <DropHighlight doc={doc} drag={drag} fragments={page.fragments} scale={scale} contentBox={page.contentBox} />

      {isLayoutLoading && !inlineEditNodeId && !drag && !resizeDrag?.committed && !minHeightDrag?.committed && (
        <rect x={0} y={0} width={W} height={H} fill="white" opacity={0.15}
          style={{ pointerEvents: "none" }} />
      )}
    </svg>
  )
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

interface Props {
  paginated: PaginatedDocument
  doc: DocumentNode
  drag: DragState | null
  resizeDrag: ResizeDrag | null
  minHeightDrag: MinHeightDrag | null
  scale: number
  selectedNodeId: string | null
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
  onResizeStart: (rowId: string, leftStackId: string, rightStackId: string, pairX: number, pairWidth: number, gapWidthPt: number, startClientX: number, pageKey: string) => void
  onMinHeightResizeStart: (rowId: string, rowFragY: number, pageKey: string) => void
  marginDrag: MarginDrag | null
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
  wysiwygTextCaretOffset: number | null
  wysiwygTextSelection: { anchorOffset: number; focusOffset: number } | null
  wysiwygTextDraftPaginationActive: boolean
  onWysiwygTextDraftChange: (nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => void
  onWysiwygTextReflowDecision: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
}

export function buildWysiwygDraftVisualPreview(input: {
  paginated: PaginatedDocument
  doc: DocumentNode
  nodeId: string
  draftText: string
  caretOffset: number | null
  textMeasurer: TextMeasurer
  draftPaginationActive?: boolean
}): WysiwygDraftVisualPreview | null {
  const paragraph = findParagraphNode(input.doc, input.nodeId)
  if (!paragraph || !isPlainTextParagraph(paragraph)) return null
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
      input.draftText,
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
  paginated, doc, drag, resizeDrag, minHeightDrag, marginDrag, scale, selectedNodeId, isLayoutLoading,
  textMeasurer,
  inlineEditVisualFresh, inlineEditNodeId, inlineEditCaretIndex, inlineEditPageIndex, inlineEditVisualLocked, onInlineEditStart, onInlineEditChange, onInlineEditCaretChange, onInlineEditUserInteraction, onInlineEditHeightChange, onInlineEditEnd, onSplitParagraph, onMergeParagraph,
  setPageRef, onNodePointerDown, onBackgroundPointerDown, onResizeStart, onMinHeightResizeStart, onMarginResizeStart, onScaleChange,
  autoFitScale, showTextSegments, showDrift, driftMap,
  wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled,
  wysiwygTextDraftNodeId,
  wysiwygTextDraftText,
  wysiwygTextCaretOffset,
  wysiwygTextSelection,
  wysiwygTextDraftPaginationActive,
  onWysiwygTextDraftChange,
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
    if (getPlainParagraphText(doc, wysiwygTextDraftNodeId) === wysiwygTextDraftText) return null
    return buildWysiwygDraftVisualPreview({
      paginated,
      doc,
      nodeId: wysiwygTextDraftNodeId,
      draftText: wysiwygTextDraftText,
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
    wysiwygTextDraftPaginationActive,
    wysiwygTextDraftNodeId,
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
        page.fragments.filter((fragment) =>
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
                <PageView
                  page={page} doc={doc} drag={drag} scale={scale}
                  selectedNodeId={selectedNodeId} isLayoutLoading={isLayoutLoading}
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
                  resizeDrag={resizeDrag}
                  onResizeStart={onResizeStart}
                  minHeightDrag={minHeightDrag}
                  onMinHeightResizeStart={onMinHeightResizeStart}
                  sectionIndex={si}
                  marginDrag={marginDrag}
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
