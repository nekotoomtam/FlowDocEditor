import { describe, expect, it } from "vitest"
import type { DataSnapshotV1 } from "../dataSnapshot"
import type { FieldRegistryV1 } from "../fieldRegistry"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../schema"
import { pt } from "../schema"
import { assessDocumentDataReadiness } from "./index"

function makeParagraph(id: string, children: ParagraphNode["children"]): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "default",
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children,
  }
}

function makeDoc(nodes: Record<string, LayoutNode>, childIds: string[]): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      meta: { title: "Readiness contract" },
      sections: [{
        id: "section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds },
          ...nodes,
        },
      }],
    },
  }
}

function fieldRef(id: string, key: string): ParagraphNode["children"][number] {
  return { id, type: "fieldRef", key, label: key }
}

function snapshot(values: DataSnapshotV1["values"]): DataSnapshotV1 {
  return { version: 1, updatedAt: "2026-05-11T00:00:00.000Z", values }
}

describe("document data readiness", () => {
  it("passes when used fieldRefs have valid snapshot values", () => {
    const doc = makeDoc({
      p1: makeParagraph("p1", [
        { id: "t1", type: "text", text: "Customer: " },
        fieldRef("f1", "customer.name"),
      ]),
    }, ["p1"])
    const registry: FieldRegistryV1 = {
      version: 1,
      fields: [{ key: "customer.name", fieldType: "text", required: true }],
    }

    const report = assessDocumentDataReadiness({
      doc,
      registry,
      snapshot: snapshot({ "customer.name": "Acme" }),
    })

    expect(report.issues).toEqual([])
    expect(report.hasErrors).toBe(false)
    expect(report.hasWarnings).toBe(false)
  })

  it("reports missing registry definitions as readiness warnings", () => {
    const doc = makeDoc({
      p1: makeParagraph("p1", [fieldRef("f1", "missing.key")]),
    }, ["p1"])

    const report = assessDocumentDataReadiness({
      doc,
      registry: { version: 1, fields: [] },
      snapshot: snapshot({}),
    })

    expect(report.issues).toEqual([expect.objectContaining({
      source: "field-registry",
      code: "missing-definition",
      severity: "warning",
      key: "missing.key",
    })])
    expect(report.hasWarnings).toBe(true)
  })

  it("checks required snapshot values only for fields used by the document", () => {
    const doc = makeDoc({
      p1: makeParagraph("p1", [fieldRef("f1", "customer.name")]),
    }, ["p1"])
    const registry: FieldRegistryV1 = {
      version: 1,
      fields: [
        { key: "customer.name", fieldType: "text", required: true },
        { key: "document.date", fieldType: "date", required: true },
      ],
    }

    const report = assessDocumentDataReadiness({
      doc,
      registry,
      snapshot: snapshot({}),
    })

    expect(report.issues).toEqual([expect.objectContaining({
      source: "data-snapshot",
      code: "missing-required-value",
      severity: "warning",
      key: "customer.name",
    })])
    expect(report.issues.some((issue) => issue.key === "document.date")).toBe(false)
  })

  it("reports invalid snapshot values as readiness errors", () => {
    const doc = makeDoc({
      p1: makeParagraph("p1", [fieldRef("f1", "invoice.total")]),
    }, ["p1"])

    const report = assessDocumentDataReadiness({
      doc,
      registry: { version: 1, fields: [{ key: "invoice.total", fieldType: "number" }] },
      snapshot: snapshot({ "invoice.total": "oops" as never }),
    })

    expect(report.issues).toEqual([expect.objectContaining({
      source: "data-snapshot",
      code: "invalid-value-type",
      severity: "error",
      key: "invoice.total",
    })])
    expect(report.hasErrors).toBe(true)
  })
})
