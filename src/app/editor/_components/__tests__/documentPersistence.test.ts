import { describe, expect, it } from "vitest"
import { createDefaultDocument, DEFAULT_PARAGRAPH_PROPS } from "@/document"
import type { ParagraphNode } from "@/schema"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import {
  CURRENT_DOCUMENT_VERSION,
  CURRENT_PACKAGE_VERSION,
  STORAGE_KEY,
  createDocumentPackage,
  documentImportSuccessMessage,
  documentParseFailureMessage,
  loadDocumentFromStorage,
  makeFlowDocFileName,
  migratePersistedDocumentPackage,
  parsePersistedDocument,
  saveDocumentToStorage,
  serializeDocumentPackage,
} from "../documentPersistence"

function firstParagraph(doc: ReturnType<typeof createDefaultDocument>): ParagraphNode {
  const section = doc.document.sections[0]
  const paragraph = Object.values(section.nodes).find((node): node is ParagraphNode => node.type === "paragraph")
  if (!paragraph) throw new Error("missing paragraph")
  return paragraph
}

function packageV2(doc: ReturnType<typeof createDefaultDocument>, fields: FieldRegistryV1["fields"]) {
  return {
    packageVersion: 2,
    kind: "document",
    id: doc.document.id,
    meta: {
      title: doc.document.meta?.title ?? "Untitled",
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    },
    document: doc,
    fields: { version: 1, fields },
  }
}

describe("document persistence", () => {
  it("parses legacy raw document JSON while normalizing and validating version 1", () => {
    const doc = createDefaultDocument("Persisted")
    const rawDoc = structuredClone(doc) as any
    delete (firstParagraph(rawDoc).props as Record<string, unknown>)["spacingAfter"]

    const result = parsePersistedDocument(JSON.stringify(rawDoc))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe("legacy-document")
    expect(result.doc.version).toBe(CURRENT_DOCUMENT_VERSION)
    expect(firstParagraph(result.doc).props.spacingAfter).toEqual(DEFAULT_PARAGRAPH_PROPS.spacingAfter)
  })

  it("parses document-first package JSON", () => {
    const doc = createDefaultDocument("Packaged")
    const pack = createDocumentPackage(doc, "2026-05-11T00:00:00.000Z")

    const result = parsePersistedDocument(JSON.stringify(pack))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe("package")
    expect(result.package?.packageVersion).toBe(CURRENT_PACKAGE_VERSION)
    expect(result.package?.kind).toBe("document")
    expect(result.package?.meta.title).toBe("Packaged")
    expect(result.doc.document.meta?.title).toBe("Packaged")
  })

  it("rejects invalid JSON without throwing", () => {
    expect(parsePersistedDocument("{")).toEqual({ ok: false, reason: "invalid-json" })
  })

  it("rejects unsupported document versions", () => {
    const doc = createDefaultDocument("Future")
    expect(parsePersistedDocument(JSON.stringify({ ...doc, version: 2 })))
      .toEqual({ ok: false, reason: "unsupported-version" })
  })

  it("rejects unsupported package versions", () => {
    const doc = createDefaultDocument("Future Package")
    const pack = createDocumentPackage(doc)
    expect(parsePersistedDocument(JSON.stringify({ ...pack, packageVersion: 99 })))
      .toEqual({ ok: false, reason: "unsupported-package-version" })
  })

  it("rejects invalid document packages", () => {
    expect(parsePersistedDocument(JSON.stringify({ packageVersion: 1, kind: "document", id: "" })))
      .toEqual({ ok: false, reason: "invalid-package" })
  })

  it("rejects document packages whose package id does not match the document id", () => {
    const doc = createDefaultDocument("Mismatched")
    const pack = createDocumentPackage(doc)

    expect(parsePersistedDocument(JSON.stringify({ ...pack, id: "different-id" })))
      .toEqual({ ok: false, reason: "invalid-package" })
  })

  it("rejects structurally invalid documents", () => {
    const doc = createDefaultDocument("Broken")
    const broken = structuredClone(doc) as any
    broken.document.sections[0].nodes = {}

    expect(parsePersistedDocument(JSON.stringify(broken))).toEqual({ ok: false, reason: "invalid-document" })
  })

  it("loads and saves document packages through the current localStorage key", () => {
    const items = new Map<string, string>()
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value) },
    }
    const doc = createDefaultDocument("Storage")

    expect(saveDocumentToStorage(storage, doc)).toEqual({ ok: true })
    expect(items.has(STORAGE_KEY)).toBe(true)
    expect(JSON.parse(items.get(STORAGE_KEY)!)["packageVersion"]).toBe(CURRENT_PACKAGE_VERSION)

    const result = loadDocumentFromStorage(storage)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.doc.document.meta?.title).toBe("Storage")
  })

  it("serializes JSON export as a document package", () => {
    const doc = createDefaultDocument("Download")
    const exported = JSON.parse(serializeDocumentPackage(doc))

    expect(exported.packageVersion).toBe(CURRENT_PACKAGE_VERSION)
    expect(exported.packageVersion).toBe(1)
    expect(exported.kind).toBe("document")
    expect(exported.document.document.meta.title).toBe("Download")
  })

  it("parses package v2 with a field registry while default export stays v1", () => {
    const doc = createDefaultDocument("Package V2")
    firstParagraph(doc).children = [
      { id: "field-customer", type: "fieldRef", key: "customer.name", label: "Customer" },
    ]
    const result = parsePersistedDocument(JSON.stringify(packageV2(doc, [
      { key: "customer.name", fieldType: "text", label: "Customer name", required: true },
    ])))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe("package")
    expect(result.package?.packageVersion).toBe(2)
    expect(result.fieldRegistryIssues).toEqual([])
    expect(JSON.parse(serializeDocumentPackage(result.doc)).packageVersion).toBe(1)
  })

  it("parses package v2 with missing field definitions as registry warnings", () => {
    const doc = createDefaultDocument("Package V2 Warnings")
    firstParagraph(doc).children = [
      { id: "field-customer", type: "fieldRef", key: "customer.name", label: "Customer" },
    ]
    const result = parsePersistedDocument(JSON.stringify(packageV2(doc, [])))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package?.packageVersion).toBe(2)
    expect(result.fieldRegistryIssues).toEqual([
      expect.objectContaining({
        code: "missing-definition",
        severity: "warning",
        key: "customer.name",
        fieldRefId: "field-customer",
      }),
    ])
  })

  it("rejects package v2 with duplicate registry keys", () => {
    const doc = createDefaultDocument("Duplicate Registry")

    expect(parsePersistedDocument(JSON.stringify(packageV2(doc, [
      { key: "customer.name", fieldType: "text" },
      { key: "customer.name", fieldType: "number" },
    ])))).toEqual({ ok: false, reason: "invalid-package" })
  })

  it("rejects package v2 inline fieldRefs that target collection fields", () => {
    const doc = createDefaultDocument("Collection FieldRef")
    firstParagraph(doc).children = [
      { id: "items-field", type: "fieldRef", key: "items", label: "Items" },
    ]

    expect(parsePersistedDocument(JSON.stringify(packageV2(doc, [
      { key: "items", fieldType: "collection" },
    ])))).toEqual({ ok: false, reason: "invalid-package" })
  })

  it("round-trips fieldRef inline nodes through package export and import", () => {
    const doc = createDefaultDocument("Field Package")
    firstParagraph(doc).children = [
      { id: "field-prefix", type: "text", text: "Customer: " },
      { id: "field-customer", type: "fieldRef", key: "customer.name", label: "Customer", fallback: "-" },
    ]

    const result = parsePersistedDocument(serializeDocumentPackage(doc))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const children = firstParagraph(result.doc).children
    expect(children).toHaveLength(2)
    expect(children[0]).toMatchObject({ id: "field-prefix", type: "text", text: "Customer: " })
    expect(children[1]).toMatchObject({
      id: "field-customer",
      type: "fieldRef",
      key: "customer.name",
      label: "Customer",
      fallback: "-",
    })
  })

  it("migrates legacy raw document JSON into a document package", () => {
    const doc = createDefaultDocument("Legacy Migration")
    const result = migratePersistedDocumentPackage(JSON.stringify(doc), "2026-05-11T00:00:00.000Z")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe("legacy-document")
    expect(result.package.packageVersion).toBe(CURRENT_PACKAGE_VERSION)
    expect(result.package.id).toBe(doc.document.id)
    expect(result.package.document.document.meta?.title).toBe("Legacy Migration")
    expect(result.package.meta.createdAt).toBe("2026-05-11T00:00:00.000Z")
  })

  it("keeps package migration idempotent for package v1", () => {
    const doc = createDefaultDocument("Idempotent")
    const pack = createDocumentPackage(doc, "2026-05-11T00:00:00.000Z")

    const first = migratePersistedDocumentPackage(JSON.stringify(pack), "2026-05-12T00:00:00.000Z")
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = migratePersistedDocumentPackage(JSON.stringify(first.package), "2026-05-13T00:00:00.000Z")
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.package).toEqual(first.package)
  })

  it("builds safe FlowDoc package file names from document titles", () => {
    expect(makeFlowDocFileName("Invoice: A/B * Draft?")).toBe("Invoice-A-B-Draft.flowdoc.json")
    expect(makeFlowDocFileName("   ...   ")).toBe("document.flowdoc.json")
    expect(makeFlowDocFileName(null)).toBe("document.flowdoc.json")
  })

  it("maps parse results to concise import status messages", () => {
    expect(documentImportSuccessMessage("package")).toBe("Opened FlowDoc package.")
    expect(documentImportSuccessMessage("package", [
      {
        code: "missing-definition",
        severity: "warning",
        key: "customer.name",
        message: "fieldRef references missing field key",
      },
    ])).toBe("Opened FlowDoc package. 1 field warning.")
    expect(documentImportSuccessMessage("legacy-document")).toBe("Opened legacy document JSON.")
    expect(documentParseFailureMessage("invalid-json")).toBe("This file is not valid JSON.")
    expect(documentParseFailureMessage("unsupported-package-version")).toBe("This FlowDoc package version is not supported.")
  })
})
