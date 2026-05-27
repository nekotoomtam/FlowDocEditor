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
  it("normalizes divider props and keeps page-break props empty", () => {
    const doc = makeDoc({
      d1: {
        id: "d1",
        type: "divider",
        props: {
          color: "bad-color",
          thickness: { value: -1, unit: "pt" },
          marginBefore: { value: 2, unit: "mm" },
          marginAfter: { value: -4, unit: "pt" },
          style: "double",
        },
      } as unknown as LayoutNode,
      pb1: {
        id: "pb1",
        type: "page-break",
        props: { unexpected: true },
      } as unknown as LayoutNode,
    }, ["d1", "pb1"])

    const nodes = normalizeDocument(doc).document.sections[0].nodes
    const divider = nodes.d1
    const pageBreak = nodes.pb1

    expect(divider.type).toBe("divider")
    if (divider.type !== "divider") return
    expect(divider.props.color).toBe("CBD5E1")
    expect(divider.props.thickness).toEqual({ value: 1, unit: "pt" })
    expect(divider.props.marginBefore).toEqual({ value: 2, unit: "mm" })
    expect(divider.props.marginAfter).toEqual({ value: 6, unit: "pt" })
    expect(divider.props.style).toBe("solid")

    expect(pageBreak.type).toBe("page-break")
    if (pageBreak.type !== "page-break") return
    expect(pageBreak.props).toEqual({})
  })

  it("normalizes old paragraph font keys to the active Sarabun default", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "Legacy default"),
        props: { ...paragraph("p1", "Legacy default").props, fontFamilyKey: "default" },
      },
      p2: {
        ...paragraph("p2", "Legacy TH"),
        props: { ...paragraph("p2", "Legacy TH").props, fontFamilyKey: "thSarabun" },
      },
    }, ["p1", "p2"])

    const nodes = normalizeDocument(doc).document.sections[0].nodes
    expect((nodes.p1 as ParagraphNode).props.fontFamilyKey).toBe("sarabun")
    expect((nodes.p2 as ParagraphNode).props.fontFamilyKey).toBe("sarabun")
  })

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
          headingLevel: 6,
          keepWithNext: true,
        },
        children: [{ id: "t1", type: "text", text: "Heading" }],
      },
    }, ["p1"])

    const paragraph = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.props.headingLevel).toBe(6)
    expect(paragraph.props.keepWithNext).toBe(true)
  })

  it("normalizes paragraph list metadata and falls back itemId to the paragraph id", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "Listed"),
        props: {
          ...paragraph("p1", "Listed").props,
          list: {
            instanceId: "tor-main",
            level: 2,
            startAt: 3,
          },
        },
      } as unknown as ParagraphNode,
    }, ["p1"])

    const normalized = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(normalized.type).toBe("paragraph")
    if (normalized.type !== "paragraph") return
    expect(normalized.props.list).toEqual({
      instanceId: "tor-main",
      level: 2,
      itemId: "p1",
      startAt: 3,
    })
  })

  it("normalizes paragraph style references", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "Styled"),
        props: {
          ...paragraph("p1", "Styled").props,
          paragraphStyleId: "tor.body",
        },
      },
      p2: {
        ...paragraph("p2", "Plain"),
        props: {
          ...paragraph("p2", "Plain").props,
          paragraphStyleId: "",
        },
      } as unknown as ParagraphNode,
    }, ["p1", "p2"])

    const nodes = normalizeDocument(doc).document.sections[0].nodes

    expect((nodes.p1 as ParagraphNode).props.paragraphStyleId).toBe("tor.body")
    expect((nodes.p2 as ParagraphNode).props.paragraphStyleId).toBeUndefined()
  })

  it("normalizes paragraph style overrides", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "Styled"),
        props: {
          ...paragraph("p1", "Styled").props,
          styleOverrides: {
            fontFamilyKey: "default",
            fontSize: { value: -1, unit: "pt" },
            textColor: "red",
            lineHeight: 1.25,
            spacingAfter: pt(12),
            fontWeight: "bold",
          },
        },
      } as unknown as ParagraphNode,
    }, ["p1"])

    const normalized = normalizeDocument(doc).document.sections[0].nodes.p1

    expect(normalized.type).toBe("paragraph")
    if (normalized.type !== "paragraph") return
    expect(normalized.props.styleOverrides).toEqual({
      fontFamilyKey: "sarabun",
      lineHeight: 1.25,
      spacingAfter: pt(12),
      fontWeight: "bold",
    })
  })

  it("drops malformed paragraph list metadata", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "Unsafe list"),
        props: {
          ...paragraph("p1", "Unsafe list").props,
          list: {
            instanceId: "",
            level: 8,
            itemId: "bad",
          },
        },
      } as unknown as ParagraphNode,
    }, ["p1"])

    const normalized = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(normalized.type).toBe("paragraph")
    if (normalized.type !== "paragraph") return
    expect(normalized.props.list).toBeUndefined()
  })

  it("normalizes legacy list-level textIndent to canonical bodyIndent", () => {
    const doc = makeDoc({
      p1: paragraph("p1", "Listed"),
    }, ["p1"])
    doc.document.listStyles = {
      "tor-clause": {
        id: "tor-clause",
        levels: [{
          level: 0,
          format: "decimal",
          pattern: "%1.",
          startAt: 1,
          markerIndent: pt(0),
          textIndent: pt(36),
        }],
      },
    } as unknown as DocumentNode["document"]["listStyles"]

    const normalizedLevel = normalizeDocument(doc).document.listStyles?.["tor-clause"]?.levels[0]

    expect(normalizedLevel?.bodyIndent).toEqual(pt(36))
    expect("textIndent" in (normalizedLevel as unknown as Record<string, unknown>)).toBe(false)
  })

  it("normalizes paragraph list metadata inside flow-table cells", () => {
    const p1 = {
      ...paragraph("p1", "Cell listed"),
      props: {
        ...paragraph("p1", "Cell listed").props,
        list: {
          instanceId: "tor-main",
          level: 1,
        },
      },
    } as unknown as ParagraphNode
    const cell: FlowTableCellNode = { id: "c1", type: "flow-table-cell", props: {}, childIds: [p1.id] }
    const row: FlowTableRowNode = { id: "r1", type: "flow-table-row", props: {}, cellIds: [cell.id] }
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: { [row.id]: row, [cell.id]: cell, [p1.id]: p1 },
    }

    const normalized = normalizeDocument(makeDoc({ [table.id]: table as unknown as LayoutNode }, [table.id]))
    const normalizedTable = normalized.document.sections[0].nodes.ft1 as unknown as FlowTableNode
    const normalizedParagraph = normalizedTable.nodes.p1

    expect(normalizedParagraph.type).toBe("paragraph")
    if (normalizedParagraph.type !== "paragraph") return
    expect(normalizedParagraph.props.list).toEqual({
      instanceId: "tor-main",
      level: 1,
      itemId: "p1",
    })
  })

  it("normalizes central paragraph and text-run style definitions", () => {
    const doc = makeDoc({
      p1: paragraph("p1", "Styled"),
    }, ["p1"])
    doc.document.styles = {
      paragraphStyles: {
        "tor.body": {
          id: "tor.body",
          name: "Body",
          props: {
            fontFamilyKey: "default",
            fontSize: { value: -1, unit: "pt" },
            textColor: "red",
            lineHeight: -1,
            spacingAfter: pt(6),
            headingLevel: 6,
          },
        },
      },
      textRunStyles: {
        emphasis: {
          id: "emphasis",
          style: {
            fontFamilyKey: "thSarabun",
            fontSize: pt(14),
            textColor: "DC2626",
            fontWeight: "bold",
          },
        },
      },
    } as unknown as DocumentNode["document"]["styles"]

    const styles = normalizeDocument(doc).document.styles

    expect(styles?.baseParagraphStyleId).toBe("tor.body")
    expect(styles?.paragraphStyles?.["tor.body"].props).toEqual({
      fontFamilyKey: "sarabun",
      spacingAfter: pt(6),
      headingLevel: 6,
    })
    expect(styles?.textRunStyles?.emphasis.style).toEqual({
      fontFamilyKey: "sarabun",
      fontSize: pt(14),
      textColor: "DC2626",
      fontWeight: "bold",
    })
  })

  it("normalizes invalid base paragraph style ids to the first paragraph style", () => {
    const doc = makeDoc({
      p1: paragraph("p1", "Styled"),
    }, ["p1"])
    doc.document.styles = {
      baseParagraphStyleId: "missing",
      paragraphStyles: {
        "tor.body": {
          id: "tor.body",
          props: { fontSize: pt(12) },
        },
      },
    } as unknown as DocumentNode["document"]["styles"]

    expect(normalizeDocument(doc).document.styles?.baseParagraphStyleId).toBe("tor.body")
  })

  it("normalizes paragraph-level font style props", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "Styled"),
        props: {
          ...paragraph("p1", "Styled").props,
          textColor: "DC2626",
          fontWeight: "bold",
          fontStyle: "italic",
          textDecoration: "underline",
          strikethrough: true,
        },
      },
      p2: {
        ...paragraph("p2", "Unsafe"),
        props: {
          ...paragraph("p2", "Unsafe").props,
          textColor: "red",
          fontWeight: "heavy",
          fontStyle: "slanted",
          textDecoration: "wavy",
          strikethrough: "yes",
        },
      } as unknown as ParagraphNode,
    }, ["p1", "p2"])

    const nodes = normalizeDocument(doc).document.sections[0].nodes
    expect((nodes.p1 as ParagraphNode).props.textColor).toBe("DC2626")
    expect((nodes.p1 as ParagraphNode).props.fontWeight).toBe("bold")
    expect((nodes.p1 as ParagraphNode).props.fontStyle).toBe("italic")
    expect((nodes.p1 as ParagraphNode).props.textDecoration).toBe("underline")
    expect((nodes.p1 as ParagraphNode).props.strikethrough).toBe(true)
    expect((nodes.p2 as ParagraphNode).props.textColor).toBe("000000")
    expect((nodes.p2 as ParagraphNode).props.fontWeight).toBe("normal")
    expect((nodes.p2 as ParagraphNode).props.fontStyle).toBe("normal")
    expect((nodes.p2 as ParagraphNode).props.textDecoration).toBe("none")
    expect((nodes.p2 as ParagraphNode).props.strikethrough).toBe(false)
  })

  it("normalizes text run style and preserves page-number inline nodes", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "Styled"),
        children: [
          {
            id: "t1",
            type: "text",
            text: "Styled",
            style: {
              fontSize: pt(18),
              fontFamilyKey: "default",
              textColor: "2563EB",
              fontWeight: "bold",
              fontStyle: "italic",
              textDecoration: "underline",
              strikethrough: true,
            },
          },
          { id: "pn1", type: "pageNumber" },
        ],
      },
    }, ["p1"])

    const normalized = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(normalized.type).toBe("paragraph")
    if (normalized.type !== "paragraph") return
    expect(normalized.children[0]).toEqual({
      id: "t1",
      type: "text",
      text: "Styled",
      style: {
        fontSize: pt(18),
        fontFamilyKey: "sarabun",
        textColor: "2563EB",
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: "underline",
        strikethrough: true,
      },
    })
    expect(normalized.children[1]).toEqual({ id: "pn1", type: "pageNumber" })
  })

  it("drops malformed text run style fields instead of creating default overrides", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "Unsafe"),
        children: [{
          id: "t1",
          type: "text",
          text: "Unsafe",
          style: {
            fontSize: pt(0),
            fontFamilyKey: "",
            textColor: "blue",
            fontWeight: "heavy",
            fontStyle: "slanted",
            textDecoration: "wavy",
            strikethrough: "yes",
          },
        }],
      } as unknown as ParagraphNode,
    }, ["p1"])

    const normalized = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(normalized.type).toBe("paragraph")
    if (normalized.type !== "paragraph") return
    expect(normalized.children[0]).toEqual({ id: "t1", type: "text", text: "Unsafe" })
  })

  it("merges adjacent text runs with identical style during normalization", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", "A"),
        children: [
          { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
          { id: "t2", type: "text", text: "B", style: { fontWeight: "bold" } },
          { id: "t3", type: "text", text: "C", style: { fontStyle: "italic" } },
        ],
      },
    }, ["p1"])

    const normalized = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(normalized.type).toBe("paragraph")
    if (normalized.type !== "paragraph") return
    expect(normalized.children).toEqual([
      { id: "t1", type: "text", text: "AB", style: { fontWeight: "bold" } },
      { id: "t3", type: "text", text: "C", style: { fontStyle: "italic" } },
    ])
  })

  it("keeps a single empty text run for empty paragraphs", () => {
    const doc = makeDoc({
      p1: {
        ...paragraph("p1", ""),
        children: [
          { id: "empty-1", type: "text", text: "" },
          { id: "empty-2", type: "text", text: "" },
        ],
      },
    }, ["p1"])

    const normalized = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(normalized.type).toBe("paragraph")
    if (normalized.type !== "paragraph") return
    expect(normalized.children).toHaveLength(1)
    expect(normalized.children[0]).toEqual({ id: "empty-1", type: "text", text: "" })
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

  it("preserves valid flow-table header repeat settings", () => {
    const p1 = paragraph("p1", "A")
    const cell: FlowTableCellNode = { id: "c1", type: "flow-table-cell", props: {}, childIds: [p1.id] }
    const row: FlowTableRowNode = { id: "r1", type: "flow-table-row", props: {}, cellIds: [cell.id] }
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: { headerRowCount: 1, repeatHeaderRows: false },
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: { [row.id]: row, [cell.id]: cell, [p1.id]: p1 },
    }

    const normalized = normalizeDocument(makeDoc({ [table.id]: table as unknown as LayoutNode }, [table.id]))
    const normalizedTable = normalized.document.sections[0].nodes.ft1 as unknown as FlowTableNode

    expect(normalizedTable.props).toMatchObject({ headerRowCount: 1, repeatHeaderRows: false })
  })

  it("drops stale non-boolean flow-table header repeat settings", () => {
    const p1 = paragraph("p1", "A")
    const cell: FlowTableCellNode = { id: "c1", type: "flow-table-cell", props: {}, childIds: [p1.id] }
    const row: FlowTableRowNode = { id: "r1", type: "flow-table-row", props: {}, cellIds: [cell.id] }
    const table = {
      id: "ft1",
      type: "flow-table",
      props: { headerRowCount: 1, repeatHeaderRows: "yes" },
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: { [row.id]: row, [cell.id]: cell, [p1.id]: p1 },
    } as unknown as FlowTableNode

    const normalized = normalizeDocument(makeDoc({ [table.id]: table as unknown as LayoutNode }, [table.id]))
    const normalizedTable = normalized.document.sections[0].nodes.ft1 as unknown as FlowTableNode

    expect(normalizedTable.props.headerRowCount).toBe(1)
    expect(normalizedTable.props.repeatHeaderRows).toBeUndefined()
  })

  it("normalizes flow-table layout props", () => {
    const p1 = paragraph("p1", "A")
    const cell: FlowTableCellNode = { id: "c1", type: "flow-table-cell", props: {}, childIds: [p1.id] }
    const row: FlowTableRowNode = { id: "r1", type: "flow-table-row", props: {}, cellIds: [cell.id] }
    const table = {
      id: "ft1",
      type: "flow-table",
      props: { align: "middle", marginTop: { value: -4, unit: "pt" }, marginBottom: { value: 6, unit: "pt" } },
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: { [row.id]: row, [cell.id]: cell, [p1.id]: p1 },
    } as unknown as FlowTableNode

    const normalized = normalizeDocument(makeDoc({ [table.id]: table as unknown as LayoutNode }, [table.id]))
    const normalizedTable = normalized.document.sections[0].nodes.ft1 as unknown as FlowTableNode

    expect(normalizedTable.props.align).toBeUndefined()
    expect(normalizedTable.props.marginTop).toEqual(pt(0))
    expect(normalizedTable.props.marginBottom).toEqual(pt(6))
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
