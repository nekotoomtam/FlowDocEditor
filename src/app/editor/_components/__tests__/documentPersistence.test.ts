import { describe, expect, it } from "vitest"
import { createDefaultDocument, DEFAULT_PARAGRAPH_PROPS } from "@/document"
import type { ParagraphNode } from "@/schema"
import {
  CURRENT_DOCUMENT_VERSION,
  CURRENT_PACKAGE_VERSION,
  STORAGE_KEY,
  createDocumentPackage,
  loadDocumentFromStorage,
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
    expect(parsePersistedDocument(JSON.stringify({ ...pack, packageVersion: 2 })))
      .toEqual({ ok: false, reason: "unsupported-package-version" })
  })

  it("rejects invalid document packages", () => {
    expect(parsePersistedDocument(JSON.stringify({ packageVersion: 1, kind: "document", id: "" })))
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
    expect(exported.kind).toBe("document")
    expect(exported.document.document.meta.title).toBe("Download")
  })
})
