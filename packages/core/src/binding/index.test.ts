import { describe, expect, it } from "vitest"
import type { DataSnapshotV1, FieldScalarValue } from "../dataSnapshot"
import type { FieldRegistryV1 } from "../fieldRegistry"
import type { DocumentNode, LayoutNode, ParagraphNode, TableCellNode, TableNode, TableRowNode } from "../schema"
import { pt } from "../schema"
import { bindDocument, bindDocumentWithSnapshot, type BindingContext } from "./index"

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
      meta: { title: "Binding contract" },
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

function makeTableDoc(paragraph: ParagraphNode): DocumentNode {
  const cell: TableCellNode = { id: "cell", type: "table-cell", props: {}, childIds: [paragraph.id] }
  const row: TableRowNode = { id: "row", type: "table-row", props: {}, cellIds: [cell.id] }
  const table: TableNode = {
    id: "table",
    type: "table",
    props: {},
    columns: [{ width: pt(200) }],
    rowIds: [row.id],
    nodes: {
      [row.id]: row,
      [cell.id]: cell,
      [paragraph.id]: paragraph,
    },
  }
  return makeDoc({ table: table as unknown as LayoutNode }, ["table"])
}

function fieldRef(id: string, key: string, fallback?: string): ParagraphNode["children"][number] {
  return { id, type: "fieldRef", key, label: key, fallback }
}

function textOfParagraph(doc: DocumentNode, paragraphId: string): string {
  const node = doc.document.sections[0].nodes[paragraphId]
  expect(node.type).toBe("paragraph")
  if (node.type !== "paragraph") return ""
  return node.children.map((child) => child.type === "text" ? child.text : `[${child.type}]`).join("")
}

function textOfTableParagraph(doc: DocumentNode, tableId: string, paragraphId: string): string {
  const table = doc.document.sections[0].nodes[tableId]
  expect(table.type).toBe("table")
  if (table.type !== "table") return ""
  const paragraph = (table as unknown as TableNode).nodes[paragraphId]
  expect(paragraph.type).toBe("paragraph")
  if (paragraph.type !== "paragraph") return ""
  return paragraph.children.map((child) => child.type === "text" ? child.text : `[${child.type}]`).join("")
}

function bind(template: DocumentNode, data: BindingContext["data"]): DocumentNode {
  return bindDocument(template, { registry: { fields: [] }, data })
}

function snapshot(values: DataSnapshotV1["values"]): DataSnapshotV1 {
  return { version: 1, updatedAt: "2026-05-11T00:00:00.000Z", values }
}

describe("binding scalar fieldRef contract", () => {
  it("replaces existing scalar fieldRefs with text runs", () => {
    const paragraph = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Customer: " },
      fieldRef("f1", "customer.name"),
      { id: "t2", type: "text", text: " / Total: " },
      fieldRef("f2", "total"),
    ])
    const result = bind(makeDoc({ p1: paragraph }, ["p1"]), {
      customer: { name: "Acme" },
      total: 1200,
    })

    expect(textOfParagraph(result, "p1")).toBe("Customer: Acme / Total: 1200")
  })

  it("uses fallback text when a field is missing", () => {
    const paragraph = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Contact: " },
      fieldRef("f1", "customer.contact", "N/A"),
    ])
    const result = bind(makeDoc({ p1: paragraph }, ["p1"]), { customer: { name: "Acme" } })

    expect(textOfParagraph(result, "p1")).toBe("Contact: N/A")
  })

  it("uses an empty text run when a field is missing and no fallback exists", () => {
    const paragraph = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Reference:" },
      fieldRef("f1", "missing.reference"),
    ])
    const result = bind(makeDoc({ p1: paragraph }, ["p1"]), {})

    const node = result.document.sections[0].nodes.p1
    expect(node.type).toBe("paragraph")
    if (node.type !== "paragraph") return
    expect(node.children).toEqual([
      { id: "t1", type: "text", text: "Reference:" },
      { id: "f1", type: "text", text: "" },
    ])
  })

  it("binds scalar fieldRefs inside table-cell paragraphs", () => {
    const paragraph = makeParagraph("cell_p", [
      { id: "t1", type: "text", text: "SKU " },
      fieldRef("f1", "item.sku"),
    ])
    const result = bind(makeTableDoc(paragraph), { item: { sku: "A-001" } })

    expect(textOfTableParagraph(result, "table", "cell_p")).toBe("SKU A-001")
  })

  it("does not mutate the template document", () => {
    const template = makeDoc({
      p1: makeParagraph("p1", [
        { id: "t1", type: "text", text: "Name: " },
        fieldRef("f1", "customer.name"),
      ]),
    }, ["p1"])
    const before = structuredClone(template)

    const result = bind(template, { customer: { name: "Acme" } })

    expect(template).toEqual(before)
    expect(result).not.toBe(template)
    expect(textOfParagraph(result, "p1")).toBe("Name: Acme")
  })

  it("treats the registry as descriptive rather than strict validation for now", () => {
    const paragraph = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Unregistered: " },
      fieldRef("f1", "not.in.registry"),
    ])
    const template = makeDoc({ p1: paragraph }, ["p1"])

    const result = bindDocument(template, {
      registry: { fields: [{ key: "other.field", type: "scalar" }] },
      data: { not: { in: { registry: "still resolves" } } },
    })

    expect(textOfParagraph(result, "p1")).toBe("Unregistered: still resolves")
  })

  it("binds flat data snapshot values without mutating the template", () => {
    const template = makeDoc({
      p1: makeParagraph("p1", [
        { id: "t1", type: "text", text: "Customer: " },
        fieldRef("f1", "customer.name"),
        { id: "t2", type: "text", text: " / Total: " },
        fieldRef("f2", "invoice.total"),
      ]),
    }, ["p1"])
    const before = structuredClone(template)
    const registry: FieldRegistryV1 = {
      version: 1,
      fields: [
        { key: "customer.name", fieldType: "text" },
        { key: "invoice.total", fieldType: "number" },
      ],
    }

    const result = bindDocumentWithSnapshot(template, {
      registry,
      snapshot: snapshot({
        "customer.name": "Acme",
        "invoice.total": 1200,
      }),
    })

    expect(result.issues).toEqual([])
    expect(template).toEqual(before)
    expect(textOfParagraph(result.doc, "p1")).toBe("Customer: Acme / Total: 1200")
  })

  it("uses registry fallback when snapshot values are missing", () => {
    const template = makeDoc({
      p1: makeParagraph("p1", [
        { id: "t1", type: "text", text: "Contact: " },
        fieldRef("f1", "customer.contact"),
      ]),
    }, ["p1"])

    const result = bindDocumentWithSnapshot(template, {
      registry: {
        version: 1,
        fields: [{ key: "customer.contact", fieldType: "text", fallback: "N/A", required: true }],
      },
      snapshot: snapshot({}),
    })

    expect(result.issues).toEqual([expect.objectContaining({
      code: "missing-required-value",
      severity: "warning",
      key: "customer.contact",
    })])
    expect(textOfParagraph(result.doc, "p1")).toBe("Contact: N/A")
  })

  it("reports invalid snapshot values and falls back instead of rendering them", () => {
    const invalidNumber = "not-a-number" as unknown as FieldScalarValue
    const template = makeDoc({
      p1: makeParagraph("p1", [
        { id: "t1", type: "text", text: "Total: " },
        fieldRef("f1", "invoice.total", "pending"),
      ]),
    }, ["p1"])

    const result = bindDocumentWithSnapshot(template, {
      registry: {
        version: 1,
        fields: [{ key: "invoice.total", fieldType: "number" }],
      },
      snapshot: snapshot({ "invoice.total": invalidNumber }),
    })

    expect(result.issues).toEqual([expect.objectContaining({
      code: "invalid-value-type",
      severity: "error",
      key: "invoice.total",
    })])
    expect(textOfParagraph(result.doc, "p1")).toBe("Total: pending")
  })
})
