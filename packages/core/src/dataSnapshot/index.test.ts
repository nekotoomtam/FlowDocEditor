import { describe, expect, it } from "vitest"
import type { FieldRegistryV1 } from "../fieldRegistry"
import { hasDataSnapshotErrors, validateDataSnapshot, type DataSnapshotV1 } from "./index"

const registry: FieldRegistryV1 = {
  version: 1,
  fields: [
    { key: "customer.name", fieldType: "text", required: true },
    { key: "invoice.total", fieldType: "number" },
    { key: "document.date", fieldType: "date" },
    { key: "approved", fieldType: "boolean" },
    {
      key: "invoice.status",
      fieldType: "enum",
      options: [
        { value: "draft", label: "Draft" },
        { value: "approved", label: "Approved" },
      ],
    },
  ],
}

function snapshot(values: DataSnapshotV1["values"]): DataSnapshotV1 {
  return {
    version: 1,
    updatedAt: "2026-05-11T00:00:00.000Z",
    values,
  }
}

describe("data snapshot validation", () => {
  it("accepts scalar values that match registry field types", () => {
    const result = validateDataSnapshot(snapshot({
      "customer.name": "Acme",
      "invoice.total": 1200,
      "document.date": "2026-05-11",
      approved: true,
      "invoice.status": "approved",
    }), registry)

    expect(result.issues).toEqual([])
    expect(hasDataSnapshotErrors(result)).toBe(false)
  })

  it("reports missing required values as readiness warnings", () => {
    const result = validateDataSnapshot(snapshot({
      "invoice.total": 1200,
    }), registry)

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "missing-required-value",
        severity: "warning",
        key: "customer.name",
      }),
    ])
    expect(hasDataSnapshotErrors(result)).toBe(false)
  })

  it("reports unknown snapshot keys as warnings", () => {
    const result = validateDataSnapshot(snapshot({
      "customer.name": "Acme",
      "extra.reference": "X-1",
    }), registry)

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "unknown-key",
        severity: "warning",
        key: "extra.reference",
      }),
    ])
    expect(hasDataSnapshotErrors(result)).toBe(false)
  })

  it("reports invalid scalar value types as errors", () => {
    const result = validateDataSnapshot(snapshot({
      "customer.name": "Acme",
      "invoice.total": "1200",
      approved: "yes",
    }), registry)

    expect(result.issues).toEqual([
      expect.objectContaining({ code: "invalid-value-type", severity: "error", key: "invoice.total" }),
      expect.objectContaining({ code: "invalid-value-type", severity: "error", key: "approved" }),
    ])
    expect(hasDataSnapshotErrors(result)).toBe(true)
  })

  it("reports enum values outside configured options as errors", () => {
    const result = validateDataSnapshot(snapshot({
      "customer.name": "Acme",
      "invoice.status": "paid",
    }), registry)

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid-enum-value",
        severity: "error",
        key: "invoice.status",
      }),
    ])
    expect(hasDataSnapshotErrors(result)).toBe(true)
  })

  it("reports image and collection fields as unsupported in scalar snapshots", () => {
    const result = validateDataSnapshot(snapshot({
      "customer.name": "Acme",
      "items": "not-yet-supported",
      "signature.image": "asset-1",
    }), {
      version: 1,
      fields: [
        { key: "customer.name", fieldType: "text", required: true },
        { key: "items", fieldType: "collection" },
        { key: "signature.image", fieldType: "image" },
      ],
    })

    expect(result.issues).toEqual([
      expect.objectContaining({ code: "unsupported-snapshot-field-type", severity: "error", key: "items" }),
      expect.objectContaining({ code: "unsupported-snapshot-field-type", severity: "error", key: "signature.image" }),
    ])
    expect(hasDataSnapshotErrors(result)).toBe(true)
  })
})
