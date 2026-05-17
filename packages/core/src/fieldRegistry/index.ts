import type { DocumentNode, FlowTableNode, TableNode } from "../schema"

export type FieldValueType = "text" | "number" | "date" | "boolean" | "enum" | "image" | "collection"
export type InlineFieldValueType = Exclude<FieldValueType, "image" | "collection">

export interface FieldOption {
  value: string
  label?: string
}

export interface FieldDefinitionV1 {
  key: string
  fieldType: FieldValueType
  label?: string
  required?: boolean
  fallback?: string
  description?: string
  source?: string
  options?: FieldOption[]
}

export interface FieldRegistryV1 {
  version: 1
  fields: FieldDefinitionV1[]
}

export interface FieldRefUsage {
  key: string
  fieldRefId: string
  paragraphId: string
  sectionId: string
  tableId?: string
  label?: string
  fallback?: string
}

export type FieldRegistryIssueSeverity = "error" | "warning"

export type FieldRegistryIssueCode =
  | "duplicate-key"
  | "missing-definition"
  | "non-inline-field-ref"

export interface FieldRegistryIssue {
  code: FieldRegistryIssueCode
  severity: FieldRegistryIssueSeverity
  key: string
  message: string
  fieldRefId?: string
  paragraphId?: string
  sectionId?: string
  tableId?: string
}

export interface FieldRegistryValidationResult {
  usages: FieldRefUsage[]
  issues: FieldRegistryIssue[]
}

const INLINE_FIELD_TYPES = new Set<FieldValueType>(["text", "number", "date", "boolean", "enum"])

function collectParagraphFieldRefs(
  usages: FieldRefUsage[],
  sectionId: string,
  paragraph: { id: string; children: Array<{ type: string; id?: string; key?: string; label?: string; fallback?: string }> },
  tableId?: string,
): void {
  paragraph.children.forEach((child) => {
    if (child.type !== "fieldRef" || typeof child.key !== "string" || child.key.length === 0) return
    const usage: FieldRefUsage = {
      key: child.key,
      fieldRefId: typeof child.id === "string" ? child.id : "",
      paragraphId: paragraph.id,
      sectionId,
    }
    if (tableId != null) usage.tableId = tableId
    if (typeof child.label === "string") usage.label = child.label
    if (typeof child.fallback === "string") usage.fallback = child.fallback
    usages.push(usage)
  })
}

export function collectDocumentFieldRefs(doc: DocumentNode): FieldRefUsage[] {
  const usages: FieldRefUsage[] = []

  doc.document.sections.forEach((section) => {
    Object.values(section.nodes).forEach((node) => {
      if (node.type === "paragraph") {
        collectParagraphFieldRefs(usages, section.id, node)
        return
      }
      if (node.type !== "table" && node.type !== "flow-table") return

      const table = node as unknown as TableNode | FlowTableNode
      Object.values(table.nodes).forEach((inner) => {
        if (inner.type === "paragraph") collectParagraphFieldRefs(usages, section.id, inner, table.id)
      })
    })
  })

  return usages
}

export function validateFieldRegistryReferences(
  doc: DocumentNode,
  registry: FieldRegistryV1,
): FieldRegistryValidationResult {
  const issues: FieldRegistryIssue[] = []
  const definitions = new Map<string, FieldDefinitionV1>()
  const seenKeys = new Set<string>()

  registry.fields.forEach((field) => {
    if (seenKeys.has(field.key)) {
      issues.push({
        code: "duplicate-key",
        severity: "error",
        key: field.key,
        message: `field registry contains duplicate key "${field.key}"`,
      })
      return
    }
    seenKeys.add(field.key)
    definitions.set(field.key, field)
  })

  const usages = collectDocumentFieldRefs(doc)
  usages.forEach((usage) => {
    const definition = definitions.get(usage.key)
    if (!definition) {
      issues.push({
        code: "missing-definition",
        severity: "warning",
        key: usage.key,
        fieldRefId: usage.fieldRefId,
        paragraphId: usage.paragraphId,
        sectionId: usage.sectionId,
        tableId: usage.tableId,
        message: `fieldRef "${usage.fieldRefId}" references missing field key "${usage.key}"`,
      })
      return
    }

    if (!INLINE_FIELD_TYPES.has(definition.fieldType)) {
      issues.push({
        code: "non-inline-field-ref",
        severity: "error",
        key: usage.key,
        fieldRefId: usage.fieldRefId,
        paragraphId: usage.paragraphId,
        sectionId: usage.sectionId,
        tableId: usage.tableId,
        message: `fieldRef "${usage.fieldRefId}" references non-inline field key "${usage.key}"`,
      })
    }
  })

  return { usages, issues }
}

export function hasFieldRegistryErrors(result: FieldRegistryValidationResult): boolean {
  return result.issues.some((issue) => issue.severity === "error")
}
