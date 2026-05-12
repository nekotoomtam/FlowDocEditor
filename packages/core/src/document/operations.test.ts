import { describe, expect, it } from "vitest"
import type { DocumentNode, LayoutNode, ParagraphNode, TableCellNode, TableNode, TableRowNode } from "../schema"
import { pt } from "../schema"
import { assertDocument } from "./assert"
import {
  applyPlacementOperation,
  addTableColumn,
  addTableRow,
  mergeParagraphWithPrevious,
  removeTableColumn,
  removeTableRow,
  splitParagraphAtIndex,
  updateFieldRefInline,
  updateParagraphText,
} from "./operations"

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

function makeGridTableDoc(options: {
  columnWidths?: number[]
  rows?: string[][]
  headerRowCount?: number
} = {}): DocumentNode {
  const rows = options.rows ?? [
    ["A", "B", "C"],
    ["D", "E", "F"],
    ["G", "H", "I"],
  ]
  const columnWidths = options.columnWidths ?? rows[0].map(() => 100)
  const tableNodes: TableNode["nodes"] = {}
  const rowIds: string[] = []

  rows.forEach((rowText, rowIndex) => {
    const cellIds: string[] = []
    rowText.forEach((text, columnIndex) => {
      const paragraph = makeParagraph(`p-${rowIndex}-${columnIndex}`, [
        { id: `t-${rowIndex}-${columnIndex}`, type: "text", text },
      ])
      const cell: TableCellNode = {
        id: `cell-${rowIndex}-${columnIndex}`,
        type: "table-cell",
        props: {},
        childIds: [paragraph.id],
      }
      tableNodes[paragraph.id] = paragraph
      tableNodes[cell.id] = cell
      cellIds.push(cell.id)
    })
    const row: TableRowNode = { id: `row-${rowIndex}`, type: "table-row", props: {}, cellIds }
    tableNodes[row.id] = row
    rowIds.push(row.id)
  })

  const table: TableNode = {
    id: "table",
    type: "table",
    props: options.headerRowCount != null ? { headerRowCount: options.headerRowCount } : {},
    columns: columnWidths.map((width) => ({ width: pt(width) })),
    rowIds,
    nodes: tableNodes,
  }
  return makeDoc({ table: table as unknown as LayoutNode }, ["table"])
}

function getTable(doc: DocumentNode): TableNode {
  return doc.document.sections[0].nodes.table as unknown as TableNode
}

function tableWidth(table: TableNode): number {
  return table.columns.reduce((sum, column) => sum + column.width.value, 0)
}

function paragraphText(node: ParagraphNode): string {
  return node.children.filter((child) => child.type === "text").map((child) => child.text).join("")
}

describe("paragraph text operations", () => {
  it("updates plain text paragraph and collapses multiple text runs to one run", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "world" },
    ])
    const result = updateParagraphText(makeDoc({ p1: p }, ["p1"]), "p1", "Changed")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.children).toHaveLength(1)
    expect(updated.children[0]).toMatchObject({ id: "t1", type: "text", text: "Changed" })
  })

  it("does not update paragraph with fieldRef through plain text operation", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Name: " },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: " baht" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = updateParagraphText(doc, "p1", "Flattened")

    expect(result).toBe(doc)
    expect(result.document.sections[0].nodes.p1).toEqual(p)
  })

  it("does not update paragraph with pageNumber through plain text operation", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = updateParagraphText(doc, "p1", "Page 1")

    expect(result).toBe(doc)
    expect(result.document.sections[0].nodes.p1).toEqual(p)
  })

  it("updates plain text paragraph inside a table", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Cell text" }])
    const result = updateParagraphText(makeTableDoc(p), "p1", "Updated cell")
    const table = result.document.sections[0].nodes.table as unknown as TableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(paragraphText(updated)).toBe("Updated cell")
  })

  it("splits plain text paragraph and preserves total text", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "world" },
    ])
    const result = splitParagraphAtIndex(makeDoc({ p1: p }, ["p1"]), "p1", 6)
    const section = result.doc.document.sections[0]
    const first = section.nodes.p1
    const second = section.nodes[result.newNodeId]

    expect(first.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first.type !== "paragraph" || second?.type !== "paragraph") return
    expect(paragraphText(first)).toBe("Hello ")
    expect(paragraphText(second)).toBe("world")
  })

  it("does not split mixed inline paragraph", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = splitParagraphAtIndex(doc, "p1", 3)

    expect(result.doc).toBe(doc)
    expect(result.newNodeId).toBe("")
  })

  it("merges plain text paragraphs and collapses merged result to one run", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "there" },
    ])
    const p2 = makeParagraph("p2", [{ id: "t3", type: "text", text: " world" }])
    const result = mergeParagraphWithPrevious(makeDoc({ p1, p2 }, ["p1", "p2"]), "p2")

    expect(result).not.toBeNull()
    if (!result) return
    const updated = result.doc.document.sections[0].nodes.p1
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.children).toHaveLength(1)
    expect(paragraphText(updated)).toBe("Hello there world")
    expect(result.caretIndex).toBe("Hello there".length)
  })

  it("does not merge when either paragraph has mixed inline children", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: " body" }])
    const result = mergeParagraphWithPrevious(makeDoc({ p1, p2 }, ["p1", "p2"]), "p2")

    expect(result).toBeNull()
  })
})

describe("field reference operations", () => {
  it("updates fieldRef label and fallback without changing its key", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Customer: " },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer", fallback: "-" },
    ])
    const updated = updateFieldRefInline(makeDoc({ p1: p }, ["p1"]), "f1", {
      label: "Client",
      fallback: "pending",
    })
    const paragraph = updated.document.sections[0].nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children[1]).toMatchObject({
      id: "f1",
      type: "fieldRef",
      key: "customer.name",
      label: "Client",
      fallback: "pending",
    })
  })

  it("clears optional fieldRef label and fallback without removing the fieldRef", () => {
    const p = makeParagraph("p1", [
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer", fallback: "-" },
    ])
    const updated = updateFieldRefInline(makeDoc({ p1: p }, ["p1"]), "f1", {
      label: "",
      fallback: "",
    })
    const paragraph = updated.document.sections[0].nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children[0]).toEqual({
      id: "f1",
      type: "fieldRef",
      key: "customer.name",
    })
  })

  it("updates fieldRef metadata inside a table-cell paragraph", () => {
    const p = makeParagraph("p1", [
      { id: "f1", type: "fieldRef", key: "line.sku", label: "SKU", fallback: "N/A" },
    ])
    const updated = updateFieldRefInline(makeTableDoc(p), "f1", { label: "Item SKU" })
    const table = updated.document.sections[0].nodes.table as unknown as TableNode
    const paragraph = table.nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children[0]).toMatchObject({
      id: "f1",
      type: "fieldRef",
      key: "line.sku",
      label: "Item SKU",
      fallback: "N/A",
    })
  })

  it("inserts a fieldRef inline into a body paragraph without flattening text runs", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Customer: " },
      { id: "t2", type: "text", text: " due" },
    ])
    const updated = applyPlacementOperation(
      makeDoc({ p1: p }, ["p1"]),
      "section",
      { kind: "insert-inline-field", paragraphId: "p1", index: 1 },
      {
        source: "field",
        field: { key: "customer.name", label: "Customer", fallback: "-", fieldType: "text" },
      },
    )
    const paragraph = updated.document.sections[0].nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children).toHaveLength(3)
    expect(paragraph.children[0]).toMatchObject({ id: "t1", type: "text", text: "Customer: " })
    expect(paragraph.children[1]).toMatchObject({
      type: "fieldRef",
      key: "customer.name",
      label: "Customer",
      fallback: "-",
    })
    expect(paragraph.children[2]).toMatchObject({ id: "t2", type: "text", text: " due" })
  })

  it("inserts a fieldRef inline into a table-cell paragraph", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "SKU: " }])
    const updated = applyPlacementOperation(
      makeTableDoc(p),
      "section",
      { kind: "insert-inline-field", paragraphId: "p1", index: 1 },
      {
        source: "field",
        field: { key: "line.sku", label: "SKU", fallback: "N/A", fieldType: "text" },
      },
    )
    const table = updated.document.sections[0].nodes.table as unknown as TableNode
    const paragraph = table.nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children).toHaveLength(2)
    expect(paragraph.children[0]).toMatchObject({ id: "t1", type: "text", text: "SKU: " })
    expect(paragraph.children[1]).toMatchObject({
      type: "fieldRef",
      key: "line.sku",
      label: "SKU",
      fallback: "N/A",
    })
  })
})

describe("table structural operations", () => {
  it("adds a row above the first row and preserves the table cell shape", () => {
    const doc = makeGridTableDoc({
      columnWidths: [120, 80],
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
    })
    const updated = addTableRow(doc, "table", -1)
    const table = getTable(updated)
    const inserted = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(3)
    expect(inserted.type).toBe("table-row")
    if (inserted.type !== "table-row") return
    expect(inserted.cellIds).toHaveLength(2)

    inserted.cellIds.forEach((cellId) => {
      const cell = table.nodes[cellId]
      expect(cell.type).toBe("table-cell")
      if (cell.type !== "table-cell") return
      expect(cell.childIds).toHaveLength(1)
      const paragraph = table.nodes[cell.childIds[0]]
      expect(paragraph.type).toBe("paragraph")
      if (paragraph.type !== "paragraph") return
      expect(paragraphText(paragraph)).toBe("")
    })
  })

  it("removes a row subtree and clamps header rows to the remaining row count", () => {
    const doc = makeGridTableDoc({ headerRowCount: 3 })
    const before = getTable(doc)
    const removedRow = before.nodes[before.rowIds[2]]
    expect(removedRow.type).toBe("table-row")
    if (removedRow.type !== "table-row") return
    const removedIds = new Set<string>([removedRow.id])
    removedRow.cellIds.forEach((cellId) => {
      removedIds.add(cellId)
      const cell = before.nodes[cellId]
      if (cell.type === "table-cell") cell.childIds.forEach((childId) => { removedIds.add(childId) })
    })

    const updated = removeTableRow(doc, "table", 2)
    const table = getTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(2)
    expect(table.props.headerRowCount).toBe(2)
    removedIds.forEach((id) => {
      expect(table.nodes[id]).toBeUndefined()
    })
  })

  it("does not delete the last table row", () => {
    const doc = makeGridTableDoc({
      columnWidths: [100],
      rows: [["Only cell"]],
      headerRowCount: 1,
    })
    const updated = removeTableRow(doc, "table", 0)
    const table = getTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(1)
    expect(table.props.headerRowCount).toBe(1)
  })

  it("adds a column to the left of the first column by splitting the nearest width", () => {
    const doc = makeGridTableDoc({
      columnWidths: [120, 80],
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
    })
    const before = getTable(doc)
    const updated = addTableColumn(doc, "table", -1)
    const table = getTable(updated)
    const firstRow = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([60, 60, 80])
    expect(tableWidth(table)).toBe(tableWidth(before))
    expect(firstRow.type).toBe("table-row")
    if (firstRow.type !== "table-row") return
    expect(firstRow.cellIds).toHaveLength(3)

    const insertedCell = table.nodes[firstRow.cellIds[0]]
    expect(insertedCell.type).toBe("table-cell")
    if (insertedCell.type !== "table-cell") return
    const insertedParagraph = table.nodes[insertedCell.childIds[0]]
    expect(insertedParagraph.type).toBe("paragraph")
    if (insertedParagraph.type !== "paragraph") return
    expect(paragraphText(insertedParagraph)).toBe("")
  })

  it("removes a column subtree and transfers its width to the left neighbor", () => {
    const doc = makeGridTableDoc({ columnWidths: [120, 80, 60] })
    const before = getTable(doc)
    const removedIds = new Set<string>()
    before.rowIds.forEach((rowId) => {
      const row = before.nodes[rowId]
      if (row.type !== "table-row") return
      const cellId = row.cellIds[1]
      removedIds.add(cellId)
      const cell = before.nodes[cellId]
      if (cell.type === "table-cell") cell.childIds.forEach((childId) => { removedIds.add(childId) })
    })

    const updated = removeTableColumn(doc, "table", 1)
    const table = getTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([200, 60])
    expect(tableWidth(table)).toBe(tableWidth(before))
    table.rowIds.forEach((rowId) => {
      const row = table.nodes[rowId]
      expect(row.type).toBe("table-row")
      if (row.type !== "table-row") return
      expect(row.cellIds).toHaveLength(2)
    })
    removedIds.forEach((id) => {
      expect(table.nodes[id]).toBeUndefined()
    })
  })

  it("does not delete the last table column", () => {
    const doc = makeGridTableDoc({
      columnWidths: [100],
      rows: [["Only cell"]],
    })
    const updated = removeTableColumn(doc, "table", 0)
    const table = getTable(updated)
    const row = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns).toHaveLength(1)
    expect(row.type).toBe("table-row")
    if (row.type !== "table-row") return
    expect(row.cellIds).toHaveLength(1)
  })
})
