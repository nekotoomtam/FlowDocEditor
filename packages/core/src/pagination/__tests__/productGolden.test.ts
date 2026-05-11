import { describe, expect, it } from "vitest"
import { assertDocument } from "../../document"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import type { DocumentNode, DocumentSection, LayoutNode, ParagraphNode, TableCellNode, TableNode, TableRowNode } from "../../schema"
import { pt } from "../../schema"
import { assertPaginatedDocument } from "../assertPaginated"
import { paginateDocument } from "../index"

const PAGE = {
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
      fontSize: pt(10),
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

function makePageNumberPara(id: string): ParagraphNode {
  return {
    ...makePara(id, ""),
    children: [
      { id: `${id}-label`, type: "text", text: "หน้า " },
      { id: `${id}-page-number`, type: "pageNumber" },
    ],
  }
}

function makeFooter(rootId: string): { rootId: string; nodes: Record<string, LayoutNode> } {
  const paragraphId = `${rootId}-text`
  return {
    rootId,
    nodes: {
      [rootId]: { id: rootId, type: "stack", props: {}, childIds: [paragraphId] },
      [paragraphId]: makePageNumberPara(paragraphId),
    },
  }
}

function makeSection(
  id: string,
  childIds: string[],
  nodes: Record<string, LayoutNode>,
  opts: { pageNumberStart?: number; footer?: ReturnType<typeof makeFooter> } = {},
): DocumentSection {
  return {
    id,
    type: "section",
    page: opts.pageNumberStart !== undefined ? { ...PAGE, pageNumberStart: opts.pageNumberStart } : PAGE,
    bodyRootId: `body-${id}`,
    footerRootId: opts.footer?.rootId,
    nodes: {
      ...(opts.footer?.nodes ?? {}),
      [`body-${id}`]: { id: `body-${id}`, type: "body", props: {}, childIds },
      ...nodes,
    },
  }
}

function makeTocSection(title: string): DocumentSection {
  return makeSection("toc", ["toc-node"], {
    "toc-node": { id: "toc-node", type: "toc", props: { title } },
  })
}

function makeTable(
  id: string,
  colWidths: number[],
  rowDefs: string[][],
): TableNode {
  const nodes: TableNode["nodes"] = {}
  const rowIds: string[] = []

  rowDefs.forEach((cells, rowIndex) => {
    const cellIds: string[] = []
    cells.forEach((text, colIndex) => {
      const paragraphId = `${id}-p${rowIndex}-${colIndex}`
      const cellId = `${id}-c${rowIndex}-${colIndex}`
      nodes[paragraphId] = makePara(paragraphId, text)
      nodes[cellId] = { id: cellId, type: "table-cell", props: {}, childIds: [paragraphId] } as TableCellNode
      cellIds.push(cellId)
    })

    const rowId = `${id}-row${rowIndex}`
    nodes[rowId] = { id: rowId, type: "table-row", props: {}, cellIds } as TableRowNode
    rowIds.push(rowId)
  })

  return {
    id,
    type: "table",
    props: { headerRowCount: 1 },
    columns: colWidths.map((width) => ({ width: pt(width) })),
    rowIds,
    nodes,
  }
}

function paginate(doc: DocumentNode) {
  assertDocument(doc)
  const result = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
  assertPaginatedDocument(result)
  return result
}

describe("product golden fixtures", () => {
  it("product fixture — customs-page-count-golden", () => {
    const footer = makeFooter("customs-footer")
    const table = makeTable("customs-golden-table", [80, 291, 80], [
      ["No.", "Description", "Amount"],
      ...Array.from({ length: 130 }, (_, index) => [
        String(index + 1),
        `รายการสินค้า ${index + 1}`,
        `${(index + 1) * 100}`,
      ]),
    ])
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "customs-page-count-golden",
        sections: [
          makeSection("customs", ["customs-golden-table"], {
            "customs-golden-table": table as unknown as LayoutNode,
          }, { footer }),
        ],
      },
    }

    const result = paginate(doc)
    const pages = result.sections[0].pages
    const headerRows = pages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === "customs-golden-table-row0"),
    )
    const bodyRows = pages.flatMap((page) =>
      page.fragments.filter((fragment) =>
        fragment.parentNodeId === "customs-golden-table" &&
        fragment.nodeType === "row" &&
        fragment.nodeId !== "customs-golden-table-row0",
      ),
    )
    const firstPageHeaderCells = pages[0].fragments
      .filter((fragment) => fragment.parentNodeId === "customs-golden-table-row0" && fragment.nodeType === "table-cell")
      .sort((a, b) => a.x - b.x)

    expect(pages).toHaveLength(3)
    expect(headerRows).toHaveLength(3)
    expect(bodyRows).toHaveLength(130)
    expect(pages.map((page) =>
      page.footerFragments.find((fragment) => fragment.nodeId === "customs-footer-text")?.lines?.[0]?.text,
    )).toEqual(["หน้า 1", "หน้า 2", "หน้า 3"])
    expect(firstPageHeaderCells.map((cell) => cell.width)).toEqual([80, 291, 80])
    expect(firstPageHeaderCells[0].x).toBe(pages[0].contentBox.x)
    expect(firstPageHeaderCells[2].x + firstPageHeaderCells[2].width)
      .toBe(pages[0].contentBox.x + pages[0].contentBox.width)
  })

  it("product fixture — report-page-count-golden", () => {
    const bodyFooter = makeFooter("body-footer")
    const coverTitle = makePara("cover-title", "รายงานราชการ", { headingLevel: 1 })
    const bodyHeading = makePara("body-heading-1", "บทที่ 1 บทนำ", {
      headingLevel: 1,
      keepWithNext: true,
      spacingAfter: pt(4),
    })
    const longBody = makePara(
      "body-long-thai",
      Array.from({ length: 125 }, (_, index) => `บรรทัดรายงาน ${index + 1}`).join("\n"),
    )
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "report-page-count-golden",
        sections: [
          makeSection("cover", ["cover-title"], { "cover-title": coverTitle }),
          makeTocSection("สารบัญ"),
          makeSection("body", ["body-heading-1", "body-long-thai"], {
            "body-heading-1": bodyHeading,
            "body-long-thai": longBody,
          }, { pageNumberStart: 1, footer: bodyFooter }),
        ],
      },
    }

    const result = paginate(doc)
    const bodyPages = result.sections[2].pages
    const bodyFragments = bodyPages.flatMap((page) =>
      page.fragments.filter((fragment) => fragment.nodeId === "body-long-thai"),
    )

    expect(result.sections.map((section) => section.pages.length)).toEqual([1, 1, 3])
    expect(result.tocEntries.map((entry) => [entry.nodeId, entry.pageNumber])).toEqual([
      ["cover-title", 1],
      ["body-heading-1", 1],
    ])
    expect(bodyPages.map((page) =>
      page.footerFragments.find((fragment) => fragment.nodeId === "body-footer-text")?.lines?.[0]?.text,
    )).toEqual(["หน้า 1", "หน้า 2", "หน้า 3"])
    expect(bodyFragments.map((fragment) => [fragment.lineStart, fragment.lineEnd])).toEqual([
      [0, 56],
      [56, 114],
      [114, 125],
    ])
    expect(bodyFragments.map((fragment) => [fragment.continuesFrom, fragment.isContinued])).toEqual([
      [false, true],
      [true, true],
      [true, false],
    ])
    expect(bodyFragments.flatMap((fragment) => fragment.lines ?? []).map((line) => line.text))
      .toEqual(Array.from({ length: 125 }, (_, index) => `บรรทัดรายงาน ${index + 1}`))
  })
})
