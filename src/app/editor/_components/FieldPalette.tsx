import type { DragSource } from "@/placement/types"
import type { FieldRegistryV1 } from "@/fieldRegistry"

interface Props {
  registry: FieldRegistryV1
  onDragStart: (source: DragSource, e: React.PointerEvent) => void
  isDragging: boolean
}

function typeLabel(type: string): string {
  switch (type) {
    case "number": return "#"
    case "date": return "D"
    case "boolean": return "?"
    case "enum": return "E"
    case "image": return "I"
    case "collection": return "[]"
    default: return "T"
  }
}

export function FieldPalette({ registry, onDragStart, isDragging }: Props) {
  return (
    <div style={{
      padding: 8,
      borderTop: "1px solid #f3f4f6",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{
        padding: "2px 6px 6px",
        fontSize: 10,
        fontWeight: "bold",
        color: "#9ca3af",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}>
        Fields
      </div>

      {registry.fields.length === 0 ? (
        <div style={{ padding: "7px 8px", fontSize: 10, color: "#d1d5db", lineHeight: 1.4 }}>
          no registered fields
        </div>
      ) : registry.fields.map((field) => (
        <div
          key={field.key}
          data-testid="field-palette-item"
          onPointerDown={(e) => {
            if (isDragging) return
            onDragStart({ source: "field", field }, e)
          }}
          title={field.key}
          style={{
            padding: "7px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            cursor: isDragging ? "not-allowed" : "grab",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#fff",
          }}
        >
          <span style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: "#eef2ff",
            color: "#3730a3",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontWeight: 700,
          }}>
            {typeLabel(field.fieldType)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: "bold", color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {field.label ?? field.key}
            </div>
            <div style={{ fontSize: 9, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {field.key}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
