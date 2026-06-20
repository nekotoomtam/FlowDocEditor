import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { AuthoredNode, DocumentNode, InlineNode, TextBlockRole } from "../src/schema/document.js"
import { parseFlowDocPackageV2DocumentVNext } from "../src/persistence/package.js"
import {
  createApproximateVNextTextMeasurer,
  createVNextTextMeasurementCache,
  paginateVNextDocument,
  type VNextTextMeasurer,
} from "../src/pagination/measuredPagination.js"

function pt(value: number) {
  return { value, unit: "pt" as const }
}

function textBlock(id: string, children: InlineNode[], role?: TextBlockRole): AuthoredNode
function textBlock(id: string, text: string, role?: TextBlockRole): AuthoredNode
function textBlock(id: string, content: string | InlineNode[], role: TextBlockRole = { role: "paragraph" }): AuthoredNode {
  return {
    id,
    type: "text-block",
    role,
    props: {},
    children: typeof content === "string"
      ? [{ id: `${id}-text`, type: "text", text: content }]
      : content,
  }
}

function pageBreakDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "measured-page-break-doc",
      meta: { title: "Measured Page Break" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          pageNumberStart: 7,
          margin: {
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
          footerReserved: 36,
          headerFooterHorizontalMode: "body",
        },
        zoneIds: ["body-zone", "footer-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["before", "break", "after"] },
          "footer-zone": { id: "footer-zone", type: "zone", role: "footer", childIds: ["footer-page"] },
          before: textBlock("before", "Before the break"),
          break: { id: "break", type: "page-break", props: {} },
          after: textBlock("after", [
            { id: "after-prefix", type: "text", text: "Current page " },
            { id: "after-page", type: "page-number" },
          ]),
          "footer-page": textBlock("footer-page", [
            { id: "footer-label", type: "text", text: "Page " },
            { id: "footer-number", type: "page-number" },
          ], { role: "label" }),
        },
      }],
    },
  }
}

function longTextDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "measured-long-text-doc",
      meta: { title: "Measured Long Text" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: pt(360),
            right: pt(72),
            bottom: pt(360),
            left: pt(72),
          },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["long"] },
          long: textBlock("long", "x".repeat(1000)),
        },
      }],
    },
  }
}

function columnsDoc(): DocumentNode {
  const sharedText = "x".repeat(30)

  return {
    version: 3,
    document: {
      id: "measured-columns-doc",
      meta: { title: "Measured Columns" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["columns"] },
          columns: { id: "columns", type: "columns", props: { gap: 12 }, columnIds: ["left", "right"] },
          left: { id: "left", type: "column", props: { widthShare: 25 }, childIds: ["left-text"] },
          right: { id: "right", type: "column", props: { widthShare: 75 }, childIds: ["right-text"] },
          "left-text": textBlock("left-text", sharedText),
          "right-text": textBlock("right-text", sharedText),
        },
      }],
    },
  }
}

function tablePaginationDoc(): DocumentNode {
  const tableColumns = [{ width: pt(100) }, { width: pt(200) }]
  const row = (id: string, cells: [string, string], height: number): AuthoredNode => ({
    id,
    type: "table-row",
    props: { height: pt(height) },
    cellIds: [`${id}-c1`, `${id}-c2`],
  })
  const cell = (id: string, textId: string): AuthoredNode => ({
    id,
    type: "table-cell",
    props: {},
    childIds: [textId],
  })

  return {
    version: 3,
    document: {
      id: "measured-table-doc",
      meta: { title: "Measured Table" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: pt(350),
            right: pt(72),
            bottom: pt(350),
            left: pt(72),
          },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["table"] },
          table: {
            id: "table",
            type: "table",
            props: { headerRowCount: 1 },
            columns: tableColumns,
            rowIds: ["header-row", "data-row-1", "data-row-2", "data-row-3"],
          },
          "header-row": row("header-row", ["Metric", "Value"], 30),
          "data-row-1": row("data-row-1", ["One", "First value"], 70),
          "data-row-2": row("data-row-2", ["Two", "Second value"], 70),
          "data-row-3": row("data-row-3", ["Three", "Third value"], 70),
          "header-row-c1": cell("header-row-c1", "header-metric"),
          "header-row-c2": cell("header-row-c2", "header-value"),
          "data-row-1-c1": cell("data-row-1-c1", "data-1-name"),
          "data-row-1-c2": cell("data-row-1-c2", "data-1-value"),
          "data-row-2-c1": cell("data-row-2-c1", "data-2-name"),
          "data-row-2-c2": cell("data-row-2-c2", "data-2-value"),
          "data-row-3-c1": cell("data-row-3-c1", "data-3-name"),
          "data-row-3-c2": cell("data-row-3-c2", "data-3-value"),
          "header-metric": textBlock("header-metric", "Metric"),
          "header-value": textBlock("header-value", "Value"),
          "data-1-name": textBlock("data-1-name", "One"),
          "data-1-value": textBlock("data-1-value", "First value"),
          "data-2-name": textBlock("data-2-name", "Two"),
          "data-2-value": textBlock("data-2-value", "Second value"),
          "data-3-name": textBlock("data-3-name", "Three"),
          "data-3-value": textBlock("data-3-value", "Third value"),
        },
      }],
    },
  }
}

function splittableCellTableDoc(allowBreak = true): DocumentNode {
  return {
    version: 3,
    document: {
      id: allowBreak ? "splittable-table-doc" : "unbreakable-table-doc",
      meta: { title: "Splittable Table Cell" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: pt(350),
            right: pt(72),
            bottom: pt(350),
            left: pt(72),
          },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["table"] },
          table: {
            id: "table",
            type: "table",
            props: { headerRowCount: 1, repeatHeaderRows: true },
            columns: [{ width: pt(100) }],
            rowIds: ["header-row", "data-row"],
          },
          "header-row": { id: "header-row", type: "table-row", props: { height: pt(30) }, cellIds: ["header-cell"] },
          "data-row": {
            id: "data-row",
            type: "table-row",
            props: allowBreak ? { allowBreak: true } : { allowBreak: false },
            cellIds: ["data-cell"],
          },
          "header-cell": { id: "header-cell", type: "table-cell", props: {}, childIds: ["header-text"] },
          "data-cell": { id: "data-cell", type: "table-cell", props: {}, childIds: ["long-cell-text"] },
          "header-text": textBlock("header-text", "Description"),
          "long-cell-text": textBlock("long-cell-text", "x".repeat(160)),
        },
      }],
    },
  }
}

function tableCellBlockPolicyDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "table-cell-block-policy-doc",
      meta: { title: "Table Cell Block Policy" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["title", "table"] },
          title: textBlock("title", "Heading", { role: "heading", level: 1 }),
          table: {
            id: "table",
            type: "table",
            props: {},
            columns: [{ width: pt(100) }],
            rowIds: ["row"],
          },
          row: { id: "row", type: "table-row", props: {}, cellIds: ["cell"] },
          cell: {
            id: "cell",
            type: "table-cell",
            props: {},
            childIds: ["cell-text", "cell-spacer", "cell-divider", "cell-toc", "cell-break"],
          },
          "cell-text": textBlock("cell-text", "Cell text"),
          "cell-spacer": { id: "cell-spacer", type: "spacer", props: { height: 18 } },
          "cell-divider": {
            id: "cell-divider",
            type: "divider",
            props: {
              color: "CBD5E1",
              thickness: pt(1),
              marginBefore: pt(4),
              marginAfter: pt(4),
              style: "solid",
            },
          },
          "cell-toc": { id: "cell-toc", type: "toc", props: { title: "Contents" } },
          "cell-break": { id: "cell-break", type: "page-break", props: {} },
        },
      }],
    },
  }
}

function parseFixture(name: string) {
  const fixtureUrl = new URL(`../fixtures/${name}`, import.meta.url)
  const raw = readFileSync(fixtureUrl, "utf8")
  return parseFlowDocPackageV2DocumentVNext(JSON.parse(raw))
}

describe("vNext measured pagination skeleton", () => {
  it("forces a new page for page-break and resolves page-number fragments", () => {
    const pagination = paginateVNextDocument(pageBreakDoc())

    expect(pagination).toMatchObject({
      documentId: "measured-page-break-doc",
      source: "vnext-pagination-plan",
      status: "measured-skeleton",
      measurementStatus: "measured",
      pageCount: 2,
    })

    const afterFragment = pagination.pages[1]?.fragments.find((fragment) => fragment.nodeId === "after")
    const footerTexts = pagination.pages.map((page) => (
      page.fragments.find((fragment) => fragment.nodeId === "footer-page")?.text
    ))

    expect(afterFragment).toMatchObject({
      nodeType: "text-block",
      kind: "text",
      pageIndex: 1,
      pageNumber: 8,
      text: "Current page 8",
    })
    expect(footerTexts).toEqual(["Page 7", "Page 8"])
    expect(pagination.pages[0]?.fragments.some((fragment) => fragment.nodeId === "break" && fragment.kind === "forced-break")).toBe(true)
  })

  it("splits long text-block output into page fragments instead of relayouting in a renderer", () => {
    const pagination = paginateVNextDocument(longTextDoc(), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 5, lineHeightPt: 50 }),
    })
    const fragments = pagination.pages.flatMap((page) => page.fragments).filter((fragment) => fragment.nodeId === "long")

    expect(pagination.pageCount).toBeGreaterThan(1)
    expect(fragments.length).toBeGreaterThan(1)
    expect(fragments[0]).toMatchObject({
      lineStart: 0,
      continuesFromPreviousPage: false,
      continuesOnNextPage: true,
    })
    expect(fragments.at(-1)).toMatchObject({
      continuesFromPreviousPage: true,
      continuesOnNextPage: false,
    })
    expect(fragments.every((fragment) => fragment.splitPolicy === "line")).toBe(true)
  })

  it("reuses the measurement contract cache and annotates text fragments", () => {
    const cache = createVNextTextMeasurementCache()
    const approximate = createApproximateVNextTextMeasurer()
    let measureCalls = 0
    const countingMeasurer: VNextTextMeasurer = {
      measure(input) {
        measureCalls += 1
        return approximate.measure(input)
      },
    }

    const first = paginateVNextDocument(pageBreakDoc(), {
      textMeasurer: countingMeasurer,
      measurementCache: cache,
      measurementProfileId: "browser-layout-v1",
    })
    const callsAfterFirstRun = measureCalls
    const second = paginateVNextDocument(pageBreakDoc(), {
      textMeasurer: countingMeasurer,
      measurementCache: cache,
      measurementProfileId: "browser-layout-v1",
    })

    const firstBefore = first.pages[0]?.fragments.find((fragment) => fragment.nodeId === "before")
    const secondBefore = second.pages[0]?.fragments.find((fragment) => fragment.nodeId === "before")

    expect(callsAfterFirstRun).toBeGreaterThan(0)
    expect(measureCalls).toBe(callsAfterFirstRun)
    expect(firstBefore?.metadata).toMatchObject({
      measurementCacheStatus: "miss",
      measurementProfileId: "browser-layout-v1",
      lineCount: 1,
    })
    expect(secondBefore?.metadata).toMatchObject({
      measurementCacheStatus: "hit",
      measurementProfileId: "browser-layout-v1",
      lineCount: 1,
    })
    expect(secondBefore?.metadata?.measurementCacheKey).toBe(firstBefore?.metadata?.measurementCacheKey)
  })

  it("measures columns as child fragments using column geometry", () => {
    const pagination = paginateVNextDocument(columnsDoc(), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 10, lineHeightPt: 12 }),
      measurementProfileId: "columns-test",
    })
    const fragments = pagination.pages[0]?.fragments ?? []
    const columns = fragments.find((fragment) => fragment.nodeId === "columns")
    const left = fragments.find((fragment) => fragment.nodeId === "left")
    const right = fragments.find((fragment) => fragment.nodeId === "right")
    const leftText = fragments.find((fragment) => fragment.nodeId === "left-text")
    const rightText = fragments.find((fragment) => fragment.nodeId === "right-text")

    expect(columns).toMatchObject({
      kind: "container",
      widthPt: 451.28,
      metadata: {
        columnCount: 2,
        gapPt: 12,
        measuredAs: "columns-fragments",
      },
    })
    expect(left).toMatchObject({
      kind: "container",
      xPt: 72,
      widthPt: 109.82,
      metadata: {
        columnsId: "columns",
        columnId: "left",
        columnIndex: 0,
      },
    })
    expect(right).toMatchObject({
      kind: "container",
      xPt: 193.82,
      widthPt: 329.46,
      metadata: {
        columnsId: "columns",
        columnId: "right",
        columnIndex: 1,
      },
    })
    expect(leftText).toMatchObject({
      kind: "text",
      widthPt: 109.82,
      metadata: {
        columnId: "left",
        measurementProfileId: "columns-test",
        lineCount: 3,
      },
    })
    expect(rightText).toMatchObject({
      kind: "text",
      widthPt: 329.46,
      metadata: {
        columnId: "right",
        measurementProfileId: "columns-test",
        lineCount: 1,
      },
    })
    expect(pagination.warnings.map((warning) => warning.code)).not.toContain("columns-atomic-skeleton")
  })

  it("paginates table rows with repeated header fragments and cell geometry", () => {
    const pagination = paginateVNextDocument(tablePaginationDoc(), {
      measurementProfileId: "table-test",
    })
    const fragments = pagination.pages.flatMap((page) => page.fragments)
    const tableSegments = fragments.filter((fragment) => fragment.nodeId === "table")
    const repeatedHeaders = fragments.filter((fragment) => (
      fragment.nodeId === "header-row" && fragment.metadata?.isRepeatedHeader === true
    ))
    const firstCell = fragments.find((fragment) => fragment.nodeId === "data-row-1-c1")
    const firstCellText = fragments.find((fragment) => fragment.nodeId === "data-1-name")

    expect(pagination.pageCount).toBe(3)
    expect(tableSegments).toHaveLength(3)
    expect(tableSegments.map((fragment) => fragment.metadata?.rowCount)).toEqual([2, 2, 2])
    expect(repeatedHeaders.map((fragment) => fragment.pageIndex)).toEqual([1, 2])
    expect(firstCell).toMatchObject({
      kind: "container",
      xPt: 72,
      widthPt: 150.43,
      heightPt: 70,
      metadata: {
        tableId: "table",
        rowId: "data-row-1",
        cellId: "data-row-1-c1",
        rowIndex: 1,
        cellIndex: 0,
      },
    })
    expect(firstCellText).toMatchObject({
      kind: "text",
      xPt: 76,
      widthPt: 142.43,
      metadata: {
        tableId: "table",
        rowId: "data-row-1",
        cellId: "data-row-1-c1",
        rowIndex: 1,
        measurementProfileId: "table-test",
      },
    })
    expect(pagination.warnings.map((warning) => warning.code)).not.toContain("table-atomic-skeleton")
  })

  it("splits over-tall breakable table cell text by measured line ranges", () => {
    const pagination = paginateVNextDocument(splittableCellTableDoc(true), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 20, lineHeightPt: 30 }),
      measurementProfileId: "table-split-test",
    })
    const fragments = pagination.pages.flatMap((page) => page.fragments)
    const rowSlices = fragments.filter((fragment) => fragment.nodeId === "data-row")
    const textSlices = fragments.filter((fragment) => fragment.nodeId === "long-cell-text")
    const repeatedHeaders = fragments.filter((fragment) => (
      fragment.nodeId === "header-row" && fragment.metadata?.isRepeatedHeader === true
    ))

    expect(pagination.pageCount).toBe(3)
    expect(rowSlices.map((fragment) => fragment.metadata?.rowSplitIndex)).toEqual([0, 1, 2])
    expect(rowSlices.map((fragment) => fragment.metadata?.continuesFromPreviousPage)).toEqual([false, true, true])
    expect(rowSlices.map((fragment) => fragment.metadata?.continuesOnNextPage)).toEqual([true, true, false])
    expect(textSlices.map((fragment) => [fragment.lineStart, fragment.lineEnd])).toEqual([
      [0, 3],
      [3, 6],
      [6, 8],
    ])
    expect(textSlices.map((fragment) => fragment.continuesFromPreviousPage)).toEqual([false, true, true])
    expect(textSlices.map((fragment) => fragment.continuesOnNextPage)).toEqual([true, true, false])
    expect(textSlices.every((fragment) => fragment.metadata?.measurementProfileId === "table-split-test")).toBe(true)
    expect(repeatedHeaders.map((fragment) => fragment.pageIndex)).toEqual([1, 2])
    expect(pagination.warnings.map((warning) => warning.code)).not.toContain("table-row-forced-overflow")
  })

  it("keeps allowBreak=false over-tall rows atomic and reports overflow", () => {
    const pagination = paginateVNextDocument(splittableCellTableDoc(false), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 20, lineHeightPt: 30 }),
      measurementProfileId: "table-split-test",
    })
    const fragments = pagination.pages.flatMap((page) => page.fragments)
    const rowFragments = fragments.filter((fragment) => fragment.nodeId === "data-row")
    const textFragments = fragments.filter((fragment) => fragment.nodeId === "long-cell-text")

    expect(rowFragments).toHaveLength(1)
    expect(textFragments).toHaveLength(1)
    expect(textFragments[0]).toMatchObject({
      lineStart: 0,
      lineEnd: 8,
    })
    expect(textFragments[0]?.continuesFromPreviousPage).toBeUndefined()
    expect(textFragments[0]?.continuesOnNextPage).toBeUndefined()
    expect(pagination.warnings.map((warning) => warning.code)).toContain("table-row-forced-overflow")
  })

  it("applies explicit table cell block policies for non-text children", () => {
    const pagination = paginateVNextDocument(tableCellBlockPolicyDoc(), {
      measurementProfileId: "cell-policy-test",
    })
    const fragments = pagination.pages.flatMap((page) => page.fragments)
    const text = fragments.find((fragment) => fragment.nodeId === "cell-text")
    const spacer = fragments.find((fragment) => fragment.nodeId === "cell-spacer")
    const divider = fragments.find((fragment) => fragment.nodeId === "cell-divider")
    const toc = fragments.find((fragment) => fragment.nodeId === "cell-toc")
    const pageBreak = fragments.find((fragment) => fragment.nodeId === "cell-break")

    expect(text).toMatchObject({
      kind: "text",
      metadata: {
        tableId: "table",
        cellId: "cell",
        cellChildPolicy: "measured-lines",
        measurementProfileId: "cell-policy-test",
      },
    })
    expect(spacer).toMatchObject({
      kind: "block",
      heightPt: 18,
      metadata: {
        tableId: "table",
        cellId: "cell",
        cellChildPolicy: "atomic",
      },
    })
    expect(divider).toMatchObject({
      kind: "block",
      heightPt: 9,
      metadata: {
        tableId: "table",
        cellId: "cell",
        cellChildPolicy: "atomic",
      },
    })
    expect(toc).toMatchObject({
      kind: "generated",
      metadata: {
        tableId: "table",
        cellId: "cell",
        cellChildPolicy: "generated-atomic",
      },
    })
    expect(pageBreak).toBeUndefined()
    expect(pagination.warnings).toContainEqual(expect.objectContaining({
      code: "page-break-in-table-cell-ignored",
      nodeId: "cell-break",
    }))
  })

  it("measures the product-shaped vNext fixture with canonical nodes only", () => {
    const pack = parseFixture("product-report-vnext.flowdoc.json")
    const pagination = paginateVNextDocument(pack.document, { data: pack.data?.values })
    const nodeTypes = pagination.pages.flatMap((page) => page.fragments.map((fragment) => fragment.nodeType))

    expect(pagination.pageCount).toBeGreaterThanOrEqual(3)
    expect(nodeTypes).toContain("text-block")
    expect(nodeTypes).not.toContain("paragraph")
    expect(nodeTypes).not.toContain("flow-row")
    expect(pagination.pages.some((page) => (
      page.fragments.some((fragment) => fragment.nodeId.endsWith("footer-page") && fragment.text?.startsWith("Page "))
    ))).toBe(true)
  })

  it("keeps measured pagination independent from the parent runtime and old names", () => {
    const sourceUrl = new URL("../src/pagination/measuredPagination.ts", import.meta.url)
    const source = readFileSync(sourceUrl, "utf8")

    expect(source).not.toMatch(/\.\.\/\.\.\/packages/)
    expect(source).not.toMatch(/\.\.\/\.\.\/src\/app/)
    expect(source).not.toContain("flow-row")
    expect(source).not.toContain("flow-stack")
    expect(source).not.toContain("paragraph.split")
  })
})
