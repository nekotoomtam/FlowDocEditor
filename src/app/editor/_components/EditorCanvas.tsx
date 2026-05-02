import { useRef, useEffect } from "react"
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

// ─── Drop Highlight ───────────────────────────────────────────────────────────

function DropHighlight({
  doc,
  drag,
  fragments,
  scale,
}: {
  doc: DocumentNode
  drag: DragState | null
  fragments: PageFragment[]
  scale: number
}) {
  if (!drag?.preview?.isValid || !drag.preview.placement) return null

  const { hoverNodeId, zone, target } = drag.preview

  if (!hoverNodeId || !zone || !target) return null

  const frag = fragments.find((f) => f.nodeId === hoverNodeId)
  if (!frag) return null

  const x = frag.x * scale
  const y = frag.y * scale
  const w = frag.width * scale
  const h = frag.height * scale

  // insert-before / row-outer-top → line at top
  if (zone === "top" || zone === "row-outer-top") {
    return <rect x={x} y={y - 1} width={w} height={3} fill="#2563eb" rx={1} style={{ pointerEvents: "none" }} />
  }

  // insert-after / row-outer-bottom → line at bottom
  if (zone === "bottom" || zone === "row-outer-bottom") {
    return <rect x={x} y={y + h - 2} width={w} height={3} fill="#2563eb" rx={1} style={{ pointerEvents: "none" }} />
  }

  // insert-into-container / center → dashed border
  if (zone === "center") {
    return (
      <rect
        x={x + 2} y={y + 2} width={w - 4} height={h - 4}
        fill="none" stroke="#2563eb" strokeWidth={1.5}
        strokeDasharray="5 3" rx={2}
        style={{ pointerEvents: "none" }}
      />
    )
  }

  // row-stack-inner → highlight the column band
  if (zone === "row-stack-inner" && target.kind === "row-stack-inner") {
    const rowFrag = fragments.find((f) => f.nodeId === target.rowId)
    if (rowFrag) {
      const geom = getRowGeometry(doc, target.rowId, rowFrag.width, rowFrag.height)
      const stackRect = geom?.stackRects.find((r) => r.stackId === target.stackId)
      if (stackRect) {
        return (
          <rect
            x={(rowFrag.x + stackRect.left) * scale + 2}
            y={(rowFrag.y + stackRect.top) * scale + 2}
            width={stackRect.width * scale - 4}
            height={stackRect.height * scale - 4}
            fill="#dbeafe" fillOpacity={0.6} stroke="#2563eb" strokeWidth={1}
            strokeDasharray="4 2" rx={2}
            style={{ pointerEvents: "none" }}
          />
        )
      }
    }
  }

  // left / right → half-highlight on hovered fragment
  if (zone === "left" || zone === "right") {
    const halfW = w / 2
    return (
      <rect
        x={zone === "left" ? x : x + halfW}
        y={y}
        width={halfW}
        height={h}
        fill="#bfdbfe" fillOpacity={0.5} stroke="#2563eb" strokeWidth={1.5}
        strokeDasharray="4 2" rx={2}
        style={{ pointerEvents: "none" }}
      />
    )
  }

  return null
}

// ─── Page View ────────────────────────────────────────────────────────────────

function getLiveParaText(doc: DocumentNode, nodeId: string): string | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      return node.children.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("")
    }
  }
  return null
}

function PageView({
  page,
  doc,
  drag,
  scale,
  selectedNodeId,
  isLayoutLoading,
  pageKey,
  setPageRef,
  onNodePointerDown,
}: {
  page: PaginatedPage
  doc: DocumentNode
  drag: DragState | null
  scale: number
  selectedNodeId: string | null
  isLayoutLoading: boolean
  pageKey: string
  setPageRef: (key: string, el: SVGSVGElement | null) => void
  onNodePointerDown: (source: DragSource, e: React.PointerEvent) => void
}) {
  const W = page.width * scale
  const H = page.height * scale
  const hoverNodeId = drag?.preview?.hoverNodeId ?? null
  const SELECTABLE = new Set(["paragraph", "spacer", "row", "table", "stack", "toc"])

  return (
    <svg
      ref={(el) => setPageRef(pageKey, el)}
      width={W}
      height={H}
      style={{ border: "1px solid #d1d5db", background: "white", display: "block" }}
    >
      {/* content box guide */}
      <rect
        x={page.contentBox.x * scale} y={page.contentBox.y * scale}
        width={page.contentBox.width * scale} height={page.contentBox.height * scale}
        fill="none" stroke="#e5e7eb" strokeDasharray="4 2" strokeWidth={0.5}
      />

      {/* fragments */}
      {page.fragments.map((f, i) => {
        const color = NODE_COLORS[f.nodeType] ?? "#f3f4f6"
        const isHovered = f.nodeId === hoverNodeId
        const isLayoutNode = doc.document.sections.some((s) => s.nodes[f.nodeId] != null)
        const isDraggable = DRAGGABLE_TYPES.has(f.nodeType) && isLayoutNode
        const isSelectable = SELECTABLE.has(f.nodeType)
        const isSelected = f.nodeId === selectedNodeId

        return (
          <g
            key={i}
            onPointerDown={isSelectable && !drag ? (e) => {
              e.stopPropagation()
              onNodePointerDown({ source: "document", nodeId: f.nodeId }, e)
            } : undefined}
            style={{ cursor: isDraggable && !drag ? "grab" : "default" }}
          >
            <rect
              x={f.x * scale} y={f.y * scale}
              width={f.width * scale} height={Math.max(f.height * scale, 2)}
              fill={color}
              stroke={isHovered ? "#4b5563" : "#9ca3af"}
              strokeWidth={isHovered ? 1 : 0.5}
              opacity={0.75}
            />
            {isSelected && (
              <rect
                x={f.x * scale - 1} y={f.y * scale - 1}
                width={f.width * scale + 2} height={Math.max(f.height * scale, 2) + 2}
                fill="none" stroke="#2563eb" strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
            )}
            <text
              x={f.x * scale + 3} y={f.y * scale + 8}
              fontSize={6} fill="#374151"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {f.nodeType}
            </text>
            {(() => {
              const rp = f.renderProps
              const fs = (rp?.fontSize ?? 8) * scale

              // dumb renderer: เมื่อ loading ให้แสดง live text จาก doc แทน stale lines
              if (isLayoutLoading && f.nodeType === "paragraph") {
                const liveText = getLiveParaText(doc, f.nodeId)
                const paginatedText = f.lines?.map((l) => l.text).join("") ?? ""
                if (liveText !== null && liveText !== paginatedText && f.lines?.length) {
                  const firstLine = f.lines[0]
                  return (
                    <text
                      x={firstLine.x * scale}
                      y={(firstLine.y + firstLine.height * 0.78) * scale}
                      fontSize={fs}
                      fontFamily="Leelawadee, Tahoma, sans-serif"
                      fill="#1e40af"
                      opacity={0.75}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {liveText}
                    </text>
                  )
                }
              }

              return f.lines?.map((line, li) => (
                <text
                  key={li}
                  x={line.x * scale}
                  y={(line.y + line.height * 0.78) * scale}
                  fontSize={line.fontSize ? line.fontSize * scale : fs}
                  fontFamily="Leelawadee, Tahoma, sans-serif"
                  fill="#1e40af"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {line.text}
                </text>
              )) ?? null
            })()}
          </g>
        )
      })}

      {/* header/footer fragments */}
      {[...page.headerFragments, ...page.footerFragments].map((f, i) => (
        <rect
          key={`hz-${i}`}
          x={f.x * scale} y={f.y * scale}
          width={f.width * scale} height={Math.max(f.height * scale, 2)}
          fill="#fef9c3" stroke="#9ca3af" strokeWidth={0.5} opacity={0.6}
        />
      ))}

      {/* drop highlight overlay */}
      <DropHighlight doc={doc} drag={drag} fragments={page.fragments} scale={scale} />

      {/* layout loading dim */}
      {isLayoutLoading && !drag && (
        <rect x={0} y={0} width={W} height={H} fill="white" opacity={0.18} style={{ pointerEvents: "none" }} />
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
  setPageRef: (key: string, el: SVGSVGElement | null) => void
  onNodePointerDown: (source: DragSource, e: React.PointerEvent) => void
  onScaleChange: (scale: number) => void
}

export function EditorCanvas({ paginated, doc, drag, scale, selectedNodeId, isLayoutLoading, setPageRef, onNodePointerDown, onScaleChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const pageWidth = paginated.sections[0]?.pages[0]?.width ?? 595
    const observer = new ResizeObserver(() => {
      const available = el.clientWidth - 48 // 24px padding each side
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
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>
                  Page {page.index + 1}
                </div>
                <PageView
                  page={page}
                  doc={doc}
                  drag={drag}
                  scale={scale}
                  selectedNodeId={selectedNodeId}
                  isLayoutLoading={isLayoutLoading}
                  pageKey={`${si}-${pi}`}
                  setPageRef={setPageRef}
                  onNodePointerDown={onNodePointerDown}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
