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
})
