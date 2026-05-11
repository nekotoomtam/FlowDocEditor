import { assertDocument, normalizeDocument } from "@/document"
import {
  hasFieldRegistryErrors,
  validateFieldRegistryReferences,
  type FieldDefinitionV1,
  type FieldRegistryIssue,
  type FieldRegistryV1,
  type FieldValueType,
} from "@/fieldRegistry"
import type { DocumentNode } from "@/schema"

export const STORAGE_KEY = "flowdoc_document"
export const CURRENT_DOCUMENT_VERSION = 1
export const CURRENT_PACKAGE_VERSION = 1
export const CURRENT_STORAGE_PACKAGE_VERSION = 2
export const SUPPORTED_PACKAGE_VERSIONS = [1, 2] as const

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

export interface FlowDocPackageV2 {
  packageVersion: 2
  kind: "document"
  id: string
  meta: {
    title: string
    createdAt: string
    updatedAt: string
  }
  document: DocumentNode
  fields: FieldRegistryV1
  data?: unknown
  history?: unknown
  migrations?: unknown
}

export type FlowDocPackage = FlowDocPackageV1 | FlowDocPackageV2

export type DocumentParseFailureReason =
  | "empty"
  | "invalid-json"
  | "unsupported-version"
  | "unsupported-package-version"
  | "invalid-package"
  | "invalid-document"

export type DocumentParseResult =
  | {
      ok: true
      doc: DocumentNode
      source: "package" | "legacy-document"
      package?: FlowDocPackage
      fieldRegistryIssues?: FieldRegistryIssue[]
    }
  | { ok: false; reason: DocumentParseFailureReason }

export type DocumentPackageMigrationResult =
  | { ok: true; package: FlowDocPackage; source: "package" | "legacy-document"; fieldRegistryIssues?: FieldRegistryIssue[] }
  | { ok: false; reason: DocumentParseFailureReason }

export type DocumentPackageV2MigrationResult =
  | { ok: true; package: FlowDocPackageV2; source: "package" | "legacy-document"; fieldRegistryIssues: FieldRegistryIssue[] }
  | { ok: false; reason: DocumentParseFailureReason }

export type DocumentStorageResult =
  | { ok: true }
  | { ok: false; reason: "storage-unavailable" }

export interface DocumentStorageSaveOptions {
  key?: string
  fields?: FieldRegistryV1
  now?: string
}

export type FlowDocExportFormat = "v1" | "v2"

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

export function documentImportSuccessMessage(
  source: "package" | "legacy-document",
  fieldRegistryIssues: FieldRegistryIssue[] = [],
): string {
  const baseMessage = source === "legacy-document"
    ? "Opened legacy document JSON."
    : "Opened FlowDoc package."
  const warningCount = fieldRegistryIssues.filter((issue) => issue.severity === "warning").length
  if (warningCount === 0) return baseMessage

  return `${baseMessage} ${warningCount} field warning${warningCount === 1 ? "" : "s"}.`
}

export function makeFlowDocFileName(title: string | null | undefined, format: FlowDocExportFormat = "v1"): string {
  const base = (title ?? "document")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/[-.]+$/g, "")
    .replace(/^[-.]+/g, "")
    .trim()
  const safeBase = base.length > 0 ? base : "document"
  return `${safeBase}${format === "v2" ? ".v2" : ""}.flowdoc.json`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFieldValueType(value: unknown): value is FieldValueType {
  return value === "text" ||
    value === "number" ||
    value === "date" ||
    value === "boolean" ||
    value === "enum" ||
    value === "image" ||
    value === "collection"
}

function parseFieldRegistryValue(value: unknown): FieldRegistryV1 | null {
  if (!isObject(value)) return null
  if (value["version"] !== 1) return null
  if (!Array.isArray(value["fields"])) return null

  const fields: FieldDefinitionV1[] = []
  for (const item of value["fields"]) {
    if (!isObject(item)) return null
    const key = item["key"]
    const fieldType = item["fieldType"]
    if (typeof key !== "string" || key.length === 0) return null
    if (!isFieldValueType(fieldType)) return null

    const field: FieldDefinitionV1 = { key, fieldType }
    if (typeof item["label"] === "string") field.label = item["label"]
    if (typeof item["required"] === "boolean") field.required = item["required"]
    if (typeof item["fallback"] === "string") field.fallback = item["fallback"]
    if (typeof item["description"] === "string") field.description = item["description"]
    if (typeof item["source"] === "string") field.source = item["source"]
    if (item["options"] != null) {
      if (!Array.isArray(item["options"])) return null
      const options = []
      for (const option of item["options"]) {
        if (!isObject(option) || typeof option["value"] !== "string") return null
        options.push({
          value: option["value"],
          ...(typeof option["label"] === "string" ? { label: option["label"] } : {}),
        })
      }
      field.options = options
    }
    fields.push(field)
  }

  return { version: 1, fields }
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

function createEmptyFieldRegistry(): FieldRegistryV1 {
  return { version: 1, fields: [] }
}

export function createDocumentPackageV2(
  doc: DocumentNode,
  fields: FieldRegistryV1 = createEmptyFieldRegistry(),
  now = new Date().toISOString(),
): FlowDocPackageV2 {
  const title = doc.document.meta?.title ?? "Untitled"
  return {
    packageVersion: CURRENT_STORAGE_PACKAGE_VERSION,
    kind: "document",
    id: doc.document.id,
    meta: {
      title,
      createdAt: doc.document.meta?.createdAt ?? now,
      updatedAt: now,
    },
    document: doc,
    fields,
  }
}

function parsePackageMeta(value: Record<string, unknown>, doc: DocumentNode): FlowDocPackageV1["meta"] {
  const rawMeta = isObject(value["meta"]) ? value["meta"] : {}
  const now = new Date().toISOString()
  return {
    title: typeof rawMeta["title"] === "string" && rawMeta["title"].length > 0
      ? rawMeta["title"]
      : doc.document.meta?.title ?? "Untitled",
    createdAt: typeof rawMeta["createdAt"] === "string" ? rawMeta["createdAt"] : now,
    updatedAt: typeof rawMeta["updatedAt"] === "string" ? rawMeta["updatedAt"] : now,
  }
}

function parsePackageV1Value(value: Record<string, unknown>): DocumentParseResult {
  const id = value["id"]
  if (typeof id !== "string" || id.length === 0) return { ok: false, reason: "invalid-package" }
  const documentResult = parseDocumentValue(value["document"])
  if (!documentResult.ok) return documentResult
  if (id !== documentResult.doc.document.id) {
    return { ok: false, reason: "invalid-package" }
  }

  const pack: FlowDocPackageV1 = {
    packageVersion: 1,
    kind: "document",
    id,
    meta: parsePackageMeta(value, documentResult.doc),
    document: documentResult.doc,
  }

  return { ok: true, doc: documentResult.doc, source: "package", package: pack }
}

function parsePackageV2Value(value: Record<string, unknown>): DocumentParseResult {
  const id = value["id"]
  if (typeof id !== "string" || id.length === 0) return { ok: false, reason: "invalid-package" }
  const documentResult = parseDocumentValue(value["document"])
  if (!documentResult.ok) return documentResult
  if (id !== documentResult.doc.document.id) {
    return { ok: false, reason: "invalid-package" }
  }

  const fields = parseFieldRegistryValue(value["fields"])
  if (!fields) return { ok: false, reason: "invalid-package" }

  const fieldRegistryValidation = validateFieldRegistryReferences(documentResult.doc, fields)
  if (hasFieldRegistryErrors(fieldRegistryValidation)) {
    return { ok: false, reason: "invalid-package" }
  }

  const pack: FlowDocPackageV2 = {
    packageVersion: 2,
    kind: "document",
    id,
    meta: parsePackageMeta(value, documentResult.doc),
    document: documentResult.doc,
    fields,
  }
  if ("data" in value) pack.data = value["data"]
  if ("history" in value) pack.history = value["history"]
  if ("migrations" in value) pack.migrations = value["migrations"]

  return {
    ok: true,
    doc: documentResult.doc,
    source: "package",
    package: pack,
    fieldRegistryIssues: fieldRegistryValidation.issues,
  }
}

function parsePackageValue(value: unknown): DocumentParseResult {
  if (!isObject(value)) return { ok: false, reason: "invalid-package" }
  if (!SUPPORTED_PACKAGE_VERSIONS.includes(value["packageVersion"] as 1 | 2)) {
    return { ok: false, reason: "unsupported-package-version" }
  }
  if (value["kind"] !== "document") return { ok: false, reason: "invalid-package" }
  if (typeof value["id"] !== "string" || value["id"].length === 0) {
    return { ok: false, reason: "invalid-package" }
  }

  return value["packageVersion"] === 2 ? parsePackageV2Value(value) : parsePackageV1Value(value)
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
    fieldRegistryIssues: result.fieldRegistryIssues,
  }
}

function migrateParseResultToPackageV2(
  result: Extract<DocumentParseResult, { ok: true }>,
  now?: string,
): DocumentPackageV2MigrationResult {
  if (result.package?.packageVersion === 2) {
    return {
      ok: true,
      package: result.package,
      source: result.source,
      fieldRegistryIssues: result.fieldRegistryIssues ?? [],
    }
  }

  const currentPackage = result.package ?? createDocumentPackage(result.doc, now)
  const fields = createEmptyFieldRegistry()
  const fieldRegistryValidation = validateFieldRegistryReferences(currentPackage.document, fields)
  return {
    ok: true,
    package: {
      packageVersion: 2,
      kind: currentPackage.kind,
      id: currentPackage.id,
      meta: currentPackage.meta,
      document: currentPackage.document,
      fields,
    },
    source: result.source,
    fieldRegistryIssues: fieldRegistryValidation.issues,
  }
}

export function parsePersistedDocument(raw: string | null | undefined): DocumentParseResult {
  const result = migratePersistedDocumentPackage(raw)
  if (!result.ok) return result
  return {
    ok: true,
    doc: result.package.document,
    source: result.source,
    package: result.package,
    fieldRegistryIssues: result.fieldRegistryIssues,
  }
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

export function migratePersistedDocumentPackageToV2(
  raw: string | null | undefined,
  now?: string,
): DocumentPackageV2MigrationResult {
  if (raw == null || raw.trim() === "") return { ok: false, reason: "empty" }

  try {
    const result = parsePersistedValue(JSON.parse(raw))
    if (!result.ok) return result
    return migrateParseResultToPackageV2(result, now)
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
  options: DocumentStorageSaveOptions = {},
): DocumentStorageResult {
  try {
    const key = options.key ?? STORAGE_KEY
    const fields = options.fields ?? createEmptyFieldRegistry()
    storage.setItem(key, JSON.stringify(createDocumentPackageV2(doc, fields, options.now)))
    return { ok: true }
  } catch {
    return { ok: false, reason: "storage-unavailable" }
  }
}

export function serializeDocumentPackage(doc: DocumentNode): string {
  return JSON.stringify(createDocumentPackage(doc), null, 2)
}

export function serializeDocumentPackageV2(doc: DocumentNode, fields: FieldRegistryV1): string {
  return JSON.stringify(createDocumentPackageV2(doc, fields), null, 2)
}
