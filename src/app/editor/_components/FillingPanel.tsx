import type { DocumentNode, TableNode } from "@/schema"
import type { FieldData } from "@/binding"
import { SAMPLE_FIELD_REGISTRY } from "@/app/_lib/fieldRegistry"

interface UsedField {
  key: string
  label?: string
  fieldType: string
  required?: boolean
}

interface Props {
  doc: DocumentNode
  data: FieldData
  onChange: (key: string, value: string | number | boolean | null) => void
}

function collectUsedFieldKeys(doc: DocumentNode): Set<string> {
  const keys = new Set<string>()
  doc.document.sections.forEach((section) => {
    Object.values(section.nodes).forEach((node) => {
      if (node.type === "paragraph") {
        node.children.forEach((child) => {
          if (child.type === "fieldRef") keys.add(child.key)
        })
      }
      if (node.type === "table") {
        Object.values((node as unknown as TableNode).nodes).forEach((inner) => {
          if (inner.type !== "paragraph") return
          inner.children.forEach((child) => {
            if (child.type === "fieldRef") keys.add(child.key)
          })
        })
      }
    })
  })
  return keys
}

function readFieldValue(data: FieldData, key: string): string {
  const value = key.split(".").reduce<unknown>((obj, part) => {
    if (typeof obj !== "object" || obj == null || Array.isArray(obj)) return undefined
    return (obj as Record<string, unknown>)[part]
  }, data)
  return value == null ? "" : String(value)
}

function fieldInputType(fieldType: string): string {
  if (fieldType === "number") return "number"
  if (fieldType === "date") return "date"
  return "text"
}

export function FillingPanel({ doc, data, onChange }: Props) {
  const usedKeys = collectUsedFieldKeys(doc)
  const fields: UsedField[] = SAMPLE_FIELD_REGISTRY
    .filter((field) => usedKeys.has(field.key))
    .map((field) => ({
      key: field.key,
      label: field.label,
      fieldType: field.fieldType,
      required: field.required,
    }))

  const unknownFields: UsedField[] = [...usedKeys]
    .filter((key) => !fields.some((field) => field.key === key))
    .map((key) => ({ key, label: key, fieldType: "text" }))

  const allFields = [...fields, ...unknownFields]

  return (
    <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
      <div style={{ padding: "8px 14px", fontSize: 10, fontWeight: "bold", color: "#9ca3af", borderBottom: "1px solid #f3f4f6", background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Filling
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {allFields.length === 0 ? (
          <div style={{ fontSize: 11, color: "#d1d5db" }}>no fields in template</div>
        ) : allFields.map((field) => (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "#6b7280" }}>
              {field.label ?? field.key}{field.required ? " *" : ""}
            </span>
            <input
              type={fieldInputType(field.fieldType)}
              value={readFieldValue(data, field.key)}
              onChange={(e) => {
                const raw = e.target.value
                onChange(field.key, field.fieldType === "number" && raw !== "" ? Number(raw) : raw)
              }}
              style={{
                width: "100%",
                fontSize: 11,
                border: "1px solid #e5e7eb",
                borderRadius: 4,
                padding: "4px 6px",
                boxSizing: "border-box",
                fontFamily: "monospace",
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
