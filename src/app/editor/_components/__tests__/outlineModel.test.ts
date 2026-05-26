import { describe, expect, it } from "vitest"
import type { DocumentNode } from "@/schema"
import { buildOutlineModel } from "../outlineModel"

function paragraph(id: string, text: string, instanceId?: string, level = 0) {
  return {
    id,
    type: "paragraph" as const,
    props: {
      align: "left" as const,
      fontSize: { value: 12, unit: "pt" as const },
      fontFamilyKey: "default",
      lineHeight: 1.5,
      spacingBefore: { value: 0, unit: "pt" as const },
      spacingAfter: { value: 0, unit: "pt" as const },
      textIndent: { value: 0, unit: "pt" as const },
      indentLeft: { value: 0, unit: "pt" as const },
      indentRight: { value: 0, unit: "pt" as const },
      ...(instanceId ? { list: { instanceId, level, itemId: `${id}.item` } } : {}),
    },
    children: [{ id: `${id}-text`, type: "text" as const, text }],
  }
}

function docWithBodyListRun(): DocumentNode {
  const p1 = paragraph("p1", "First", "tor-main", 0)
  const p2 = paragraph("p2", "Second", "tor-main", 1)
  const p3 = paragraph("p3", "Plain")
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
          body: { id: "body", type: "body", props: {}, childIds: ["p1", "p2", "p3"] },
          p1,
          p2,
          p3,
        },
      }],
    },
  }
}

function docWithFlowTableCellListRun(): DocumentNode {
  const p1 = paragraph("p1", "First", "tor-main", 0)
  const p2 = paragraph("p2", "Second", "tor-main", 1)
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
          body: { id: "body", type: "body", props: {}, childIds: ["table"] },
          table: {
            id: "table",
            type: "flow-table",
            props: {},
            columns: [{ width: { value: 120, unit: "pt" } }],
            rowIds: ["row"],
            nodes: {
              row: { id: "row", type: "flow-table-row", props: {}, cellIds: ["cell"] },
              cell: { id: "cell", type: "flow-table-cell", props: {}, childIds: ["p1", "p2"] },
              p1,
              p2,
            },
          },
        },
      }],
    },
  }
}

describe("outline model", () => {
  it("wraps contiguous body paragraph list items in a virtual list group run", () => {
    const [section] = buildOutlineModel(docWithBodyListRun(), { listGroupIds: ["tor-main"] })

    expect(section.sectionId).toBe("section")
    expect(section.bodyId).toBe("body")
    expect(section.items).toHaveLength(2)
    expect(section.items[0]).toMatchObject({
      kind: "list-group-run",
      instanceId: "tor-main",
      paragraphIds: ["p1", "p2"],
    })
    if (section.items[0].kind !== "list-group-run") return
    expect(section.items[0].children.map((item) => item.nodeId)).toEqual(["p1", "p2"])
    expect(section.items[0].children.map((item) => item.isBodyChild)).toEqual([true, true])
    expect(section.items[1]).toMatchObject({ kind: "node", nodeId: "p3", isBodyChild: true })
  })

  it("keeps flow-table structure while grouping listed cell paragraphs", () => {
    const [section] = buildOutlineModel(docWithFlowTableCellListRun(), { listGroupIds: ["tor-main"] })
    const table = section.items[0]

    expect(table).toMatchObject({ kind: "node", nodeId: "table", nodeType: "flow-table", isBodyChild: true })
    if (table.kind !== "node") return
    const row = table.children[0]
    expect(row).toMatchObject({ kind: "node", nodeId: "row", nodeType: "flow-table-row", labelOverride: "แถว 1" })
    if (row.kind !== "node") return
    const cell = row.children[0]
    expect(cell).toMatchObject({ kind: "node", nodeId: "cell", nodeType: "flow-table-cell", labelOverride: "เซลล์ 1" })
    if (cell.kind !== "node") return
    expect(cell.children[0]).toMatchObject({
      kind: "list-group-run",
      instanceId: "tor-main",
      paragraphIds: ["p1", "p2"],
    })
    if (cell.children[0].kind !== "list-group-run") return
    expect(cell.children[0].children.map((item) => item.isBodyChild)).toEqual([false, false])
  })
})
