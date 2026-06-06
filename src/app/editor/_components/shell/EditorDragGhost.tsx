import type * as React from "react"
import type { DragSource } from "@/placement/types"
import type { DragState } from "../editorInteractionTypes"

export function describeDragSource(source: DragSource): string {
  if (source.source === "palette") {
    if (source.tableSize) return `Table ${source.tableSize.rows} x ${source.tableSize.columns}`
    if (source.columnShares && source.columnShares.length > 1) return source.columnShares.map((share) => Math.round(share)).join(" | ")
    if (source.blockType === "paragraph") return "Paragraph"
    if (source.blockType === "divider") return "Divider"
    if (source.blockType === "page-break") return "Page break"
    if (source.blockType === "toc") return "TOC"
    if (source.blockType === "row") return "Row"
    if (source.blockType === "flow-columns" || source.blockType === "columns") return "Column"
    if (source.blockType === "flow-table") return "Table"
    return source.blockType
  }
  if (source.source === "field") return source.field.label ?? source.field.key
  if (source.source === "document-copy") return "Copy"
  return "node"
}

function dragFieldTypeLabel(source: DragSource): string {
  if (source.source !== "field") return ""
  switch (source.field.fieldType) {
    case "number": return "#"
    case "date": return "D"
    case "boolean": return "?"
    case "enum": return "E"
    case "image": return "I"
    case "collection": return "[]"
    default: return "T"
  }
}

function DragGhostIcon({ source }: { source: DragSource }) {
  if (source.source === "field") {
    return <span style={dragGhostFieldIcon}>{dragFieldTypeLabel(source)}</span>
  }
  if (source.source === "document") {
    return <span style={dragGhostDocumentIcon}>N</span>
  }
  if (source.source === "document-copy") {
    return <span style={dragGhostDocumentIcon}>C</span>
  }
  if (source.blockType === "paragraph") {
    return <span style={dragGhostDocumentIcon}>{"\u00b6"}</span>
  }
  if (source.blockType === "divider") {
    return <span style={dragGhostDocumentIcon}>-</span>
  }
  if (source.blockType === "page-break") {
    return <span style={dragGhostDocumentIcon}>PB</span>
  }
  if (source.blockType === "toc") {
    return <span style={dragGhostDocumentIcon}>TOC</span>
  }
  if (source.blockType === "flow-table") {
    return (
      <span style={dragGhostTableIcon}>
        {Array.from({ length: 9 }).map((_, index) => <span key={index} style={dragGhostTableCell} />)}
      </span>
    )
  }

  const shares = source.columnShares ?? (source.blockType === "row" ? [100] : [1])
  const isRow = source.blockType === "row"
  return (
    <span style={isRow ? dragGhostRowIcon : dragGhostColumnIcon}>
      {shares.map((share, index) => (
        <span
          key={`${share}-${index}`}
          style={{
            ...(isRow ? dragGhostRowBar : dragGhostColumnBar),
            flex: Math.max(1, share),
          }}
        />
      ))}
    </span>
  )
}

export function EditorDragGhost({ drag }: { drag: DragState | null }) {
  if (!drag) return null
  return (
    <div
      data-testid="editor-drag-ghost"
      aria-hidden="true"
      style={{
        ...editorDragGhostStyle,
        transform: `translate3d(${drag.clientX + 14}px, ${drag.clientY + 12}px, 0)`,
      }}
    >
      <DragGhostIcon source={drag.source} />
      <span style={editorDragGhostLabel}>{describeDragSource(drag.source)}</span>
    </div>
  )
}

const editorDragGhostStyle: React.CSSProperties = {
  position: "fixed",
  top: -10,
  left: -45,
  zIndex: 12000,
  maxWidth: 220,
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 9px",
  border: "1px solid #bfdbfe",
  borderRadius: 6,
  backgroundColor: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(37, 99, 235, 0.16)",
  color: "#1e293b",
  fontSize: 11,
  pointerEvents: "none",
  userSelect: "none",
  boxSizing: "border-box",
}

const editorDragGhostLabel: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 700,
}

const dragGhostDocumentIcon: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "grid",
  placeItems: "center",
  border: "1px solid #93c5fd",
  borderRadius: 5,
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: 13,
  fontWeight: 800,
  flexShrink: 0,
}

const dragGhostFieldIcon: React.CSSProperties = {
  ...dragGhostDocumentIcon,
  borderColor: "#c7d2fe",
  backgroundColor: "#eef2ff",
  color: "#3730a3",
  fontSize: 10,
}

const dragGhostRowIcon: React.CSSProperties = {
  width: 28,
  height: 22,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 3,
  flexShrink: 0,
}

const dragGhostRowBar: React.CSSProperties = {
  minHeight: 5,
  borderRadius: 2,
  backgroundColor: "#64748b",
}

const dragGhostColumnIcon: React.CSSProperties = {
  width: 28,
  height: 22,
  display: "flex",
  justifyContent: "center",
  gap: 3,
  flexShrink: 0,
}

const dragGhostColumnBar: React.CSSProperties = {
  minWidth: 5,
  borderRadius: 2,
  backgroundColor: "#64748b",
}

const dragGhostTableIcon: React.CSSProperties = {
  width: 24,
  height: 22,
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 2,
  padding: 3,
  border: "1px solid #93c5fd",
  borderRadius: 4,
  backgroundColor: "#eff6ff",
  boxSizing: "border-box",
  flexShrink: 0,
}

const dragGhostTableCell: React.CSSProperties = {
  backgroundColor: "#64748b",
  borderRadius: 1,
}
