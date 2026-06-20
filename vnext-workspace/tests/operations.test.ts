import { describe, expect, it } from "vitest"
import type { AuthoredNode, DocumentNode, TextBlockNode, TextBlockRole } from "../src/schema/document.js"
import {
  appendVNextOperationHistoryRecord,
  createVNextOperationHistoryRecord,
  replayVNextOperationHistory,
  runVNextOperation,
} from "../src/operations/documentOperations.js"
import { buildRelationshipGraph } from "../src/graph/relationshipGraph.js"

function pt(value: number) {
  return { value, unit: "pt" as const }
}

function textBlock(id: string, text: string, role: TextBlockRole = { role: "paragraph" }): TextBlockNode {
  return {
    id,
    type: "text-block",
    role,
    props: {},
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function docWithNodes(nodes: Record<string, AuthoredNode>, bodyChildIds: string[]): DocumentNode {
  return {
    version: 3,
    document: {
      id: "operation-doc",
      meta: { title: "Operation Test" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function columnsNodeSet(): Record<string, AuthoredNode> {
  return {
    columns: { id: "columns", type: "columns", props: { gap: 12 }, columnIds: ["left", "right"] },
    left: { id: "left", type: "column", props: { widthShare: 40 }, childIds: ["left-text"] },
    right: { id: "right", type: "column", props: { widthShare: 60 }, childIds: ["right-text"] },
    "left-text": textBlock("left-text", "Left"),
    "right-text": textBlock("right-text", "Right"),
  }
}

function tableNodeSet(): Record<string, AuthoredNode> {
  return {
    table: {
      id: "table",
      type: "table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: ["row"],
    },
    row: { id: "row", type: "table-row", props: {}, cellIds: ["cell"] },
    cell: { id: "cell", type: "table-cell", props: {}, childIds: ["cell-text"] },
    "cell-text": textBlock("cell-text", "Cell"),
  }
}

function twoRowTableNodeSet(): Record<string, AuthoredNode> {
  return {
    table: {
      id: "table",
      type: "table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: ["row", "row-2"],
    },
    row: { id: "row", type: "table-row", props: {}, cellIds: ["cell"] },
    cell: { id: "cell", type: "table-cell", props: {}, childIds: ["cell-text"] },
    "cell-text": textBlock("cell-text", "Cell"),
    "row-2": { id: "row-2", type: "table-row", props: {}, cellIds: ["cell-2"] },
    "cell-2": { id: "cell-2", type: "table-cell", props: {}, childIds: ["cell-2-text"] },
    "cell-2-text": textBlock("cell-2-text", "Cell 2"),
  }
}

function twoColumnTableNodeSet(): Record<string, AuthoredNode> {
  return {
    table: {
      id: "table",
      type: "table",
      props: {},
      columns: [{ width: pt(80) }, { width: pt(120) }],
      rowIds: ["row"],
    },
    row: { id: "row", type: "table-row", props: {}, cellIds: ["cell-a", "cell-b"] },
    "cell-a": { id: "cell-a", type: "table-cell", props: {}, childIds: ["cell-a-text"] },
    "cell-b": { id: "cell-b", type: "table-cell", props: {}, childIds: ["cell-b-text"] },
    "cell-a-text": textBlock("cell-a-text", "A"),
    "cell-b-text": textBlock("cell-b-text", "B"),
  }
}

describe("vNext operations", () => {
  it("deletes a node through graph parent refs and records operation scope", () => {
    const doc = docWithNodes({
      title: textBlock("title", "Title", { role: "heading", level: 1 }),
      body: textBlock("body", "Body"),
    }, ["title", "body"])

    const result = runVNextOperation(doc, { kind: "node.delete", nodeId: "title", source: "automation" })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    const zone = section.nodes["body-zone"]
    expect(zone.type).toBe("zone")
    if (zone.type !== "zone") throw new Error("expected zone")

    expect(zone.childIds).toEqual(["body"])
    expect(section.nodes.title).toBeUndefined()
    expect(result.operation).toMatchObject({
      kind: "node.delete",
      source: "automation",
      targetNodeIds: ["title"],
      validationPolicy: "full",
      historyPolicy: { kind: "single-entry", durableIntent: "structure" },
      renderInvalidation: { lane: "node-structure" },
    })
    expect(result.operation.scope).toMatchObject({
      sectionIds: ["section-main"],
      zoneIds: ["body-zone"],
      nodeIds: ["title"],
      parentNodeIds: ["body-zone"],
      textBlockIds: ["title"],
    })
    expect(() => buildRelationshipGraph(result.document)).not.toThrow()
  })

  it("deletes a structural subtree without leaving orphan descendants", () => {
    const doc = docWithNodes({
      intro: textBlock("intro", "Intro"),
      ...columnsNodeSet(),
    }, ["intro", "columns"])

    const result = runVNextOperation(doc, { kind: "node.delete", nodeId: "columns" })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    expect(Object.keys(section.nodes).sort()).toEqual(["body-zone", "intro"])
    expect(result.operation.scope.nodeIds).toEqual(["columns", "left", "left-text", "right", "right-text"])
    expect(result.operation.renderInvalidation.pageScope).toEqual({
      kind: "unknown",
      reason: "pagination-not-integrated",
    })
  })

  it("rejects deletion for graph nodes that are not deletable", () => {
    const doc = docWithNodes({ title: textBlock("title", "Title") }, ["title"])

    const result = runVNextOperation(doc, { kind: "node.delete", nodeId: "body-zone" })

    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported-target",
      issues: [{ code: "cannot-delete", nodeId: "body-zone" }],
    })
    expect(result.document).toBe(doc)
  })

  it("duplicates a structural subtree with deterministic copied ids", () => {
    const doc = docWithNodes({
      intro: textBlock("intro", "Intro"),
      ...columnsNodeSet(),
    }, ["intro", "columns"])

    const result = runVNextOperation(doc, { kind: "node.duplicate", nodeId: "columns" })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    const zone = section.nodes["body-zone"]
    expect(zone.type).toBe("zone")
    if (zone.type !== "zone") throw new Error("expected zone")

    expect(zone.childIds).toEqual(["intro", "columns", "columns-copy"])
    expect(section.nodes["columns-copy"]?.type).toBe("columns")
    expect(section.nodes["left-copy"]?.type).toBe("column")
    expect(section.nodes["left-text-copy"]?.type).toBe("text-block")
    expect(result.operation).toMatchObject({
      kind: "node.duplicate",
      targetNodeIds: ["columns", "columns-copy"],
      historyPolicy: { durableIntent: "structure" },
    })
    expect(result.operation.scope.parentNodeIds).toEqual(["body-zone"])
    expect(() => buildRelationshipGraph(result.document)).not.toThrow()
  })

  it("rejects duplicate for graph nodes that are not duplicatable", () => {
    const doc = docWithNodes({ title: textBlock("title", "Title") }, ["title"])

    const result = runVNextOperation(doc, { kind: "node.duplicate", nodeId: "body-zone" })

    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported-target",
      issues: [{ code: "cannot-duplicate", nodeId: "body-zone" }],
    })
    expect(result.document).toBe(doc)
  })

  it("reorders a node within its graph parent list", () => {
    const doc = docWithNodes({
      first: textBlock("first", "First"),
      second: textBlock("second", "Second"),
      third: textBlock("third", "Third"),
    }, ["first", "second", "third"])

    const result = runVNextOperation(doc, { kind: "node.reorder", nodeId: "third", toIndex: 0 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const zone = result.document.document.sections[0].nodes["body-zone"]
    expect(zone.type).toBe("zone")
    if (zone.type !== "zone") throw new Error("expected zone")
    expect(zone.childIds).toEqual(["third", "first", "second"])
    expect(result.operation.historyPolicy).toMatchObject({ durableIntent: "structure" })
    expect(result.operation.scope.parentNodeIds).toEqual(["body-zone"])
  })

  it("rejects invalid reorder targets and indexes without mutating the document", () => {
    const doc = docWithNodes({
      ...tableNodeSet(),
    }, ["table"])

    const unsupported = runVNextOperation(doc, { kind: "node.reorder", nodeId: "row", toIndex: 0 })
    const badIndex = runVNextOperation(doc, { kind: "node.reorder", nodeId: "table", toIndex: 3 })

    expect(unsupported).toMatchObject({
      ok: false,
      reason: "unsupported-target",
      issues: [{ code: "cannot-reorder", nodeId: "row" }],
    })
    expect(badIndex).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "invalid-index", nodeId: "table" }],
    })
    expect(unsupported.document).toBe(doc)
    expect(badIndex.document).toBe(doc)
  })

  it("inserts columns into a graph-approved parent with valid width shares", () => {
    const doc = docWithNodes({
      first: textBlock("first", "First"),
      second: textBlock("second", "Second"),
    }, ["first", "second"])

    const result = runVNextOperation(doc, {
      kind: "columns.insert",
      parentNodeId: "body-zone",
      index: 1,
      columnsId: "summary-columns",
      columnCount: 3,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    const zone = section.nodes["body-zone"]
    const columns = section.nodes["summary-columns"]
    expect(zone.type).toBe("zone")
    expect(columns.type).toBe("columns")
    if (zone.type !== "zone" || columns.type !== "columns") throw new Error("expected zone and columns")

    expect(zone.childIds).toEqual(["first", "summary-columns", "second"])
    expect(columns.columnIds).toEqual([
      "summary-columns-column-1",
      "summary-columns-column-2",
      "summary-columns-column-3",
    ])
    expect(columns.columnIds.map((columnId) => {
      const column = section.nodes[columnId]
      return column.type === "column" ? column.props.widthShare : null
    })).toEqual([33.33, 33.33, 33.34])
    expect(result.operation).toMatchObject({
      kind: "columns.insert",
      targetNodeIds: ["summary-columns"],
      historyPolicy: { durableIntent: "structure" },
      renderInvalidation: { lane: "node-structure" },
    })
    expect(result.operation.scope.parentNodeIds).toEqual(["body-zone"])
    expect(() => buildRelationshipGraph(result.document)).not.toThrow()
  })

  it("rejects columns insert for unsupported parents and invalid counts", () => {
    const doc = docWithNodes({
      ...tableNodeSet(),
    }, ["table"])

    const unsupported = runVNextOperation(doc, {
      kind: "columns.insert",
      parentNodeId: "cell",
      index: 0,
      columnsId: "columns-in-cell",
      columnCount: 2,
    })
    const invalidCount = runVNextOperation(doc, {
      kind: "columns.insert",
      parentNodeId: "body-zone",
      index: 0,
      columnCount: 0,
    })

    expect(unsupported).toMatchObject({
      ok: false,
      reason: "unsupported-target",
      issues: [{ code: "cannot-insert-columns", nodeId: "cell" }],
    })
    expect(invalidCount).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "invalid-column-count", nodeId: "body-zone" }],
    })
  })

  it("patches columns layout as a layout operation", () => {
    const doc = docWithNodes({
      ...columnsNodeSet(),
    }, ["columns"])

    const result = runVNextOperation(doc, { kind: "columns.layout.patch", columnsId: "columns", widthShares: [25, 75] })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    const left = section.nodes.left
    const right = section.nodes.right
    expect(left.type).toBe("column")
    expect(right.type).toBe("column")
    if (left.type !== "column" || right.type !== "column") throw new Error("expected columns")
    expect(left.props.widthShare).toBe(25)
    expect(right.props.widthShare).toBe(75)
    expect(result.operation).toMatchObject({
      kind: "columns.layout.patch",
      historyPolicy: { durableIntent: "layout" },
      renderInvalidation: { lane: "node-layout" },
    })
    expect(result.operation.scope.nodeIds).toEqual(["columns", "left", "right"])
    expect(() => buildRelationshipGraph(result.document)).not.toThrow()
  })

  it("rejects invalid columns layout patches", () => {
    const doc = docWithNodes({
      ...columnsNodeSet(),
    }, ["columns"])

    const wrongCount = runVNextOperation(doc, { kind: "columns.layout.patch", columnsId: "columns", widthShares: [100] })
    const wrongTotal = runVNextOperation(doc, { kind: "columns.layout.patch", columnsId: "columns", widthShares: [40, 40] })

    expect(wrongCount).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "invalid-width-count", nodeId: "columns" }],
    })
    expect(wrongTotal).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "invalid-width-total", nodeId: "columns" }],
    })
  })

  it("replaces text-block inline content as a content operation", () => {
    const doc = docWithNodes({
      title: textBlock("title", "Old", { role: "heading", level: 1 }),
    }, ["title"])

    const result = runVNextOperation(doc, {
      kind: "text-block.text.replace",
      nodeId: "title",
      children: [
        { id: "title-new-text", type: "text", text: "New" },
        { id: "title-break", type: "line-break" },
        { id: "title-field", type: "field-ref", key: "customer.name" },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const title = result.document.document.sections[0].nodes.title
    expect(title.type).toBe("text-block")
    if (title.type !== "text-block") throw new Error("expected text-block")
    expect(title.children.map((child) => child.type)).toEqual(["text", "line-break", "field-ref"])
    expect(result.operation).toMatchObject({
      kind: "text-block.text.replace",
      historyPolicy: { kind: "single-entry", durableIntent: "content" },
      renderInvalidation: { lane: "text-content" },
    })
    expect(result.operation.scope.textBlockIds).toEqual(["title"])
  })

  it("inserts a text-block into a graph-approved parent", () => {
    const doc = docWithNodes({
      first: textBlock("first", "First"),
      second: textBlock("second", "Second"),
    }, ["first", "second"])

    const result = runVNextOperation(doc, {
      kind: "text-block.insert",
      parentNodeId: "body-zone",
      index: 1,
      node: textBlock("inserted", "Inserted", { role: "heading", level: 2 }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const zone = result.document.document.sections[0].nodes["body-zone"]
    expect(zone.type).toBe("zone")
    if (zone.type !== "zone") throw new Error("expected zone")
    expect(zone.childIds).toEqual(["first", "inserted", "second"])
    expect(result.document.document.sections[0].nodes.inserted).toMatchObject({
      type: "text-block",
      role: { role: "heading", level: 2 },
    })
    expect(result.operation).toMatchObject({
      kind: "text-block.insert",
      targetNodeIds: ["inserted"],
      historyPolicy: { durableIntent: "structure" },
      renderInvalidation: { lane: "node-structure" },
    })
    expect(result.operation.scope.parentNodeIds).toEqual(["body-zone"])
  })

  it("rejects text-block insert for unsupported parents and duplicate ids", () => {
    const doc = docWithNodes({
      existing: textBlock("existing", "Existing"),
      ...tableNodeSet(),
    }, ["existing", "table"])

    const unsupported = runVNextOperation(doc, {
      kind: "text-block.insert",
      parentNodeId: "table",
      index: 0,
      node: textBlock("inserted", "Inserted"),
    })
    const duplicate = runVNextOperation(doc, {
      kind: "text-block.insert",
      parentNodeId: "body-zone",
      index: 0,
      node: textBlock("existing", "Duplicate"),
    })

    expect(unsupported).toMatchObject({
      ok: false,
      reason: "unsupported-target",
      issues: [{ code: "cannot-insert-text-block", nodeId: "table" }],
    })
    expect(duplicate).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "duplicate-id", nodeId: "existing" }],
    })
  })

  it("rejects text replacement when the target is not a text-block", () => {
    const doc = docWithNodes({
      ...columnsNodeSet(),
    }, ["columns"])

    const result = runVNextOperation(doc, {
      kind: "text-block.text.replace",
      nodeId: "columns",
      children: [{ id: "text", type: "text", text: "Nope" }],
    })

    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported-target",
      issues: [{ code: "not-text-block", nodeId: "columns" }],
    })
    expect(result.document).toBe(doc)
  })

  it("inserts a table row with generated cells and empty text blocks", () => {
    const doc = docWithNodes({
      ...tableNodeSet(),
    }, ["table"])

    const result = runVNextOperation(doc, { kind: "table.row.insert", tableId: "table", index: 1, rowId: "row-2" })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    const table = section.nodes.table
    expect(table.type).toBe("table")
    if (table.type !== "table") throw new Error("expected table")
    expect(table.rowIds).toEqual(["row", "row-2"])

    const row = section.nodes["row-2"]
    expect(row.type).toBe("table-row")
    if (row.type !== "table-row") throw new Error("expected table row")
    expect(row.cellIds).toEqual(["row-2-cell-1"])
    expect(section.nodes["row-2-cell-1"]?.type).toBe("table-cell")
    expect(section.nodes["row-2-cell-1-text"]?.type).toBe("text-block")
    expect(result.operation).toMatchObject({
      kind: "table.row.insert",
      targetNodeIds: ["table", "row-2"],
      historyPolicy: { durableIntent: "structure" },
    })
    expect(result.operation.scope.tableIds).toEqual(["table"])
    expect(() => buildRelationshipGraph(result.document)).not.toThrow()
  })

  it("rejects table row insert for non-table targets and duplicate row ids", () => {
    const doc = docWithNodes({
      ...tableNodeSet(),
      outro: textBlock("outro", "Outro"),
    }, ["table", "outro"])

    const unsupported = runVNextOperation(doc, { kind: "table.row.insert", tableId: "outro", index: 0 })
    const duplicate = runVNextOperation(doc, { kind: "table.row.insert", tableId: "table", index: 1, rowId: "row" })

    expect(unsupported).toMatchObject({
      ok: false,
      reason: "unsupported-target",
      issues: [{ code: "not-table", nodeId: "outro" }],
    })
    expect(duplicate).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "duplicate-id", nodeId: "row" }],
    })
  })

  it("deletes a table row through table-specific structure operation", () => {
    const doc = docWithNodes({
      ...twoRowTableNodeSet(),
    }, ["table"])

    const result = runVNextOperation(doc, { kind: "table.row.delete", rowId: "row-2" })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    const table = section.nodes.table
    expect(table.type).toBe("table")
    if (table.type !== "table") throw new Error("expected table")
    expect(table.rowIds).toEqual(["row"])
    expect(section.nodes["row-2"]).toBeUndefined()
    expect(section.nodes["cell-2"]).toBeUndefined()
    expect(section.nodes["cell-2-text"]).toBeUndefined()
    expect(result.operation).toMatchObject({
      kind: "table.row.delete",
      targetNodeIds: ["table", "row-2"],
      historyPolicy: { durableIntent: "structure" },
    })
    expect(result.operation.scope.tableIds).toEqual(["table"])
    expect(() => buildRelationshipGraph(result.document)).not.toThrow()
  })

  it("rejects table row delete when it would leave an invalid table", () => {
    const doc = docWithNodes({
      ...tableNodeSet(),
    }, ["table"])

    const result = runVNextOperation(doc, { kind: "table.row.delete", rowId: "row" })

    expect(result).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "cannot-delete-last-row", nodeId: "row" }],
    })
    expect(result.document).toBe(doc)
  })

  it("inserts a table column with generated cells for every row", () => {
    const doc = docWithNodes({
      ...twoRowTableNodeSet(),
    }, ["table"])

    const result = runVNextOperation(doc, {
      kind: "table.column.insert",
      tableId: "table",
      index: 1,
      width: { value: 140, unit: "pt" },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    const table = section.nodes.table
    const row = section.nodes.row
    const row2 = section.nodes["row-2"]
    expect(table.type).toBe("table")
    expect(row.type).toBe("table-row")
    expect(row2.type).toBe("table-row")
    if (table.type !== "table" || row.type !== "table-row" || row2.type !== "table-row") {
      throw new Error("expected table rows")
    }

    expect(table.columns.map((column) => column.width)).toEqual([
      { value: 100, unit: "pt" },
      { value: 140, unit: "pt" },
    ])
    expect(row.cellIds).toEqual(["cell", "row-cell-2"])
    expect(row2.cellIds).toEqual(["cell-2", "row-2-cell-2"])
    expect(section.nodes["row-cell-2"]?.type).toBe("table-cell")
    expect(section.nodes["row-cell-2-text"]?.type).toBe("text-block")
    expect(section.nodes["row-2-cell-2"]?.type).toBe("table-cell")
    expect(result.operation).toMatchObject({
      kind: "table.column.insert",
      targetNodeIds: ["table"],
      historyPolicy: { durableIntent: "structure" },
    })
    expect(result.operation.scope.tableIds).toEqual(["table"])
    expect(() => buildRelationshipGraph(result.document)).not.toThrow()
  })

  it("deletes a table column and its cell descendants", () => {
    const doc = docWithNodes({
      ...twoColumnTableNodeSet(),
    }, ["table"])

    const result = runVNextOperation(doc, { kind: "table.column.delete", tableId: "table", index: 0 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const section = result.document.document.sections[0]
    const table = section.nodes.table
    const row = section.nodes.row
    expect(table.type).toBe("table")
    expect(row.type).toBe("table-row")
    if (table.type !== "table" || row.type !== "table-row") throw new Error("expected table row")

    expect(table.columns).toEqual([{ width: { value: 120, unit: "pt" } }])
    expect(row.cellIds).toEqual(["cell-b"])
    expect(section.nodes["cell-a"]).toBeUndefined()
    expect(section.nodes["cell-a-text"]).toBeUndefined()
    expect(result.operation).toMatchObject({
      kind: "table.column.delete",
      targetNodeIds: ["table"],
      historyPolicy: { durableIntent: "structure" },
    })
    expect(result.operation.scope.tableIds).toEqual(["table"])
    expect(() => buildRelationshipGraph(result.document)).not.toThrow()
  })

  it("rejects table column operations that would violate table structure", () => {
    const doc = docWithNodes({
      ...tableNodeSet(),
      outro: textBlock("outro", "Outro"),
    }, ["table", "outro"])

    const unsupported = runVNextOperation(doc, { kind: "table.column.insert", tableId: "outro", index: 0 })
    const badIndex = runVNextOperation(doc, { kind: "table.column.insert", tableId: "table", index: 2 })
    const lastColumn = runVNextOperation(doc, { kind: "table.column.delete", tableId: "table", index: 0 })

    expect(unsupported).toMatchObject({
      ok: false,
      reason: "unsupported-target",
      issues: [{ code: "not-table", nodeId: "outro" }],
    })
    expect(badIndex).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "invalid-index", nodeId: "table" }],
    })
    expect(lastColumn).toMatchObject({
      ok: false,
      reason: "invalid-command",
      issues: [{ code: "cannot-delete-last-column", nodeId: "table" }],
    })
  })

  it("creates durable-history-ready records for committed operations", () => {
    const doc = docWithNodes({
      ...columnsNodeSet(),
    }, ["columns"])
    const result = runVNextOperation(doc, {
      kind: "columns.layout.patch",
      source: "automation",
      columnsId: "columns",
      widthShares: [30, 70],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"))

    const record = createVNextOperationHistoryRecord(result)

    expect(record).toMatchObject({
      schemaVersion: 1,
      status: "committed",
      operationKind: "columns.layout.patch",
      source: "automation",
      targetNodeIds: ["columns"],
      historyIntent: "layout",
      validationPolicy: "full",
      renderInvalidation: { lane: "node-layout" },
    })
    expect(record.command).toEqual({
      kind: "columns.layout.patch",
      source: "automation",
      columnsId: "columns",
      widthShares: [30, 70],
    })
    expect(JSON.parse(JSON.stringify(record))).toEqual(record)
  })

  it("creates durable-history-ready records for rejected operations", () => {
    const doc = docWithNodes({
      ...tableNodeSet(),
    }, ["table"])
    const result = runVNextOperation(doc, { kind: "table.row.delete", rowId: "row" })
    const record = createVNextOperationHistoryRecord(result)

    expect(record).toMatchObject({
      schemaVersion: 1,
      status: "rejected",
      operationKind: "table.row.delete",
      source: "user",
      targetNodeIds: ["row"],
      scope: null,
      historyIntent: null,
      validationPolicy: null,
      renderInvalidation: null,
      failureReason: "invalid-command",
      issues: [{ code: "cannot-delete-last-row", nodeId: "row" }],
    })
    expect(JSON.parse(JSON.stringify(record))).toEqual(record)
  })

  it("replays committed operation history while preserving rejected audit records", () => {
    const initialDoc = docWithNodes({
      ...tableNodeSet(),
      outro: textBlock("outro", "Outro"),
    }, ["table", "outro"])

    const insertResult = runVNextOperation(initialDoc, {
      kind: "text-block.insert",
      parentNodeId: "body-zone",
      index: 1,
      node: textBlock("inserted", "Inserted"),
    })
    expect(insertResult.ok).toBe(true)
    if (!insertResult.ok) throw new Error(insertResult.issues.map((issue) => issue.message).join("\n"))

    const rejectedResult = runVNextOperation(insertResult.document, { kind: "table.row.delete", rowId: "row" })
    expect(rejectedResult.ok).toBe(false)

    const replaceResult = runVNextOperation(insertResult.document, {
      kind: "text-block.text.replace",
      nodeId: "inserted",
      children: [{ id: "inserted-new-text", type: "text", text: "Replayed" }],
    })
    expect(replaceResult.ok).toBe(true)
    if (!replaceResult.ok) throw new Error(replaceResult.issues.map((issue) => issue.message).join("\n"))

    const timeline = appendVNextOperationHistoryRecord(
      appendVNextOperationHistoryRecord(
        appendVNextOperationHistoryRecord([], createVNextOperationHistoryRecord(insertResult)),
        createVNextOperationHistoryRecord(rejectedResult),
      ),
      createVNextOperationHistoryRecord(replaceResult),
    )
    const replay = replayVNextOperationHistory(initialDoc, timeline)

    expect(replay.ok).toBe(true)
    if (!replay.ok) throw new Error(replay.issues.map((issue) => issue.message).join("\n"))
    expect(replay.replayedCount).toBe(2)
    expect(replay.skippedRejectedCount).toBe(1)
    expect(replay.document).toEqual(replaceResult.document)
    expect(timeline[1].status).toBe("rejected")
  })
})
