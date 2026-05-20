import { useState } from "react"
import type { CSSProperties, PointerEvent, ReactNode } from "react"
import type { DragSource, PaletteBlockType } from "@/placement/types"

interface PaletteItem {
  type: PaletteBlockType
  label: string
  desc: string
  icon: "paragraph" | "row" | "column" | "two-even" | "two-left" | "two-right" | "three" | "four" | "table"
  columnShares?: number[]
}

const LAYOUT_ITEMS: PaletteItem[] = [
  { type: "row", label: "Row", icon: "row", desc: "Full width", columnShares: [100] },
  { type: "flow-columns", label: "Column", icon: "column", desc: "Split stack" },
  { type: "flow-columns", label: "50 | 50", icon: "two-even", desc: "2 columns", columnShares: [50, 50] },
  { type: "flow-columns", label: "66 | 33", icon: "two-left", desc: "Wide left", columnShares: [66, 33] },
  { type: "flow-columns", label: "33 | 66", icon: "two-right", desc: "Wide right", columnShares: [33, 66] },
  { type: "flow-columns", label: "33 | 33 | 33", icon: "three", desc: "3 columns", columnShares: [33, 33, 33] },
  { type: "flow-columns", label: "25 | 25 | 25 | 25", icon: "four", desc: "4 columns", columnShares: [25, 25, 25, 25] },
]

const TEXT_ITEMS: PaletteItem[] = [
  { type: "paragraph", label: "Paragraph", icon: "paragraph", desc: "Text block" },
]

interface Props {
  onDragStart: (source: DragSource, e: PointerEvent) => void
  isDragging: boolean
}

function paletteSource(item: PaletteItem): DragSource {
  return {
    source: "palette",
    blockType: item.type,
    columnShares: item.columnShares,
  }
}

function startPaletteItemDrag(
  item: PaletteItem,
  isDragging: boolean,
  onDragStart: (source: DragSource, event: PointerEvent) => void,
  event: PointerEvent,
) {
  if (isDragging) return
  onDragStart(paletteSource(item), event)
}

function PaletteSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={paletteSection}>
      <div style={paletteSectionTitle}>
        <span style={paletteSectionCaret}>▾</span>
        <span>{title}</span>
      </div>
      {children}
    </section>
  )
}

function PaletteCard({
  item,
  isDragging,
  onDragStart,
}: {
  item: PaletteItem
  isDragging: boolean
  onDragStart: (source: DragSource, event: PointerEvent) => void
}) {
  return (
    <button
      type="button"
      data-testid={`palette-block-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      title={item.desc}
      onPointerDown={(event) => startPaletteItemDrag(item, isDragging, onDragStart, event)}
      style={{
        ...paletteCard,
        cursor: isDragging ? "not-allowed" : "grab",
        opacity: isDragging ? 0.58 : 1,
      }}
    >
      <PaletteIcon icon={item.icon} />
      <span style={paletteCardLabel}>{item.label}</span>
    </button>
  )
}

function PaletteIcon({ icon }: { icon: PaletteItem["icon"] }) {
  if (icon === "paragraph") {
    return <span style={paragraphIcon}>¶</span>
  }

  if (icon === "table") {
    return (
      <span style={tableIcon}>
        {Array.from({ length: 9 }).map((_, index) => <span key={index} style={tableIconCell} />)}
      </span>
    )
  }

  const bars = (() => {
    if (icon === "row") return [1]
    if (icon === "column") return [1]
    if (icon === "two-left") return [2, 1]
    if (icon === "two-right") return [1, 2]
    if (icon === "three") return [1, 1, 1]
    if (icon === "four") return [1, 1, 1, 1]
    return [1, 1]
  })()

  return (
    <span style={icon === "row" ? rowIcon : columnIcon}>
      {bars.map((weight, index) => (
        <span
          key={index}
          style={{
            ...(icon === "row" ? rowIconBar : columnIconBar),
            flex: weight,
          }}
        />
      ))}
    </span>
  )
}

function TablePicker({
  isDragging,
  onDragStart,
}: {
  isDragging: boolean
  onDragStart: (source: DragSource, event: PointerEvent) => void
}) {
  const [open, setOpen] = useState(false)
  const [hoverSize, setHoverSize] = useState<{ rows: number; columns: number }>({ rows: 3, columns: 3 })

  return (
    <div style={tablePickerShell}>
      <button
        type="button"
        data-testid="palette-table-picker-toggle"
        aria-expanded={open}
        title="Choose table size"
        onClick={() => setOpen((value) => !value)}
        style={paletteWideCard}
      >
        <PaletteIcon icon="table" />
        <span style={paletteCardLabel}>Table</span>
        <span style={tablePickerSizeLabel}>{hoverSize.rows} x {hoverSize.columns}</span>
      </button>
      {open && (
        <div data-testid="palette-table-picker" style={tablePickerPopover}>
          <div style={tablePickerGrid}>
            {Array.from({ length: 36 }).map((_, index) => {
              const rows = Math.floor(index / 6) + 1
              const columns = (index % 6) + 1
              const active = rows <= hoverSize.rows && columns <= hoverSize.columns
              return (
                <button
                  key={`${rows}-${columns}`}
                  type="button"
                  data-testid="palette-table-size"
                  aria-label={`${rows} x ${columns} table`}
                  onPointerEnter={() => setHoverSize({ rows, columns })}
                  onPointerDown={(event) => {
                    if (isDragging) return
                    onDragStart({
                      source: "palette",
                      blockType: "flow-table",
                      tableSize: { rows, columns },
                    }, event)
                  }}
                  style={{
                    ...tablePickerCell,
                    backgroundColor: active ? "#bfdbfe" : "#fff",
                    borderColor: active ? "#60a5fa" : "#cbd5e1",
                    cursor: isDragging ? "not-allowed" : "grab",
                  }}
                />
              )
            })}
          </div>
          <div style={tablePickerReadout}>{hoverSize.rows} x {hoverSize.columns}</div>
        </div>
      )}
    </div>
  )
}

export function EditorPalette({ onDragStart, isDragging }: Props) {
  return (
    <div style={paletteShell}>
      <PaletteSection title="Layout">
        <div style={layoutGrid}>
          {LAYOUT_ITEMS.map((item) => (
            <PaletteCard
              key={`${item.label}-${item.columnShares?.join("-") ?? "modifier"}`}
              item={item}
              isDragging={isDragging}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      </PaletteSection>

      <PaletteSection title="Table">
        <TablePicker isDragging={isDragging} onDragStart={onDragStart} />
      </PaletteSection>

      <PaletteSection title="Text">
        <div style={singleColumnList}>
          {TEXT_ITEMS.map((item) => (
            <PaletteCard
              key={item.type}
              item={item}
              isDragging={isDragging}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      </PaletteSection>
    </div>
  )
}

const paletteShell: CSSProperties = {
  background: "white",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderBottom: "1px solid #eef2f7",
}

const paletteSection: CSSProperties = {
  borderBottom: "1px solid #eef2f7",
}

const paletteSectionTitle: CSSProperties = {
  height: 30,
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "0 10px",
  fontSize: 11,
  color: "#475569",
  background: "#fff",
}

const paletteSectionCaret: CSSProperties = {
  color: "#64748b",
  fontSize: 10,
}

const layoutGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))",
  gap: 8,
  padding: 8,
}

const singleColumnList: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 8,
}

const paletteCard: CSSProperties = {
  minHeight: 74,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: 8,
  color: "#334155",
  fontFamily: "monospace",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
}

const paletteWideCard: CSSProperties = {
  ...paletteCard,
  minHeight: 64,
  width: "100%",
  flexDirection: "row",
  justifyContent: "flex-start",
  cursor: "pointer",
}

const paletteCardLabel: CSSProperties = {
  minWidth: 0,
  fontSize: 11,
  overflowWrap: "anywhere",
  textAlign: "center",
}

const paragraphIcon: CSSProperties = {
  width: 46,
  height: 34,
  display: "grid",
  placeItems: "center",
  border: "1px solid #94a3b8",
  borderRadius: 3,
  color: "#64748b",
  fontSize: 18,
}

const rowIcon: CSSProperties = {
  width: 48,
  height: 34,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  justifyContent: "center",
}

const rowIconBar: CSSProperties = {
  minHeight: 6,
  borderRadius: 2,
  background: "#64748b",
}

const columnIcon: CSSProperties = {
  width: 48,
  height: 34,
  display: "flex",
  gap: 4,
  justifyContent: "center",
}

const columnIconBar: CSSProperties = {
  minWidth: 6,
  borderRadius: 2,
  background: "#64748b",
}

const tableIcon: CSSProperties = {
  width: 42,
  height: 32,
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 2,
  padding: 3,
  border: "1px solid #94a3b8",
  borderRadius: 3,
  boxSizing: "border-box",
}

const tableIconCell: CSSProperties = {
  background: "#64748b",
  borderRadius: 1,
}

const tablePickerShell: CSSProperties = {
  position: "relative",
  padding: 8,
}

const tablePickerSizeLabel: CSSProperties = {
  marginLeft: "auto",
  flexShrink: 0,
  fontSize: 10,
  color: "#64748b",
}

const tablePickerPopover: CSSProperties = {
  marginTop: 8,
  border: "1px solid #dbeafe",
  borderRadius: 6,
  background: "#fff",
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
  padding: 8,
}

const tablePickerGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 18px)",
  gap: 3,
  justifyContent: "center",
}

const tablePickerCell: CSSProperties = {
  width: 18,
  height: 18,
  border: "1px solid #cbd5e1",
  borderRadius: 2,
  padding: 0,
}

const tablePickerReadout: CSSProperties = {
  marginTop: 7,
  fontSize: 10,
  color: "#475569",
  textAlign: "center",
}
