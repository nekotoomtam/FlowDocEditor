import { describe, expect, it } from "vitest"
import type { AuthoredNode, DocumentNode, TextBlockRole } from "../src/schema/document.js"
import {
  assertDocument,
  buildRelationshipGraph,
  getColumns,
  getTableCells,
  getTableRows,
  getTables,
  getTextBlocks,
  getZones,
} from "../src/graph/relationshipGraph.js"

function pt(value: number) {
  return { value, unit: "pt" as const }
}

function textBlock(id: string, text: string, role: TextBlockRole = { role: "paragraph" }): AuthoredNode {
  return {
    id,
    type: "text-block",
    role,
    props: {},
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function minimalDoc(nodes: Record<string, AuthoredNode>, bodyChildIds: string[]): DocumentNode {
  return {
    version: 3,
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
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

describe("vNext relationship graph", () => {
  it("builds graph facts for zones, text-block roles, columns, and tables", () => {
    const doc = minimalDoc({
      title: textBlock("title", "Report", { role: "heading", level: 1 }),
      item: textBlock("item", "List item", {
        role: "list-item",
        list: { instanceId: "list", level: 0, itemId: "item-1" },
      }),
      columns: { id: "columns", type: "columns", props: { gap: 12 }, columnIds: ["left", "right"] },
      left: { id: "left", type: "column", props: { widthShare: 40 }, childIds: ["left-text"] },
      right: { id: "right", type: "column", props: { widthShare: 60 }, childIds: ["right-text"] },
      "left-text": textBlock("left-text", "Left"),
      "right-text": textBlock("right-text", "Right"),
      table: {
        id: "table",
        type: "table",
        props: { headerRowCount: 1 },
        columns: [{ width: pt(120) }, { width: pt(120) }],
        rowIds: ["row"],
      },
      row: { id: "row", type: "table-row", props: {}, cellIds: ["cell-a", "cell-b"] },
      "cell-a": { id: "cell-a", type: "table-cell", props: {}, childIds: ["cell-a-text"] },
      "cell-b": { id: "cell-b", type: "table-cell", props: {}, childIds: ["cell-b-text"] },
      "cell-a-text": textBlock("cell-a-text", "A"),
      "cell-b-text": textBlock("cell-b-text", "B"),
    }, ["title", "item", "columns", "table"])

    const graph = buildRelationshipGraph(doc)

    expect(getZones(graph).map((node) => node.role)).toEqual(["body"])
    expect(getTextBlocks(graph).every((node) => node.type === "text-block")).toBe(true)
    expect(getColumns(graph).map((node) => node.id)).toEqual(["left", "right"])
    expect(getTables(graph).map((node) => node.id)).toEqual(["table"])
    expect(getTableRows(graph).map((node) => node.id)).toEqual(["row"])
    expect(getTableCells(graph).map((node) => node.id)).toEqual(["cell-a", "cell-b"])
    expect(graph.parentByNodeId.get("left")).toEqual({
      kind: "columns",
      columnsId: "columns",
      childField: "columnIds",
      index: 0,
    })
    expect(graph.nearestByNodeId.get("cell-a-text")).toMatchObject({
      sectionId: "section",
      zoneId: "body-zone",
      tableId: "table",
      tableRowId: "row",
      tableCellId: "cell-a",
      textBlockId: "cell-a-text",
    })
    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("keeps prototype names out of public vNext capabilities", () => {
    const graph = buildRelationshipGraph(minimalDoc({ p: textBlock("p", "Text") }, ["p"]))
    const types = Object.keys(graph.capabilitiesByType)

    expect(types).toContain("text-block")
    expect(types).toContain("columns")
    expect(types).toContain("table")
    expect(types).not.toContain("paragraph")
    expect(types).not.toContain("flow-row")
    expect(types).not.toContain("flow-stack")
    expect(types).not.toContain("flow-table")
    expect(types).not.toContain("body")
  })

  it("rejects orphan nodes and invalid column width totals", () => {
    expect(() => assertDocument(minimalDoc({
      p: textBlock("p", "Text"),
      orphan: textBlock("orphan", "No parent"),
    }, ["p"]))).toThrow("orphan node")

    expect(() => assertDocument(minimalDoc({
      columns: { id: "columns", type: "columns", props: {}, columnIds: ["left", "right"] },
      left: { id: "left", type: "column", props: { widthShare: 40 }, childIds: [] },
      right: { id: "right", type: "column", props: { widthShare: 30 }, childIds: [] },
    }, ["columns"]))).toThrow("columns widthShare total must be 100.00")
  })
})
