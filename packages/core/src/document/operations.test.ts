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
import { assertDocument } from "./assert"
import { resolveFlowTableGrid } from "./flowTableGrid"
import {
  applyPlacementOperation,
  addTableColumn,
  addTableRow,
  addFlowTableColumn,
  addFlowTableRow,
  addFlowStackColumn,
  canRemoveFlowTableColumn,
  canRemoveFlowTableRow,
  deleteNode,
  mergeParagraphWithPrevious,
  removeTableColumn,
  removeTableRow,
  removeFlowTableColumn,
  removeFlowTableRow,
  splitParagraphAtIndex,
  updateFieldRefInline,
  updateFlowStackBoxStyle,
  updateParagraphBoxStyle,
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

function makeGridFlowTableDoc(options: {
  columnWidths?: number[]
  rows?: string[][]
  headerRowCount?: number
  firstCellProps?: FlowTableCellNode["props"]
} = {}): DocumentNode {
  const rows = options.rows ?? [
    ["A", "B", "C"],
    ["D", "E", "F"],
    ["G", "H", "I"],
  ]
  const columnWidths = options.columnWidths ?? rows[0].map(() => 100)
  const tableNodes: FlowTableNode["nodes"] = {}
  const rowIds: string[] = []

  rows.forEach((rowText, rowIndex) => {
    const cellIds: string[] = []
    rowText.forEach((text, columnIndex) => {
      const paragraph = makeParagraph(`fp-${rowIndex}-${columnIndex}`, [
        { id: `ft-${rowIndex}-${columnIndex}`, type: "text", text },
      ])
      const cell: FlowTableCellNode = {
        id: `flow-cell-${rowIndex}-${columnIndex}`,
        type: "flow-table-cell",
        props: rowIndex === 0 && columnIndex === 0 ? options.firstCellProps ?? {} : {},
        childIds: [paragraph.id],
      }
      tableNodes[paragraph.id] = paragraph
      tableNodes[cell.id] = cell
      cellIds.push(cell.id)
    })
    const row: FlowTableRowNode = { id: `flow-row-${rowIndex}`, type: "flow-table-row", props: {}, cellIds }
    tableNodes[row.id] = row
    rowIds.push(row.id)
  })

  const table: FlowTableNode = {
    id: "flow-table",
    type: "flow-table",
    props: options.headerRowCount != null ? { headerRowCount: options.headerRowCount } : {},
    columns: columnWidths.map((width) => ({ width: pt(width) })),
    rowIds,
    nodes: tableNodes,
  }
  return makeDoc({ "flow-table": table as unknown as LayoutNode }, ["flow-table"])
}

function makeSpannedFlowTableDoc(): DocumentNode {
  const p1 = makeParagraph("fsp-1", [{ id: "fst-1", type: "text", text: "A" }])
  const p2 = makeParagraph("fsp-2", [{ id: "fst-2", type: "text", text: "B" }])
  const p3 = makeParagraph("fsp-3", [{ id: "fst-3", type: "text", text: "C" }])
  const c1: FlowTableCellNode = { id: "flow-cell-span", type: "flow-table-cell", props: { colspan: 2, rowspan: 2 }, childIds: [p1.id] }
  const c2: FlowTableCellNode = { id: "flow-cell-top-right", type: "flow-table-cell", props: {}, childIds: [p2.id] }
  const c3: FlowTableCellNode = { id: "flow-cell-bottom-right", type: "flow-table-cell", props: {}, childIds: [p3.id] }
  const r1: FlowTableRowNode = { id: "flow-row-top", type: "flow-table-row", props: {}, cellIds: [c1.id, c2.id] }
  const r2: FlowTableRowNode = { id: "flow-row-bottom", type: "flow-table-row", props: {}, cellIds: [c3.id] }
  const table: FlowTableNode = {
    id: "flow-table",
    type: "flow-table",
    props: {},
    columns: [120, 80, 60].map((width) => ({ width: pt(width) })),
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
  return makeDoc({ "flow-table": table as unknown as LayoutNode }, ["flow-table"])
}

function getTable(doc: DocumentNode): TableNode {
  return doc.document.sections[0].nodes.table as unknown as TableNode
}

function getFlowTable(doc: DocumentNode): FlowTableNode {
  return doc.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
}

function tableWidth(table: TableNode): number {
  return table.columns.reduce((sum, column) => sum + column.width.value, 0)
}

function flowTableWidth(table: FlowTableNode): number {
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

  it("updates plain text paragraph inside a flow-table", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Flow cell text" }])
    const result = updateParagraphText(makeFlowTableDoc(p), "p1", "Updated flow cell")
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(paragraphText(updated)).toBe("Updated flow cell")
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

describe("paragraph box style operations", () => {
  it("updates body paragraph box style without changing text content", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Box me" }])
    const result = updateParagraphBoxStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      fill: "F8FAFC",
      padding: {
        top: pt(4),
        right: pt(5),
        bottom: pt(6),
        left: pt(7),
      },
      border: {
        top: { style: "solid", width: pt(1), color: "111111" },
        right: { style: "dashed", width: pt(2), color: "222222" },
      },
    })
    const updated = result.document.sections[0].nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(paragraphText(updated)).toBe("Box me")
    expect(updated.props.box).toEqual({
      fill: "F8FAFC",
      padding: { top: pt(4), right: pt(5), bottom: pt(6), left: pt(7) },
      border: {
        top: { style: "solid", width: pt(1), color: "111111" },
        right: { style: "dashed", width: pt(2), color: "222222" },
      },
    })
  })

  it("merges partial box changes and prunes zero/none values", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Box me" }])
    const withBox = updateParagraphBoxStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      padding: { top: pt(8), left: pt(3) },
      border: {
        bottom: { style: "solid", width: pt(2), color: "333333" },
      },
    })
    const result = updateParagraphBoxStyle(withBox, "p1", {
      padding: { left: pt(0) },
      border: {
        bottom: { style: "none", width: pt(2), color: "333333" },
      },
    })
    const updated = result.document.sections[0].nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.box).toEqual({
      padding: { top: pt(8), right: pt(0), bottom: pt(0), left: pt(0) },
    })
  })

  it("removes an empty paragraph box when all channels are cleared", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Box me" }])
    const withBox = updateParagraphBoxStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      fill: "FFFFFF",
      padding: { top: pt(2) },
      border: { left: { style: "solid", width: pt(1), color: "111111" } },
    })
    const result = updateParagraphBoxStyle(withBox, "p1", {
      fill: null,
      padding: null,
      border: null,
    })
    const updated = result.document.sections[0].nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.box).toBeUndefined()
  })

  it("updates paragraph box style inside a table cell", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Cell" }])
    const result = updateParagraphBoxStyle(makeTableDoc(p), "p1", {
      fill: "E0F2FE",
      padding: { left: pt(9) },
    })
    const table = result.document.sections[0].nodes.table as unknown as TableNode
    const updated = table.nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.box).toEqual({
      fill: "E0F2FE",
      padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(9) },
    })
  })
})

describe("flow-stack box style operations", () => {
  it("updates flow-stack box style without changing row structure", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Column text" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1: p,
    }, ["fr1"])

    const result = updateFlowStackBoxStyle(doc, "fs1", {
      fill: "E0F2FE",
      padding: { top: pt(4), left: pt(6) },
      border: { left: { style: "solid", width: pt(1), color: "111111" } },
    })
    const section = result.document.sections[0]
    const row = section.nodes.fr1
    const stack = section.nodes.fs1

    expect(() => assertDocument(result)).not.toThrow()
    expect(row.type).toBe("flow-row")
    expect(stack.type).toBe("flow-stack")
    if (row.type !== "flow-row" || stack.type !== "flow-stack") return
    expect(row.childIds).toEqual(["fs1"])
    expect(stack.childIds).toEqual(["p1"])
    expect(stack.props.box).toEqual({
      fill: "E0F2FE",
      padding: { top: pt(4), right: pt(0), bottom: pt(0), left: pt(6) },
      border: { left: { style: "solid", width: pt(1), color: "111111" } },
    })
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

describe("flow-row / flow-stack operations", () => {
  it("maps the Row palette block to a single-stack flow-row", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "row" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(1)

    const stack = section.nodes[row.childIds[0]]
    expect(stack.type).toBe("flow-stack")
    if (stack.type !== "flow-stack") return
    expect(stack.props.widthShare).toBe(100)
  })

  it("maps the Columns palette block to a two-stack flow-row", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "columns" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["flow-stack", "flow-stack"])
  })

  it("wraps a body paragraph in flow-stack columns on horizontal placement", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Right" }])
    const updated = applyPlacementOperation(
      makeDoc({ p1 }, ["p1"]),
      "section",
      { kind: "wrap-in-row-left", parentId: "body", parentType: "body", index: 0, targetNodeId: "p1" },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["flow-stack", "flow-stack"])

    const [leftStackId, rightStackId] = row.childIds
    const leftStack = section.nodes[leftStackId]
    const rightStack = section.nodes[rightStackId]
    expect(leftStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (leftStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(section.nodes[leftStack.childIds[0]]?.type).toBe("paragraph")
    expect(rightStack.childIds).toEqual(["p1"])
  })

  it("keeps direct legacy stack wrap operations on the old row model", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Nested" }])
    const updated = applyPlacementOperation(
      makeDoc({
        rowParent: { id: "rowParent", type: "row", props: {}, childIds: ["stackParent"] },
        stackParent: { id: "stackParent", type: "stack", props: { widthShare: 100 }, childIds: ["p1"] },
        p1,
      }, ["rowParent"]),
      "section",
      { kind: "wrap-in-row-left", parentId: "stackParent", parentType: "stack", index: 0, targetNodeId: "p1" },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const stackParent = section.nodes.stackParent

    expect(() => assertDocument(updated)).not.toThrow()
    expect(stackParent.type).toBe("stack")
    if (stackParent.type !== "stack") return

    const row = section.nodes[stackParent.childIds[0]]
    expect(row.type).toBe("row")
    if (row.type !== "row") return
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["stack", "stack"])
  })

  it("inserts a default two-stack flow-row from the palette", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "flow-columns" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    expect(body.childIds).toHaveLength(1)

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(2)
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["flow-stack", "flow-stack"])
    expect(row.childIds.map((id) => {
      const stack = section.nodes[id]
      return stack.type === "flow-stack" ? stack.props.widthShare : undefined
    })).toEqual([50, 50])
  })

  it("inserts a default 3 by 3 flow-table from the palette", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "flow-table" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    expect(body.childIds).toHaveLength(1)

    const table = section.nodes[body.childIds[0]] as unknown as FlowTableNode
    expect(table.type).toBe("flow-table")
    expect(table.rowIds).toHaveLength(3)
    expect(table.columns).toHaveLength(3)
    expect(table.columns.map((column) => column.width)).toEqual([pt(150), pt(150), pt(150)])

    table.rowIds.forEach((rowId) => {
      const row = table.nodes[rowId]
      expect(row.type).toBe("flow-table-row")
      if (row.type !== "flow-table-row") return
      expect(row.cellIds).toHaveLength(3)
      row.cellIds.forEach((cellId) => {
        const cell = table.nodes[cellId]
        expect(cell.type).toBe("flow-table-cell")
        if (cell.type !== "flow-table-cell") return
        expect(cell.childIds).toHaveLength(1)
        const paragraph = table.nodes[cell.childIds[0]]
        expect(paragraph.type).toBe("paragraph")
        if (paragraph.type !== "paragraph") return
        expect(paragraphText(paragraph)).toBe("")
      })
    })
  })

  it("inserts a paragraph into an empty flow-stack", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: [] },
    }, ["fr1"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "fs1", containerType: "flow-stack", index: 0 },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const stack = section.nodes.fs1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(stack.type).toBe("flow-stack")
    if (stack.type !== "flow-stack") return
    expect(stack.childIds).toHaveLength(1)
    expect(section.nodes[stack.childIds[0]]?.type).toBe("paragraph")
  })

  it("inserts a paragraph into the second flow-stack without moving sibling content", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
      p1,
    }, ["fr1"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "fs2", containerType: "flow-stack", index: 0 },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const leftStack = section.nodes.fs1
    const rightStack = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(leftStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (leftStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(leftStack.childIds).toEqual(["p1"])
    expect(rightStack.childIds).toHaveLength(1)
    expect(section.nodes[rightStack.childIds[0]]?.type).toBe("paragraph")
  })

  it("keeps flow-stack topology stable across insert and delete snapshots", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const inserted = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "fs2", containerType: "flow-stack", index: 1 },
      { source: "palette", blockType: "paragraph" },
    )
    const insertedSection = inserted.document.sections[0]
    const insertedLeftStack = insertedSection.nodes.fs1
    const insertedRightStack = insertedSection.nodes.fs2

    expect(() => assertDocument(inserted)).not.toThrow()
    expect(insertedLeftStack.type).toBe("flow-stack")
    expect(insertedRightStack.type).toBe("flow-stack")
    if (insertedLeftStack.type !== "flow-stack" || insertedRightStack.type !== "flow-stack") return
    expect(insertedLeftStack.childIds).toEqual(["p1"])
    expect(insertedRightStack.childIds[0]).toBe("p2")
    expect(insertedRightStack.childIds).toHaveLength(2)
    expect(insertedSection.nodes[insertedRightStack.childIds[1]]?.type).toBe("paragraph")

    const deleted = deleteNode(inserted, insertedRightStack.childIds[1])
    const deletedSection = deleted.document.sections[0]
    const deletedLeftStack = deletedSection.nodes.fs1
    const deletedRightStack = deletedSection.nodes.fs2

    expect(() => assertDocument(deleted)).not.toThrow()
    expect(deletedLeftStack.type).toBe("flow-stack")
    expect(deletedRightStack.type).toBe("flow-stack")
    if (deletedLeftStack.type !== "flow-stack" || deletedRightStack.type !== "flow-stack") return
    expect(deletedLeftStack.childIds).toEqual(["p1"])
    expect(deletedRightStack.childIds).toEqual(["p2"])
  })

  it("adds a flow-stack column by splitting the selected stack width", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = addFlowStackColumn(doc, "fr1", "fs1")
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const leftStack = section.nodes.fs1
    const rightStack = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(3)
    expect(row.childIds[0]).toBe("fs1")
    expect(row.childIds[2]).toBe("fs2")

    const insertedStack = section.nodes[row.childIds[1]]
    expect(leftStack.type).toBe("flow-stack")
    expect(insertedStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (leftStack.type !== "flow-stack" || insertedStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(leftStack.props.widthShare).toBe(25)
    expect(insertedStack.props.widthShare).toBe(25)
    expect(insertedStack.childIds).toEqual([])
    expect(rightStack.props.widthShare).toBe(50)
    expect(leftStack.childIds).toEqual(["p1"])
    expect(rightStack.childIds).toEqual(["p2"])
  })

  it("adds a balanced flow-stack column when the flow-row is selected", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2", "fs3"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 20 }, childIds: [] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 60 }, childIds: [] },
      fs3: { id: "fs3", type: "flow-stack", props: { widthShare: 20 }, childIds: [] },
    }, ["fr1"])

    const updated = addFlowStackColumn(doc, "fr1")
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const firstStack = section.nodes.fs1
    const secondStack = section.nodes.fs2
    const thirdStack = section.nodes.fs3

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(4)
    expect(row.childIds.slice(0, 3)).toEqual(["fs1", "fs2", "fs3"])

    const insertedStack = section.nodes[row.childIds[3]]
    expect(firstStack.type).toBe("flow-stack")
    expect(secondStack.type).toBe("flow-stack")
    expect(thirdStack.type).toBe("flow-stack")
    expect(insertedStack.type).toBe("flow-stack")
    if (firstStack.type !== "flow-stack" || secondStack.type !== "flow-stack" || thirdStack.type !== "flow-stack" || insertedStack.type !== "flow-stack") return
    expect(firstStack.props.widthShare).toBe(25)
    expect(secondStack.props.widthShare).toBe(25)
    expect(thirdStack.props.widthShare).toBe(25)
    expect(insertedStack.props.widthShare).toBe(25)
  })

  it("adds a flow-stack column before a selected stack", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = addFlowStackColumn(doc, "fr1", "fs2", "before")
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const firstStack = section.nodes.fs1
    const targetStack = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(3)
    expect(row.childIds[0]).toBe("fs1")
    expect(row.childIds[2]).toBe("fs2")

    const insertedStack = section.nodes[row.childIds[1]]
    expect(firstStack.type).toBe("flow-stack")
    expect(insertedStack.type).toBe("flow-stack")
    expect(targetStack.type).toBe("flow-stack")
    if (firstStack.type !== "flow-stack" || insertedStack.type !== "flow-stack" || targetStack.type !== "flow-stack") return
    expect(firstStack.props.widthShare).toBe(50)
    expect(insertedStack.props.widthShare).toBe(25)
    expect(targetStack.props.widthShare).toBe(25)
    expect(insertedStack.childIds).toEqual([])
    expect(firstStack.childIds).toEqual(["p1"])
    expect(targetStack.childIds).toEqual(["p2"])
  })

  it("transfers a deleted flow-stack width share to the nearest sibling", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 60 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 40 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = deleteNode(doc, "fs1")
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const remaining = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toEqual(["fs2"])
    expect(remaining.type).toBe("flow-stack")
    if (remaining.type !== "flow-stack") return
    expect(remaining.props.widthShare).toBe(100)
    expect(section.nodes.fs1).toBeUndefined()
    expect(section.nodes.p1).toBeUndefined()
  })

  it("removes an empty flow-row after deleting its last flow-stack", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Only" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    const updated = deleteNode(doc, "fs1")
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    expect(body.childIds).toEqual([])
    expect(section.nodes.fr1).toBeUndefined()
    expect(section.nodes.fs1).toBeUndefined()
    expect(section.nodes.p1).toBeUndefined()
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

describe("flow-table structural operations", () => {
  it("adds a row above the first row and preserves the flow-table cell shape", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [120, 80],
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
    })
    const updated = addFlowTableRow(doc, "flow-table", -1)
    const table = getFlowTable(updated)
    const inserted = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(3)
    expect(inserted.type).toBe("flow-table-row")
    if (inserted.type !== "flow-table-row") return
    expect(inserted.cellIds).toHaveLength(2)

    inserted.cellIds.forEach((cellId) => {
      const cell = table.nodes[cellId]
      expect(cell.type).toBe("flow-table-cell")
      if (cell.type !== "flow-table-cell") return
      expect(cell.childIds).toHaveLength(1)
      const paragraph = table.nodes[cell.childIds[0]]
      expect(paragraph.type).toBe("paragraph")
      if (paragraph.type !== "paragraph") return
      expect(paragraphText(paragraph)).toBe("")
    })
  })

  it("removes a row subtree and clamps flow-table header rows to the remaining row count", () => {
    const doc = makeGridFlowTableDoc({ headerRowCount: 3 })
    const before = getFlowTable(doc)
    const removedRow = before.nodes[before.rowIds[2]]
    expect(removedRow.type).toBe("flow-table-row")
    if (removedRow.type !== "flow-table-row") return
    const removedIds = new Set<string>([removedRow.id])
    removedRow.cellIds.forEach((cellId) => {
      removedIds.add(cellId)
      const cell = before.nodes[cellId]
      if (cell.type === "flow-table-cell") cell.childIds.forEach((childId) => { removedIds.add(childId) })
    })

    const updated = removeFlowTableRow(doc, "flow-table", 2)
    const table = getFlowTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(2)
    expect(table.props.headerRowCount).toBe(2)
    removedIds.forEach((id) => {
      expect(table.nodes[id]).toBeUndefined()
    })
  })

  it("does not delete the last flow-table row", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [100],
      rows: [["Only cell"]],
      headerRowCount: 1,
    })
    const updated = removeFlowTableRow(doc, "flow-table", 0)
    const table = getFlowTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(updated).toBe(doc)
    expect(table.rowIds).toHaveLength(1)
    expect(table.props.headerRowCount).toBe(1)
  })

  it("adds a flow-table column to the left of the first column by splitting the nearest width", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [120, 80],
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
    })
    const before = getFlowTable(doc)
    const updated = addFlowTableColumn(doc, "flow-table", -1)
    const table = getFlowTable(updated)
    const firstRow = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([60, 60, 80])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    expect(firstRow.type).toBe("flow-table-row")
    if (firstRow.type !== "flow-table-row") return
    expect(firstRow.cellIds).toHaveLength(3)

    const insertedCell = table.nodes[firstRow.cellIds[0]]
    expect(insertedCell.type).toBe("flow-table-cell")
    if (insertedCell.type !== "flow-table-cell") return
    const insertedParagraph = table.nodes[insertedCell.childIds[0]]
    expect(insertedParagraph.type).toBe("paragraph")
    if (insertedParagraph.type !== "paragraph") return
    expect(paragraphText(insertedParagraph)).toBe("")
  })

  it("adds a row through flow-table rowspans by expanding covered cells", () => {
    const doc = makeSpannedFlowTableDoc()
    const updated = addFlowTableRow(doc, "flow-table", 0)
    const table = getFlowTable(updated)
    const spanningCell = table.nodes["flow-cell-span"]
    const insertedRow = table.nodes[table.rowIds[1]]
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(3)
    expect(spanningCell.type).toBe("flow-table-cell")
    if (spanningCell.type !== "flow-table-cell") return
    expect(spanningCell.props.rowspan).toBe(3)
    expect(insertedRow.type).toBe("flow-table-row")
    if (insertedRow.type !== "flow-table-row") return
    expect(insertedRow.cellIds).toHaveLength(1)
    expect(grid.slots).toEqual([
      ["flow-cell-span", "flow-cell-span", "flow-cell-top-right"],
      ["flow-cell-span", "flow-cell-span", insertedRow.cellIds[0]],
      ["flow-cell-span", "flow-cell-span", "flow-cell-bottom-right"],
    ])
  })

  it("adds a column through flow-table colspans by expanding covered cells", () => {
    const doc = makeSpannedFlowTableDoc()
    const before = getFlowTable(doc)
    const updated = addFlowTableColumn(doc, "flow-table", 0)
    const table = getFlowTable(updated)
    const spanningCell = table.nodes["flow-cell-span"]
    const topRow = table.nodes["flow-row-top"]
    const bottomRow = table.nodes["flow-row-bottom"]
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([60, 60, 80, 60])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    expect(spanningCell.type).toBe("flow-table-cell")
    if (spanningCell.type !== "flow-table-cell") return
    expect(spanningCell.props.colspan).toBe(3)
    expect(topRow.type).toBe("flow-table-row")
    expect(bottomRow.type).toBe("flow-table-row")
    if (topRow.type !== "flow-table-row" || bottomRow.type !== "flow-table-row") return
    expect(topRow.cellIds).toEqual(["flow-cell-span", "flow-cell-top-right"])
    expect(bottomRow.cellIds).toEqual(["flow-cell-bottom-right"])
    expect(grid.slots).toEqual([
      ["flow-cell-span", "flow-cell-span", "flow-cell-span", "flow-cell-top-right"],
      ["flow-cell-span", "flow-cell-span", "flow-cell-span", "flow-cell-bottom-right"],
    ])
  })

  it("removes a flow-table column subtree and transfers its width to the left neighbor", () => {
    const doc = makeGridFlowTableDoc({ columnWidths: [120, 80, 60] })
    const before = getFlowTable(doc)
    const removedIds = new Set<string>()
    before.rowIds.forEach((rowId) => {
      const row = before.nodes[rowId]
      if (row.type !== "flow-table-row") return
      const cellId = row.cellIds[1]
      removedIds.add(cellId)
      const cell = before.nodes[cellId]
      if (cell.type === "flow-table-cell") cell.childIds.forEach((childId) => { removedIds.add(childId) })
    })

    const updated = removeFlowTableColumn(doc, "flow-table", 1)
    const table = getFlowTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([200, 60])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    table.rowIds.forEach((rowId) => {
      const row = table.nodes[rowId]
      expect(row.type).toBe("flow-table-row")
      if (row.type !== "flow-table-row") return
      expect(row.cellIds).toHaveLength(2)
    })
    removedIds.forEach((id) => {
      expect(table.nodes[id]).toBeUndefined()
    })
  })

  it("removes a row inside a flow-table rowspan by shrinking the covering cell", () => {
    const doc = makeSpannedFlowTableDoc()
    const before = getFlowTable(doc)
    const removedRow = before.nodes["flow-row-bottom"]
    expect(removedRow.type).toBe("flow-table-row")
    if (removedRow.type !== "flow-table-row") return
    const removedIds = new Set<string>([removedRow.id, "flow-cell-bottom-right", "fsp-3"])

    expect(canRemoveFlowTableRow(before, 1)).toBe(true)
    const updated = removeFlowTableRow(doc, "flow-table", 1)
    const table = getFlowTable(updated)
    const spanningCell = table.nodes["flow-cell-span"]
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toEqual(["flow-row-top"])
    expect(spanningCell.type).toBe("flow-table-cell")
    if (spanningCell.type !== "flow-table-cell") return
    expect(spanningCell.props.rowspan).toBe(1)
    expect(grid.slots).toEqual([["flow-cell-span", "flow-cell-span", "flow-cell-top-right"]])
    removedIds.forEach((id) => {
      expect(table.nodes[id]).toBeUndefined()
    })
  })

  it("does not remove a row when that would move a flow-table rowspan origin", () => {
    const doc = makeSpannedFlowTableDoc()
    const table = getFlowTable(doc)

    expect(canRemoveFlowTableRow(table, 0)).toBe(false)
    expect(removeFlowTableRow(doc, "flow-table", 0)).toBe(doc)
  })

  it("removes a column inside a flow-table colspan by shrinking the covering cell", () => {
    const doc = makeSpannedFlowTableDoc()
    const before = getFlowTable(doc)

    expect(canRemoveFlowTableColumn(before, 1)).toBe(true)
    const updated = removeFlowTableColumn(doc, "flow-table", 1)
    const table = getFlowTable(updated)
    const spanningCell = table.nodes["flow-cell-span"]
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([200, 60])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    expect(spanningCell.type).toBe("flow-table-cell")
    if (spanningCell.type !== "flow-table-cell") return
    expect(spanningCell.props.colspan).toBe(1)
    expect(grid.slots).toEqual([
      ["flow-cell-span", "flow-cell-top-right"],
      ["flow-cell-span", "flow-cell-bottom-right"],
    ])
  })

  it("does not remove a column when that would move a flow-table colspan origin", () => {
    const doc = makeSpannedFlowTableDoc()
    const table = getFlowTable(doc)

    expect(canRemoveFlowTableColumn(table, 0)).toBe(false)
    expect(removeFlowTableColumn(doc, "flow-table", 0)).toBe(doc)
  })

  it("does not delete the last flow-table column", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [100],
      rows: [["Only cell"]],
    })
    const updated = removeFlowTableColumn(doc, "flow-table", 0)
    const table = getFlowTable(updated)
    const row = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(updated).toBe(doc)
    expect(table.columns).toHaveLength(1)
    expect(row.type).toBe("flow-table-row")
    if (row.type !== "flow-table-row") return
    expect(row.cellIds).toHaveLength(1)
  })

})
