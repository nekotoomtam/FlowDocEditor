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

function bodyDoc(nodes: Record<string, LayoutNode>, childIds: string[]): DocumentNode {
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
          body: { id: "body", type: "body", props: {}, childIds },
          ...nodes,
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

  it("allows authored toc blocks used by report fixtures", () => {
    const doc = bodyDoc({
      toc: { id: "toc", type: "toc", props: { title: "สารบัญ" } },
    }, ["toc"])

    expect(() => assertDocument(doc)).not.toThrow()
  })
})

describe("assertDocument flow-row / flow-stack invariants", () => {
  it("allows a valid two-stack flow-row", () => {
    const p1 = paragraph("p1", "Left")
    const p2 = paragraph("p2", "Right")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("allows a valid three-stack flow-row", () => {
    const p1 = paragraph("p1", "A")
    const p2 = paragraph("p2", "B")
    const p3 = paragraph("p3", "C")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: { gap: 8 }, childIds: ["fs1", "fs2", "fs3"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p2"] },
      fs3: { id: "fs3", type: "flow-stack", props: { widthShare: 33.34 }, childIds: ["p3"] },
      p1,
      p2,
      p3,
    }, ["fr1"])

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("rejects an old stack inside a flow-row", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["st1"] },
      st1: { id: "st1", type: "stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("flow-row child must be flow-stack")
  })

  it("rejects a flow-stack inside an old row", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      row1: { id: "row1", type: "row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["row1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("row child must be stack")
  })

  it("rejects a flow-stack outside a flow-row", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fs1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("body child must be paragraph, row, flow-row, spacer, table, or toc")
  })

  it("rejects non-paragraph and non-spacer children inside flow-stack", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["row1"] },
      row1: { id: "row1", type: "row", props: {}, childIds: ["st1"] },
      st1: { id: "st1", type: "stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("flow-stack child must be paragraph or spacer")
  })

  it("rejects a flow-stack without widthShare inside flow-row", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: {}, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("flow-stack inside flow-row must have widthShare")
  })

  it("rejects flow-row width shares that do not total 100", () => {
    const p1 = paragraph("p1", "Left")
    const p2 = paragraph("p2", "Right")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 40 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 40 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("flow-row stack widths must total exactly 100.00")
  })
})
