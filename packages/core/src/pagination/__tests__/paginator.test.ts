import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, ParagraphNode, SpacerNode, LayoutNode, TableNode } from "../../schema"
import type { PageFragment } from "../types"

// ─── Page Metrics ────────────────────────────────────────────────────────────
// A4 portrait + 72pt margins
const CX = 72   // contentBox.x
const CY = 72   // contentBox.y
const CW = 451  // contentBox.width  (595 - 72 - 72)
const CH = 698  // contentBox.height (842 - 72 - 72)
const CB = CY + CH  // contentBottom = 770

// defaultTextMeasurer constants at fontSize=10
// ASCII char width:  10 * 0.48 = 4.8
// Thai char width:   10 * 0.62 = 6.2
// lineHeight ratio 1.2: 10 * 1.2 = 12
const FS = 10
const LH = FS * 1.2  // = 12

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAGE_SETTINGS = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePara(id: string, text: string, overrides: Partial<ParagraphNode["props"]> = {}): ParagraphNode {
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
      ...overrides,
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function makeSpacer(id: string, height: number): SpacerNode {
  return { id, type: "spacer", props: { height } }
}

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE_SETTINGS,
        bodyRootId: "body",
        nodes: {
          "body": { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function getFragments(doc: DocumentNode): PageFragment[] {
  const result = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
  return result.sections[0].pages.flatMap((p) => p.fragments)
}

function getPages(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker).sections[0].pages
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("paginator — geometry", () => {
  it("places first paragraph at content box origin", () => {
    const p = makePara("p1", "Hi")
    const paginated = makeDoc(["p1"], { p1: p })
    const frags = getFragments(paginated)
    const f = frags.find((f) => f.nodeId === "p1")!
    expect(f.x).toBe(CX)
    expect(f.y).toBe(CY)
    expect(f.width).toBe(CW)
  })

  it("paragraph height equals one line height when text fits on one line", () => {
    // "Hi" = 2 chars × 4.8 = 9.6 < 451 → 1 line, height = LH = 12
    const p = makePara("p1", "Hi")
    const frags = getFragments(makeDoc(["p1"], { p1: p }))
    const f = frags.find((f) => f.nodeId === "p1")!
    expect(f.height).toBe(LH)
    expect(f.lines).toHaveLength(1)
    expect(f.lines![0].text).toBe("Hi")
  })

  it("stacks two paragraphs vertically", () => {
    const p1 = makePara("p1", "A")
    const p2 = makePara("p2", "B")
    const frags = getFragments(makeDoc(["p1", "p2"], { p1, p2 }))
    const f1 = frags.find((f) => f.nodeId === "p1")!
    const f2 = frags.find((f) => f.nodeId === "p2")!
    expect(f1.y).toBe(CY)
    expect(f2.y).toBe(CY + LH)   // p1 height = LH, p2 starts right after
  })

  it("spacer has correct height and position", () => {
    const p = makePara("p1", "A")
    const s = makeSpacer("s1", 50)
    const frags = getFragments(makeDoc(["p1", "s1"], { p1: p, s1: s }))
    const sp = frags.find((f) => f.nodeId === "s1")!
    expect(sp.y).toBe(CY + LH)   // after p1
    expect(sp.height).toBe(50)
    expect(sp.width).toBe(CW)
  })

  it("places paragraph text inside paragraph box padding and border", () => {
    const p = makePara("p1", "Hi", {
      box: {
        fill: "F5F7FA",
        padding: {
          top: pt(3),
          right: pt(4),
          bottom: pt(5),
          left: pt(6),
        },
        border: {
          top: { style: "solid", width: pt(1), color: "111111" },
          right: { style: "solid", width: pt(3), color: "222222" },
          bottom: { style: "solid", width: pt(4), color: "333333" },
          left: { style: "solid", width: pt(2), color: "444444" },
        },
      },
    })
    const frags = getFragments(makeDoc(["p1"], { p1: p }))
    const f = frags.find((f) => f.nodeId === "p1")!

    expect(f.height).toBe(LH + 1 + 3 + 5 + 4)
    expect(f.lines?.[0]?.x).toBe(CX + 2 + 6)
    expect(f.lines?.[0]?.y).toBe(CY + 1 + 3)
    expect(f.renderProps?.box?.fill).toBe("F5F7FA")
    expect(f.renderProps?.box?.padding.left).toBe(6)
    expect(f.renderProps?.box?.border.left?.width).toBe(2)
  })
})

describe("paginator — page breaks", () => {
  it("keeps single paragraph on one page when it fits", () => {
    const p = makePara("p1", "A")
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    expect(pages).toHaveLength(1)
  })

  it("paragraph splits across pages when it does not fit on one page", () => {
    // p1 is short (1 line); p2 is 60 lines → splits across pages
    const p1 = makePara("p1", "A")
    const p2Text = Array.from({ length: 60 }, (_, i) => String.fromCharCode(65 + (i % 26))).join("\n")
    const p2 = makePara("p2", p2Text)
    const pages = getPages(makeDoc(["p1", "p2"], { p1, p2 }))
    // p2 spans multiple pages
    expect(pages.length).toBeGreaterThanOrEqual(2)
    // p2 has fragments on page 0 (partial) and page 1 (remainder)
    const p2OnPage0 = pages[0].fragments.some((f) => f.nodeId === "p2")
    const p2OnPage1 = pages[1]?.fragments.some((f) => f.nodeId === "p2")
    expect(p2OnPage0).toBe(true)
    expect(p2OnPage1).toBe(true)
    // Total line count across all fragments equals original line count
    const totalLines = pages.flatMap((pg) => pg.fragments)
      .filter((f) => f.nodeId === "p2")
      .reduce((sum, f) => sum + (f.lines?.length ?? 0), 0)
    expect(totalLines).toBe(60)
  })

  it("spacer moves to next page when it does not fit", () => {
    // fill most of the page with a tall paragraph, then add a large spacer
    const fillerText = Array.from({ length: 55 }, () => "A").join("\n")
    const p1 = makePara("p1", fillerText)  // 55 × 12 = 660pt
    const s1 = makeSpacer("s1", 100)       // 100pt, won't fit (660 + 100 = 760 > 698 remaining after nothing...
    // actually cursor after p1: CY + 660 = 732, 732+100 = 832 > 770 → move spacer to page 2
    const pages = getPages(makeDoc(["p1", "s1"], { p1, s1 }))
    expect(pages.length).toBeGreaterThanOrEqual(2)
    const spacerPage = pages.findIndex((pg) => pg.fragments.some((f) => f.nodeId === "s1"))
    expect(spacerPage).toBeGreaterThan(0)
  })

  it("paragraph at top of page is not moved even if tall", () => {
    // A paragraph taller than contentHeight must still be placed (no infinite loop)
    // Use 80 lines × 12 = 960pt > 698pt = CH
    const tallText = Array.from({ length: 80 }, () => "A").join("\n")
    const p = makePara("p1", tallText)
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    // should produce exactly 1 page and not crash
    const p1Frag = pages[0].fragments.find((f) => f.nodeId === "p1")
    expect(p1Frag).toBeDefined()
    expect(p1Frag!.y).toBe(CY)
  })

  it("applies paragraph box top inset only to the first split fragment and bottom inset only to the last", () => {
    const text = Array.from({ length: 60 }, () => "A").join("\n")
    const p = makePara("p1", text, {
      box: {
        padding: {
          top: pt(6),
          right: pt(0),
          bottom: pt(15),
          left: pt(0),
        },
        border: {
          top: { style: "solid", width: pt(4), color: "111111" },
          bottom: { style: "solid", width: pt(5), color: "222222" },
        },
      },
    })
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    const frags = pages.flatMap((page) => page.fragments).filter((f) => f.nodeId === "p1")

    expect(frags).toHaveLength(2)
    expect(frags[0].lines).toHaveLength(57)
    expect(frags[0].height).toBe(10 + 57 * LH)
    expect(frags[0].lines?.[0]?.y).toBe(CY + 10)
    expect(frags[1].lines).toHaveLength(3)
    expect(frags[1].height).toBe(3 * LH + 20)
    expect(frags[1].lines?.[0]?.y).toBe(CY)
    expect(() => assertPaginatedDocument(paginateDocument(makeDoc(["p1"], { p1: p }), defaultTextMeasurer, defaultWordBreaker))).not.toThrow()
  })
})

describe("paginator — fragment relationships", () => {
  it("row fragment has bodyId as parentNodeId", () => {
    const p = makePara("p1", "A")
    const stack: LayoutNode = { id: "st", type: "stack", props: { widthShare: 100, minHeight: 24 }, childIds: ["p1"] }
    const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st"] }
    const frags = getFragments(makeDoc(["r1"], { r1: row, st: stack, p1: p }))
    const rowFrag = frags.find((f) => f.nodeId === "r1")!
    expect(rowFrag.parentNodeId).toBe("body")
  })

  it("stack fragment has rowId as parentNodeId", () => {
    const p = makePara("p1", "A")
    const stack: LayoutNode = { id: "st", type: "stack", props: { widthShare: 100, minHeight: 24 }, childIds: ["p1"] }
    const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st"] }
    const frags = getFragments(makeDoc(["r1"], { r1: row, st: stack, p1: p }))
    const stackFrag = frags.find((f) => f.nodeId === "st")!
    expect(stackFrag.parentNodeId).toBe("r1")
  })

  it("paragraph inside stack has stackId as parentNodeId", () => {
    const p = makePara("p1", "A")
    const stack: LayoutNode = { id: "st", type: "stack", props: { widthShare: 100, minHeight: 24 }, childIds: ["p1"] }
    const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st"] }
    const frags = getFragments(makeDoc(["r1"], { r1: row, st: stack, p1: p }))
    const pFrag = frags.find((f) => f.nodeId === "p1")!
    expect(pFrag.parentNodeId).toBe("st")
  })

  it("two-column row produces two stacks with correct widths", () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const st1: LayoutNode = { id: "st1", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p1"] }
    const st2: LayoutNode = { id: "st2", type: "stack", props: { widthShare: 50, minHeight: 24 }, childIds: ["p2"] }
    const row: LayoutNode = { id: "r1", type: "row", props: {}, childIds: ["st1", "st2"] }
    const frags = getFragments(makeDoc(["r1"], { r1: row, st1, st2, p1, p2 }))
    const st1Frag = frags.find((f) => f.nodeId === "st1")!
    const st2Frag = frags.find((f) => f.nodeId === "st2")!
    // Total width should equal CW, each half ≈ CW/2
    expect(st1Frag.width + st2Frag.width).toBeCloseTo(CW, 0)
    // st1 starts at contentBox.x, st2 starts after st1
    expect(st1Frag.x).toBe(CX)
    expect(st2Frag.x).toBeCloseTo(CX + st1Frag.width, 0)
  })
})

describe("paginator — line metadata", () => {
  it("paragraph with hard newlines produces correct line texts", () => {
    const p = makePara("p1", "Hello\nWorld")
    const frags = getFragments(makeDoc(["p1"], { p1: p }))
    const f = frags.find((f) => f.nodeId === "p1")!
    expect(f.lines).toHaveLength(2)
    expect(f.lines![0].text).toBe("Hello")
    expect(f.lines![1].text).toBe("World")
  })

  it("paragraph lines have x equal to fragment x", () => {
    const p = makePara("p1", "A\nB\nC")
    const frags = getFragments(makeDoc(["p1"], { p1: p }))
    const f = frags.find((f) => f.nodeId === "p1")!
    f.lines!.forEach((line) => expect(line.x).toBe(CX))
  })

  it("paragraph lines are positioned top-to-bottom within fragment", () => {
    const p = makePara("p1", "A\nB\nC")
    const frags = getFragments(makeDoc(["p1"], { p1: p }))
    const f = frags.find((f) => f.nodeId === "p1")!
    const lines = f.lines!
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].y).toBeGreaterThan(lines[i - 1].y)
    }
  })
})

// ─── Paragraph split across pages ────────────────────────────────────────────

describe("paginator — paragraph split across pages", () => {
  // A4 + 72pt margins: contentHeight=698, LH=12 → floor(698/12)=58 lines per page
  const LINES_PER_PAGE = Math.floor(698 / LH)  // = 58

  it("paragraph split preserves total line count", () => {
    const lineCount = LINES_PER_PAGE + 10  // spans 2 pages
    const p = makePara("p1", Array.from({ length: lineCount }, () => "A").join("\n"))
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    const total = pages.flatMap((pg) => pg.fragments)
      .filter((f) => f.nodeId === "p1")
      .reduce((sum, f) => sum + (f.lines?.length ?? 0), 0)
    expect(total).toBe(lineCount)
  })

  it("first split fragment starts at contentBox.y", () => {
    const p = makePara("p1", Array.from({ length: LINES_PER_PAGE + 5 }, () => "A").join("\n"))
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    const firstFrag = pages[0].fragments.find((f) => f.nodeId === "p1")!
    expect(firstFrag.y).toBe(CY)
  })

  it("continuation fragment starts at contentBox.y on next page", () => {
    const p = makePara("p1", Array.from({ length: LINES_PER_PAGE + 5 }, () => "A").join("\n"))
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    const contFrag = pages[1]?.fragments.find((f) => f.nodeId === "p1")!
    expect(contFrag).toBeDefined()
    expect(contFrag.y).toBe(CY)
  })

  it("spacingBefore is only on the first fragment", () => {
    const p = makePara("p1",
      Array.from({ length: LINES_PER_PAGE + 5 }, () => "A").join("\n"),
      { spacingBefore: pt(20) },
    )
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    const allFrags = pages.flatMap((pg) => pg.fragments).filter((f) => f.nodeId === "p1")
    // First fragment: y=CY, first line y = CY + 20 (spacingBefore)
    expect(allFrags[0].lines![0].y).toBe(CY + 20)
    // Continuation fragment: first line y = CY (no spacingBefore)
    expect(allFrags[1].lines![0].y).toBe(CY)
  })

  it("spacingAfter is only on the last fragment", () => {
    const lineCount = LINES_PER_PAGE + 3
    const p = makePara("p1",
      Array.from({ length: lineCount }, () => "A").join("\n"),
      { spacingAfter: pt(16) },
    )
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    const allFrags = pages.flatMap((pg) => pg.fragments).filter((f) => f.nodeId === "p1")
    // First fragment height = lines × LH (no spacingAfter)
    const firstLineCount = allFrags[0].lines!.length
    expect(allFrags[0].height).toBe(firstLineCount * LH)
    // Last fragment height = lines × LH + 16 (spacingAfter)
    const lastFrag = allFrags[allFrags.length - 1]
    const lastLineCount = lastFrag.lines!.length
    expect(lastFrag.height).toBe(lastLineCount * LH + 16)
  })

  it("paragraph spanning 3 pages preserves all lines", () => {
    const lineCount = LINES_PER_PAGE * 2 + 10  // spans 3 pages
    const p = makePara("p1", Array.from({ length: lineCount }, () => "A").join("\n"))
    const pages = getPages(makeDoc(["p1"], { p1: p }))
    expect(pages.length).toBe(3)
    const total = pages.flatMap((pg) => pg.fragments)
      .filter((f) => f.nodeId === "p1")
      .reduce((sum, f) => sum + (f.lines?.length ?? 0), 0)
    expect(total).toBe(lineCount)
  })

  it("split fragments pass assertPaginatedDocument", () => {
    const p = makePara("p1", Array.from({ length: LINES_PER_PAGE + 10 }, () => "A").join("\n"))
    const result = paginateDocument(makeDoc(["p1"], { p1: p }), defaultTextMeasurer, defaultWordBreaker)
    expect(() => assertPaginatedDocument(result)).not.toThrow()
  })

  it("paragraph after a split paragraph is placed correctly", () => {
    // p1 splits, p2 should land right after p1's last fragment
    const p1 = makePara("p1", Array.from({ length: LINES_PER_PAGE + 5 }, () => "A").join("\n"))
    const p2 = makePara("p2", "After")
    const pages = getPages(makeDoc(["p1", "p2"], { p1, p2 }))
    const p1LastFrag = [...pages.flatMap((pg) => pg.fragments).filter((f) => f.nodeId === "p1")].pop()!
    const p2Frag = pages.flatMap((pg) => pg.fragments).find((f) => f.nodeId === "p2")!
    expect(p2Frag.y).toBeCloseTo(p1LastFrag.y + p1LastFrag.height, 0)
  })
})

// ─── Product fixture scenarios ───────────────────────────────────────────────

describe("product fixture — report-long-thai-paragraph", () => {
  it("splits a long Thai paragraph across pages without losing text", () => {
    // Deterministic Thai fixture: an unbroken Thai run exercises grapheme
    // fallback and page splitting without depending on ICU word dictionary data.
    const text = "ก".repeat(5000)
    const p = makePara("report-long-thai-paragraph", text)
    const doc = makeDoc(["report-long-thai-paragraph"], { "report-long-thai-paragraph": p })
    const result = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    const pages = result.sections[0].pages
    const fragments = pages.flatMap((pg) => pg.fragments)
      .filter((f) => f.nodeId === "report-long-thai-paragraph")

    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(fragments.length).toBeGreaterThanOrEqual(2)
    expect(new Set(fragments.map((f) => f.pageIndex)).size).toBeGreaterThanOrEqual(2)
    expect(fragments.flatMap((f) => f.lines ?? []).map((line) => line.text).join("")).toBe(text)
    expect(() => assertPaginatedDocument(result)).not.toThrow()
  })
})

// ─── Table Fragment Relationships ────────────────────────────────────────────

function makeTable(id: string, rowCount: number, colCount: number, cellText = ""): TableNode {
  const internalNodes: TableNode["nodes"] = {}
  const rowIds: string[] = []
  const colWidthPt = 100

  for (let r = 0; r < rowCount; r++) {
    const cellIds: string[] = []
    for (let c = 0; c < colCount; c++) {
      const paraId = `${id}-p${r}-${c}`
      const cellId = `${id}-cell${r}-${c}`
      internalNodes[paraId] = makePara(paraId, cellText)
      internalNodes[cellId] = { id: cellId, type: "table-cell", props: {}, childIds: [paraId] }
      cellIds.push(cellId)
    }
    const rowId = `${id}-row${r}`
    internalNodes[rowId] = { id: rowId, type: "table-row", props: {}, cellIds }
    rowIds.push(rowId)
  }

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
    columns: Array.from({ length: colCount }, () => ({ width: pt(colWidthPt) })),
    rowIds,
    nodes: internalNodes,
  }
}

describe("paginator — table fragment relationships", () => {
  it("table fragment has bodyId as parentNodeId", () => {
    const table = makeTable("tbl", 2, 2)
    const frags = getFragments(makeDoc(["tbl"], { tbl: table }))
    const tFrag = frags.find((f) => f.nodeId === "tbl" && f.nodeType === "table")!
    expect(tFrag).toBeDefined()
    expect(tFrag.parentNodeId).toBe("body")
  })

  it("table row fragments have tableId as parentNodeId", () => {
    const table = makeTable("tbl", 2, 2)
    const frags = getFragments(makeDoc(["tbl"], { tbl: table }))
    const rowFrags = frags.filter((f) => f.nodeType === "row" && f.nodeId.startsWith("tbl-row"))
    expect(rowFrags.length).toBe(2)
    rowFrags.forEach((f) => expect(f.parentNodeId).toBe("tbl"))
  })

  it("table cell fragments (nodeType=table-cell) have rowId as parentNodeId", () => {
    const table = makeTable("tbl", 2, 2)
    const frags = getFragments(makeDoc(["tbl"], { tbl: table }))
    const cellFrags = frags.filter((f) => f.nodeType === "table-cell" && f.nodeId.startsWith("tbl-cell"))
    expect(cellFrags.length).toBe(4)  // 2 rows × 2 cols
    cellFrags.forEach((f) => {
      expect(f.parentNodeId).toMatch(/^tbl-row/)
    })
  })

  it("paragraph inside table cell has cellId as parentNodeId", () => {
    const table = makeTable("tbl", 1, 2, "text")
    const frags = getFragments(makeDoc(["tbl"], { tbl: table }))
    const paraFrags = frags.filter((f) => f.nodeType === "paragraph" && f.nodeId.startsWith("tbl-p"))
    expect(paraFrags.length).toBe(2)
    paraFrags.forEach((f) => {
      expect(f.parentNodeId).toMatch(/^tbl-cell/)
    })
  })

  it("all fragments on a page are ordered top-to-bottom by Y", () => {
    const p1 = makePara("p1", "First")
    const p2 = makePara("p2", "Second")
    const table = makeTable("tbl", 2, 2)
    const pages = getPages(makeDoc(["p1", "tbl", "p2"], { p1, p2, tbl: table }))
    for (const page of pages) {
      const ys = page.fragments.map((f) => f.y)
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1])
      }
    }
  })
})
