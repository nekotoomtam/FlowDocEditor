"use client"

import { useRef, useEffect, useState } from "react"
import type { PaginatedDocument, PageFragment, PaginatedPage } from "@/pagination"
import type { DocumentNode } from "@/schema"
import type { DragSource } from "@/placement/types"
import type { DragState, ResizeDrag, MinHeightDrag, MarginDrag } from "./EditorShell"
import { getRowGeometry } from "@/placement/geometry"
import { resolveFontCssFamily } from "@/font-registry"

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  paragraph: "#bfdbfe",
  spacer:    "#d1d5db",
  row:       "#fed7aa",
  stack:     "#e9d5ff",
  body:      "#bbf7d0",
  table:     "#fde68a",
  toc:       "#d1fae5",
}

const DRAGGABLE_TYPES = new Set(["paragraph", "spacer", "row", "table", "toc"])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLiveParaText(doc: DocumentNode, nodeId: string): string | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      return node.children.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("")
    }
  }
  return null
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
  page, doc, drag, scale, selectedNodeId, isLayoutLoading,
  inlineEditNodeId, onInlineEditStart, onInlineEditChange, onInlineEditEnd,
  pageKey, setPageRef, onNodePointerDown, onBackgroundPointerDown,
  resizeDrag, onResizeStart, minHeightDrag, onMinHeightResizeStart,
  sectionIndex, marginDrag, onMarginResizeStart,
}: {
  page: PaginatedPage; doc: DocumentNode; drag: DragState | null
  scale: number; selectedNodeId: string | null; isLayoutLoading: boolean
  inlineEditNodeId: string | null
  onInlineEditStart: (nodeId: string) => void
  onInlineEditChange: (nodeId: string, text: string) => void
  onInlineEditEnd: () => void
  pageKey: string; setPageRef: (key: string, el: SVGSVGElement | null) => void
  onNodePointerDown: (source: DragSource, e: React.PointerEvent) => void
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
  const SELECTABLE = new Set(["paragraph", "spacer", "row", "table", "toc"])

  // foreignObject textarea auto-grow height
  const [editHeight, setEditHeight] = useState(40)

  // reset editHeight when switching to a different node
  const prevEditNodeRef = useRef<string | null>(null)
  if (prevEditNodeRef.current !== inlineEditNodeId) {
    prevEditNodeRef.current = inlineEditNodeId
    // will set after mount via ref callback
  }

  return (
    // overflow: visible — ให้ inline editor ขยายเกิน SVG boundary ได้
    <svg
      ref={(el) => setPageRef(pageKey, el)}
      width={W} height={H}
      overflow="visible"
      style={{ border: "1px solid #d1d5db", background: "white", display: "block" }}
      onPointerDown={!drag ? onBackgroundPointerDown : undefined}
    >
      {/* clipPaths — ป้องกัน text overflow ออกนอก fragment width */}
      <defs>
        {page.fragments.map((f) => (
          <clipPath key={f.nodeId} id={`cp-${pageKey}-${f.nodeId}`}>
            <rect x={f.x * scale} y={f.y * scale} width={f.width * scale} height={9999} />
          </clipPath>
        ))}
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
      {page.fragments.map((f, i) => {
        const color = NODE_COLORS[f.nodeType] ?? "#f3f4f6"
        const isHovered = f.nodeId === hoverNodeId
        const isLayoutNode = doc.document.sections.some((s) => s.nodes[f.nodeId] != null)
        const isDraggable = DRAGGABLE_TYPES.has(f.nodeType) && isLayoutNode
        const isSelectable = SELECTABLE.has(f.nodeType)
        const selectNodeId = f.nodeId
        const isSelected = f.nodeId === selectedNodeId
        const isInlineEditing = f.nodeId === inlineEditNodeId
        const docNode = doc.document.sections.flatMap((s) => Object.values(s.nodes)).find((n) => n.id === f.nodeId)
        const isEmpty = f.nodeType === "stack" && docNode && "childIds" in docNode && (docNode as { childIds: string[] }).childIds.length === 0
        const editFontSize = (f.renderProps?.fontSize ?? 12) * scale
        const editLineHeight = (f.renderProps?.lineHeight ?? (f.renderProps?.fontSize ?? 12) * 1.5) * scale

        // visual override ระหว่าง resize
        let fragX = f.x, fragWidth = f.width, fragHeight = f.height
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

        return (
          <g
            key={i}
            onPointerDown={(isSelectable || f.nodeType === "stack") && !drag && !resizeDrag && !isInlineEditing
              ? (e) => { e.stopPropagation(); onNodePointerDown({ source: "document", nodeId: selectNodeId }, e) }
              : undefined}
            onDoubleClick={f.nodeType === "paragraph" && !drag
              ? (e) => { e.stopPropagation(); setEditHeight(Math.max(f.height * scale, 40)); onInlineEditStart(f.nodeId) }
              : undefined}
            style={{ cursor: isInlineEditing ? "text" : isDraggable && !drag ? "grab" : "default" }}
          >
            <rect
              x={fragX * scale} y={f.y * scale}
              width={Math.max(fragWidth * scale, 2)} height={Math.max(fragHeight * scale, 2)}
              fill={isInlineEditing ? "#dbeafe" : color}
              stroke={isInlineEditing ? "#2563eb" : isHovered ? "#4b5563" : "#9ca3af"}
              strokeWidth={isInlineEditing ? 1.5 : isHovered ? 1 : 0.5}
              opacity={isInlineEditing ? 0.35 : 0.75}
            />
            {isSelected && !isInlineEditing && (
              <rect
                x={f.x * scale - 1} y={f.y * scale - 1}
                width={f.width * scale + 2} height={Math.max(fragHeight * scale, 2) + 2}
                fill="none" stroke="#2563eb" strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
            )}
            <text x={f.x * scale + 3} y={f.y * scale + 8} fontSize={6} fill="#374151"
              style={{ pointerEvents: "none", userSelect: "none" }}>
              {f.nodeType}
            </text>
            {isEmpty && (
              <text
                x={(f.x + f.width / 2) * scale} y={(f.y + fragHeight / 2 + 3) * scale}
                textAnchor="middle" fontSize={8 * scale} fill="#9ca3af"
                style={{ pointerEvents: "none", userSelect: "none" }}>
                วางที่นี่
              </text>
            )}

            {/* ── text lines หรือ inline editor ── */}
            {isInlineEditing ? (
              // foreignObject: coordinate system เดียวกับ SVG → width ถูกต้องเสมอ
              <foreignObject
                x={f.x * scale}
                y={f.y * scale}
                width={f.width * scale}
                height={Math.max(editHeight, f.height * scale, 40)}
              >
                <textarea
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  {...{ xmlns: "http://www.w3.org/1999/xhtml" } as any}
                  autoFocus
                  defaultValue={getLiveParaText(doc, f.nodeId) ?? ""}
                  style={{
                    width: "100%",
                    height: "100%",
                    minHeight: Math.max(f.height * scale, 40),
                    background: "rgba(219,234,254,0.97)",
                    border: "none",
                    outline: "2px solid #2563eb",
                    outlineOffset: -2,
                    borderRadius: 2,
                    fontFamily: resolveFontCssFamily(f.renderProps?.fontFamilyKey),
                    fontSize: editFontSize,
                    lineHeight: `${editLineHeight}px`,
                    resize: "none",
                    overflow: "hidden",
                    padding: 0,
                    boxSizing: "border-box",
                  }}
                  onInput={(e) => {
                    const el = e.currentTarget
                    el.style.height = "auto"
                    const sh = Math.max(el.scrollHeight, f.height * scale, 40)
                    el.style.height = sh + "px"
                    setEditHeight(sh)
                    onInlineEditChange(f.nodeId, el.value)
                  }}
                  onBlur={onInlineEditEnd}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === "Escape") { e.preventDefault(); onInlineEditEnd() }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </foreignObject>
            ) : (() => {
              const rp = f.renderProps
              const fs = (rp?.fontSize ?? 8) * scale
              const clipId = `url(#cp-${pageKey}-${f.nodeId})`

              // dumb renderer: เมื่อ loading และ text เปลี่ยน → แสดง live text
              if (isLayoutLoading && !inlineEditNodeId && f.nodeType === "paragraph") {
                const liveText = getLiveParaText(doc, f.nodeId)
                const paginatedText = f.lines?.map((l) => l.text).join("") ?? ""
                if (liveText !== null && liveText !== paginatedText && f.lines?.length) {
                  const fl = f.lines[0]
                  return (
                    <text x={fl.x * scale} y={(fl.y + fl.height * 0.78) * scale}
                      fontSize={fs} fontFamily={resolveFontCssFamily(f.renderProps?.fontFamilyKey)}
                      fill="#1e40af" opacity={0.75} clipPath={clipId}
                      style={{ pointerEvents: "none", userSelect: "none" }}>
                      {liveText}
                    </text>
                  )
                }
              }

              return f.lines?.map((line, li) => (
                <text key={li}
                  x={line.x * scale} y={(line.y + line.height * 0.78) * scale}
                  fontSize={line.fontSize ? line.fontSize * scale : fs}
                  fontFamily={resolveFontCssFamily(f.renderProps?.fontFamilyKey)}
                  fill="#1e40af" clipPath={clipId}
                  style={{ pointerEvents: "none", userSelect: "none" }}>
                  {line.text}
                </text>
              )) ?? null
            })()}
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
  inlineEditNodeId: string | null
  onInlineEditStart: (nodeId: string) => void
  onInlineEditChange: (nodeId: string, text: string) => void
  onInlineEditEnd: () => void
  setPageRef: (key: string, el: SVGSVGElement | null) => void
  onNodePointerDown: (source: DragSource, e: React.PointerEvent) => void
  onBackgroundPointerDown: () => void
  onResizeStart: (rowId: string, leftStackId: string, rightStackId: string, pairX: number, pairWidth: number, startClientX: number, pageKey: string) => void
  onMinHeightResizeStart: (rowId: string, rowFragY: number, pageKey: string) => void
  marginDrag: MarginDrag | null
  onMarginResizeStart: (sectionIndex: number, side: "top" | "right" | "bottom" | "left", currentMargins: { top: number; right: number; bottom: number; left: number }, pageWidthPt: number, pageHeightPt: number, pageKey: string, altKey: boolean) => void
  onScaleChange: (scale: number) => void
}

export function EditorCanvas({
  paginated, doc, drag, resizeDrag, minHeightDrag, marginDrag, scale, selectedNodeId, isLayoutLoading,
  inlineEditNodeId, onInlineEditStart, onInlineEditChange, onInlineEditEnd,
  setPageRef, onNodePointerDown, onBackgroundPointerDown, onResizeStart, onMinHeightResizeStart, onMarginResizeStart, onScaleChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sections = Array.isArray(paginated.sections) ? paginated.sections : []

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const pageWidth = sections[0]?.pages[0]?.width ?? 595
    const observer = new ResizeObserver(() => {
      const available = el.clientWidth - 48
      onScaleChange(Math.max(0.3, Math.min(2, available / pageWidth)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [sections, onScaleChange])

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: "auto", padding: 24 }}>
      {sections.map((section, si) => (
        <div key={si} style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 10 }}>
            Section {si + 1} · {section.pages.length} page{section.pages.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            {section.pages.map((page, pi) => (
              <div key={pi}>
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>Page {page.index + 1}</div>
                <PageView
                  page={page} doc={doc} drag={drag} scale={scale}
                  selectedNodeId={selectedNodeId} isLayoutLoading={isLayoutLoading}
                  inlineEditNodeId={inlineEditNodeId}
                  onInlineEditStart={onInlineEditStart}
                  onInlineEditChange={onInlineEditChange}
                  onInlineEditEnd={onInlineEditEnd}
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
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
