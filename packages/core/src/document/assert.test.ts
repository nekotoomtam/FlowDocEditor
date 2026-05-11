import { describe, expect, it } from "vitest"
import type { DocumentNode, LayoutNode, ParagraphNode, TableCellNode, TableNode, TableRowNode } from "../schema"
import { pt } from "../schema"
import { assertDocument, DocumentAssertionError } from "./assert"

function paragraph(id: string, text = "Cell"): ParagraphNode {
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
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function tableDoc(table: TableNode): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
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
          body: { id: "body", type: "body", props: {}, childIds: [table.id] },
          [table.id]: table as unknown as LayoutNode,
        },
      }],
    },
  }
}

function cell(id: string, childId: string, props: TableCellNode["props"] = {}): TableCellNode {
  return { id, type: "table-cell", props, childIds: [childId] }
}

function row(id: string, cellIds: string[]): TableRowNode {
  return { id, type: "table-row", props: {}, cellIds }
}

describe("assertDocument table invariants", () => {
  it("rejects table rows that do not fill every column", () => {
    const p1 = paragraph("p1")
    const c1 = cell("c1", p1.id)
    const r1 = row("r1", [c1.id])
    const table: TableNode = {
      id: "table",
      type: "table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id],
      nodes: { [r1.id]: r1, [c1.id]: c1, [p1.id]: p1 },
    }

    expect(() => assertDocument(tableDoc(table))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(tableDoc(table))).toThrow("table row must fill all 2 columns")
  })

  it("counts rowspans when checking whether a row fills all columns", () => {
    const p1 = paragraph("p1")
    const p2 = paragraph("p2")
    const p3 = paragraph("p3")
    const c1 = cell("c1", p1.id, { rowspan: 2 })
    const c2 = cell("c2", p2.id)
    const c3 = cell("c3", p3.id)
    const r1 = row("r1", [c1.id, c2.id])
    const r2 = row("r2", [c3.id])
    const table: TableNode = {
      id: "table",
      type: "table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id, r2.id],
      nodes: {
        [r1.id]: r1,
        [r2.id]: r2,
        [c1.id]: c1,
        [c2.id]: c2,
        [c3.id]: c3,
        [p1.id]: p1,
        [p2.id]: p2,
        [p3.id]: p3,
      },
    }

    expect(() => assertDocument(tableDoc(table))).not.toThrow()
  })

  it("rejects headerRowCount larger than the table row count", () => {
    const p1 = paragraph("p1")
    const c1 = cell("c1", p1.id)
    const r1 = row("r1", [c1.id])
    const table: TableNode = {
      id: "table",
      type: "table",
      props: { headerRowCount: 2 },
      columns: [{ width: pt(100) }],
      rowIds: [r1.id],
      nodes: { [r1.id]: r1, [c1.id]: c1, [p1.id]: p1 },
    }

    expect(() => assertDocument(tableDoc(table))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(tableDoc(table))).toThrow("headerRowCount cannot exceed table row count")
  })
})
