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

export type DocumentPackageMigrationResult =
  | { ok: true; package: FlowDocPackageV1; source: "package" | "legacy-document" }
  | { ok: false; reason: DocumentParseFailureReason }

export type DocumentStorageResult =
  | { ok: true }
  | { ok: false; reason: "storage-unavailable" }

export function documentParseFailureMessage(reason: DocumentParseFailureReason): string {
  switch (reason) {
    case "empty":
      return "No document data found."
    case "invalid-json":
      return "This file is not valid JSON."
    case "unsupported-version":
      return "This document version is not supported."
    case "unsupported-package-version":
      return "This FlowDoc package version is not supported."
    case "invalid-package":
      return "This FlowDoc package is invalid."
    case "invalid-document":
      return "This document structure is invalid."
  }
}

export function documentImportSuccessMessage(source: "package" | "legacy-document"): string {
  return source === "legacy-document"
    ? "Opened legacy document JSON."
    : "Opened FlowDoc package."
}

export function makeFlowDocFileName(title: string | null | undefined): string {
  const base = (title ?? "document")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/[-.]+$/g, "")
    .replace(/^[-.]+/g, "")
    .trim()
  const safeBase = base.length > 0 ? base : "document"
  return `${safeBase}.flowdoc.json`
}

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
  if (value["id"] !== documentResult.doc.document.id) {
    return { ok: false, reason: "invalid-package" }
  }

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

function migratePersistedValue(value: unknown, now?: string): DocumentPackageMigrationResult {
  const result = parsePersistedValue(value)
  if (!result.ok) return result
  return {
    ok: true,
    package: result.package ?? createDocumentPackage(result.doc, now),
    source: result.source,
  }
}

export function parsePersistedDocument(raw: string | null | undefined): DocumentParseResult {
  const result = migratePersistedDocumentPackage(raw)
  if (!result.ok) return result
  return { ok: true, doc: result.package.document, source: result.source, package: result.package }
}

export function migratePersistedDocumentPackage(
  raw: string | null | undefined,
  now?: string,
): DocumentPackageMigrationResult {
  if (raw == null || raw.trim() === "") return { ok: false, reason: "empty" }

  try {
    return migratePersistedValue(JSON.parse(raw), now)
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
