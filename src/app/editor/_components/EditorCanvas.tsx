"use client"

import { useRef, useEffect, useState } from "react"
import type { PaginatedDocument, PageFragment, PaginatedPage } from "@/pagination"
import type { DocumentNode } from "@/schema"
import type { DragSource } from "@/placement/types"
import type { DragState } from "./EditorShell"
import { getRowGeometry } from "@/placement/geometry"

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

      {/* content box guide */}
      <rect
        x={page.contentBox.x * scale} y={page.contentBox.y * scale}
        width={page.contentBox.width * scale} height={page.contentBox.height * scale}
        fill="none" stroke="#e5e7eb" strokeDasharray="4 2" strokeWidth={0.5}
      />

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
        // stack click → select parent row แทน
        const selectNodeId = f.nodeType === "stack" && f.parentNodeId ? f.parentNodeId : f.nodeId
        const isSelected = f.nodeId === selectedNodeId || (f.nodeType === "stack" && f.parentNodeId === selectedNodeId)
        const isInlineEditing = f.nodeId === inlineEditNodeId
        const docNode = doc.document.sections.flatMap((s) => Object.values(s.nodes)).find((n) => n.id === f.nodeId)
        const isEmpty = f.nodeType === "stack" && docNode && "childIds" in docNode && (docNode as { childIds: string[] }).childIds.length === 0

        return (
          <g
            key={i}
            onPointerDown={(isSelectable || f.nodeType === "stack") && !drag && !isInlineEditing
              ? (e) => { e.stopPropagation(); onNodePointerDown({ source: "document", nodeId: selectNodeId }, e) }
              : undefined}
            onDoubleClick={f.nodeType === "paragraph" && !drag
              ? (e) => { e.stopPropagation(); setEditHeight(Math.max(f.height * scale, 40)); onInlineEditStart(f.nodeId) }
              : undefined}
            style={{ cursor: isInlineEditing ? "text" : isDraggable && !drag ? "grab" : "default" }}
          >
            <rect
              x={f.x * scale} y={f.y * scale}
              width={f.width * scale} height={Math.max(f.height * scale, 2)}
              fill={isInlineEditing ? "#dbeafe" : color}
              stroke={isInlineEditing ? "#2563eb" : isHovered ? "#4b5563" : "#9ca3af"}
              strokeWidth={isInlineEditing ? 1.5 : isHovered ? 1 : 0.5}
              opacity={isInlineEditing ? 0.35 : 0.75}
            />
            {isSelected && !isInlineEditing && (
              <rect
                x={f.x * scale - 1} y={f.y * scale - 1}
                width={f.width * scale + 2} height={Math.max(f.height * scale, 2) + 2}
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
                x={(f.x + f.width / 2) * scale} y={(f.y + f.height / 2 + 3) * scale}
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
                    fontFamily: "Leelawadee, Tahoma, sans-serif",
                    fontSize: (f.renderProps?.fontSize ?? 12) * scale,
                    lineHeight: String(f.renderProps?.lineHeight ?? 1.5),
                    resize: "none",
                    overflow: "hidden",
                    padding: "3px 5px",
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
              if (isLayoutLoading && f.nodeType === "paragraph") {
                const liveText = getLiveParaText(doc, f.nodeId)
                const paginatedText = f.lines?.map((l) => l.text).join("") ?? ""
                if (liveText !== null && liveText !== paginatedText && f.lines?.length) {
                  const fl = f.lines[0]
                  return (
                    <text x={fl.x * scale} y={(fl.y + fl.height * 0.78) * scale}
                      fontSize={fs} fontFamily="Leelawadee, Tahoma, sans-serif"
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
                  fontFamily="Leelawadee, Tahoma, sans-serif"
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

      <DropHighlight doc={doc} drag={drag} fragments={page.fragments} scale={scale} contentBox={page.contentBox} />

      {isLayoutLoading && !drag && (
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
  onScaleChange: (scale: number) => void
}

export function EditorCanvas({
  paginated, doc, drag, scale, selectedNodeId, isLayoutLoading,
  inlineEditNodeId, onInlineEditStart, onInlineEditChange, onInlineEditEnd,
  setPageRef, onNodePointerDown, onBackgroundPointerDown, onScaleChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const pageWidth = paginated.sections[0]?.pages[0]?.width ?? 595
    const observer = new ResizeObserver(() => {
      const available = el.clientWidth - 48
      onScaleChange(Math.max(0.3, Math.min(2, available / pageWidth)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [paginated, onScaleChange])

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: "auto", padding: 24 }}>
      {paginated.sections.map((section, si) => (
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
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
