import { describe, expect, it } from "vitest"
import type { AuthoredNodeVNext, DocumentNodeVNext, TextBlockRoleVNext } from "../schema"
import { pt } from "../schema"
import {
  assertDocumentVNext,
  buildRelationshipGraphVNext,
  getColumnNodesVNext,
  getTableCellsVNext,
  getTableNodesVNext,
  getTableRowsVNext,
  getTextBlockNodesVNext,
  getZoneNodesVNext,
} from "./documentVNext"

function textBlock(
  id: string,
  text: string,
  role: TextBlockRoleVNext = { role: "paragraph" },
): AuthoredNodeVNext {
  return {
    id,
    type: "text-block",
    role,
    props: {},
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function minimalDoc(nodes: Record<string, AuthoredNodeVNext>, bodyChildIds: string[]): DocumentNodeVNext {
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

describe("Document Model vNext graph skeleton", () => {
  it("builds graph facts for zones, text-block roles, columns, and tables", () => {
    const doc = minimalDoc({
      title: textBlock("title", "Quarterly Report", { role: "heading", level: 1 }),
      intro: textBlock("intro", "Intro"),
      bullets: textBlock("bullets", "Item", {
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
    }, ["title", "intro", "bullets", "columns", "table"])

    const graph = buildRelationshipGraphVNext(doc)

    expect(doc.version).toBe(3)
    expect(getZoneNodesVNext(graph).map((node) => node.role)).toEqual(["body"])
    expect(getTextBlockNodesVNext(graph).map((node) => node.type).every((type) => type === "text-block")).toBe(true)
    expect(getColumnNodesVNext(graph).map((node) => node.id)).toEqual(["left", "right"])
    expect(getTableNodesVNext(graph).map((node) => node.id)).toEqual(["table"])
    expect(getTableRowsVNext(graph).map((node) => node.id)).toEqual(["row"])
    expect(getTableCellsVNext(graph).map((node) => node.id)).toEqual(["cell-a", "cell-b"])
    expect(graph.parentByNodeId.get("columns")).toEqual({
      kind: "zone",
      sectionId: "section",
      zoneId: "body-zone",
      childField: "childIds",
      index: 3,
    })
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
    expect(() => assertDocumentVNext(doc)).not.toThrow()
  })

  it("keeps prototype node names out of vNext capabilities", () => {
    const doc = minimalDoc({ p: textBlock("p", "Text") }, ["p"])
    const graph = buildRelationshipGraphVNext(doc)
    const finalTypes = Object.keys(graph.capabilitiesByType)

    expect(finalTypes).toContain("text-block")
    expect(finalTypes).toContain("columns")
    expect(finalTypes).toContain("table")
    expect(finalTypes).not.toContain("paragraph")
    expect(finalTypes).not.toContain("flow-row")
    expect(finalTypes).not.toContain("flow-stack")
    expect(finalTypes).not.toContain("flow-table")
    expect(finalTypes).not.toContain("body")
  })

  it("rejects prototype node names in a vNext document", () => {
    const doc = minimalDoc({
      p: {
        id: "p",
        type: "paragraph",
        props: {},
        children: [],
      } as never,
    }, ["p"])

    expect(() => assertDocumentVNext(doc)).toThrow()
  })

  it("rejects orphan nodes and invalid columns widths", () => {
    const orphanDoc = minimalDoc({
      p: textBlock("p", "Text"),
      orphan: textBlock("orphan", "No parent"),
    }, ["p"])
    expect(() => assertDocumentVNext(orphanDoc)).toThrow("orphan node")

    const badColumnsDoc = minimalDoc({
      columns: { id: "columns", type: "columns", props: {}, columnIds: ["left", "right"] },
      left: { id: "left", type: "column", props: { widthShare: 40 }, childIds: [] },
      right: { id: "right", type: "column", props: { widthShare: 30 }, childIds: [] },
    }, ["columns"])
    expect(() => assertDocumentVNext(badColumnsDoc)).toThrow("columns widthShare total must be 100.00")
  })
})
