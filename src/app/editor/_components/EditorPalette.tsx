import type { DragSource, PaletteBlockType } from "@/placement/types"

const BLOCKS: { type: PaletteBlockType; label: string; icon: string; desc: string }[] = [
  { type: "paragraph", label: "Paragraph", icon: "¶", desc: "Text block" },
  { type: "row",       label: "Row",       icon: "▥", desc: "Single column" },
  { type: "columns",   label: "Columns",   icon: "⊞", desc: "Two columns" },
  { type: "table",     label: "Table",     icon: "⊡", desc: "3×3 table" },
  { type: "toc",       label: "TOC",       icon: "≡", desc: "Table of contents" },
]

interface Props {
  onDragStart: (source: DragSource, e: React.PointerEvent) => void
  isDragging: boolean
}

export function EditorPalette({ onDragStart, isDragging }: Props) {
  return (
    <div style={{
      width: 160, flexShrink: 0,
      borderRight: "1px solid #e5e7eb", background: "white",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 14px", fontSize: 10, fontWeight: "bold",
        color: "#9ca3af", borderBottom: "1px solid #f3f4f6", background: "#fafafa",
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        Blocks
      </div>

      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {BLOCKS.map(({ type, label, icon, desc }) => (
          <div
            key={type}
            onPointerDown={(e) => {
              if (isDragging) return
              onDragStart({ source: "palette", blockType: type }, e)
            }}
            style={{
              padding: "8px 10px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              cursor: isDragging ? "not-allowed" : "grab",
              display: "flex", alignItems: "center", gap: 8,
              background: "#fafafa",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!isDragging) (e.currentTarget as HTMLDivElement).style.background = "#f0f9ff"
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "#fafafa"
            }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: "bold", color: "#374151" }}>{label}</div>
              <div style={{ fontSize: 9, color: "#9ca3af" }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 14px", fontSize: 9, color: "#d1d5db", marginTop: "auto" }}>
        drag block onto canvas
      </div>
    </div>
  )
}
