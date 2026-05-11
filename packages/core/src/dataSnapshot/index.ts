import type { FieldDefinitionV1, FieldRegistryV1, FieldValueType } from "../fieldRegistry"

export type FieldScalarValue = string | number | boolean | null

export interface DataSnapshotV1 {
  version: 1
  updatedAt: string
  values: Record<string, FieldScalarValue>
}

export type DataSnapshotIssueSeverity = "error" | "warning"

export type DataSnapshotIssueCode =
  | "unknown-key"
  | "missing-required-value"
  | "invalid-value-type"
  | "invalid-enum-value"
  | "unsupported-snapshot-field-type"

export interface DataSnapshotIssue {
  code: DataSnapshotIssueCode
  severity: DataSnapshotIssueSeverity
  key: string
  message: string
}

export interface DataSnapshotValidationResult {
  issues: DataSnapshotIssue[]
}

function issue(
  code: DataSnapshotIssueCode,
  severity: DataSnapshotIssueSeverity,
  key: string,
  message: string,
): DataSnapshotIssue {
  return { code, severity, key, message }
}

function hasValue(value: FieldScalarValue | undefined): boolean {
  return value !== undefined && value !== null && value !== ""
}

function expectedTypeMessage(fieldType: FieldValueType): string {
  switch (fieldType) {
    case "number": return "number or null"
    case "boolean": return "boolean or null"
    case "text":
    case "date":
    case "enum":
      return "string or null"
    case "image":
    case "collection":
      return "not supported by scalar data snapshots"
  }
}

function validateScalarValue(field: FieldDefinitionV1, value: FieldScalarValue): DataSnapshotIssue | null {
  if (value == null) return null

  switch (field.fieldType) {
    case "text":
    case "date":
      return typeof value === "string"
        ? null
        : issue("invalid-value-type", "error", field.key, `field "${field.key}" expects ${expectedTypeMessage(field.fieldType)}`)
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : issue("invalid-value-type", "error", field.key, `field "${field.key}" expects ${expectedTypeMessage(field.fieldType)}`)
    case "boolean":
      return typeof value === "boolean"
        ? null
        : issue("invalid-value-type", "error", field.key, `field "${field.key}" expects ${expectedTypeMessage(field.fieldType)}`)
    case "enum": {
      if (typeof value !== "string") {
        return issue("invalid-value-type", "error", field.key, `field "${field.key}" expects ${expectedTypeMessage(field.fieldType)}`)
      }
      if (field.options != null && !field.options.some((option) => option.value === value)) {
        return issue("invalid-enum-value", "error", field.key, `field "${field.key}" has an unknown enum value "${value}"`)
      }
      return null
    }
    case "image":
    case "collection":
      return issue(
        "unsupported-snapshot-field-type",
        "error",
        field.key,
        `field "${field.key}" uses ${field.fieldType}, which is not supported by scalar data snapshots`,
      )
  }
}

export function validateDataSnapshot(
  snapshot: DataSnapshotV1,
  registry: FieldRegistryV1,
): DataSnapshotValidationResult {
  const issues: DataSnapshotIssue[] = []
  const definitions = new Map(registry.fields.map((field) => [field.key, field]))

  Object.entries(snapshot.values).forEach(([key, value]) => {
    const field = definitions.get(key)
    if (!field) {
      issues.push(issue("unknown-key", "warning", key, `data snapshot contains unknown key "${key}"`))
      return
    }

    const valueIssue = validateScalarValue(field, value)
    if (valueIssue) issues.push(valueIssue)
  })

  registry.fields.forEach((field) => {
    if (field.required && !hasValue(snapshot.values[field.key])) {
      issues.push(issue("missing-required-value", "warning", field.key, `required field "${field.key}" has no value`))
    }
  })

  return { issues }
}

export function hasDataSnapshotErrors(result: DataSnapshotValidationResult): boolean {
  return result.issues.some((issue) => issue.severity === "error")
}
