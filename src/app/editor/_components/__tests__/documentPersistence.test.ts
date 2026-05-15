import { describe, expect, it } from "vitest"
import { createDefaultDocument, DEFAULT_PARAGRAPH_PROPS } from "@/document"
import type { DocumentNode, LayoutNode, ParagraphNode } from "@/schema"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DataSnapshotV1 } from "@/dataSnapshot"
import {
  CURRENT_DOCUMENT_VERSION,
  CURRENT_PACKAGE_VERSION,
  CURRENT_STORAGE_PACKAGE_VERSION,
  LEGACY_PACKAGE_VERSION,
  STORAGE_KEY,
  createLegacyDocumentPackage,
  documentImportSuccessMessage,
  documentParseFailureMessage,
  loadDocumentFromStorage,
  makeFlowDocFileName,
  migratePersistedDocumentPackage,
  migratePersistedDocumentPackageToV2,
  parsePersistedDocument,
  saveDocumentToStorage,
  serializeLegacyDocumentPackage,
  serializeDocumentPackage,
  serializeDocumentPackageWithFields,
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

function dataSnapshot(values: DataSnapshotV1["values"]): DataSnapshotV1 {
  return {
    version: 1,
    updatedAt: "2026-05-12T00:00:00.000Z",
    values,
  }
}

function makeParagraphNode(id: string, text: string): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: { ...DEFAULT_PARAGRAPH_PROPS },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeFlowRowDocument(): DocumentNode {
  const doc = createDefaultDocument("Flow Row Storage")
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]

  if (!body || body.type !== "body") {
    throw new Error("Expected default document body")
  }

  const nodes: Record<string, LayoutNode> = {
    [body.id]: { ...body, childIds: ["flow-row-1"] },
    "flow-row-1": {
      id: "flow-row-1",
      type: "flow-row",
      props: {},
      childIds: ["flow-stack-left", "flow-stack-right"],
    },
    "flow-stack-left": {
      id: "flow-stack-left",
      type: "flow-stack",
      props: { widthShare: 50 },
      childIds: ["left-1", "left-2"],
    },
    "flow-stack-right": {
      id: "flow-stack-right",
      type: "flow-stack",
      props: { widthShare: 50 },
      childIds: ["right-1", "right-2"],
    },
    "left-1": makeParagraphNode("left-1", "Left paragraph 1"),
    "left-2": makeParagraphNode("left-2", "Left paragraph 2"),
    "right-1": makeParagraphNode("right-1", "Right paragraph 1"),
    "right-2": makeParagraphNode("right-2", "Right paragraph 2"),
  }

  return {
    ...doc,
    document: {
      ...doc.document,
      sections: [{ ...section, nodes }],
    },
  }
}

function expectFlowRowTree(doc: DocumentNode) {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  const row = section.nodes["flow-row-1"]
  const leftStack = section.nodes["flow-stack-left"]
  const rightStack = section.nodes["flow-stack-right"]
  const paragraphText = (nodeId: string) => {
    const node = section.nodes[nodeId]
    expect(node?.type).toBe("paragraph")
    if (node?.type !== "paragraph") return undefined

    const firstChild = node.children[0]
    expect(firstChild?.type).toBe("text")
    return firstChild?.type === "text" ? firstChild.text : undefined
  }

  expect(body?.type).toBe("body")
  if (body?.type === "body") {
    expect(body.childIds).toEqual(["flow-row-1"])
  }

  expect(row?.type).toBe("flow-row")
  if (row?.type === "flow-row") {
    expect(row.childIds).toEqual(["flow-stack-left", "flow-stack-right"])
  }

  expect(leftStack?.type).toBe("flow-stack")
  if (leftStack?.type === "flow-stack") {
    expect(leftStack.childIds).toEqual(["left-1", "left-2"])
    expect(leftStack.props.widthShare).toBe(50)
  }

  expect(rightStack?.type).toBe("flow-stack")
  if (rightStack?.type === "flow-stack") {
    expect(rightStack.childIds).toEqual(["right-1", "right-2"])
    expect(rightStack.props.widthShare).toBe(50)
  }

  expect(paragraphText("left-1")).toBe("Left paragraph 1")
  expect(paragraphText("left-2")).toBe("Left paragraph 2")
  expect(paragraphText("right-1")).toBe("Right paragraph 1")
  expect(paragraphText("right-2")).toBe("Right paragraph 2")
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

  it("parses legacy document-first package JSON without upgrading during import parse", () => {
    const doc = createDefaultDocument("Packaged")
    const raw = serializeLegacyDocumentPackage(doc)
    const pack = JSON.parse(raw)

    const result = parsePersistedDocument(raw)

    expect(pack.packageVersion).toBe(LEGACY_PACKAGE_VERSION)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe("package")
    expect(result.package?.packageVersion).toBe(LEGACY_PACKAGE_VERSION)
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
    const pack = createLegacyDocumentPackage(doc)
    expect(parsePersistedDocument(JSON.stringify({ ...pack, packageVersion: 99 })))
      .toEqual({ ok: false, reason: "unsupported-package-version" })
  })

  it("rejects invalid document packages", () => {
    expect(parsePersistedDocument(JSON.stringify({ packageVersion: 1, kind: "document", id: "" })))
      .toEqual({ ok: false, reason: "invalid-package" })
  })

  it("rejects document packages whose package id does not match the document id", () => {
    const doc = createDefaultDocument("Mismatched")
    const pack = createLegacyDocumentPackage(doc)

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
    const storedPackage = JSON.parse(items.get(STORAGE_KEY)!)
    expect(storedPackage["packageVersion"]).toBe(CURRENT_STORAGE_PACKAGE_VERSION)
    expect(storedPackage["fields"]).toEqual({ version: 1, fields: [] })

    const result = loadDocumentFromStorage(storage)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.doc.document.meta?.title).toBe("Storage")
    expect(result.package?.packageVersion).toBe(CURRENT_STORAGE_PACKAGE_VERSION)
  })

  it("round-trips flow-row stack content through localStorage without flattening columns", () => {
    const items = new Map<string, string>()
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(key, value)
      },
    }
    const doc = makeFlowRowDocument()

    expect(saveDocumentToStorage(storage, doc, { now: "2026-05-15T12:00:00.000Z" })).toEqual({ ok: true })

    const storedPackage = JSON.parse(items.get(STORAGE_KEY)!)
    expect(storedPackage.packageVersion).toBe(CURRENT_STORAGE_PACKAGE_VERSION)
    expectFlowRowTree(storedPackage.document)

    const result = loadDocumentFromStorage(storage)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expectFlowRowTree(result.doc)
    expect(result.package?.packageVersion).toBe(CURRENT_STORAGE_PACKAGE_VERSION)
  })

  it("saves localStorage packages as v2 with the provided field registry", () => {
    const items = new Map<string, string>()
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value) },
    }
    const doc = createDefaultDocument("Storage V2 Registry")
    firstParagraph(doc).children = [
      { id: "field-customer", type: "fieldRef", key: "customer.name", label: "Customer" },
    ]
    const fields: FieldRegistryV1 = {
      version: 1,
      fields: [{ key: "customer.name", fieldType: "text", label: "Customer name", required: true }],
    }

    expect(saveDocumentToStorage(storage, doc, { fields, now: "2026-05-12T00:00:00.000Z" })).toEqual({ ok: true })
    const storedPackage = JSON.parse(items.get(STORAGE_KEY)!)
    expect(storedPackage["packageVersion"]).toBe(2)
    expect(storedPackage["fields"]).toEqual(fields)

    const result = loadDocumentFromStorage(storage)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package?.packageVersion).toBe(2)
    expect(result.package?.packageVersion === 2 ? result.package.fields : null).toEqual(fields)
    expect(result.fieldRegistryIssues).toEqual([])
  })

  it("saves and loads package v2 data snapshots through localStorage", () => {
    const items = new Map<string, string>()
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value) },
    }
    const doc = createDefaultDocument("Storage V2 Data")
    firstParagraph(doc).children = [
      { id: "field-customer", type: "fieldRef", key: "customer.name", label: "Customer" },
    ]
    const fields: FieldRegistryV1 = {
      version: 1,
      fields: [{ key: "customer.name", fieldType: "text", label: "Customer name" }],
    }
    const data = dataSnapshot({ "customer.name": "Acme Co" })

    expect(saveDocumentToStorage(storage, doc, { fields, data, now: "2026-05-12T00:00:00.000Z" })).toEqual({ ok: true })
    const storedPackage = JSON.parse(items.get(STORAGE_KEY)!)
    expect(storedPackage["packageVersion"]).toBe(2)
    expect(storedPackage["data"]).toEqual(data)

    const result = loadDocumentFromStorage(storage)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package?.packageVersion).toBe(2)
    expect(result.package?.packageVersion === 2 ? result.package.data : null).toEqual(data)
  })

  it("serializes JSON export as the current package v2 shape", () => {
    const doc = createDefaultDocument("Download")
    const exported = JSON.parse(serializeDocumentPackage(doc))

    expect(exported.packageVersion).toBe(CURRENT_PACKAGE_VERSION)
    expect(exported.packageVersion).toBe(2)
    expect(exported.kind).toBe("document")
    expect(exported.document.document.meta.title).toBe("Download")
    expect(exported.fields).toEqual({ version: 1, fields: [] })
  })

  it("serializes JSON export with a field registry and data snapshot", () => {
    const doc = createDefaultDocument("Download V2")
    firstParagraph(doc).children = [
      { id: "field-customer", type: "fieldRef", key: "customer.name", label: "Customer" },
    ]
    const fields: FieldRegistryV1 = {
      version: 1,
      fields: [{ key: "customer.name", fieldType: "text", label: "Customer name" }],
    }
    const data = dataSnapshot({ "customer.name": "Acme Co" })

    const exported = JSON.parse(serializeDocumentPackageWithFields(doc, fields, data))

    expect(exported.packageVersion).toBe(2)
    expect(exported.kind).toBe("document")
    expect(exported.document.document.meta.title).toBe("Download V2")
    expect(exported.fields).toEqual(fields)
    expect(exported.data).toEqual(data)
  })

  it("parses package v2 with a field registry as the current package format", () => {
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
    if (result.package?.packageVersion !== 2) return
    expect(result.fieldRegistryIssues).toEqual([])
    expect(JSON.parse(serializeDocumentPackageWithFields(result.doc, result.package.fields)).packageVersion).toBe(2)
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

  it("parses package v2 with a document-bound data snapshot", () => {
    const doc = createDefaultDocument("Package V2 Data")
    firstParagraph(doc).children = [
      { id: "field-customer", type: "fieldRef", key: "customer.name", label: "Customer" },
    ]
    const data = dataSnapshot({ "customer.name": "Acme Co" })
    const result = parsePersistedDocument(JSON.stringify({
      ...packageV2(doc, [{ key: "customer.name", fieldType: "text", label: "Customer name" }]),
      data,
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package?.packageVersion).toBe(2)
    expect(result.package?.packageVersion === 2 ? result.package.data : null).toEqual(data)
    expect(result.fieldRegistryIssues).toEqual([])
  })

  it("rejects package v2 with structurally invalid data snapshots", () => {
    const doc = createDefaultDocument("Invalid Data Snapshot")

    expect(parsePersistedDocument(JSON.stringify({
      ...packageV2(doc, []),
      data: { version: 1, updatedAt: "2026-05-12T00:00:00.000Z", values: { nested: { bad: true } } },
    }))).toEqual({ ok: false, reason: "invalid-package" })
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

    const result = parsePersistedDocument(serializeDocumentPackageWithFields(doc, {
      version: 1,
      fields: [{ key: "customer.name", fieldType: "text", label: "Customer name" }],
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fieldRegistryIssues).toEqual([])
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
    expect(result.package.fields).toEqual({ version: 1, fields: [] })
  })

  it("keeps package migration idempotent after migrating package v1", () => {
    const doc = createDefaultDocument("Idempotent")
    const pack = createLegacyDocumentPackage(doc, "2026-05-11T00:00:00.000Z")

    const first = migratePersistedDocumentPackage(JSON.stringify(pack), "2026-05-12T00:00:00.000Z")
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.package.packageVersion).toBe(2)

    const second = migratePersistedDocumentPackage(JSON.stringify(first.package), "2026-05-13T00:00:00.000Z")
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.package).toEqual(first.package)
  })

  it("migrates package v1 into package v2 in memory", () => {
    const doc = createDefaultDocument("V2 Migration")
    const pack = createLegacyDocumentPackage(doc, "2026-05-11T00:00:00.000Z")

    const result = migratePersistedDocumentPackageToV2(JSON.stringify(pack), "2026-05-12T00:00:00.000Z")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe("package")
    expect(result.package.packageVersion).toBe(2)
    expect(result.package.id).toBe(pack.id)
    expect(result.package.meta).toEqual(pack.meta)
    expect(result.package.document).toEqual(pack.document)
    expect(result.package.fields).toEqual({ version: 1, fields: [] })
    expect(result.fieldRegistryIssues).toEqual([])
    expect(JSON.parse(serializeDocumentPackage(result.package.document)).packageVersion).toBe(2)
  })

  it("migrates legacy raw documents into package v2 with missing field warnings", () => {
    const doc = createDefaultDocument("Legacy V2 Migration")
    firstParagraph(doc).children = [
      { id: "field-customer", type: "fieldRef", key: "customer.name", label: "Customer" },
    ]

    const result = migratePersistedDocumentPackageToV2(JSON.stringify(doc), "2026-05-11T00:00:00.000Z")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe("legacy-document")
    expect(result.package.packageVersion).toBe(2)
    expect(result.package.fields).toEqual({ version: 1, fields: [] })
    expect(result.package.meta.createdAt).toBe("2026-05-11T00:00:00.000Z")
    expect(result.fieldRegistryIssues).toEqual([
      expect.objectContaining({
        code: "missing-definition",
        severity: "warning",
        key: "customer.name",
        fieldRefId: "field-customer",
      }),
    ])
  })

  it("keeps package v2 migration idempotent while preserving optional layers", () => {
    const doc = createDefaultDocument("Existing V2")
    const pack = {
      ...packageV2(doc, [{ key: "customer.name", fieldType: "text" }]),
      data: dataSnapshot({ "customer.name": "Acme" }),
      history: { version: 1, entries: [] },
      migrations: [{ from: 1, to: 2 }],
    }

    const result = migratePersistedDocumentPackageToV2(JSON.stringify(pack), "2026-05-12T00:00:00.000Z")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe("package")
    expect(result.package.packageVersion).toBe(2)
    expect(result.package.fields).toEqual(pack.fields)
    expect(result.package.data).toEqual(pack.data)
    expect(result.package.history).toEqual(pack.history)
    expect(result.package.migrations).toEqual(pack.migrations)
    expect(result.fieldRegistryIssues).toEqual([])
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
