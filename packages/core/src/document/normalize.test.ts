import { describe, expect, it } from "vitest"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, FlowTableRowNode, LayoutNode, ParagraphNode } from "../schema"
import { pt } from "../schema"
import { normalizeDocument } from "./normalize"

function makeDoc(nodes: Record<string, LayoutNode>, childIds: string[]): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      meta: { title: "Normalize props" },
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

function paragraph(id: string, text: string): ParagraphNode {
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

describe("normalizeDocument", () => {
  it("preserves paragraph heading and keep-with-next props", () => {
    const doc = makeDoc({
      p1: {
        id: "p1",
        type: "paragraph",
        props: {
          align: "left",
          fontSize: pt(12),
          lineHeight: 1.5,
          spacingBefore: pt(0),
          spacingAfter: pt(8),
          textIndent: pt(0),
          indentLeft: pt(0),
          indentRight: pt(0),
          headingLevel: 2,
          keepWithNext: true,
        },
        children: [{ id: "t1", type: "text", text: "Heading" }],
      },
    }, ["p1"])

    const paragraph = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.props.headingLevel).toBe(2)
    expect(paragraph.props.keepWithNext).toBe(true)
  })

  it("preserves valid paragraph box style props", () => {
    const doc = makeDoc({
      p1: {
        id: "p1",
        type: "paragraph",
        props: {
          align: "left",
          fontSize: pt(12),
          lineHeight: 1.5,
          spacingBefore: pt(0),
          spacingAfter: pt(8),
          textIndent: pt(0),
          indentLeft: pt(0),
          indentRight: pt(0),
          box: {
            fill: "E0F2FE",
            padding: { top: pt(2), right: pt(4), bottom: pt(6), left: pt(8) },
            border: {
              top: { style: "solid", width: pt(1), color: "0F172A" },
              bottom: { style: "dashed", width: pt(0.5), color: "334155" },
            },
          },
        },
        children: [{ id: "t1", type: "text", text: "Boxed" }],
      },
    }, ["p1"])

    const paragraph = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.props.box).toEqual({
      fill: "E0F2FE",
      padding: { top: pt(2), right: pt(4), bottom: pt(6), left: pt(8) },
      border: {
        top: { style: "solid", width: pt(1), color: "0F172A" },
        bottom: { style: "dashed", width: pt(0.5), color: "334155" },
      },
    })
  })

  it("normalizes unsafe paragraph box style values", () => {
    const doc = makeDoc({
      p1: {
        id: "p1",
        type: "paragraph",
        props: {
          align: "left",
          fontSize: pt(12),
          lineHeight: 1.5,
          spacingBefore: pt(0),
          spacingAfter: pt(8),
          textIndent: pt(0),
          indentLeft: pt(0),
          indentRight: pt(0),
          box: {
            fill: "not-a-color",
            padding: { top: pt(-2), right: pt(4), bottom: { value: 2, unit: "px" }, left: pt(8) },
            border: {
              top: { style: "solid", width: pt(-1), color: "bad" },
              right: { style: "wavy", width: pt(1), color: "000000" },
            },
          },
        },
        children: [{ id: "t1", type: "text", text: "Boxed" }],
      } as unknown as LayoutNode,
    }, ["p1"])

    const paragraph = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.props.box).toEqual({
      padding: { top: pt(0), right: pt(4), bottom: pt(0), left: pt(8) },
      border: {
        top: { style: "solid", width: pt(0), color: "000000" },
      },
    })
  })

  it("preserves row minHeight", () => {
    const doc = makeDoc({
      row1: { id: "row1", type: "row", props: { minHeight: 96 }, childIds: ["st1"] },
      st1: { id: "st1", type: "stack", props: { widthShare: 100, minHeight: 24 }, childIds: [] },
    }, ["row1"])

    const row = normalizeDocument(doc).document.sections[0].nodes.row1
    expect(row.type).toBe("row")
    if (row.type !== "row") return
    expect(row.props.minHeight).toBe(96)
  })

  it("preserves flow-row and flow-stack props", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: { gap: 6, minHeight: 96 }, childIds: ["fs1"] },
      fs1: {
        id: "fs1",
        type: "flow-stack",
        props: {
          widthShare: 100,
          minHeight: 24,
          box: {
            fill: "F8FAFC",
            padding: { top: pt(2), right: pt(4), bottom: pt(6), left: pt(8) },
            border: { left: { style: "solid", width: pt(1), color: "0F172A" } },
          },
        },
        childIds: [],
      },
    }, ["fr1"])

    const nodes = normalizeDocument(doc).document.sections[0].nodes
    const row = nodes.fr1
    const stack = nodes.fs1
    expect(row.type).toBe("flow-row")
    expect(stack.type).toBe("flow-stack")
    if (row.type !== "flow-row" || stack.type !== "flow-stack") return
    expect(row.props.gap).toBe(6)
    expect(row.props.minHeight).toBe(96)
    expect(stack.props.widthShare).toBe(100)
    expect(stack.props.minHeight).toBe(24)
    expect(stack.props.box).toEqual({
      fill: "F8FAFC",
      padding: { top: pt(2), right: pt(4), bottom: pt(6), left: pt(8) },
      border: { left: { style: "solid", width: pt(1), color: "0F172A" } },
    })
  })

  it("normalizes flow-row width shares without assuming two stacks", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2", "fs3"] },
      fs1: { id: "fs1", type: "flow-stack", props: {}, childIds: [] },
      fs2: { id: "fs2", type: "flow-stack", props: {}, childIds: [] },
      fs3: { id: "fs3", type: "flow-stack", props: {}, childIds: [] },
    }, ["fr1"])

    const nodes = normalizeDocument(doc).document.sections[0].nodes
    const shares = ["fs1", "fs2", "fs3"].map((id) => {
      const node = nodes[id]
      expect(node.type).toBe("flow-stack")
      return node.type === "flow-stack" ? node.props.widthShare ?? 0 : 0
    })
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100)
    expect(shares).toEqual([33.33, 33.33, 33.34])
  })

  it("preserves valid flow-table cell mergeMap entries", () => {
    const p1 = paragraph("p1", "A")
    const p2 = paragraph("p2", "B")
    const cell: FlowTableCellNode = {
      id: "c1",
      type: "flow-table-cell",
      props: {
        colspan: 2,
        mergeMap: {
          version: 1,
          entries: [
            { rowOffset: 0, colOffset: 0, childIds: [p1.id] },
            { rowOffset: 0, colOffset: 1, childIds: [p2.id] },
          ],
        },
      },
      childIds: [p1.id, p2.id],
    }
    const row: FlowTableRowNode = { id: "r1", type: "flow-table-row", props: {}, cellIds: [cell.id] }
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [row.id],
      nodes: { [row.id]: row, [cell.id]: cell, [p1.id]: p1, [p2.id]: p2 },
    }

    const normalized = normalizeDocument(makeDoc({ [table.id]: table as unknown as LayoutNode }, [table.id]))
    const normalizedTable = normalized.document.sections[0].nodes.ft1 as unknown as FlowTableNode
    const normalizedCell = normalizedTable.nodes.c1
    expect(normalizedCell.type).toBe("flow-table-cell")
    if (normalizedCell.type !== "flow-table-cell") return
    expect(normalizedCell.props.mergeMap).toEqual(cell.props.mergeMap)
  })

  it("normalizes stale flow-table cell mergeMap entries", () => {
    const p1 = paragraph("p1", "A")
    const p2 = paragraph("p2", "B")
    const cell = {
      id: "c1",
      type: "flow-table-cell",
      props: {
        colspan: 2,
        mergeMap: {
          version: 1,
          entries: [
            { rowOffset: 0, colOffset: 0, childIds: [p1.id, p1.id] },
            { rowOffset: 0, colOffset: 1, childIds: [p2.id, "missing"] },
            { rowOffset: 1, colOffset: 0, childIds: [p2.id] },
            { rowOffset: 0, colOffset: 2, childIds: [p2.id] },
          ],
        },
      },
      childIds: [p1.id, p2.id],
    } as unknown as FlowTableCellNode
    const row: FlowTableRowNode = { id: "r1", type: "flow-table-row", props: {}, cellIds: [cell.id] }
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [row.id],
      nodes: { [row.id]: row, [cell.id]: cell, [p1.id]: p1, [p2.id]: p2 },
    }

    const normalized = normalizeDocument(makeDoc({ [table.id]: table as unknown as LayoutNode }, [table.id]))
    const normalizedTable = normalized.document.sections[0].nodes.ft1 as unknown as FlowTableNode
    const normalizedCell = normalizedTable.nodes.c1
    expect(normalizedCell.type).toBe("flow-table-cell")
    if (normalizedCell.type !== "flow-table-cell") return
    expect(normalizedCell.props.mergeMap).toEqual({
      version: 1,
      entries: [
        { rowOffset: 0, colOffset: 0, childIds: [p1.id] },
        { rowOffset: 0, colOffset: 1, childIds: [p2.id] },
      ],
    })
  })
})
