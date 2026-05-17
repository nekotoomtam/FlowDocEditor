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
    expect(leftCell?.width).toBe(100)
    expect(rightCell?.x).toBe(72 + 100)
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
    expect(bottomRightCell?.x).toBe(72 + 130)
    expect(bottomRightCell?.width).toBe(80)
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
    expect(cellFragments[0].continuesFrom).toBe(false)
    expect(cellFragments[0].isContinued).toBe(true)
    expect(cellFragments.at(-1)?.continuesFrom).toBe(true)
    expect(cellFragments.at(-1)?.isContinued).toBe(false)
    expectContiguousLineFragments(paragraphFragments, lineCount)
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

  it("keeps rowspan-linked flow-table rows atomic while non-rowspan rows can split", () => {
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
    const spanningCell = fragmentsFor(result, "c1", "flow-table-cell")[0]

    expect(result.sections[0].pages).toHaveLength(2)
    expect(tableFragment.pageIndex).toBe(1)
    expect(rowFragments.map((fragment) => fragment.pageIndex)).toEqual([1, 1])
    expect(rowFragments.map((fragment) => fragment.y)).toEqual([72, 112])
    expect(spanningCell.pageIndex).toBe(1)
    expect(spanningCell.height).toBeCloseTo(80, 5)
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
})
