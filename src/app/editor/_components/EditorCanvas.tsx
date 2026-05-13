"use client"

import { useRef, useEffect, useMemo } from "react"
import type { TextMeasurer } from "@/layout"
import type { PaginatedDocument, PageFragment, PaginatedLine, PaginatedPage, ParagraphRenderProps } from "@/pagination"
import { isPlainTextParagraph } from "@/document"
import type { DocumentNode, ParagraphNode, TableCellNode, TableNode } from "@/schema"
import type { DragSource } from "@/placement/types"
import type { DragState, ResizeDrag, MinHeightDrag, MarginDrag } from "./EditorShell"
import type { FragmentDrift } from "./comparePagination"
import { getRowGeometry } from "@/placement/geometry"
import {
  buildWysiwygDraftParagraphLayout,
  ParagraphTextSurface,
  type WysiwygTextPointerFragmentTarget,
} from "./ParagraphTextSurface"
import { resolveCaretOffsetFromPointInFragment } from "./wysiwygCaretMapping"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import {
  createWysiwygDraftVisualPreview,
  shiftWysiwygDraftPreviewDownstreamFragments,
  splitWysiwygDraftVisualFragments,
  type WysiwygDraftVisualPreview,
} from "./wysiwygDraftVisualPreview"

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  paragraph: "#bfdbfe",
  spacer:    "#d1d5db",
  row:       "#fed7aa",
  stack:     "#e9d5ff",
  body:      "#bbf7d0",
  table:     "#fde68a",
  "table-cell": "#fef3c7",
  toc:       "#d1fae5",
}

const DRAGGABLE_TYPES = new Set(["paragraph", "spacer", "row", "table", "toc"])
const PARAGRAPH_CHROME_Y = 3
const PARAGRAPH_LIVE_PREVIEW_GAP_Y = 2

type PendingClickAction = {
  type: "inline-edit"
  nodeId: string
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
      if (node.type !== "table") continue
      const table = node as unknown as TableNode
      const cell = table.nodes[cellId] as TableCellNode | undefined
      if (cell?.type !== "table-cell") continue
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
      if (candidate.type !== "table") continue
      const inner = (candidate as unknown as TableNode).nodes[nodeId]
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
      if (node.type !== "table") continue
      const table = node as unknown as TableNode
      if (table.nodes[nodeId]?.type === "table-cell") return true
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
      return <rect x={cx} y={contentBox.y * scale} width={cw} height={3} fill="#2563eb" rx={1} style={{ pointerEvents: "none" }} />
    }
    // มี content: line ล่างสุดของ fragment สุดท้าย
    const bottomY = Math.max(...fragments.map((f) => f.y + f.height)) * scale
    return <rect x={cx} y={bottomY + 2} width={cw} height={3} fill="#2563eb" rx={1} style={{ pointerEvents: "none" }} />
  }

  const frag = fragments.find((f) => f.nodeId === hoverNodeId)
  if (!frag) return null
  const x = frag.x * scale, y = frag.y * scale, w = frag.width * scale, h = frag.height * scale

  if (zone === "top" || zone === "row-outer-top")
    return <rect x={x} y={y - 1} width={w} height={3} fill="#2563eb" rx={1} style={{ pointerEvents: "none" }} />
  if (zone === "bottom" || zone === "row-outer-bottom")
    return <rect x={x} y={y + h - 2} width={w} height={3} fill="#2563eb" rx={1} style={{ pointerEvents: "none" }} />
  if (zone === "center")
    return <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="5 3" rx={2} style={{ pointerEvents: "none" }} />
  if (zone === "row-stack-inner" && target.kind === "row-stack-inner") {
    const rowFrag = fragments.find((f) => f.nodeId === target.rowId)
    if (rowFrag) {
      const geom = getRowGeometry(doc, target.rowId, rowFrag.width, rowFrag.height)
      const sr = geom?.stackRects.find((r) => r.stackId === target.stackId)
      if (sr) return <rect x={(rowFrag.x + sr.left) * scale + 2} y={(rowFrag.y + sr.top) * scale + 2} width={sr.width * scale - 4} height={sr.height * scale - 4} fill="#dbeafe" fillOpacity={0.6} stroke="#2563eb" strokeWidth={1} strokeDasharray="4 2" rx={2} style={{ pointerEvents: "none" }} />
    }
  }
  if (zone === "left" || zone === "right") {
    const halfW = w / 2
    return <rect x={zone === "left" ? x : x + halfW} y={y} width={halfW} height={h} fill="#bfdbfe" fillOpacity={0.5} stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 2" rx={2} style={{ pointerEvents: "none" }} />
  }
  return null
}

// ─── Page View ────────────────────────────────────────────────────────────────

function PageView({
  page, doc, drag, scale, selectedNodeId, isLayoutLoading, inlineEditVisualFresh,
  inlineEditNodeId, inlineEditCaretIndex, inlineEditPageIndex, onInlineEditStart, onInlineEditChange, onInlineEditCaretChange, onInlineEditUserInteraction, onInlineEditHeightChange, onInlineEditEnd, onSplitParagraph, onMergeParagraph,
  pageKey, setPageRef, textMeasurer, onNodePointerDown, onBackgroundPointerDown,
  resizeDrag, onResizeStart, minHeightDrag, onMinHeightResizeStart,
  sectionIndex, marginDrag, onMarginResizeStart, showTextSegments, showDrift, driftMap, wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled, wysiwygTextDraftNodeId, wysiwygTextDraftText, wysiwygTextCaretOffset, wysiwygTextSelection, wysiwygTextDraftPaginationActive, wysiwygDraftVisualPreview, wysiwygTextPointerFragments, onWysiwygTextDraftChange, onWysiwygTextReflowDecision,
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
  wysiwygTextPointerFragments: WysiwygTextPointerFragmentTarget[]
  inlineEditNodeId: string | null
  inlineEditCaretIndex: number | null
  inlineEditPageIndex: number | null
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
  onResizeStart: (rowId: string, leftStackId: string, rightStackId: string, pairX: number, pairWidth: number, startClientX: number, pageKey: string) => void
  minHeightDrag: MinHeightDrag | null
  onMinHeightResizeStart: (rowId: string, rowFragY: number, pageKey: string) => void
  sectionIndex: number
  marginDrag: MarginDrag | null
  onMarginResizeStart: (sectionIndex: number, side: "top" | "right" | "bottom" | "left", currentMargins: { top: number; right: number; bottom: number; left: number }, pageWidthPt: number, pageHeightPt: number, pageKey: string, altKey: boolean) => void
}) {
  const W = page.width * scale
  const H = page.height * scale
  const hoverNodeId = drag?.preview?.hoverNodeId ?? null
  const SELECTABLE = new Set(["paragraph", "spacer", "row", "table", "table-cell", "toc"])
  const editFragmentRef = useRef<{ nodeId: string; pageKey: string; fragment: PageFragment } | null>(null)

  useEffect(() => {
    if (inlineEditNodeId == null) editFragmentRef.current = null
  }, [inlineEditNodeId])
  const wysiwygCaretMappingEnabled = wysiwygInlineEditEnabled || wysiwygTextEngineEnabled
  const visualDraftFragmentForPage = wysiwygDraftVisualPreview?.fragmentsByPageIndex.get(page.index) ?? null
  const hasRealVisualDraftFragment = visualDraftFragmentForPage
    ? page.fragments.some((fragment) =>
      fragment.nodeId === visualDraftFragmentForPage.nodeId &&
      fragment.nodeType === "paragraph"
    )
    : false
  const shiftedPageFragments = visualDraftFragmentForPage && !hasRealVisualDraftFragment
    ? shiftWysiwygDraftPreviewDownstreamFragments({
      fragments: page.fragments,
      draftFragment: visualDraftFragmentForPage,
      extraShiftY: (PARAGRAPH_CHROME_Y * 2 + PARAGRAPH_LIVE_PREVIEW_GAP_Y) / scale,
    })
    : page.fragments
  const renderFragments = visualDraftFragmentForPage && !hasRealVisualDraftFragment
    ? [visualDraftFragmentForPage, ...shiftedPageFragments]
    : shiftedPageFragments
  const activeInlineEditPageIndex = wysiwygDraftVisualPreview?.caretPageIndex ?? inlineEditPageIndex

  const resolveDisplayFragment = (fragment: PageFragment): PageFragment => (
    visualDraftFragmentForPage &&
    fragment.nodeId === visualDraftFragmentForPage.nodeId &&
    fragment.nodeType === "paragraph"
      ? visualDraftFragmentForPage
      : fragment
  )

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
        {renderFragments.map((f) => {
          const displayFragment = resolveDisplayFragment(f)
          return (
          <clipPath key={f.nodeId} id={`cp-${pageKey}-${f.nodeId}`}>
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
        const isHovered = f.nodeId === hoverNodeId
        const isLayoutNode = doc.document.sections.some((s) => s.nodes[f.nodeId] != null)
        const isDraggable = DRAGGABLE_TYPES.has(f.nodeType) && isLayoutNode
        const isSelectable = SELECTABLE.has(f.nodeType)
        const selectNodeId = f.nodeId
        const isSelected = f.nodeId === selectedNodeId
        const isTableCellParagraph = f.nodeType === "paragraph" && isTableCellId(doc, f.parentNodeId)
        const canInlineEditThisParagraph = f.nodeType === "paragraph" && canInlineEditParagraph(doc, f.nodeId)
        const visualDisplayFragment = resolveDisplayFragment(f)
        // For split paragraphs: only the fragment on the clicked page enters edit mode.
        // Without the pageIndex check, ALL fragments of the paragraph get isInlineEditing=true,
        // disabling pointer events and rendering textareas on every page the paragraph spans.
        const isInlineEditing = f.nodeId === inlineEditNodeId &&
          (activeInlineEditPageIndex == null || f.pageIndex === activeInlineEditPageIndex)
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
        const docNode = doc.document.sections.flatMap((s) => Object.values(s.nodes)).find((n) => n.id === f.nodeId)
        const isEmpty = f.nodeType === "stack" && docNode && "childIds" in docNode && (docNode as { childIds: string[] }).childIds.length === 0
        // visual override ระหว่าง resize
        let fragX = displayFragment.x, fragWidth = displayFragment.width, fragHeight = displayFragment.height
        if (resizeDrag && f.nodeType === "stack") {
          if (f.nodeId === resizeDrag.leftStackId) {
            fragWidth = resizeDrag.currentDocX - f.x
          } else if (f.nodeId === resizeDrag.rightStackId) {
            fragX = resizeDrag.currentDocX
            fragWidth = (f.x + f.width) - resizeDrag.currentDocX
          }
        }
        if (minHeightDrag && !minHeightDrag.committed) {
          if (f.nodeId === minHeightDrag.rowId || f.parentNodeId === minHeightDrag.rowId) {
            fragHeight = Math.max(fragHeight, minHeightDrag.currentMinHeight)
          }
        }
        const chromeTop = f.nodeType === "paragraph" ? PARAGRAPH_CHROME_Y : 0
        const chromeBottom = f.nodeType === "paragraph" ? PARAGRAPH_CHROME_Y : 0
        const chromeY = displayFragment.y * scale - chromeTop
        const chromeHeight = Math.max(fragHeight * scale + chromeTop + chromeBottom, 2)
        const fragmentKey = isInlineEditing
          ? `inline-edit-${f.nodeId}`
          : `${f.nodeType}-${f.nodeId}-${f.pageIndex}-${f.lineStart ?? "x"}-${f.lineEnd ?? "x"}-${f.parentNodeId ?? "root"}-${i}`

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
            onPointerDown={(isSelectable || f.nodeType === "stack") && !drag && !resizeDrag && !isInlineEditing
              ? (e) => {
                e.stopPropagation()
                const clickAction = canInlineEditThisParagraph && !isTableCellParagraph
                  ? {
                      type: "inline-edit" as const,
                      nodeId: f.nodeId,
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
            onDoubleClick={(f.nodeType === "paragraph" || f.nodeType === "table-cell") && !drag
              ? (e) => {
                e.stopPropagation()
                const paragraphId = f.nodeType === "table-cell" ? findFirstParagraphInCell(doc, f.nodeId) : f.nodeId
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
            style={{ cursor: isInlineEditing ? "text" : isDraggable && !drag ? "grab" : "default" }}
          >
            <rect
              x={fragX * scale} y={chromeY}
              width={Math.max(fragWidth * scale, 2)} height={chromeHeight}
              fill={isInlineEditing ? "#dbeafe" : color}
              stroke={isInlineEditing ? "#2563eb" : isHovered ? "#4b5563" : "#9ca3af"}
              strokeWidth={isInlineEditing ? 1.5 : isHovered ? 1 : 0.5}
              opacity={isInlineEditing ? 0.35 : 0.75}
            />
            {isSelected && !isInlineEditing && (
              <rect
                x={displayFragment.x * scale - 1} y={chromeY - 1}
                width={displayFragment.width * scale + 2} height={chromeHeight + 2}
                fill="none" stroke="#2563eb" strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
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
            <text x={displayFragment.x * scale + 3} y={displayFragment.y * scale + 8} fontSize={6} fill="#374151"
              style={{ pointerEvents: "none", userSelect: "none" }}>
              {f.nodeType}
            </text>
            {isEmpty && (
              <text
                x={(displayFragment.x + displayFragment.width / 2) * scale} y={(displayFragment.y + fragHeight / 2 + 3) * scale}
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

      {/* header/footer */}
      {[...page.headerFragments, ...page.footerFragments].map((f, i) => (
        <rect key={`hz-${i}`} x={f.x * scale} y={f.y * scale}
          width={f.width * scale} height={Math.max(f.height * scale, 2)}
          fill="#fef9c3" stroke="#9ca3af" strokeWidth={0.5} opacity={0.6} />
      ))}

      {/* resize handles — แสดงระหว่าง stacks ของแต่ละ row */}
      {!drag && page.fragments.filter((f) => f.nodeType === "row").map((rowFrag) => {
        const rowNode = doc.document.sections.flatMap((s) => Object.values(s.nodes)).find((n) => n.id === rowFrag.nodeId)
        if (rowNode?.type !== "row") return null
        return rowNode.childIds.slice(0, -1).map((leftStackId, i) => {
          const rightStackId = rowNode.childIds[i + 1]
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
                fill="transparent" style={{ cursor: "col-resize" }}
                onPointerDown={(e) => {
                  e.stopPropagation(); e.preventDefault()
                  onResizeStart(rowFrag.nodeId, leftStackId, rightStackId, leftFrag.x, leftFrag.width + rightFrag.width, e.clientX, pageKey)
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
  onResizeStart: (rowId: string, leftStackId: string, rightStackId: string, pairX: number, pairWidth: number, startClientX: number, pageKey: string) => void
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
}): WysiwygDraftVisualPreview | null {
  const paragraph = findParagraphNode(input.doc, input.nodeId)
  if (!paragraph || !isPlainTextParagraph(paragraph)) return null
  if (isTableCellId(input.doc, input.nodeId)) return null
  if (isParagraphInsideRowStack(input.doc, input.nodeId)) return null

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
    if (isTableCellId(input.doc, sourceFragment.parentNodeId)) return null
    if (isStackInsideRow(input.doc, sourceFragment.parentNodeId)) return null

    const draftLayout = buildWysiwygDraftParagraphLayout(
      sourceFragment,
      paragraph,
      input.draftText,
      input.textMeasurer,
      { allowContinuedFirstFragment: true },
    )
    if (!draftLayout) return null

    return createWysiwygDraftVisualPreview({
      nodeId: input.nodeId,
      fragments: splitWysiwygDraftVisualFragments({
        sourceFragment,
        draftLines: draftLayout.lines,
        draftHeight: draftLayout.height,
        pages: section.pages,
      }),
      caretOffset: input.caretOffset,
      textMeasurer: input.textMeasurer,
    })
  }

  return null
}

export function EditorCanvas({
  paginated, doc, drag, resizeDrag, minHeightDrag, marginDrag, scale, selectedNodeId, isLayoutLoading,
  textMeasurer,
  inlineEditVisualFresh, inlineEditNodeId, inlineEditCaretIndex, inlineEditPageIndex, onInlineEditStart, onInlineEditChange, onInlineEditCaretChange, onInlineEditUserInteraction, onInlineEditHeightChange, onInlineEditEnd, onSplitParagraph, onMergeParagraph,
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
    })
  }, [
    doc,
    inlineEditNodeId,
    paginated,
    textMeasurer,
    wysiwygTextCaretOffset,
    wysiwygTextDraftNodeId,
    wysiwygTextDraftText,
    wysiwygTextEngineEnabled,
  ])
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
    <div ref={containerRef} data-testid="editor-canvas" style={{ flex: 1, overflow: "auto", padding: 24, background: "#f3f4f6" }}>
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
