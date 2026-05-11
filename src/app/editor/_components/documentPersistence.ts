import { assertDocument, normalizeDocument } from "@/document"
import type { DocumentNode } from "@/schema"

export const STORAGE_KEY = "flowdoc_document"
export const CURRENT_DOCUMENT_VERSION = 1
export const CURRENT_PACKAGE_VERSION = 1

export interface FlowDocPackageV1 {
  packageVersion: 1
  kind: "document"
  id: string
  meta: {
    title: string
    createdAt: string
    updatedAt: string
  }
  document: DocumentNode
}

export type DocumentParseFailureReason =
  | "empty"
  | "invalid-json"
  | "unsupported-version"
  | "unsupported-package-version"
  | "invalid-package"
  | "invalid-document"

export type DocumentParseResult =
  | { ok: true; doc: DocumentNode; source: "package" | "legacy-document"; package?: FlowDocPackageV1 }
  | { ok: false; reason: DocumentParseFailureReason }

export type DocumentStorageResult =
  | { ok: true }
  | { ok: false; reason: "storage-unavailable" }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseDocumentValue(value: unknown): Extract<DocumentParseResult, { ok: true }> | Extract<DocumentParseResult, { ok: false }> {
  if (!isObject(value)) return { ok: false, reason: "invalid-document" }
  if (value["version"] !== CURRENT_DOCUMENT_VERSION) return { ok: false, reason: "unsupported-version" }

  const document = value["document"]
  if (!isObject(document) || !Array.isArray(document["sections"])) {
    return { ok: false, reason: "invalid-document" }
  }

  try {
    const normalized = normalizeDocument(value as DocumentNode)
    assertDocument(normalized)
    return { ok: true, doc: normalized, source: "legacy-document" }
  } catch {
    return { ok: false, reason: "invalid-document" }
  }
}

export function createDocumentPackage(doc: DocumentNode, now = new Date().toISOString()): FlowDocPackageV1 {
  const title = doc.document.meta?.title ?? "Untitled"
  return {
    packageVersion: CURRENT_PACKAGE_VERSION,
    kind: "document",
    id: doc.document.id,
    meta: {
      title,
      createdAt: doc.document.meta?.createdAt ?? now,
      updatedAt: now,
    },
    document: doc,
  }
}

function parsePackageValue(value: unknown): DocumentParseResult {
  if (!isObject(value)) return { ok: false, reason: "invalid-package" }
  if (value["packageVersion"] !== CURRENT_PACKAGE_VERSION) {
    return { ok: false, reason: "unsupported-package-version" }
  }
  if (value["kind"] !== "document") return { ok: false, reason: "invalid-package" }
  if (typeof value["id"] !== "string" || value["id"].length === 0) {
    return { ok: false, reason: "invalid-package" }
  }

  const documentResult = parseDocumentValue(value["document"])
  if (!documentResult.ok) return documentResult

  const rawMeta = isObject(value["meta"]) ? value["meta"] : {}
  const now = new Date().toISOString()
  const pack: FlowDocPackageV1 = {
    packageVersion: CURRENT_PACKAGE_VERSION,
    kind: "document",
    id: value["id"],
    meta: {
      title: typeof rawMeta["title"] === "string" && rawMeta["title"].length > 0
        ? rawMeta["title"]
        : documentResult.doc.document.meta?.title ?? "Untitled",
      createdAt: typeof rawMeta["createdAt"] === "string" ? rawMeta["createdAt"] : now,
      updatedAt: typeof rawMeta["updatedAt"] === "string" ? rawMeta["updatedAt"] : now,
    },
    document: documentResult.doc,
  }

  return { ok: true, doc: documentResult.doc, source: "package", package: pack }
}

function parsePersistedValue(value: unknown): DocumentParseResult {
  if (isObject(value) && "packageVersion" in value) return parsePackageValue(value)
  return parseDocumentValue(value)
}

export function parsePersistedDocument(raw: string | null | undefined): DocumentParseResult {
  if (raw == null || raw.trim() === "") return { ok: false, reason: "empty" }

  try {
    return parsePersistedValue(JSON.parse(raw))
  } catch {
    return { ok: false, reason: "invalid-json" }
  }
}

export function loadDocumentFromStorage(storage: Pick<Storage, "getItem">, key = STORAGE_KEY): DocumentParseResult {
  try {
    return parsePersistedDocument(storage.getItem(key))
  } catch {
    return { ok: false, reason: "empty" }
  }
}

export function saveDocumentToStorage(
  storage: Pick<Storage, "setItem">,
  doc: DocumentNode,
  key = STORAGE_KEY,
): DocumentStorageResult {
  try {
    storage.setItem(key, JSON.stringify(createDocumentPackage(doc)))
    return { ok: true }
  } catch {
    return { ok: false, reason: "storage-unavailable" }
  }
}

export function serializeDocumentPackage(doc: DocumentNode): string {
  return JSON.stringify(createDocumentPackage(doc), null, 2)
}
