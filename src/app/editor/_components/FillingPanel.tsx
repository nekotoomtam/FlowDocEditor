import type { DataSnapshotV1, FieldScalarValue } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DocumentDataReadinessIssue } from "@/readiness"
import type { DocumentNode, FlowTableNode, TableNode } from "@/schema"

interface UsedField {
  key: string
  label?: string
  fieldType: string
  required?: boolean
}

interface Props {
  doc: DocumentNode
  registry: FieldRegistryV1
  snapshot: DataSnapshotV1
  readinessIssues?: DocumentDataReadinessIssue[]
  onChange: (key: string, value: FieldScalarValue) => void
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
      if (node.type === "table" || node.type === "flow-table") {
        Object.values((node as unknown as TableNode | FlowTableNode).nodes).forEach((inner) => {
          if (inner.type !== "paragraph") return
          inner.children.forEach((child: { type: string; key?: string }) => {
            if (child.type === "fieldRef" && typeof child.key === "string") keys.add(child.key)
          })
        })
      }
    })
  })
  return keys
}

function readFieldValue(snapshot: DataSnapshotV1, key: string): string {
  const value = snapshot.values[key]
  return value == null ? "" : String(value)
}

function fieldInputType(fieldType: string): string {
  if (fieldType === "number") return "number"
  if (fieldType === "date") return "date"
  return "text"
}

export function FillingPanel({ doc, registry, snapshot, readinessIssues = [], onChange }: Props) {
  const errorCount = readinessIssues.filter((issue) => issue.severity === "error").length
  const warningCount = readinessIssues.filter((issue) => issue.severity === "warning").length
  const usedKeys = collectUsedFieldKeys(doc)
  const fields: UsedField[] = registry.fields
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
    <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", fontSize: 10, fontWeight: "bold", color: "#9ca3af", borderBottom: "1px solid #f3f4f6", background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Filling
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {readinessIssues.length > 0 && (
          <div
            data-testid="filling-readiness"
            style={{
              border: `1px solid ${errorCount > 0 ? "#fecaca" : "#fde68a"}`,
              background: errorCount > 0 ? "#fef2f2" : "#fffbeb",
              color: errorCount > 0 ? "#991b1b" : "#92400e",
              borderRadius: 4,
              padding: "7px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: "bold" }}>
              {errorCount > 0 ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : `${warningCount} warning${warningCount === 1 ? "" : "s"}`}
            </div>
            {readinessIssues.slice(0, 3).map((issue, index) => (
              <div
                key={`${issue.source}:${issue.key}:${issue.code}:${index}`}
                title={issue.message}
                style={{ fontSize: 10, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {issue.key}: {issue.message}
              </div>
            ))}
          </div>
        )}
        {allFields.length === 0 ? (
          <div style={{ fontSize: 11, color: "#d1d5db" }}>no fields in template</div>
        ) : allFields.map((field) => (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "#6b7280" }}>
              {field.label ?? field.key}{field.required ? " *" : ""}
            </span>
            <input
              type={fieldInputType(field.fieldType)}
              value={readFieldValue(snapshot, field.key)}
              onChange={(e) => {
                const raw = e.target.value
                onChange(field.key, field.fieldType === "number" && raw !== "" ? Number(raw) : raw || null)
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
