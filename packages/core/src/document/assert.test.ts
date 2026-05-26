import { describe, expect, it } from "vitest"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, FlowTableRowNode, LayoutNode, ParagraphNode } from "../schema"
import { pt } from "../schema"
import { assertDocument, DocumentAssertionError } from "./assert"

function paragraph(id: string, text = "Cell"): ParagraphNode {
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

function flowTableDoc(table: FlowTableNode): DocumentNode {
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
          body: { id: "body", type: "body", props: {}, childIds: [table.id] },
          [table.id]: table as unknown as LayoutNode,
        },
      }],
    },
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

function flowCell(id: string, childId: string, props: FlowTableCellNode["props"] = {}): FlowTableCellNode {
  return { id, type: "flow-table-cell", props, childIds: [childId] }
}

function flowRow(id: string, cellIds: string[]): FlowTableRowNode {
  return { id, type: "flow-table-row", props: {}, cellIds }
}

describe("assertDocument general invariants", () => {
  it("allows central paragraph and text-run style definitions", () => {
    const doc = bodyDoc({}, [])
    doc.document.styles = {
      paragraphStyles: {
        "tor.body": {
          id: "tor.body",
          props: { fontSize: pt(12), spacingAfter: pt(6) },
        },
      },
      textRunStyles: {
        emphasis: {
          id: "emphasis",
          style: { fontWeight: "bold", textColor: "1D4ED8" },
        },
      },
    }

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("rejects central style definitions whose ids do not match map keys", () => {
    const doc = bodyDoc({}, [])
    doc.document.styles = {
      paragraphStyles: {
        "tor.body": {
          id: "tor.heading",
          props: {},
        },
      },
    }

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow('paragraph style id "tor.heading" must match map key "tor.body"')
  })

  it("allows paragraphs to reference known central paragraph styles", () => {
    const doc = bodyDoc({
      p1: {
        ...paragraph("p1", "Styled"),
        props: {
          ...paragraph("p1", "Styled").props,
          paragraphStyleId: "tor.body",
        },
      },
    }, ["p1"])
    doc.document.styles = {
      paragraphStyles: {
        "tor.body": { id: "tor.body", props: { fontSize: pt(12) } },
      },
    }

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("allows paragraph style overrides without requiring a central style reference", () => {
    const doc = bodyDoc({
      p1: {
        ...paragraph("p1", "Styled"),
        props: {
          ...paragraph("p1", "Styled").props,
          styleOverrides: {
            fontSize: pt(16),
            spacingAfter: pt(10),
          },
        },
      },
    }, ["p1"])

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("rejects paragraphs that reference missing central paragraph styles", () => {
    const doc = bodyDoc({
      p1: {
        ...paragraph("p1", "Styled"),
        props: {
          ...paragraph("p1", "Styled").props,
          paragraphStyleId: "missing",
        },
      },
    }, ["p1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow('missing paragraph style "missing"')
  })

  it("allows authored toc blocks used by report fixtures", () => {
    const doc = bodyDoc({
      toc: { id: "toc", type: "toc", props: { title: "สารบัญ" } },
    }, ["toc"])

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("walks first-page header and footer roots when checking reachability", () => {
    const doc = bodyDoc({
      "first-header-root": { id: "first-header-root", type: "stack", props: {}, childIds: ["first-header-row"] },
      "first-header-row": { id: "first-header-row", type: "flow-row", props: {}, childIds: ["first-header-stack"] },
      "first-header-stack": { id: "first-header-stack", type: "flow-stack", props: { widthShare: 100 }, childIds: ["first-header-p"] },
      "first-header-p": paragraph("first-header-p", "First page header"),
      "first-footer-root": { id: "first-footer-root", type: "stack", props: {}, childIds: ["first-footer-p"] },
      "first-footer-p": paragraph("first-footer-p", "First page footer"),
    }, [])
    const section = doc.document.sections[0]
    section.headerFirstPageRootId = "first-header-root"
    section.footerFirstPageRootId = "first-footer-root"

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("allows divider and page-break nodes in body flow", () => {
    const doc = bodyDoc({
      divider: {
        id: "divider",
        type: "divider",
        props: {
          color: "334155",
          thickness: pt(1),
          marginBefore: pt(4),
          marginAfter: pt(4),
          style: "solid",
        },
      },
      "page-break": { id: "page-break", type: "page-break", props: {} },
    }, ["divider", "page-break"])

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("allows divider but rejects page-break inside flow-stack content", () => {
    const divider = {
      id: "divider",
      type: "divider",
      props: {
        color: "334155",
        thickness: pt(1),
        marginBefore: pt(4),
        marginAfter: pt(4),
        style: "solid",
      },
    } satisfies LayoutNode
    const valid = bodyDoc({
      row: { id: "row", type: "flow-row", props: {}, childIds: ["stack"] },
      stack: { id: "stack", type: "flow-stack", props: { widthShare: 100 }, childIds: ["divider"] },
      divider,
    }, ["row"])
    const invalid = bodyDoc({
      row: { id: "row", type: "flow-row", props: {}, childIds: ["stack"] },
      stack: { id: "stack", type: "flow-stack", props: { widthShare: 100 }, childIds: ["page-break"] },
      "page-break": { id: "page-break", type: "page-break", props: {} },
    }, ["row"])

    expect(() => assertDocument(valid)).not.toThrow()
    expect(() => assertDocument(invalid)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(invalid)).toThrow('flow-stack child must be paragraph, spacer, or divider — got "page-break"')
  })
})

describe("assertDocument list numbering invariants", () => {
  function listedParagraph(id: string, instanceId = "tor-main", itemId = id, level = 0): ParagraphNode {
    return {
      ...paragraph(id, "List item"),
      props: {
        ...paragraph(id, "List item").props,
        list: { instanceId, itemId, level },
      },
    }
  }

  function addListDefinitions(doc: DocumentNode): DocumentNode {
    doc.document.listStyles = {
      "tor-clause": {
        id: "tor-clause",
        levels: [
          { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), bodyIndent: pt(18) },
          { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, markerIndent: pt(18), bodyIndent: pt(36) },
        ],
      },
    }
    doc.document.listInstances = {
      "tor-main": { id: "tor-main", styleId: "tor-clause" },
    }
    return doc
  }

  it("allows paragraph list metadata that references a known instance and defined level", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1"),
      p2: listedParagraph("p2", "tor-main", "p2", 1),
    }, ["p1", "p2"]))

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("allows a list instance to define a positive top-level startAt", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1"),
    }, ["p1"]))
    doc.document.listInstances = {
      "tor-main": { id: "tor-main", styleId: "tor-clause", startAt: 3 },
    }

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("rejects a list instance startAt that is not a positive integer", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1"),
    }, ["p1"]))
    doc.document.listInstances = {
      "tor-main": { id: "tor-main", styleId: "tor-clause", startAt: 0 },
    }

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
  })

  it("rejects restartAfterLevel when it does not point to a shallower level", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1", "tor-main", "p1", 1),
    }, ["p1"]))
    doc.document.listStyles = {
      "tor-clause": {
        id: "tor-clause",
        levels: [
          { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), bodyIndent: pt(18) },
          { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, restartAfterLevel: 1, markerIndent: pt(18), bodyIndent: pt(36) },
        ],
      },
    }

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("restartAfterLevel must be shallower than the level it restarts")
  })

  it("rejects paragraph list metadata that references a missing instance", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1", "missing-instance"),
    }, ["p1"]))

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow('missing list instance "missing-instance"')
  })

  it("rejects paragraph list metadata when the style does not define the requested level", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1", "tor-main", "p1", 2),
    }, ["p1"]))

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow('list style "tor-clause" does not define level 2')
  })

  it("rejects a list item that starts deeper than level 0", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1", "tor-main", "p1", 1),
    }, ["p1"]))

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("list cannot start at level 1; missing parent level 0")
  })

  it("rejects a list item that jumps more than one level deeper", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1", "tor-main", "p1", 0),
      p2: listedParagraph("p2", "tor-main", "p2", 2),
    }, ["p1", "p2"]))
    doc.document.listStyles = {
      "tor-clause": {
        id: "tor-clause",
        levels: [
          { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), bodyIndent: pt(18) },
          { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, markerIndent: pt(18), bodyIndent: pt(36) },
          { level: 2, format: "decimal", pattern: "%1.%2.%3", startAt: 1, markerIndent: pt(36), bodyIndent: pt(54) },
        ],
      },
    }

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("list level cannot jump from 0 to 2; missing parent level 1")
  })

  it("rejects duplicate itemId values inside the same list instance", () => {
    const doc = addListDefinitions(bodyDoc({
      p1: listedParagraph("p1", "tor-main", "same"),
      p2: listedParagraph("p2", "tor-main", "same"),
    }, ["p1", "p2"]))

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow('duplicate list itemId "same" in instance "tor-main"')
  })
})

describe("assertDocument flow-table invariants", () => {
  it("allows a valid flow-table with cell box styling and rowspan occupancy", () => {
    const p1 = paragraph("p1")
    const p2 = paragraph("p2")
    const p3 = paragraph("p3")
    const c1 = flowCell("c1", p1.id, {
      rowspan: 2,
      box: {
        fill: "D9EAF7",
        padding: { top: pt(4), right: pt(4), bottom: pt(4), left: pt(4) },
        border: { top: { style: "solid", width: pt(1), color: "1F2937" } },
      },
    })
    const c2 = flowCell("c2", p2.id)
    const c3 = flowCell("c3", p3.id)
    const r1 = flowRow("r1", [c1.id, c2.id])
    const r2 = flowRow("r2", [c3.id])
    const table: FlowTableNode = {
      id: "flow-table",
      type: "flow-table",
      props: { headerRowCount: 1 },
      columns: [{ width: pt(100) }, { width: pt(100) }],
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

    expect(() => assertDocument(flowTableDoc(table))).not.toThrow()
  })

  it("rejects divider and page-break content in flow-table cells for now", () => {
    const divider = {
      id: "cell-divider",
      type: "divider",
      props: {
        color: "334155",
        thickness: pt(1),
        marginBefore: pt(4),
        marginAfter: pt(4),
        style: "solid",
      },
    } satisfies LayoutNode
    const row = flowRow("row", ["cell"])
    const dividerTable = {
      id: "flow-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: {
        [row.id]: row,
        cell: { id: "cell", type: "flow-table-cell", props: {}, childIds: [divider.id] },
        [divider.id]: divider,
      },
    } as unknown as FlowTableNode

    const pageBreakTable = {
      id: "flow-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: [row.id],
      nodes: {
        [row.id]: row,
        cell: { id: "cell", type: "flow-table-cell", props: {}, childIds: ["cell-page-break"] },
        "cell-page-break": { id: "cell-page-break", type: "page-break", props: {} },
      },
    } as unknown as FlowTableNode

    expect(() => assertDocument(flowTableDoc(dividerTable))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(flowTableDoc(dividerTable))).toThrow('flow-table cell child must be paragraph or spacer — got "divider"')

    expect(() => assertDocument(flowTableDoc(pageBreakTable))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(flowTableDoc(pageBreakTable))).toThrow('flow-table cell child must be paragraph or spacer — got "page-break"')
  })

  it("allows a flow-table cell mergeMap that maps current children inside the span", () => {
    const p1 = paragraph("p1")
    const p2 = paragraph("p2")
    const p3 = paragraph("p3")
    const c1: FlowTableCellNode = {
      id: "c1",
      type: "flow-table-cell",
      props: {
        colspan: 2,
        rowspan: 2,
        mergeMap: {
          version: 1,
          entries: [
            { rowOffset: 0, colOffset: 0, childIds: [p1.id] },
            { rowOffset: 0, colOffset: 1, childIds: [p2.id] },
            { rowOffset: 1, colOffset: 0, childIds: [p3.id] },
          ],
        },
      },
      childIds: [p1.id, p2.id, p3.id],
    }
    const r1 = flowRow("r1", [c1.id])
    const r2 = flowRow("r2", [])
    const table: FlowTableNode = {
      id: "flow-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id, r2.id],
      nodes: { [r1.id]: r1, [r2.id]: r2, [c1.id]: c1, [p1.id]: p1, [p2.id]: p2, [p3.id]: p3 },
    }

    expect(() => assertDocument(flowTableDoc(table))).not.toThrow()
  })

  it("rejects a flow-table cell mergeMap that references children outside the cell", () => {
    const p1 = paragraph("p1")
    const p2 = paragraph("p2")
    const c1: FlowTableCellNode = {
      id: "c1",
      type: "flow-table-cell",
      props: {
        colspan: 2,
        mergeMap: { version: 1, entries: [{ rowOffset: 0, colOffset: 1, childIds: [p2.id] }] },
      },
      childIds: [p1.id],
    }
    const c2 = flowCell("c2", p2.id)
    const r1 = flowRow("r1", [c1.id])
    const table: FlowTableNode = {
      id: "flow-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id],
      nodes: { [r1.id]: r1, [c1.id]: c1, [c2.id]: c2, [p1.id]: p1, [p2.id]: p2 },
    }

    expect(() => assertDocument(flowTableDoc(table))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(flowTableDoc(table))).toThrow('mergeMap child "p2" must be in the cell childIds')
  })

  it("rejects a flow-table cell mergeMap with offsets outside the current span", () => {
    const p1 = paragraph("p1")
    const c1: FlowTableCellNode = {
      id: "c1",
      type: "flow-table-cell",
      props: {
        mergeMap: { version: 1, entries: [{ rowOffset: 1, colOffset: 0, childIds: [p1.id] }] },
      },
      childIds: [p1.id],
    }
    const r1 = flowRow("r1", [c1.id])
    const table: FlowTableNode = {
      id: "flow-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: [r1.id],
      nodes: { [r1.id]: r1, [c1.id]: c1, [p1.id]: p1 },
    }

    expect(() => assertDocument(flowTableDoc(table))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(flowTableDoc(table))).toThrow("mergeMap rowOffset must be within cell rowspan 1")
  })

  it("rejects flow-table rows that do not fill every column", () => {
    const p1 = paragraph("p1")
    const c1 = flowCell("c1", p1.id)
    const r1 = flowRow("r1", [c1.id])
    const table: FlowTableNode = {
      id: "flow-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id],
      nodes: { [r1.id]: r1, [c1.id]: c1, [p1.id]: p1 },
    }

    expect(() => assertDocument(flowTableDoc(table))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(flowTableDoc(table))).toThrow("flow-table row \"r1\" must fill all 2 columns")
  })

  it("rejects legacy table internals inside flow-table", () => {
    const p1 = paragraph("p1")
    const legacyCell = { id: "c1", type: "table-cell", props: {}, childIds: [p1.id] }
    const legacyRow = { id: "r1", type: "table-row", props: {}, cellIds: [legacyCell.id] }
    const table: FlowTableNode = {
      id: "flow-table",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: [legacyRow.id],
      nodes: { [legacyRow.id]: legacyRow, [legacyCell.id]: legacyCell, [p1.id]: p1 } as unknown as FlowTableNode["nodes"],
    }

    expect(() => assertDocument(flowTableDoc(table))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(flowTableDoc(table))).toThrow("unsupported flow-table internal node type \"table-row\"")
  })

  it("rejects headerRowCount larger than the flow-table row count", () => {
    const p1 = paragraph("p1")
    const c1 = flowCell("c1", p1.id)
    const r1 = flowRow("r1", [c1.id])
    const table: FlowTableNode = {
      id: "flow-table",
      type: "flow-table",
      props: { headerRowCount: 2 },
      columns: [{ width: pt(100) }],
      rowIds: [r1.id],
      nodes: { [r1.id]: r1, [c1.id]: c1, [p1.id]: p1 },
    }

    expect(() => assertDocument(flowTableDoc(table))).toThrow(DocumentAssertionError)
    expect(() => assertDocument(flowTableDoc(table))).toThrow("headerRowCount cannot exceed flow-table row count")
  })
})

describe("assertDocument flow-row / flow-stack invariants", () => {
  it("allows a valid two-stack flow-row", () => {
    const p1 = paragraph("p1", "Left")
    const p2 = paragraph("p2", "Right")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("allows a valid three-stack flow-row", () => {
    const p1 = paragraph("p1", "A")
    const p2 = paragraph("p2", "B")
    const p3 = paragraph("p3", "C")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: { gap: 8 }, childIds: ["fs1", "fs2", "fs3"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p2"] },
      fs3: { id: "fs3", type: "flow-stack", props: { widthShare: 33.34 }, childIds: ["p3"] },
      p1,
      p2,
      p3,
    }, ["fr1"])

    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("rejects an old stack inside a flow-row", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["st1"] },
      st1: { id: "st1", type: "stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("flow-row child must be flow-stack")
  })

  it("rejects a flow-stack inside an old row", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      row1: { id: "row1", type: "row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["row1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("row child must be stack")
  })

  it("rejects a flow-stack outside a flow-row", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fs1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("body child must be paragraph, row, flow-row, spacer, divider, page-break, flow-table, or toc")
  })

  it("rejects non-paragraph and non-spacer children inside flow-stack", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["row1"] },
      row1: { id: "row1", type: "row", props: {}, childIds: ["st1"] },
      st1: { id: "st1", type: "stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("flow-stack child must be paragraph, spacer, or divider")
  })

  it("rejects a flow-stack without widthShare inside flow-row", () => {
    const p1 = paragraph("p1")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: {}, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("flow-stack inside flow-row must have widthShare")
  })

  it("rejects flow-row width shares that do not total 100", () => {
    const p1 = paragraph("p1", "Left")
    const p2 = paragraph("p2", "Right")
    const doc = bodyDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 40 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 40 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    expect(() => assertDocument(doc)).toThrow(DocumentAssertionError)
    expect(() => assertDocument(doc)).toThrow("flow-row stack widths must total exactly 100.00")
  })
})
