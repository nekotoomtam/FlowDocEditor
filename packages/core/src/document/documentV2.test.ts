import { describe, expect, it } from "vitest"
import type {
  DocumentNode,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableRowNode,
  LayoutNode,
  ParagraphNode,
} from "../schema"
import { pt } from "../schema"
import { createDefaultDocument, createDefaultFlowTable, DEFAULT_PARAGRAPH_PROPS } from "./defaults"
import { assertDocument } from "./assert"
import {
  adaptDocumentV2ToCurrentDocument,
  addFlowTableColumnV2,
  addFlowTableRowV2,
  assertDocumentV2,
  buildDocumentGraphIndexV2,
  deleteEmptyFlowTableCellParagraphV2,
  fitFlowTableToSectionWidthV2,
  getDocumentGraphChildrenV2,
  getDocumentGraphSiblingContextV2,
  migrateDocumentToV2,
  orderedDocumentParagraphsV2,
  orderedSectionParagraphsV2,
  removeFlowTableColumnV2,
  removeFlowTableRowV2,
  resizeFlowTableColumnPairV2,
  updateFlowTableCellSpanV2,
} from "./documentV2"

function paragraph(id: string, text = id): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: { ...DEFAULT_PARAGRAPH_PROPS },
    children: [{ id: `${id}-text`, type: "text", text }],
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

function flowCell(id: string, childIds: string[], props: FlowTableCellNode["props"] = {}): FlowTableCellNode {
  return { id, type: "flow-table-cell", props, childIds }
}

function flowRow(id: string, cellIds: string[]): FlowTableRowNode {
  return { id, type: "flow-table-row", props: {}, cellIds }
}

function v2DocWithDefaultFlowTable(rowCount = 2, columnCount = 2) {
  const table = createDefaultFlowTable(rowCount, columnCount)
  const firstRow = table.nodes[table.rowIds[0]]
  if (firstRow?.type !== "flow-table-row") throw new Error("expected flow-table-row")
  return {
    doc: migrateDocumentToV2(bodyDoc({ [table.id]: table as unknown as LayoutNode }, [table.id])),
    tableId: table.id,
    firstCellId: firstRow.cellIds[0],
  }
}

function getV2Section(doc: ReturnType<typeof migrateDocumentToV2>) {
  return doc.document.sections[0]
}

function getV2FlowTable(doc: ReturnType<typeof migrateDocumentToV2>, tableId: string) {
  const table = getV2Section(doc).nodes[tableId]
  if (table?.type !== "flow-table") throw new Error("expected flow-table")
  return table
}

function expectFlattenedV2TableStorage(doc: ReturnType<typeof migrateDocumentToV2>, tableId: string): void {
  const section = getV2Section(doc)
  const table = getV2FlowTable(doc, tableId)

  expect("nodes" in table).toBe(false)
  table.rowIds.forEach((rowId) => {
    const row = section.nodes[rowId]
    expect(row?.type).toBe("flow-table-row")
    if (row?.type !== "flow-table-row") return
    row.cellIds.forEach((cellId) => {
      const cell = section.nodes[cellId]
      expect(cell?.type).toBe("flow-table-cell")
      if (cell?.type !== "flow-table-cell") return
      cell.childIds.forEach((childId) => {
        expect(["paragraph", "spacer"]).toContain(section.nodes[childId]?.type)
      })
    })
  })
  expect(() => assertDocumentV2(doc)).not.toThrow()
}

describe("Document Model v2 migration", () => {
  it("migrates a default v1 document to roots-based DocumentNode v2", () => {
    const migrated = migrateDocumentToV2(createDefaultDocument("V2"))
    const section = migrated.document.sections[0]

    expect(migrated.version).toBe(2)
    expect(section.roots.body).toBeTruthy()
    expect("bodyRootId" in section).toBe(false)
    expect(() => assertDocumentV2(migrated)).not.toThrow()
  })

  it("migrates legacy row/stack authoring to flow-row/flow-stack", () => {
    const p1 = paragraph("p1", "Left")
    const p2 = paragraph("p2", "Right")
    const doc = bodyDoc({
      row: { id: "row", type: "row", props: { gap: 8 }, childIds: ["left", "right"] },
      left: { id: "left", type: "stack", props: { widthShare: 40, minHeight: 20 }, childIds: ["p1"] },
      right: { id: "right", type: "stack", props: { widthShare: 60, minHeight: 24 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["row"])

    const migrated = migrateDocumentToV2(doc)
    const section = migrated.document.sections[0]

    expect(section.nodes.row?.type).toBe("flow-row")
    expect(section.nodes.left?.type).toBe("flow-stack")
    expect(section.nodes.right?.type).toBe("flow-stack")
    expect(Object.values(section.nodes).some((node) => {
      const type = (node as { type: string }).type
      return type === "row" || type === "stack"
    })).toBe(false)
    expect(() => assertDocumentV2(migrated)).not.toThrow()
  })

  it("flattens flow-table internals into the section node map", () => {
    const p1 = paragraph("p1", "A")
    const p2 = paragraph("p2", "B")
    const row = flowRow("r1", ["c1", "c2"])
    const table: FlowTableNode = {
      id: "table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [row.id],
      nodes: {
        [row.id]: row,
        c1: flowCell("c1", [p1.id]),
        c2: flowCell("c2", [p2.id]),
        [p1.id]: p1,
        [p2.id]: p2,
      },
    }

    const migrated = migrateDocumentToV2(bodyDoc({ table: table as unknown as LayoutNode }, ["table"]))
    const section = migrated.document.sections[0]
    const migratedTable = section.nodes.table

    expect(migratedTable?.type).toBe("flow-table")
    expect(migratedTable && "nodes" in migratedTable).toBe(false)
    expect(section.nodes.r1?.type).toBe("flow-table-row")
    expect(section.nodes.c1?.type).toBe("flow-table-cell")
    expect(section.nodes.p1?.type).toBe("paragraph")
    expect(() => assertDocumentV2(migrated)).not.toThrow()

    const index = buildDocumentGraphIndexV2(migrated)
    expect(index.tableByDescendantId.get("c1")).toBe("table")
    expect(index.rowByCellId.get("c1")).toBe("r1")
  })

  it("rewrites colliding table-local ids while preserving table references", () => {
    const bodyParagraph = paragraph("p1", "Outside")
    const cellParagraph = paragraph("p1", "Inside")
    const row = flowRow("r1", ["c1"])
    const cell = flowCell("c1", [cellParagraph.id], {
      mergeMap: { version: 1, entries: [{ rowOffset: 0, colOffset: 0, childIds: [cellParagraph.id] }] },
    })
    const table: FlowTableNode = {
      id: "table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: {
        [row.id]: row,
        [cell.id]: cell,
        [cellParagraph.id]: cellParagraph,
      },
    }
    const doc = bodyDoc({ p1: bodyParagraph, table: table as unknown as LayoutNode }, ["p1", "table"])

    const migrated = migrateDocumentToV2(doc)
    const section = migrated.document.sections[0]
    const migratedCell = section.nodes.c1

    expect(section.nodes.p1?.type).toBe("paragraph")
    expect(migratedCell?.type).toBe("flow-table-cell")
    if (migratedCell?.type !== "flow-table-cell") return
    expect(migratedCell.childIds[0]).not.toBe("p1")
    expect(section.nodes[migratedCell.childIds[0]]?.type).toBe("paragraph")
    expect(migratedCell.props.mergeMap?.entries[0]?.childIds).toEqual([migratedCell.childIds[0]])
    expect(() => assertDocumentV2(migrated)).not.toThrow()
  })

  it("rejects nested flow-table node maps in v2 documents", () => {
    const migrated = migrateDocumentToV2(createDefaultDocument("Invalid V2"))
    const section = migrated.document.sections[0]
    section.nodes.table = {
      id: "table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: ["row"],
      nodes: {},
    } as never
    const body = section.nodes[section.roots.body]
    if (body?.type === "body") body.childIds.push("table")

    expect(() => assertDocumentV2(migrated)).toThrow("nested node maps are not allowed in DocumentNode v2")
  })

  it("orders v2 body paragraphs through flattened flow-table descendants", () => {
    const outsideBefore = paragraph("outside-before", "Before")
    const tableParagraph = paragraph("table-paragraph", "Inside")
    const outsideAfter = paragraph("outside-after", "After")
    const row = flowRow("table-row", ["table-cell"])
    const table: FlowTableNode = {
      id: "table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: {
        [row.id]: row,
        "table-cell": flowCell("table-cell", [tableParagraph.id]),
        [tableParagraph.id]: tableParagraph,
      },
    }
    const migrated = migrateDocumentToV2(bodyDoc({
      [outsideBefore.id]: outsideBefore,
      table: table as unknown as LayoutNode,
      [outsideAfter.id]: outsideAfter,
    }, [outsideBefore.id, "table", outsideAfter.id]))
    const section = migrated.document.sections[0]

    expect(orderedSectionParagraphsV2(section).map((node) => node.id)).toEqual([
      "outside-before",
      "table-paragraph",
      "outside-after",
    ])
    expect(orderedDocumentParagraphsV2(migrated).map((node) => node.id)).toEqual([
      "outside-before",
      "table-paragraph",
      "outside-after",
    ])
  })

  it("exposes parent sibling context from the v2 graph index", () => {
    const p1 = paragraph("p1", "A")
    const p2 = paragraph("p2", "B")
    const row = flowRow("r1", ["c1", "c2"])
    const table: FlowTableNode = {
      id: "table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [row.id],
      nodes: {
        [row.id]: row,
        c1: flowCell("c1", [p1.id]),
        c2: flowCell("c2", [p2.id]),
        [p1.id]: p1,
        [p2.id]: p2,
      },
    }
    const migrated = migrateDocumentToV2(bodyDoc({ table: table as unknown as LayoutNode }, ["table"]))
    const index = buildDocumentGraphIndexV2(migrated)

    expect(getDocumentGraphChildrenV2(index, "table").map((node) => node.id)).toEqual(["r1"])
    expect(getDocumentGraphChildrenV2(index, "r1").map((node) => node.id)).toEqual(["c1", "c2"])
    expect(getDocumentGraphChildrenV2(index, "c1").map((node) => node.id)).toEqual(["p1"])
    expect(getDocumentGraphSiblingContextV2(index, "c2")).toEqual({
      parent: { kind: "cellIds", sectionId: "section", tableId: "table", rowId: "r1", index: 1 },
      siblingIds: ["c1", "c2"],
    })
    expect(getDocumentGraphSiblingContextV2(index, "table")).toEqual({
      parent: { kind: "childIds", sectionId: "section", parentId: "body", index: 0 },
      siblingIds: ["table"],
    })
  })

  it("adapts flattened v2 flow-table storage back to the current runtime table shape", () => {
    const p1 = paragraph("p1", "A")
    const p2 = paragraph("p2", "B")
    const row = flowRow("r1", ["c1", "c2"])
    const table: FlowTableNode = {
      id: "table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [row.id],
      nodes: {
        [row.id]: row,
        c1: flowCell("c1", [p1.id]),
        c2: flowCell("c2", [p2.id]),
        [p1.id]: p1,
        [p2.id]: p2,
      },
    }
    const migrated = migrateDocumentToV2(bodyDoc({ table: table as unknown as LayoutNode }, ["table"]))

    const adapted = adaptDocumentV2ToCurrentDocument(migrated)
    const adaptedSection = adapted.document.sections[0]
    const adaptedTable = adaptedSection.nodes.table as unknown as FlowTableNode

    expect(() => assertDocument(adapted)).not.toThrow()
    expect(adapted.version).toBe(1)
    expect(adaptedSection.nodes.r1).toBeUndefined()
    expect(adaptedSection.nodes.c1).toBeUndefined()
    expect(adaptedSection.nodes.p1).toBeUndefined()
    expect(adaptedTable.nodes.r1?.type).toBe("flow-table-row")
    expect(adaptedTable.nodes.c1?.type).toBe("flow-table-cell")
    expect(adaptedTable.nodes.p1?.type).toBe("paragraph")
  })

  it("adapts v2 reserved-zone body roots back to current runtime stack roots", () => {
    const doc = bodyDoc({
      header: { id: "header", type: "stack", props: {}, childIds: ["header-p"] },
      "header-p": paragraph("header-p", "Header"),
    }, [])
    doc.document.sections[0].headerRootId = "header"

    const migrated = migrateDocumentToV2(doc)
    const migratedSection = migrated.document.sections[0]
    expect(migratedSection.nodes.header?.type).toBe("body")

    const adapted = adaptDocumentV2ToCurrentDocument(migrated)
    const adaptedSection = adapted.document.sections[0]

    expect(() => assertDocument(adapted)).not.toThrow()
    expect(adaptedSection.headerRootId).toBe("header")
    expect(adaptedSection.nodes.header?.type).toBe("stack")
    expect(adaptedSection.nodes[adaptedSection.bodyRootId]?.type).toBe("body")
  })
})

describe("Document Model v2 table operations", () => {
  it("adds and removes table rows through flattened section graph storage", () => {
    const { doc, tableId } = v2DocWithDefaultFlowTable(2, 2)

    const added = addFlowTableRowV2(doc, tableId, 0)
    const addedTable = getV2FlowTable(added, tableId)
    const insertedRowId = addedTable.rowIds[1]

    expect(addedTable.rowIds).toHaveLength(3)
    expect(getV2Section(added).nodes[insertedRowId]?.type).toBe("flow-table-row")
    expectFlattenedV2TableStorage(added, tableId)

    const removed = removeFlowTableRowV2(added, tableId, 1)

    expect(getV2FlowTable(removed, tableId).rowIds).toHaveLength(2)
    expect(getV2Section(removed).nodes[insertedRowId]).toBeUndefined()
    expectFlattenedV2TableStorage(removed, tableId)
  })

  it("adds and removes table columns through flattened section graph storage", () => {
    const { doc, tableId } = v2DocWithDefaultFlowTable(2, 2)

    const added = addFlowTableColumnV2(doc, tableId, 0)
    const addedSection = getV2Section(added)
    const addedTable = getV2FlowTable(added, tableId)
    const firstRow = addedSection.nodes[addedTable.rowIds[0]]
    if (firstRow?.type !== "flow-table-row") throw new Error("expected flow-table-row")
    const insertedCellId = firstRow.cellIds[1]

    expect(addedTable.columns).toHaveLength(3)
    expect(firstRow.cellIds).toHaveLength(3)
    expect(addedSection.nodes[insertedCellId]?.type).toBe("flow-table-cell")
    expectFlattenedV2TableStorage(added, tableId)

    const removed = removeFlowTableColumnV2(added, tableId, 1)

    expect(getV2FlowTable(removed, tableId).columns).toHaveLength(2)
    expect(getV2Section(removed).nodes[insertedCellId]).toBeUndefined()
    expectFlattenedV2TableStorage(removed, tableId)
  })

  it("updates table column widths through v2 table helpers without re-nesting table nodes", () => {
    const { doc, tableId } = v2DocWithDefaultFlowTable(2, 2)

    const resized = resizeFlowTableColumnPairV2(doc, tableId, 0, 220, 80)
    expect(getV2FlowTable(resized, tableId).columns.map((column) => column.width.value)).toEqual([220, 80])
    expectFlattenedV2TableStorage(resized, tableId)

    const fit = fitFlowTableToSectionWidthV2(resized, tableId)
    const totalWidth = getV2FlowTable(fit, tableId).columns.reduce((sum, column) => sum + column.width.value, 0)

    expect(totalWidth).toBeGreaterThan(0)
    expect(totalWidth).not.toBe(300)
    expectFlattenedV2TableStorage(fit, tableId)
  })

  it("updates cell spans through flattened row and cell parentage", () => {
    const { doc, tableId, firstCellId } = v2DocWithDefaultFlowTable(2, 2)
    const beforeSection = getV2Section(doc)
    const firstRow = beforeSection.nodes[getV2FlowTable(doc, tableId).rowIds[0]]
    if (firstRow?.type !== "flow-table-row") throw new Error("expected flow-table-row")
    const consumedCellId = firstRow.cellIds[1]

    const expanded = updateFlowTableCellSpanV2(doc, firstCellId, { colspan: 2 })
    const expandedSection = getV2Section(expanded)
    const expandedRow = expandedSection.nodes[getV2FlowTable(expanded, tableId).rowIds[0]]
    const expandedCell = expandedSection.nodes[firstCellId]

    expect(expandedRow?.type === "flow-table-row" ? expandedRow.cellIds : []).toEqual([firstCellId])
    expect(expandedCell?.type === "flow-table-cell" ? expandedCell.props.colspan : undefined).toBe(2)
    expect(expandedSection.nodes[consumedCellId]).toBeUndefined()
    expectFlattenedV2TableStorage(expanded, tableId)

    const shrunk = updateFlowTableCellSpanV2(expanded, firstCellId, { colspan: 1 })
    const shrunkRow = getV2Section(shrunk).nodes[getV2FlowTable(shrunk, tableId).rowIds[0]]

    expect(shrunkRow?.type === "flow-table-row" ? shrunkRow.cellIds : []).toHaveLength(2)
    expectFlattenedV2TableStorage(shrunk, tableId)
  })

  it("deletes an empty table-cell paragraph from v2 section graph storage", () => {
    const keep = paragraph("keep", "Keep")
    const empty = paragraph("empty", "")
    const row = flowRow("row", ["cell"])
    const table: FlowTableNode = {
      id: "table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: {
        [row.id]: row,
        cell: flowCell("cell", [keep.id, empty.id]),
        [keep.id]: keep,
        [empty.id]: empty,
      },
    }
    const doc = migrateDocumentToV2(bodyDoc({ table: table as unknown as LayoutNode }, ["table"]))

    const result = deleteEmptyFlowTableCellParagraphV2(doc, empty.id)
    if (result == null) throw new Error("expected delete-empty-table-cell result")
    const section = getV2Section(result.doc)
    const cell = section.nodes.cell

    expect(result.prevNodeId).toBe(keep.id)
    expect(result.caretIndex).toBe(4)
    expect(section.nodes[empty.id]).toBeUndefined()
    expect(cell?.type === "flow-table-cell" ? cell.childIds : []).toEqual([keep.id])
    expectFlattenedV2TableStorage(result.doc, "table")
  })
})
