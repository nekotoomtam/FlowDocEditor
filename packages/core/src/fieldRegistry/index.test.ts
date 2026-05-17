import { describe, expect, it } from "vitest"
import type {
  DocumentNode,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableRowNode,
  LayoutNode,
  ParagraphNode,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "../schema"
import { pt } from "../schema"
import {
  collectDocumentFieldRefs,
  hasFieldRegistryErrors,
  validateFieldRegistryReferences,
  type FieldRegistryV1,
} from "./index"

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
      meta: { title: "Field registry contract" },
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

function makeFlowTableDoc(paragraph: ParagraphNode): DocumentNode {
  const cell: FlowTableCellNode = { id: "flow-cell", type: "flow-table-cell", props: {}, childIds: [paragraph.id] }
  const row: FlowTableRowNode = { id: "flow-row", type: "flow-table-row", props: {}, cellIds: [cell.id] }
  const table: FlowTableNode = {
    id: "flow-table",
    type: "flow-table",
    props: {},
    columns: [{ width: pt(200) }],
    rowIds: [row.id],
    nodes: {
      [row.id]: row,
      [cell.id]: cell,
      [paragraph.id]: paragraph,
    },
  }
  return makeDoc({ "flow-table": table as unknown as LayoutNode }, ["flow-table"])
}

const registry: FieldRegistryV1 = {
  version: 1,
  fields: [
    { key: "customer.name", fieldType: "text", label: "Customer name", required: true },
    { key: "invoice.total", fieldType: "number", label: "Invoice total" },
  ],
}

describe("field registry references", () => {
  it("collects fieldRef usages from body paragraphs and table-cell paragraphs", () => {
    const bodyParagraph = makeParagraph("body-p", [
      { id: "body-t", type: "text", text: "Customer " },
      { id: "body-field", type: "fieldRef", key: "customer.name", label: "Customer", fallback: "-" },
    ])
    const tableParagraph = makeParagraph("table-p", [
      { id: "table-field", type: "fieldRef", key: "invoice.total", label: "Total" },
    ])
    const tableDoc = makeTableDoc(tableParagraph)
    const table = tableDoc.document.sections[0].nodes.table
    const doc = makeDoc({ "body-p": bodyParagraph, table }, ["body-p", "table"])

    expect(collectDocumentFieldRefs(doc)).toEqual([
      {
        key: "customer.name",
        fieldRefId: "body-field",
        paragraphId: "body-p",
        sectionId: "section",
        label: "Customer",
        fallback: "-",
      },
      {
        key: "invoice.total",
        fieldRefId: "table-field",
        paragraphId: "table-p",
        sectionId: "section",
        tableId: "table",
        label: "Total",
        fallback: undefined,
      },
    ])
  })

  it("collects fieldRef usages from flow-table-cell paragraphs", () => {
    const paragraph = makeParagraph("flow-table-p", [
      { id: "flow-table-field", type: "fieldRef", key: "invoice.total", label: "Total" },
    ])
    const doc = makeFlowTableDoc(paragraph)

    expect(collectDocumentFieldRefs(doc)).toEqual([
      {
        key: "invoice.total",
        fieldRefId: "flow-table-field",
        paragraphId: "flow-table-p",
        sectionId: "section",
        tableId: "flow-table",
        label: "Total",
        fallback: undefined,
      },
    ])
  })

  it("accepts registered inline scalar field references", () => {
    const paragraph = makeParagraph("p1", [
      { id: "f1", type: "fieldRef", key: "customer.name" },
      { id: "f2", type: "fieldRef", key: "invoice.total" },
    ])
    const result = validateFieldRegistryReferences(makeDoc({ p1: paragraph }, ["p1"]), registry)

    expect(result.usages.map((usage) => usage.key)).toEqual(["customer.name", "invoice.total"])
    expect(result.issues).toEqual([])
    expect(hasFieldRegistryErrors(result)).toBe(false)
  })

  it("reports duplicate registry keys as errors", () => {
    const paragraph = makeParagraph("p1", [{ id: "f1", type: "fieldRef", key: "customer.name" }])
    const result = validateFieldRegistryReferences(makeDoc({ p1: paragraph }, ["p1"]), {
      version: 1,
      fields: [
        { key: "customer.name", fieldType: "text" },
        { key: "customer.name", fieldType: "number" },
      ],
    })

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "duplicate-key",
      severity: "error",
      key: "customer.name",
    }))
    expect(hasFieldRegistryErrors(result)).toBe(true)
  })

  it("reports missing field definitions as warnings while binding remains descriptive", () => {
    const paragraph = makeParagraph("p1", [{ id: "f1", type: "fieldRef", key: "missing.key" }])
    const result = validateFieldRegistryReferences(makeDoc({ p1: paragraph }, ["p1"]), registry)

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "missing-definition",
        severity: "warning",
        key: "missing.key",
        fieldRefId: "f1",
        paragraphId: "p1",
        sectionId: "section",
      }),
    ])
    expect(hasFieldRegistryErrors(result)).toBe(false)
  })

  it("reports collection and image fields as invalid inline fieldRef targets", () => {
    const paragraph = makeParagraph("p1", [
      { id: "f1", type: "fieldRef", key: "items" },
      { id: "f2", type: "fieldRef", key: "signature.image" },
    ])
    const result = validateFieldRegistryReferences(makeDoc({ p1: paragraph }, ["p1"]), {
      version: 1,
      fields: [
        { key: "items", fieldType: "collection" },
        { key: "signature.image", fieldType: "image" },
      ],
    })

    expect(result.issues).toEqual([
      expect.objectContaining({ code: "non-inline-field-ref", severity: "error", key: "items" }),
      expect.objectContaining({ code: "non-inline-field-ref", severity: "error", key: "signature.image" }),
    ])
    expect(hasFieldRegistryErrors(result)).toBe(true)
  })
})
