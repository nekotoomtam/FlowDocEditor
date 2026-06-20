import { describe, expect, it } from "vitest"
import type { AuthoredNode, DocumentNode } from "../src/schema/document.js"
import {
  buildVNextMeasuredRendererConsumption,
  createApproximateVNextTextMeasurer,
  paginateVNextDocument,
  type VNextMeasuredPagination,
} from "../src/index.js"

function pt(value: number) {
  return { value, unit: "pt" as const }
}

function textBlock(id: string, text: string): AuthoredNode {
  return {
    id,
    type: "text-block",
    role: { role: "paragraph" },
    props: {},
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function splittableTableDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "renderer-consumption-table-doc",
      meta: { title: "Renderer Consumption Table" },
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
            props: { allowBreak: true },
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

function clonePagination(pagination: VNextMeasuredPagination): VNextMeasuredPagination {
  return JSON.parse(JSON.stringify(pagination)) as VNextMeasuredPagination
}

describe("vNext measured renderer consumption", () => {
  it("builds table render commands from measured pagination without authored document input", () => {
    const pagination = paginateVNextDocument(splittableTableDoc(), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 20, lineHeightPt: 30 }),
      measurementProfileId: "renderer-consumption-test",
    })
    const consumption = buildVNextMeasuredRendererConsumption(pagination)
    const tableSegments = consumption.commands.filter((command) => command.nodeType === "table")
    const repeatedHeaderRows = consumption.commands.filter((command) => (
      command.nodeId === "header-row" && command.table?.isRepeatedHeader === true
    ))
    const splitRows = consumption.commands.filter((command) => command.nodeId === "data-row")
    const splitText = consumption.commands.filter((command) => command.nodeId === "long-cell-text")

    expect(consumption).toMatchObject({
      source: "vnext-measured-pagination",
      status: "consumable",
      pageCount: 3,
      rendererContract: {
        consumes: "measured-pagination-fragments",
        requiresAuthoredDocumentForLayout: false,
        mayRelayout: false,
      },
      blockingIssues: [],
      warningIssues: [],
    })
    expect(consumption.commandCount).toBe(pagination.pages.flatMap((page) => page.fragments).length)
    expect(tableSegments.map((command) => command.table?.tableSegmentIndex)).toEqual([0, 1, 2])
    expect(repeatedHeaderRows.map((command) => command.pageIndex)).toEqual([1, 2])
    expect(splitRows.map((command) => command.table?.rowSplitIndex)).toEqual([0, 1, 2])
    expect(splitText.map((command) => [command.lineStart, command.lineEnd])).toEqual([
      [0, 3],
      [3, 6],
      [6, 8],
    ])
    expect(splitText.every((command) => command.table?.cellChildPolicy === "splittable-lines")).toBe(true)
  })

  it("blocks consumption when a table fragment would require renderer-side inference", () => {
    const pagination = paginateVNextDocument(splittableTableDoc(), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 20, lineHeightPt: 30 }),
    })
    const broken = clonePagination(pagination)
    const cellFragment = broken.pages
      .flatMap((page) => page.fragments)
      .find((fragment) => fragment.nodeId === "data-cell")

    if (cellFragment?.metadata == null) {
      throw new Error("Expected data-cell fragment metadata in test setup.")
    }

    delete cellFragment.metadata.tableId

    const consumption = buildVNextMeasuredRendererConsumption(broken)

    expect(consumption.status).toBe("blocked")
    expect(consumption.blockingIssues).toContainEqual(expect.objectContaining({
      code: "table-fragment-missing-metadata",
      nodeId: "data-cell",
      fragmentId: cellFragment.id,
    }))
  })
})
