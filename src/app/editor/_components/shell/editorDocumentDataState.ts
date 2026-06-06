import { SAMPLE_FIELD_REGISTRY_V1 } from "@/app/_lib/fieldRegistry"
import type { DataSnapshotV1, FieldScalarValue } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DocumentNode } from "@/schema"
import type { DocumentParseResult } from "../documentPersistence"
import { saveDocumentToStorage } from "../documentPersistence"

export function createEmptyDataSnapshot(): DataSnapshotV1 {
  return { version: 1, updatedAt: new Date().toISOString(), values: {} }
}

export function setDataSnapshotValue(snapshot: DataSnapshotV1, key: string, value: FieldScalarValue): DataSnapshotV1 {
  return {
    ...snapshot,
    updatedAt: new Date().toISOString(),
    values: {
      ...snapshot.values,
      [key]: value,
    },
  }
}

export function fieldRegistryFromDocumentParseResult(result: DocumentParseResult): FieldRegistryV1 {
  return result.ok && result.package?.packageVersion === 2
    ? result.package.fields
    : SAMPLE_FIELD_REGISTRY_V1
}

export function dataSnapshotFromDocumentParseResult(result: DocumentParseResult): DataSnapshotV1 {
  return result.ok && result.package?.packageVersion === 2 && result.package.data
    ? result.package.data
    : createEmptyDataSnapshot()
}

export function saveToStorage(doc: DocumentNode, fields: FieldRegistryV1, data: DataSnapshotV1): void {
  saveDocumentToStorage(localStorage, doc, { fields, data })
}
