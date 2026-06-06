import type { DataSnapshotV1 } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DocumentNode } from "@/schema"
import {
  makeFlowDocFileName,
  parsePersistedDocument,
  serializeDocumentPackageWithFields,
  type DocumentParseResult,
} from "../documentPersistence"

export function downloadDocumentJsonPackage(doc: DocumentNode, fields: FieldRegistryV1, data: DataSnapshotV1): void {
  const title = doc.document.meta?.title ?? "document"
  const blob = new Blob([serializeDocumentPackageWithFields(doc, fields, data)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = makeFlowDocFileName(title)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function readPersistedDocumentFile(
  file: File,
  onParsed: (result: DocumentParseResult) => void,
  onError: () => void,
): void {
  const reader = new FileReader()
  reader.onload = (event) => {
    onParsed(parsePersistedDocument(event.target?.result as string))
  }
  reader.onerror = onError
  reader.readAsText(file)
}
