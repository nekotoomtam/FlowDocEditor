import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import {
  assertDocument,
  normalizeDocument,
  addTableRow,
  removeTableRow,
  addTableColumn,
  removeTableColumn,
} from "../../document"
import type { DocumentNode, LayoutNode, ParagraphNode, TableNode, TableCellNode, TableRowNode } from "../../schema"

// ─── Page Metrics ─────────────────────────────────────────────────────────────
// A4 + 72pt margins → contentBox.y=72, contentBox.height=698, contentBottom=770
const CY = 72
const FS = 10
const LH = FS * 1.2  // = 12

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePara(id: string, text: string): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(FS),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function makePageNumberPara(id: string, prefix = "หน้า "): ParagraphNode {
  return {
    ...makePara(id, ""),
    children: [
      { id: `${id}-t`, type: "text", text: prefix },
      { id: `${id}-pn`, type: "pageNumber" },
    ],
  }
}

// Build a table with explicit rowspan control.
// rowDefs: array of rows, each row has cells with optional rowspan/colspan.
function makeTable(
  id: string,
  colWidths: number[],
  rowDefs: { rowspan?: number; colspan?: number; text?: string }[][],
): TableNode {
  const internalNodes: TableNode["nodes"] = {}
  const rowIds: string[] = []

  rowDefs.forEach((cells, rowIdx) => {
    const cellIds: string[] = []
    cells.forEach((cell, colIdx) => {
      const paraId = `${id}-p${rowIdx}-${colIdx}`
      const cellId = `${id}-c${rowIdx}-${colIdx}`
      internalNodes[paraId] = makePara(paraId, cell.text ?? "")
      internalNodes[cellId] = {
        id: cellId,
        type: "table-cell",
        props: {
          rowspan: cell.rowspan ?? 1,
          colspan: cell.colspan ?? 1,
        },
        childIds: [paraId],
      } as TableCellNode
      cellIds.push(cellId)
    })
    const rowId = `${id}-row${rowIdx}`
    internalNodes[rowId] = { id: rowId, type: "table-row", props: {}, cellIds } as TableRowNode
    rowIds.push(rowId)
  })

  return {
    id,
    type: "table",
    props: {
      border: {
        top: { style: "solid", width: pt(0.5), color: "000000" },
        right: { style: "solid", width: pt(0.5), color: "000000" },
        bottom: { style: "solid", width: pt(0.5), color: "000000" },
        left: { style: "solid", width: pt(0.5), color: "000000" },
      },
    },
    columns: colWidths.map((w) => ({ width: pt(w) })),
    rowIds,
    nodes: internalNodes,
  }
}

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE,
        bodyRootId: "body",
        nodes: {
          "body": { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

function getTableFragments(result: ReturnType<typeof paginate>, tableId: string) {
  return result.sections[0].pages.flatMap((pg) =>
    pg.fragments.filter((f) => f.nodeId === tableId || f.nodeId.startsWith(`${tableId}-row`))
  )
}

function getPageOfFragment(result: ReturnType<typeof paginate>, nodeId: string): number {
  for (const page of result.sections[0].pages) {
    if (page.fragments.some((f) => f.nodeId === nodeId)) return page.index
  }
  return -1
}

// ─── No rowspan: existing behavior preserved ──────────────────────────────────

describe("tablePagination — no rowspan (single-row groups)", () => {
  it("simple 2×2 table renders without violations", () => {
    const tbl = makeTable("tbl", [100, 100], [
      [{ text: "A" }, { text: "B" }],
      [{ text: "C" }, { text: "D" }],
    ])
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
  })

  it("table with no rowspan: rows can end up on different pages when they don't fit", () => {
    // Fill page with filler, then a 2-row table where first row fits, second doesn't
    const fillerText = Array.from({ length: 55 }, () => "A").join("\n")
    const filler: LayoutNode = makePara("filler", fillerText)
    const tbl = makeTable("tbl", [200, 200], [
      [{ text: "R1C1" }, { text: "R1C2" }],
      [{ text: "R2C1" }, { text: "R2C2" }],
    ])
    const result = paginate(makeDoc(["filler", "tbl"], { filler, tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    // Result may have rows on different pages (current behavior for no-rowspan)
    expect(result.sections[0].pages.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Rowspan groups: rows must land on the same page ─────────────────────────

describe("tablePagination — rowspan groups stay on same page", () => {
  it("2-row rowspan group stays together on the same page", () => {
    // Row 0 has a cell with rowspan=2 → rows 0 and 1 form a group
    const tbl = makeTable("tbl", [100, 100], [
      [{ text: "A", rowspan: 2 }, { text: "B" }],
      [{ text: "C" }],  // row 1 has only 1 cell because column 0 is spanned
    ])
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    // Both rows should be on the same page
    expect(getPageOfFragment(result, "tbl-row0")).toBe(getPageOfFragment(result, "tbl-row1"))
  })

  it("rowspan group moves to next page as a unit when it doesn't fit", () => {
    // Fill most of page 1, then add a 2-row rowspan group that won't fit
    const fillerText = Array.from({ length: 55 }, () => "A").join("\n")  // ~660pt
    const filler = makePara("filler", fillerText)
    // 2-row group with some content in each row (each ~12pt → group ~24pt)
    // After 660pt filler, remaining = 698-660=38pt → group 24pt fits? Let's make rows taller
    // Use 4 hard lines each (4×12=48pt) → group 96pt, remaining 38pt → group moves to page 2
    const rowText = "A\nB\nC\nD"  // 4 lines × 12pt = 48pt per row
    const tbl = makeTable("tbl", [200, 200], [
      [{ text: rowText, rowspan: 2 }, { text: rowText }],
      [{ text: rowText }],
    ])
    const result = paginate(makeDoc(["filler", "tbl"], { filler, tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    // Both rows of the group should be on the same page (page 2)
    const row0Page = getPageOfFragment(result, "tbl-row0")
    const row1Page = getPageOfFragment(result, "tbl-row1")
    expect(row0Page).toBe(row1Page)
    // And that page should be after filler's page
    expect(row0Page).toBeGreaterThan(0)
  })

  it("3-row rowspan group stays together", () => {
    const tbl = makeTable("tbl", [100, 100], [
      [{ text: "A", rowspan: 3 }, { text: "B" }],
      [{ text: "C" }],
      [{ text: "D" }],
    ])
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    const pages = [
      getPageOfFragment(result, "tbl-row0"),
      getPageOfFragment(result, "tbl-row1"),
      getPageOfFragment(result, "tbl-row2"),
    ]
    expect(pages[0]).toBe(pages[1])
    expect(pages[1]).toBe(pages[2])
  })

  it("table with mixed groups: rowspan group and independent rows", () => {
    // Row 0+1 form a group (rowspan), row 2 is independent
    const tbl = makeTable("tbl", [100, 100], [
      [{ text: "A", rowspan: 2 }, { text: "B" }],
      [{ text: "C" }],
      [{ text: "D" }, { text: "E" }],  // independent row
    ])
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    // Row 0 and row 1 on same page
    expect(getPageOfFragment(result, "tbl-row0")).toBe(getPageOfFragment(result, "tbl-row1"))
    // Row 2 can be on any page (independent)
    expect(getPageOfFragment(result, "tbl-row2")).toBeGreaterThanOrEqual(0)
  })

  it("too-tall rowspan group starts at contentTop of next page, not mid-page", () => {
    // Fill part of page 1 (filler ~300pt), then add a rowspan group taller than
    // one content page (698pt). The group should move to page 2 contentTop (72pt),
    // not start at the mid-page cursor after the filler.
    const fillerText = Array.from({ length: 25 }, () => "A").join("\n")  // 25×12=300pt
    const filler = makePara("filler", fillerText)
    // Each row: 40 hard lines × 12pt = 480pt, group = 960pt > contentHeight 698pt
    const tallText = Array.from({ length: 40 }, () => "A").join("\n")
    const tbl = makeTable("tbl", [200, 200], [
      [{ text: tallText, rowspan: 2 }, { text: tallText }],
      [{ text: tallText }],
    ])
    const result = paginate(makeDoc(["filler", "tbl"], { filler, tbl }))
    // Row 0 must start at contentTop (72), not at ~300+72=372 (mid-page)
    const row0Frag = result.sections[0].pages
      .flatMap((pg) => pg.fragments)
      .find((f) => f.nodeId === "tbl-row0")!
    expect(row0Frag.y).toBe(CY)  // contentTop = 72
    // Both rows still on the same page (group integrity preserved)
    expect(getPageOfFragment(result, "tbl-row0")).toBe(getPageOfFragment(result, "tbl-row1"))
  })

  it("assertPaginatedDocument passes for table with rowspan", () => {
    const tbl = makeTable("tbl", [100, 100], [
      [{ text: "Top", rowspan: 2 }, { text: "R" }],
      [{ text: "Bot" }],
    ])
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
  })
})

// ─── Grid invariants after operations ────────────────────────────────────────

// ─── Repeating table headers ──────────────────────────────────────────────────

describe("tablePagination — repeating headers", () => {
  // Build a table where row 0 is a header and rows 1..N are content.
  // Each row has 2 cells with short text (~1 line = 12pt each).
  function makeHeaderTable(id: string, contentRowCount: number): TableNode {
    // Header row with tall content so we can measure it: 3 lines × 12pt = 36pt
    const headerText = "H1\nH2\nH3"
    const contentText = "A"
    return makeTable(id, [200, 200], [
      [{ text: headerText }, { text: headerText }],
      ...Array.from({ length: contentRowCount }, () => [{ text: contentText }, { text: contentText }]),
    ])
  }

  it("table without headerRowCount has no repeating headers (baseline)", () => {
    const tbl = makeHeaderTable("tbl", 60)
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    // Header row (row0) should appear exactly once
    const headerFrags = result.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "tbl-row0"),
    )
    expect(headerFrags).toHaveLength(1)
  })

  it("table with headerRowCount=1 repeats header on each continuation page", () => {
    const tbl = { ...makeHeaderTable("tbl", 60), props: { headerRowCount: 1 } }
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    // Table should span at least 2 pages
    expect(result.sections[0].pages.length).toBeGreaterThanOrEqual(2)
    // Header row (row0) should appear on every page
    for (const page of result.sections[0].pages) {
      const hasHeader = page.fragments.some((f) => f.nodeId === "tbl-row0")
      expect(hasHeader).toBe(true)
    }
  })

  it("repeated header starts at contentTop on continuation page", () => {
    const tbl = { ...makeHeaderTable("tbl", 60), props: { headerRowCount: 1 } }
    const result = paginate(makeDoc(["tbl"], { tbl }))
    const page1 = result.sections[0].pages[1]!
    const headerOnPage1 = page1.fragments.find((f) => f.nodeId === "tbl-row0")!
    expect(headerOnPage1).toBeDefined()
    expect(headerOnPage1.y).toBe(CY)  // contentTop = 72
  })

  it("content rows on continuation pages start below repeated header", () => {
    const tbl = { ...makeHeaderTable("tbl", 60), props: { headerRowCount: 1 } }
    const result = paginate(makeDoc(["tbl"], { tbl }))
    const page1 = result.sections[0].pages[1]!
    const headerOnPage1 = page1.fragments.find((f) => f.nodeId === "tbl-row0")!
    const firstContentOnPage1 = page1.fragments.find(
      (f) => f.nodeId !== "tbl-row0" && f.nodeType === "row" && f.parentNodeId === "tbl",
    )
    if (firstContentOnPage1) {
      expect(firstContentOnPage1.y).toBeGreaterThanOrEqual(headerOnPage1.y + headerOnPage1.height)
    }
  })

  it("header fragments appear in ascending page order (assertPaginatedDocument passes)", () => {
    const tbl = { ...makeHeaderTable("tbl", 60), props: { headerRowCount: 1 } }
    const result = paginate(makeDoc(["tbl"], { tbl }))
    // assertPaginatedDocument's split-fragment-order rule verifies ascending pages
    expect(() => assertPaginatedDocument(result)).not.toThrow()
  })
})

describe("product fixture — customs-basic-table", () => {
  it("paginates a 2+ page customs table with repeated header and page footer", () => {
    const tbl = makeTable("customs-table", [150, 220, 80], [
      [{ text: "Item" }, { text: "Description" }, { text: "Amount" }],
      ...Array.from({ length: 70 }, (_, i) => [
        { text: String(i + 1) },
        { text: `รายการสินค้า ${i + 1}` },
        { text: `${(i + 1) * 100}` },
      ]),
    ])
    tbl.props = { ...tbl.props, headerRowCount: 1 }
    const footer = makePageNumberPara("customs-footer")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "customs-basic-table",
        sections: [{
          id: "customs",
          type: "section",
          page: PAGE,
          bodyRootId: "body",
          footerRootId: "customs-footer",
          nodes: {
            "body": { id: "body", type: "body", props: {}, childIds: ["customs-table"] },
            "customs-footer": footer,
            "customs-table": tbl,
          },
        }],
      },
    }

    const result = paginate(doc)
    assertPaginatedDocument(result)
    const pages = result.sections[0].pages
    const tablePages = pages.filter((page) =>
      page.fragments.some((f) => f.nodeId === "customs-table" || f.parentNodeId === "customs-table"),
    )

    expect(tablePages.length).toBeGreaterThanOrEqual(2)
    for (const page of tablePages) {
      expect(page.fragments.some((f) => f.nodeId === "customs-table-row0")).toBe(true)
      expect(page.footerFragments.some((f) =>
        f.nodeId === "customs-footer" && f.lines?.[0]?.text === `หน้า ${page.index + 1}`,
      )).toBe(true)
    }
  })
})

describe("product fixture — customs-rowspan-boundary", () => {
  it("moves a near-boundary rowspan group as a unit to the next page", () => {
    const filler = makePara("customs-filler", Array.from({ length: 51 }, () => "Filler").join("\n"))
    const groupText = Array.from({ length: 8 }, (_, i) => `สินค้า ${i + 1}`).join("\n")
    const tbl = makeTable("customs-rowspan", [150, 220, 80], [
      [{ text: "Item" }, { text: "Description" }, { text: "Amount" }],
      [{ text: "1", rowspan: 2 }, { text: groupText }, { text: "1000" }],
      [{ text: groupText }, { text: "2000" }],
      [{ text: "2" }, { text: "รายการถัดไป" }, { text: "3000" }],
    ])
    tbl.props = { ...tbl.props, headerRowCount: 1 }

    const result = paginate(makeDoc(["customs-filler", "customs-rowspan"], { "customs-filler": filler, "customs-rowspan": tbl }))
    assertPaginatedDocument(result)

    const row1Page = getPageOfFragment(result, "customs-rowspan-row1")
    const row2Page = getPageOfFragment(result, "customs-rowspan-row2")
    const row1Frag = result.sections[0].pages
      .flatMap((pg) => pg.fragments)
      .find((f) => f.nodeId === "customs-rowspan-row1")
    const row2Frag = result.sections[0].pages
      .flatMap((pg) => pg.fragments)
      .find((f) => f.nodeId === "customs-rowspan-row2")

    expect(row1Page).toBeGreaterThan(0)
    expect(row1Page).toBe(row2Page)
    expect(row1Frag?.y).toBeGreaterThan(CY)
    expect(row2Frag?.y).toBeCloseTo((row1Frag?.y ?? 0) + (row1Frag?.height ?? 0), 0)
  })
})

describe("product fixture — customs-breakable-row-uneven-cells", () => {
  it("splits a long description cell without duplicating short numeric cells", () => {
    const longDescription = Array.from({ length: 130 }, (_, i) => `รายละเอียดสินค้า ${i + 1}`).join("\n")
    const tbl = makeTable("customs-breakable", [80, 290, 80], [
      [{ text: "No." }, { text: "Description" }, { text: "Amount" }],
      [{ text: "1" }, { text: longDescription }, { text: "12000" }],
    ])
    tbl.props = { ...tbl.props, headerRowCount: 1 }
    const bodyRow = tbl.nodes["customs-breakable-row1"]
    if (bodyRow?.type === "table-row") bodyRow.props = { ...bodyRow.props, allowBreak: true }

    const result = paginate(makeDoc(["customs-breakable"], { "customs-breakable": tbl }))
    assertPaginatedDocument(result)

    const bodyRowPages = new Set(result.sections[0].pages
      .filter((page) => page.fragments.some((f) => f.nodeId === "customs-breakable-row1"))
      .map((page) => page.index))
    const descriptionFragments = result.sections[0].pages.flatMap((page) =>
      page.fragments.filter((f) => f.nodeId === "customs-breakable-p1-1"),
    )
    const shortNumberFragments = result.sections[0].pages.flatMap((page) =>
      page.fragments.filter((f) => f.nodeId === "customs-breakable-p1-0"),
    )
    const amountFragments = result.sections[0].pages.flatMap((page) =>
      page.fragments.filter((f) => f.nodeId === "customs-breakable-p1-2"),
    )

    expect(bodyRowPages.size).toBeGreaterThanOrEqual(2)
    expect(descriptionFragments.length).toBeGreaterThanOrEqual(2)
    expect(descriptionFragments.flatMap((f) => f.lines ?? []).map((line) => line.text).join("").replace(/\s+/g, ""))
      .toBe(longDescription.replace(/\s+/g, ""))
    expect(shortNumberFragments).toHaveLength(1)
    expect(shortNumberFragments[0].lines?.map((line) => line.text).join("")).toBe("1")
    expect(amountFragments).toHaveLength(1)
    expect(amountFragments[0].lines?.map((line) => line.text).join("")).toBe("12000")
    for (const page of result.sections[0].pages.filter((page) => bodyRowPages.has(page.index) && page.index > 0)) {
      expect(page.fragments.some((f) => f.nodeId === "customs-breakable-row0")).toBe(true)
    }
  })
})

describe("tablePagination — grid invariants after operations", () => {
  function makeSimpleTableDoc() {
    const tbl = makeTable("tbl", [100, 100, 100], [
      [{ text: "A" }, { text: "B" }, { text: "C" }],
      [{ text: "D" }, { text: "E" }, { text: "F" }],
      [{ text: "G" }, { text: "H" }, { text: "I" }],
    ])
    return makeDoc(["tbl"], { tbl })
  }

  it("createDefaultTable passes assertDocument", () => {
    const doc = normalizeDocument(makeSimpleTableDoc())
    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("addTableRow produces valid document and valid paginated output", () => {
    const base = normalizeDocument(makeSimpleTableDoc())
    const updated = normalizeDocument(addTableRow(base, "tbl"))
    expect(() => assertDocument(updated)).not.toThrow()
    expect(() => assertPaginatedDocument(paginate(updated))).not.toThrow()
  })

  it("removeTableRow produces valid document and valid paginated output", () => {
    const base = normalizeDocument(makeSimpleTableDoc())
    const updated = normalizeDocument(removeTableRow(base, "tbl", 1))
    expect(() => assertDocument(updated)).not.toThrow()
    expect(() => assertPaginatedDocument(paginate(updated))).not.toThrow()
  })

  it("addTableColumn produces valid document and valid paginated output", () => {
    const base = normalizeDocument(makeSimpleTableDoc())
    const updated = normalizeDocument(addTableColumn(base, "tbl"))
    expect(() => assertDocument(updated)).not.toThrow()
    expect(() => assertPaginatedDocument(paginate(updated))).not.toThrow()
  })

  it("removeTableColumn produces valid document and valid paginated output", () => {
    const base = normalizeDocument(makeSimpleTableDoc())
    const updated = normalizeDocument(removeTableColumn(base, "tbl", 1))
    expect(() => assertDocument(updated)).not.toThrow()
    expect(() => assertPaginatedDocument(paginate(updated))).not.toThrow()
  })

  it("table at start of page has correct y position", () => {
    const tbl = makeTable("tbl", [100, 100], [
      [{ text: "A" }, { text: "B" }],
    ])
    const result = paginate(makeDoc(["tbl"], { tbl }))
    const tblFrag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "tbl")!
    expect(tblFrag.y).toBe(CY)
  })

  it("full table-cell paragraph exposes line metadata", () => {
    const tbl = makeTable("tbl", [451], [
      [{ text: "A\nB\nC" }],
    ])
    const result = paginate(makeDoc(["tbl"], { tbl }))
    const paraFrag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "tbl-p0-0")!

    expect(paraFrag.lineStart).toBe(0)
    expect(paraFrag.lineEnd).toBe(3)
    expect(paraFrag.continuesFrom).toBe(false)
    expect(paraFrag.isContinued).toBe(false)
  })
})

// ─── Multi-page row split (allowBreak=true) ───────────────────────────────────
// A4 + 72pt margins: contentHeight=698pt, LH=12pt → ~58 lines per page

describe("tablePagination — multi-page row split", () => {
  // Helper: table with one breakable row, one cell, N hard-newline lines
  function makeBreakableTable(id: string, lineCount: number): TableNode {
    const text = Array.from({ length: lineCount }, (_, i) => `L${i}`).join("\n")
    const paraId = `${id}-p`
    const cellId = `${id}-c`
    const rowId = `${id}-row`
    return {
      id,
      type: "table",
      props: {},
      columns: [{ width: pt(451) }],
      rowIds: [rowId],
      nodes: {
        [rowId]: { id: rowId, type: "table-row", props: { allowBreak: true }, cellIds: [cellId] } as TableRowNode,
        [cellId]: { id: cellId, type: "table-cell", props: { rowspan: 1, colspan: 1 }, childIds: [paraId] } as TableCellNode,
        [paraId]: makePara(paraId, text),
      },
    }
  }

  it("row spanning 3 pages produces fragments on 3 pages", () => {
    const LINES_PER_PAGE = 58
    const tbl = makeBreakableTable("tbl", LINES_PER_PAGE * 3)
    const result = paginate(makeDoc(["tbl"], { tbl }))
    const rowFrags = result.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "tbl-row")
    )
    expect(rowFrags.length).toBeGreaterThanOrEqual(3)
    const pageIndices = [...new Set(rowFrags.map((f) => f.pageIndex))]
    expect(pageIndices.length).toBeGreaterThanOrEqual(3)
  })

  it("total paragraph line count is preserved across all fragments", () => {
    const LINES_PER_PAGE = 58
    const lineCount = LINES_PER_PAGE * 3
    const tbl = makeBreakableTable("tbl", lineCount)
    const result = paginate(makeDoc(["tbl"], { tbl }))
    const paraFrags = result.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "tbl-p")
    )
    const totalLines = paraFrags.reduce((s, f) => s + (f.lines?.length ?? 0), 0)
    expect(totalLines).toBe(lineCount)
  })

  it("split fragments appear in ascending page order", () => {
    const LINES_PER_PAGE = 58
    const tbl = makeBreakableTable("tbl", LINES_PER_PAGE * 3)
    const result = paginate(makeDoc(["tbl"], { tbl }))
    const paraFrags = result.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "tbl-p")
    )
    for (let i = 1; i < paraFrags.length; i++) {
      expect(paraFrags[i].pageIndex).toBeGreaterThanOrEqual(paraFrags[i - 1].pageIndex)
    }
  })

  it("table-cell paragraph split fragments expose line continuation metadata", () => {
    const LINES_PER_PAGE = 58
    const lineCount = LINES_PER_PAGE * 2
    const tbl = makeBreakableTable("tbl", lineCount)
    const result = paginate(makeDoc(["tbl"], { tbl }))
    const paraFrags = result.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "tbl-p")
    )

    expect(paraFrags.length).toBeGreaterThan(1)
    expect(paraFrags[0].lineStart).toBe(0)
    expect(paraFrags[0].continuesFrom).toBe(false)
    expect(paraFrags[0].isContinued).toBe(true)

    for (let i = 0; i < paraFrags.length - 1; i++) {
      expect(paraFrags[i].lineEnd).toBe(paraFrags[i + 1]!.lineStart)
    }

    const last = paraFrags[paraFrags.length - 1]!
    expect(last.lineEnd).toBe(lineCount)
    expect(last.continuesFrom).toBe(true)
    expect(last.isContinued).toBe(false)
  })

  it("assertPaginatedDocument passes for a 3-page breakable row", () => {
    const LINES_PER_PAGE = 58
    const tbl = makeBreakableTable("tbl", LINES_PER_PAGE * 3)
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
  })

  it("2-page breakable row still works correctly after refactor", () => {
    const LINES_PER_PAGE = 58
    const tbl = makeBreakableTable("tbl", Math.floor(LINES_PER_PAGE * 1.5))
    const result = paginate(makeDoc(["tbl"], { tbl }))
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    const paraFrags = result.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "tbl-p")
    )
    const totalLines = paraFrags.reduce((s, f) => s + (f.lines?.length ?? 0), 0)
    expect(totalLines).toBe(Math.floor(LINES_PER_PAGE * 1.5))
  })

  it("does not duplicate shorter cell content across split-row continuation pages", () => {
    const longText = Array.from({ length: 120 }, (_, i) => `Long ${i}`).join("\n")
    const tbl = makeTable("tbl", [220, 220], [
      [{ text: "Short" }, { text: longText }],
    ])
    const row = tbl.nodes["tbl-row0"]
    if (row?.type === "table-row") row.props = { ...row.props, allowBreak: true }

    const result = paginate(makeDoc(["tbl"], { tbl }))
    const shortCellParagraphs = result.sections[0].pages.flatMap((pg) =>
      pg.fragments.filter((f) => f.nodeId === "tbl-p0-0"),
    )
    expect(shortCellParagraphs).toHaveLength(1)
    expect(shortCellParagraphs[0].lines?.map((line) => line.text).join("")).toBe("Short")
  })

  it("repeats table headers during breakable row continuation", () => {
    const longText = Array.from({ length: 120 }, (_, i) => `Body ${i}`).join("\n")
    const tbl = makeTable("tbl", [451], [
      [{ text: "Header" }],
      [{ text: longText }],
    ])
    tbl.props = { ...tbl.props, headerRowCount: 1 }
    const bodyRow = tbl.nodes["tbl-row1"]
    if (bodyRow?.type === "table-row") bodyRow.props = { ...bodyRow.props, allowBreak: true }

    const result = paginate(makeDoc(["tbl"], { tbl }))
    const bodyPages = new Set(
      result.sections[0].pages
        .filter((pg) => pg.fragments.some((f) => f.nodeId === "tbl-row1"))
        .map((pg) => pg.index),
    )
    expect(bodyPages.size).toBeGreaterThan(1)
    for (const page of result.sections[0].pages.filter((pg) => bodyPages.has(pg.index) && pg.index > 0)) {
      expect(page.fragments.some((f) => f.nodeId === "tbl-row0")).toBe(true)
    }
  })
})
