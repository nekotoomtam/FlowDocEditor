import { describe, expect, it } from "vitest"
import { assertDocument } from "../../document"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { assertPaginatedDocument, paginateDocument } from "../index"
import { collectPaginatedLayoutWarnings } from "../warnings"
import { pt } from "../../schema"
import type { PageFragment } from "../types"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, FlowTableRowNode, LayoutNode, ParagraphNode, SpacerNode } from "../../schema"

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePara(id: string, text = "Flow table cell"): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeSpacer(id: string, height: number): SpacerNode {
  return { id, type: "spacer", props: { height } }
}

function makeCell(id: string, childIds: string[], props: FlowTableCellNode["props"] = {}): FlowTableCellNode {
  return { id, type: "flow-table-cell", props, childIds }
}

function makeRow(id: string, cellIds: string[], props: FlowTableRowNode["props"] = {}): FlowTableRowNode {
  return { id, type: "flow-table-row", props, cellIds }
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
          body: { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

function makeLines(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join("\n")
}

function pageFragments(result: ReturnType<typeof paginate>): PageFragment[] {
  return result.sections[0].pages.flatMap((page) => page.fragments)
}

function fragmentsFor(result: ReturnType<typeof paginate>, nodeId: string, nodeType?: PageFragment["nodeType"]): PageFragment[] {
  return pageFragments(result).filter((fragment) =>
    fragment.nodeId === nodeId && (nodeType === undefined || fragment.nodeType === nodeType),
  )
}

function expectContiguousLineFragments(fragments: PageFragment[], expectedLineCount: number): void {
  expect(fragments.length).toBeGreaterThan(1)
  expect(fragments[0].lineStart).toBe(0)
  expect(fragments.at(-1)?.lineEnd).toBe(expectedLineCount)

  let placedLineCount = 0
  for (let i = 0; i < fragments.length; i++) {
    const fragment = fragments[i]
    expect(fragment.lineStart).toBeDefined()
    expect(fragment.lineEnd).toBeDefined()
    placedLineCount += (fragment.lineEnd ?? 0) - (fragment.lineStart ?? 0)
    if (i > 0) {
      expect(fragment.lineStart).toBe(fragments[i - 1].lineEnd)
      expect(fragment.continuesFrom).toBe(true)
    }
    if (i < fragments.length - 1) {
      expect(fragment.isContinued).toBe(true)
    }
  }
  expect(placedLineCount).toBe(expectedLineCount)
}

describe("flow-table static pagination", () => {
  it("emits one-page flow-table, row, cell, and paragraph fragments", () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const c1 = makeCell("c1", [p1.id], {
      box: {
        fill: "D9EAF7",
        padding: { top: pt(6), right: pt(6), bottom: pt(6), left: pt(6) },
        border: { top: { style: "solid", width: pt(1), color: "1F2937" } },
      },
    })
    const c2 = makeCell("c2", [p2.id])
    const r1 = makeRow("r1", [c1.id, c2.id])
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(120) }],
      rowIds: [r1.id],
      nodes: { r1, c1, c2, p1, p2 },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const fragments = result.sections[0].pages[0].fragments
    const tableFragment = fragments.find((fragment) => fragment.nodeId === "ft1" && fragment.nodeType === "flow-table")
    const rowFragment = fragments.find((fragment) => fragment.nodeId === "r1" && fragment.nodeType === "flow-table-row")
    const leftCell = fragments.find((fragment) => fragment.nodeId === "c1" && fragment.nodeType === "flow-table-cell")
    const rightCell = fragments.find((fragment) => fragment.nodeId === "c2" && fragment.nodeType === "flow-table-cell")
    const leftParagraph = fragments.find((fragment) => fragment.nodeId === "p1" && fragment.nodeType === "paragraph")

    expect(tableFragment).toBeTruthy()
    expect(rowFragment).toBeTruthy()
    expect(tableFragment?.flowTableGridProps?.columnWidths).toEqual([100, 120])
    expect(rowFragment?.flowTableGridProps?.columnWidths).toEqual([100, 120])
    expect(leftCell?.width).toBe(100)
    expect(rightCell?.x).toBe(72 + 100)
    expect(leftCell?.flowTableCellGridProps).toMatchObject({ columnIndex: 0, colspan: 1, rowspan: 1 })
    expect(rightCell?.flowTableCellGridProps).toMatchObject({ columnIndex: 1, colspan: 1, rowspan: 1 })
    expect(leftCell?.boxRenderProps?.fill).toBe("D9EAF7")
    expect(leftParagraph?.parentNodeId).toBe("c1")
    expect(leftParagraph?.x).toBe(72 + 6)
    expect(leftParagraph?.y).toBe(72 + 6)
    expect(leftParagraph?.lines?.[0]?.text).toBe("Left")
  })

  it("uses colspan and rowspan occupancy for static geometry", () => {
    const p1 = makePara("p1", "Wide")
    const p2 = makePara("p2", "Top right")
    const p3 = makePara("p3", "Bottom right")
    const c1 = makeCell("c1", [p1.id], { colspan: 2, rowspan: 2 })
    const c2 = makeCell("c2", [p2.id])
    const c3 = makeCell("c3", [p3.id])
    const r1 = makeRow("r1", [c1.id, c2.id])
    const r2 = makeRow("r2", [c3.id])
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(60) }, { width: pt(70) }, { width: pt(80) }],
      rowIds: [r1.id, r2.id],
      nodes: { r1, r2, c1, c2, c3, p1, p2, p3 },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const fragments = result.sections[0].pages[0].fragments
    const spanningCell = fragments.find((fragment) => fragment.nodeId === "c1" && fragment.nodeType === "flow-table-cell")
    const bottomRightCell = fragments.find((fragment) => fragment.nodeId === "c3" && fragment.nodeType === "flow-table-cell")
    const rows = fragments.filter((fragment) => fragment.nodeType === "flow-table-row")

    expect(spanningCell?.width).toBe(130)
    expect(spanningCell?.height).toBeCloseTo(rows.reduce((sum, row) => sum + row.height, 0), 5)
    expect(spanningCell?.flowTableCellGridProps).toMatchObject({ columnIndex: 0, colspan: 2, rowspan: 2 })
    expect(bottomRightCell?.x).toBe(72 + 130)
    expect(bottomRightCell?.width).toBe(80)
    expect(bottomRightCell?.flowTableCellGridProps).toMatchObject({ columnIndex: 2, colspan: 1, rowspan: 1 })
  })

  it("moves an unsplittable flow-table row to the next page before overflowing the current page", () => {
    const before = makeSpacer("before", 670)
    const c1 = makeCell("c1", [])
    const r1 = makeRow("r1", [c1.id], { height: pt(40), allowBreak: false })
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(120) }],
      rowIds: [r1.id],
      nodes: { r1, c1 },
    }
    const doc = makeDoc([before.id, table.id], {
      [before.id]: before,
      [table.id]: table as unknown as LayoutNode,
    })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const tableFragment = result.sections[0].pages
      .flatMap((page) => page.fragments)
      .find((fragment) => fragment.nodeId === "ft1" && fragment.nodeType === "flow-table")

    expect(result.sections[0].pages).toHaveLength(2)
    expect(tableFragment?.pageIndex).toBe(1)
    expect(tableFragment?.y).toBe(72)
  })

  it("splits a breakable non-rowspan flow-table row across pages", () => {
    const lineCount = 130
    const p1 = makePara("p1", makeLines("Long", lineCount))
    const c1 = makeCell("c1", [p1.id])
    const r1 = makeRow("r1", [c1.id])
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(220) }],
      rowIds: [r1.id],
      nodes: { r1, c1, p1 },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const rowFragments = fragmentsFor(result, "r1", "flow-table-row")
    const cellFragments = fragmentsFor(result, "c1", "flow-table-cell")
    const paragraphFragments = fragmentsFor(result, "p1", "paragraph")

    expect(result.sections[0].pages.length).toBeGreaterThan(1)
    expect(rowFragments.length).toBeGreaterThan(1)
    expect(cellFragments.length).toBe(rowFragments.length)
    expect(rowFragments[0].continuesFrom).toBe(false)
    expect(rowFragments[0].isContinued).toBe(true)
    expect(rowFragments.at(-1)?.continuesFrom).toBe(true)
    expect(rowFragments.at(-1)?.isContinued).toBe(false)
    expect(rowFragments.every((fragment) =>
      fragment.flowTableGridProps?.columnWidths.length === 1 &&
      fragment.flowTableGridProps.columnWidths[0] === 220,
    )).toBe(true)
    expect(cellFragments[0].continuesFrom).toBe(false)
    expect(cellFragments[0].isContinued).toBe(true)
    expect(cellFragments.at(-1)?.continuesFrom).toBe(true)
    expect(cellFragments.at(-1)?.isContinued).toBe(false)
    expect(cellFragments.every((fragment) =>
      fragment.flowTableCellGridProps?.columnIndex === 0 &&
      fragment.flowTableCellGridProps.colspan === 1 &&
      fragment.flowTableCellGridProps.rowspan === 1,
    )).toBe(true)
    expectContiguousLineFragments(paragraphFragments, lineCount)
  })

  it("splits a breakable colspan-only flow-table cell across pages", () => {
    const lineCount = 130
    const p1 = makePara("p1", makeLines("Wide", lineCount))
    const p2 = makePara("p2", "Short")
    const c1 = makeCell("c1", [p1.id], { colspan: 2 })
    const c2 = makeCell("c2", [p2.id])
    const r1 = makeRow("r1", [c1.id, c2.id])
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(90) }, { width: pt(110) }, { width: pt(80) }],
      rowIds: [r1.id],
      nodes: { r1, c1, c2, p1, p2 },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const rowFragments = fragmentsFor(result, "r1", "flow-table-row")
    const wideCellFragments = fragmentsFor(result, "c1", "flow-table-cell")
    const wideParagraphFragments = fragmentsFor(result, "p1", "paragraph")
    const shortParagraphFragments = fragmentsFor(result, "p2", "paragraph")

    expect(rowFragments.length).toBeGreaterThan(1)
    expect(wideCellFragments.length).toBe(rowFragments.length)
    expect(wideCellFragments.every((fragment) =>
      fragment.width === 200 &&
      fragment.flowTableCellGridProps?.columnIndex === 0 &&
      fragment.flowTableCellGridProps.colspan === 2 &&
      fragment.flowTableCellGridProps.rowspan === 1,
    )).toBe(true)
    expect(shortParagraphFragments).toHaveLength(1)
    expectContiguousLineFragments(wideParagraphFragments, lineCount)
  })

  it("repeats flow-table headers on body row continuation pages", () => {
    const bodyLineCount = 130
    const header = makePara("header", "Header")
    const body = makePara("body-p", makeLines("Body", bodyLineCount))
    const headerCell = makeCell("header-cell", [header.id])
    const bodyCell = makeCell("body-cell", [body.id])
    const headerRow = makeRow("header-row", [headerCell.id], { height: pt(24) })
    const bodyRow = makeRow("body-row", [bodyCell.id])
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: { headerRowCount: 1 },
      columns: [{ width: pt(220) }],
      rowIds: [headerRow.id, bodyRow.id],
      nodes: {
        [headerRow.id]: headerRow,
        [bodyRow.id]: bodyRow,
        [headerCell.id]: headerCell,
        [bodyCell.id]: bodyCell,
        [header.id]: header,
        [body.id]: body,
      },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const pages = result.sections[0].pages
    const headerRows = fragmentsFor(result, headerRow.id, "flow-table-row")
    const headerParagraphs = fragmentsFor(result, header.id, "paragraph")
    const bodyRows = fragmentsFor(result, bodyRow.id, "flow-table-row")
    const bodyParagraphs = fragmentsFor(result, body.id, "paragraph")

    expect(pages.length).toBeGreaterThan(1)
    expect(headerRows).toHaveLength(pages.length)
    expect(headerParagraphs).toHaveLength(pages.length)
    expect(headerRows.every((fragment) => fragment.y === 72)).toBe(true)
    expect(bodyRows.length).toBeGreaterThan(1)
    expect(bodyRows.every((fragment) => fragment.y === 72 + 24)).toBe(true)
    expectContiguousLineFragments(bodyParagraphs, bodyLineCount)
  })

  it("keeps flow-table body split accounting when repeated headers consume most page height", () => {
    const bodyLineCount = 30
    const header = makePara("header", "Tall header")
    const body = makePara("body-p", makeLines("Body", bodyLineCount))
    const headerCell = makeCell("header-cell", [header.id])
    const bodyCell = makeCell("body-cell", [body.id])
    const headerRow = makeRow("header-row", [headerCell.id], { height: pt(650) })
    const bodyRow = makeRow("body-row", [bodyCell.id])
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: { headerRowCount: 1 },
      columns: [{ width: pt(220) }],
      rowIds: [headerRow.id, bodyRow.id],
      nodes: {
        [headerRow.id]: headerRow,
        [bodyRow.id]: bodyRow,
        [headerCell.id]: headerCell,
        [bodyCell.id]: bodyCell,
        [header.id]: header,
        [body.id]: body,
      },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const headerRows = fragmentsFor(result, headerRow.id, "flow-table-row")
    const bodyRows = fragmentsFor(result, bodyRow.id, "flow-table-row")
    const bodyParagraphs = fragmentsFor(result, body.id, "paragraph")
    const warningSummary = collectPaginatedLayoutWarnings(result)

    expect(headerRows.length).toBeGreaterThan(1)
    expect(bodyRows.length).toBeGreaterThan(1)
    expect(bodyRows.every((fragment) => fragment.y === 72 + 650)).toBe(true)
    expectContiguousLineFragments(bodyParagraphs, bodyLineCount)
    expect(warningSummary.find((warning) => warning.code === "forced-flow-table-split-overflow")).toBeUndefined()
  })

  it("does not duplicate shorter sibling cell content on flow-table row continuation", () => {
    const longLineCount = 120
    const short = makePara("short", "Short cell")
    const long = makePara("long", makeLines("Long", longLineCount))
    const c1 = makeCell("c1", [short.id])
    const c2 = makeCell("c2", [long.id])
    const r1 = makeRow("r1", [c1.id, c2.id])
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(120) }, { width: pt(120) }],
      rowIds: [r1.id],
      nodes: { r1, c1, c2, short, long },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const shortParagraphFragments = fragmentsFor(result, "short", "paragraph")
    const longParagraphFragments = fragmentsFor(result, "long", "paragraph")
    const shortCellFragments = fragmentsFor(result, "c1", "flow-table-cell")
    const longCellFragments = fragmentsFor(result, "c2", "flow-table-cell")

    expect(shortCellFragments.length).toBeGreaterThan(1)
    expect(longCellFragments.length).toBe(shortCellFragments.length)
    expect(shortParagraphFragments).toHaveLength(1)
    expect(shortParagraphFragments[0].lineStart).toBe(0)
    expect(shortParagraphFragments[0].lineEnd).toBe(1)
    expect(shortParagraphFragments[0].isContinued).toBe(false)
    expectContiguousLineFragments(longParagraphFragments, longLineCount)
  })

  it("splits rowspan-linked flow-table rows at row boundaries with continuation cell chrome", () => {
    const before = makeSpacer("before", 650)
    const p1 = makePara("p1", "Spanning")
    const p2 = makePara("p2", "Top")
    const p3 = makePara("p3", "Bottom")
    const c1 = makeCell("c1", [p1.id], { rowspan: 2 })
    const c2 = makeCell("c2", [p2.id])
    const c3 = makeCell("c3", [p3.id])
    const r1 = makeRow("r1", [c1.id, c2.id], { height: pt(40) })
    const r2 = makeRow("r2", [c3.id], { height: pt(40) })
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id, r2.id],
      nodes: { r1, r2, c1, c2, c3, p1, p2, p3 },
    }
    const doc = makeDoc([before.id, table.id], {
      [before.id]: before,
      [table.id]: table as unknown as LayoutNode,
    })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const tableFragment = fragmentsFor(result, "ft1", "flow-table")[0]
    const rowFragments = pageFragments(result).filter((fragment) => fragment.nodeType === "flow-table-row")
    const spanningCells = fragmentsFor(result, "c1", "flow-table-cell")
    const topCell = fragmentsFor(result, "c2", "flow-table-cell")[0]
    const bottomCell = fragmentsFor(result, "c3", "flow-table-cell")[0]

    expect(result.sections[0].pages).toHaveLength(2)
    expect(tableFragment.pageIndex).toBe(0)
    expect(rowFragments.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(rowFragments.map((fragment) => fragment.y)).toEqual([722, 72])
    expect(spanningCells).toHaveLength(2)
    expect(spanningCells.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(spanningCells.map((fragment) => fragment.parentNodeId)).toEqual(["r1", "r2"])
    expect(spanningCells.map((fragment) => fragment.height)).toEqual([40, 40])
    expect(spanningCells[0].continuesFrom).toBe(false)
    expect(spanningCells[0].isContinued).toBe(true)
    expect(spanningCells[1].continuesFrom).toBe(true)
    expect(spanningCells[1].isContinued).toBe(false)
    expect(spanningCells[0].flowTableCellGridProps).toEqual({ columnIndex: 0, colspan: 1, rowspan: 2 })
    expect(spanningCells[1].flowTableCellGridProps).toEqual({ columnIndex: 0, colspan: 1, rowspan: 2 })
    expect(topCell.pageIndex).toBe(0)
    expect(bottomCell.pageIndex).toBe(1)
  })

  it("splits spanning flow-table cell paragraph content across rowspan continuation slices", () => {
    const before = makeSpacer("before", 650)
    const p1 = makePara("p1", makeLines("Span", 7))
    const p2 = makePara("p2", "Top")
    const p3 = makePara("p3", "Middle")
    const p4 = makePara("p4", "Bottom")
    const c1 = makeCell("c1", [p1.id], { rowspan: 3 })
    const c2 = makeCell("c2", [p2.id])
    const c3 = makeCell("c3", [p3.id])
    const c4 = makeCell("c4", [p4.id])
    const r1 = makeRow("r1", [c1.id, c2.id], { height: pt(40) })
    const r2 = makeRow("r2", [c3.id], { height: pt(40) })
    const r3 = makeRow("r3", [c4.id], { height: pt(40) })
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id, r2.id, r3.id],
      nodes: { r1, r2, r3, c1, c2, c3, c4, p1, p2, p3, p4 },
    }
    const doc = makeDoc([before.id, table.id], {
      [before.id]: before,
      [table.id]: table as unknown as LayoutNode,
    })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const spanningCells = fragmentsFor(result, "c1", "flow-table-cell")
    const spanningParagraphFragments = fragmentsFor(result, "p1", "paragraph")

    expect(spanningCells).toHaveLength(2)
    expect(spanningCells.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(spanningCells.map((fragment) => fragment.parentNodeId)).toEqual(["r1", "r2"])
    expect(spanningCells.map((fragment) => fragment.height)).toEqual([40, 80])
    expect(spanningCells[0].isContinued).toBe(true)
    expect(spanningCells[1].continuesFrom).toBe(true)
    expect(spanningParagraphFragments.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(spanningParagraphFragments.map((fragment) => fragment.parentNodeId)).toEqual(["c1", "c1"])
    expectContiguousLineFragments(spanningParagraphFragments, 7)
  })

  it("keeps mixed rowspan and colspan geometry while splitting spanning content", () => {
    const before = makeSpacer("before", 650)
    const p1 = makePara("p1", makeLines("Wide span", 7))
    const p2 = makePara("p2", "Top third")
    const p3 = makePara("p3", "Top fourth")
    const p4 = makePara("p4", "Middle third")
    const p5 = makePara("p5", "Middle fourth")
    const p6 = makePara("p6", "Bottom third")
    const p7 = makePara("p7", "Bottom fourth")
    const c1 = makeCell("c1", [p1.id], { colspan: 2, rowspan: 3 })
    const c2 = makeCell("c2", [p2.id])
    const c3 = makeCell("c3", [p3.id])
    const c4 = makeCell("c4", [p4.id])
    const c5 = makeCell("c5", [p5.id])
    const c6 = makeCell("c6", [p6.id])
    const c7 = makeCell("c7", [p7.id])
    const r1 = makeRow("r1", [c1.id, c2.id, c3.id], { height: pt(40) })
    const r2 = makeRow("r2", [c4.id, c5.id], { height: pt(40) })
    const r3 = makeRow("r3", [c6.id, c7.id], { height: pt(40) })
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(50) }, { width: pt(70) }, { width: pt(60) }, { width: pt(80) }],
      rowIds: [r1.id, r2.id, r3.id],
      nodes: { r1, r2, r3, c1, c2, c3, c4, c5, c6, c7, p1, p2, p3, p4, p5, p6, p7 },
    }
    const doc = makeDoc([before.id, table.id], {
      [before.id]: before,
      [table.id]: table as unknown as LayoutNode,
    })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const rowFragments = pageFragments(result).filter((fragment) => fragment.nodeType === "flow-table-row")
    const spanningCells = fragmentsFor(result, "c1", "flow-table-cell")
    const thirdColumnCells = ["c2", "c4", "c6"].map((id) => fragmentsFor(result, id, "flow-table-cell")[0])
    const fourthColumnCells = ["c3", "c5", "c7"].map((id) => fragmentsFor(result, id, "flow-table-cell")[0])
    const spanningParagraphFragments = fragmentsFor(result, "p1", "paragraph")

    expect(rowFragments.map((fragment) => fragment.pageIndex)).toEqual([0, 1, 1])
    expect(spanningCells).toHaveLength(2)
    expect(spanningCells.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(spanningCells.map((fragment) => fragment.parentNodeId)).toEqual(["r1", "r2"])
    expect(spanningCells.map((fragment) => fragment.width)).toEqual([120, 120])
    expect(spanningCells.map((fragment) => fragment.height)).toEqual([40, 80])
    expect(spanningCells.every((fragment) =>
      fragment.flowTableCellGridProps?.columnIndex === 0 &&
      fragment.flowTableCellGridProps.colspan === 2 &&
      fragment.flowTableCellGridProps.rowspan === 3,
    )).toBe(true)
    expect(thirdColumnCells.map((fragment) => fragment.x)).toEqual([72 + 120, 72 + 120, 72 + 120])
    expect(thirdColumnCells.map((fragment) => fragment.width)).toEqual([60, 60, 60])
    expect(fourthColumnCells.map((fragment) => fragment.x)).toEqual([72 + 180, 72 + 180, 72 + 180])
    expect(fourthColumnCells.map((fragment) => fragment.width)).toEqual([80, 80, 80])
    expect(spanningParagraphFragments.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expectContiguousLineFragments(spanningParagraphFragments, 7)
  })

  it("keeps allowBreak=false rowspan-linked flow-table rows atomic", () => {
    const before = makeSpacer("before", 650)
    const p1 = makePara("p1", "Spanning")
    const p2 = makePara("p2", "Top")
    const p3 = makePara("p3", "Bottom")
    const c1 = makeCell("c1", [p1.id], { rowspan: 2 })
    const c2 = makeCell("c2", [p2.id])
    const c3 = makeCell("c3", [p3.id])
    const r1 = makeRow("r1", [c1.id, c2.id], { height: pt(40), allowBreak: false })
    const r2 = makeRow("r2", [c3.id], { height: pt(40) })
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id, r2.id],
      nodes: { r1, r2, c1, c2, c3, p1, p2, p3 },
    }
    const doc = makeDoc([before.id, table.id], {
      [before.id]: before,
      [table.id]: table as unknown as LayoutNode,
    })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const rowFragments = pageFragments(result).filter((fragment) => fragment.nodeType === "flow-table-row")
    const spanningCells = fragmentsFor(result, "c1", "flow-table-cell")

    expect(rowFragments.map((fragment) => fragment.pageIndex)).toEqual([1, 1])
    expect(rowFragments.map((fragment) => fragment.y)).toEqual([72, 112])
    expect(spanningCells).toHaveLength(1)
    expect(spanningCells[0].pageIndex).toBe(1)
    expect(spanningCells[0].height).toBeCloseTo(80, 5)
  })

  it("repeats flow-table headers before a rowspan row-boundary continuation", () => {
    const before = makeSpacer("before", 620)
    const hp1 = makePara("hp1", "Header left")
    const hp2 = makePara("hp2", "Header right")
    const p1 = makePara("p1", "Spanning")
    const p2 = makePara("p2", "Top")
    const p3 = makePara("p3", "Bottom")
    const hc1 = makeCell("hc1", [hp1.id])
    const hc2 = makeCell("hc2", [hp2.id])
    const c1 = makeCell("c1", [p1.id], { rowspan: 2 })
    const c2 = makeCell("c2", [p2.id])
    const c3 = makeCell("c3", [p3.id])
    const headerRow = makeRow("header", [hc1.id, hc2.id], { height: pt(24) })
    const r1 = makeRow("r1", [c1.id, c2.id], { height: pt(40) })
    const r2 = makeRow("r2", [c3.id], { height: pt(40) })
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: { headerRowCount: 1 },
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [headerRow.id, r1.id, r2.id],
      nodes: { header: headerRow, r1, r2, hc1, hc2, c1, c2, c3, hp1, hp2, p1, p2, p3 },
    }
    const doc = makeDoc([before.id, table.id], {
      [before.id]: before,
      [table.id]: table as unknown as LayoutNode,
    })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const headerRows = fragmentsFor(result, "header", "flow-table-row")
    const bodyRows = pageFragments(result)
      .filter((fragment) => fragment.nodeType === "flow-table-row" && fragment.nodeId !== "header")
    const spanningCells = fragmentsFor(result, "c1", "flow-table-cell")

    expect(headerRows.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(headerRows.map((fragment) => fragment.y)).toEqual([692, 72])
    expect(bodyRows.map((fragment) => fragment.pageIndex)).toEqual([0, 1])
    expect(bodyRows.map((fragment) => fragment.y)).toEqual([716, 96])
    expect(spanningCells).toHaveLength(2)
    expect(spanningCells.map((fragment) => fragment.parentNodeId)).toEqual(["r1", "r2"])
    expect(spanningCells.map((fragment) => fragment.y)).toEqual([716, 96])
    expect(spanningCells[0].isContinued).toBe(true)
    expect(spanningCells[1].continuesFrom).toBe(true)
  })

  it("warns when a flow-table row split must force one unit of overflow progress", () => {
    const p1 = makePara("p1", "Forced")
    const c1 = makeCell("c1", [p1.id], {
      box: {
        padding: { top: pt(800), right: pt(0), bottom: pt(0), left: pt(0) },
      },
    })
    const r1 = makeRow("r1", [c1.id])
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(120) }],
      rowIds: [r1.id],
      nodes: { r1, c1, p1 },
    }
    const doc = makeDoc([table.id], { [table.id]: table as unknown as LayoutNode })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const rowFragment = fragmentsFor(result, "r1", "flow-table-row")[0]
    const cellFragment = fragmentsFor(result, "c1", "flow-table-cell")[0]
    const warningSummary = collectPaginatedLayoutWarnings(result)

    expect(rowFragment.warnings?.[0]?.code).toBe("forced-flow-table-split-overflow")
    expect(cellFragment.warnings?.[0]?.code).toBe("forced-flow-table-split-overflow")
    expect(warningSummary).toContainEqual(expect.objectContaining({
      code: "forced-flow-table-split-overflow",
      count: 2,
    }))
  })

  it("warns when a rowspan row-boundary slice must force one content unit", () => {
    const before = makeSpacer("before", 650)
    const p1 = makePara("p1", "Forced")
    const p2 = makePara("p2", "Top")
    const p3 = makePara("p3", "Bottom")
    const c1 = makeCell("c1", [p1.id], {
      rowspan: 2,
      box: {
        padding: { top: pt(800), right: pt(0), bottom: pt(0), left: pt(0) },
      },
    })
    const c2 = makeCell("c2", [p2.id])
    const c3 = makeCell("c3", [p3.id])
    const r1 = makeRow("r1", [c1.id, c2.id], { height: pt(40) })
    const r2 = makeRow("r2", [c3.id], { height: pt(40) })
    const table: FlowTableNode = {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }, { width: pt(100) }],
      rowIds: [r1.id, r2.id],
      nodes: { r1, r2, c1, c2, c3, p1, p2, p3 },
    }
    const doc = makeDoc([before.id, table.id], {
      [before.id]: before,
      [table.id]: table as unknown as LayoutNode,
    })

    assertDocument(doc)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const rowFragments = fragmentsFor(result, "r1", "flow-table-row")
    const spanningCells = fragmentsFor(result, "c1", "flow-table-cell")
    const forcedParagraphFragments = fragmentsFor(result, "p1", "paragraph")
    const warningSummary = collectPaginatedLayoutWarnings(result)

    expect(rowFragments[0].warnings?.[0]?.code).toBe("forced-flow-table-split-overflow")
    expect(spanningCells[0].warnings?.[0]?.code).toBe("forced-flow-table-split-overflow")
    expect(spanningCells[1].warnings).toBeUndefined()
    expect(forcedParagraphFragments).toHaveLength(1)
    expect(forcedParagraphFragments[0].pageIndex).toBe(0)
    expect(forcedParagraphFragments[0].y).toBeGreaterThan(spanningCells[0].y + spanningCells[0].height)
    expect(warningSummary).toContainEqual(expect.objectContaining({
      code: "forced-flow-table-split-overflow",
      count: 2,
    }))
  })
})
