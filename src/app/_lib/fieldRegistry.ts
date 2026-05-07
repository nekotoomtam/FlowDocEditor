import type { FieldDragData } from "@/placement/types"

export interface EditorFieldDefinition extends FieldDragData {
  required?: boolean
  group?: string
}

export const SAMPLE_FIELD_REGISTRY: EditorFieldDefinition[] = [
  { key: "customer.name", label: "Customer name", fieldType: "text", required: true, group: "Customer" },
  { key: "customer.address", label: "Customer address", fieldType: "text", group: "Customer" },
  { key: "document.date", label: "Document date", fieldType: "date", required: true, group: "Document" },
  { key: "invoice.total", label: "Invoice total", fieldType: "number", group: "Invoice" },
]
