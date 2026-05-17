import { describe, expect, it } from "vitest"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, FlowTableRowNode, TableCellNode, TableNode, TableRowNode } from "@/schema"
import { buildSelectionContext } from "../selectionContext"

function flowDoc(): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["fr1"] },
          fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
          fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: {
              align: "left",
              fontSize: { value: 12, unit: "pt" },
              fontFamilyKey: "default",
              lineHeight: 1.5,
              spacingBefore: { value: 0, unit: "pt" },
              spacingAfter: { value: 0, unit: "pt" },
              textIndent: { value: 0, unit: "pt" },
              indentLeft: { value: 0, unit: "pt" },
              indentRight: { value: 0, unit: "pt" },
            },
            children: [{ id: "t1", type: "text", text: "Flow text" }],
          },
        },
      }],
    },
  } as DocumentNode
}

function tableDoc(): DocumentNode {
  const table: TableNode = {
    id: "tbl1",
    type: "table",
    props: {},
    columns: [
      { width: { value: 100, unit: "pt" } },
    ],
    rowIds: ["tr1"],
    nodes: {
      tr1: { id: "tr1", type: "table-row", props: {}, cellIds: ["tc1"] } as TableRowNode,
      tc1: { id: "tc1", type: "table-cell", props: {}, childIds: ["p1"] } as TableCellNode,
      p1: {
        id: "p1",
        type: "paragraph",
        props: {
          align: "left",
          fontSize: { value: 12, unit: "pt" },
          fontFamilyKey: "default",
          lineHeight: 1.5,
          spacingBefore: { value: 0, unit: "pt" },
          spacingAfter: { value: 0, unit: "pt" },
          textIndent: { value: 0, unit: "pt" },
          indentLeft: { value: 0, unit: "pt" },
          indentRight: { value: 0, unit: "pt" },
        },
        children: [{ id: "t1", type: "text", text: "Cell text" }],
      },
    },
  }

  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["tbl1"] },
          tbl1: table,
        },
      }],
    },
  } as DocumentNode
}

function flowTableDoc(): DocumentNode {
  const table: FlowTableNode = {
    id: "ft1",
    type: "flow-table",
    props: {},
    columns: [
      { width: { value: 100, unit: "pt" } },
    ],
    rowIds: ["ftr1"],
    nodes: {
      ftr1: { id: "ftr1", type: "flow-table-row", props: {}, cellIds: ["ftc1"] } as FlowTableRowNode,
      ftc1: { id: "ftc1", type: "flow-table-cell", props: {}, childIds: ["p1"] } as FlowTableCellNode,
      p1: {
        id: "p1",
        type: "paragraph",
        props: {
          align: "left",
          fontSize: { value: 12, unit: "pt" },
          fontFamilyKey: "default",
          lineHeight: 1.5,
          spacingBefore: { value: 0, unit: "pt" },
          spacingAfter: { value: 0, unit: "pt" },
          textIndent: { value: 0, unit: "pt" },
          indentLeft: { value: 0, unit: "pt" },
          indentRight: { value: 0, unit: "pt" },
        },
        children: [{ id: "t1", type: "text", text: "Flow cell text" }],
      },
    },
  }

  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
          ft1: table,
        },
      }],
    },
  } as DocumentNode
}

describe("buildSelectionContext", () => {
  it("returns a top-to-deep flow context for a paragraph inside a flow-stack", () => {
    const context = buildSelectionContext(flowDoc(), "p1")

    expect(context.map((item) => item.nodeId)).toEqual(["fr1", "fs1", "p1"])
    expect(context.map((item) => item.label)).toEqual(["Row", "Stack", "Paragraph"])
  })

  it("hides body from simple body paragraph context", () => {
    const doc = flowDoc()
    const section = doc.document.sections[0]
    section.nodes.body = { id: "body", type: "body", props: {}, childIds: ["p1"] }

    const context = buildSelectionContext(doc, "p1")

    expect(context.map((item) => item.nodeId)).toEqual(["p1"])
  })

  it("can describe existing table parents without using the outline", () => {
    const context = buildSelectionContext(tableDoc(), "p1")

    expect(context.map((item) => item.nodeId)).toEqual(["tbl1", "tr1", "tc1", "p1"])
    expect(context.map((item) => item.label)).toEqual(["Table", "Table row", "Table cell", "Paragraph"])
  })

  it("can describe flow-table parents without using the outline", () => {
    const context = buildSelectionContext(flowTableDoc(), "p1")

    expect(context.map((item) => item.nodeId)).toEqual(["ft1", "ftr1", "ftc1", "p1"])
    expect(context.map((item) => item.label)).toEqual(["Flow table", "Flow table row", "Flow table cell", "Paragraph"])
  })
})
