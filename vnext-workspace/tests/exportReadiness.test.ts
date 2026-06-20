import { describe, expect, it } from "vitest"
import type { AuthoredNode, DocumentNode } from "../src/schema/document.js"
import {
  assessVNextMeasuredPaginationExportReadiness,
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

function simpleDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "export-ready-doc",
      meta: { title: "Export Ready" },
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
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["body"] },
          body: textBlock("body", "Ready text"),
        },
      }],
    },
  }
}

function tableDoc(allowBreak: boolean): DocumentNode {
  return {
    version: 3,
    document: {
      id: allowBreak ? "export-split-table-doc" : "export-blocked-table-doc",
      meta: { title: "Export Table" },
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
            props: {},
            columns: [{ width: pt(100) }],
            rowIds: ["row"],
          },
          row: {
            id: "row",
            type: "table-row",
            props: allowBreak ? { allowBreak: true } : { allowBreak: false },
            cellIds: ["cell"],
          },
          cell: { id: "cell", type: "table-cell", props: {}, childIds: ["cell-text"] },
          "cell-text": textBlock("cell-text", "x".repeat(160)),
        },
      }],
    },
  }
}

function warningDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "export-warning-doc",
      meta: { title: "Export Warning" },
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
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["table"] },
          table: {
            id: "table",
            type: "table",
            props: {},
            columns: [{ width: pt(100) }],
            rowIds: ["row"],
          },
          row: { id: "row", type: "table-row", props: {}, cellIds: ["cell"] },
          cell: { id: "cell", type: "table-cell", props: {}, childIds: ["cell-break"] },
          "cell-break": { id: "cell-break", type: "page-break", props: {} },
        },
      }],
    },
  }
}

function clonePagination(pagination: VNextMeasuredPagination): VNextMeasuredPagination {
  return JSON.parse(JSON.stringify(pagination)) as VNextMeasuredPagination
}

describe("vNext measured pagination export readiness", () => {
  it("marks warning-free measured pagination as ready", () => {
    const pagination = paginateVNextDocument(simpleDoc())
    const readiness = assessVNextMeasuredPaginationExportReadiness(pagination)

    expect(readiness).toMatchObject({
      documentId: "export-ready-doc",
      source: "vnext-measured-pagination",
      status: "ready",
      pageCount: 1,
      rendererContract: {
        pdf: { consumes: "measured-pagination-output", mayRelayout: false },
        docx: {
          consumes: "measured-pagination-output",
          mayRelayout: false,
          mayUseSourceDocumentForStructure: true,
        },
      },
      rendererConsumption: {
        source: "vnext-measured-pagination",
        status: "consumable",
        consumes: "measured-pagination-fragments",
        requiresAuthoredDocumentForLayout: false,
        mayRelayout: false,
        blockingIssueCount: 0,
        warningIssueCount: 0,
      },
      blockingIssues: [],
      warningIssues: [],
    })
  })

  it("keeps non-blocking table warnings visible without blocking export", () => {
    const pagination = paginateVNextDocument(warningDoc())
    const readiness = assessVNextMeasuredPaginationExportReadiness(pagination)

    expect(readiness.status).toBe("ready-with-warnings")
    expect(readiness.blockingIssues).toEqual([])
    expect(readiness.warningIssues).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "page-break-in-table-cell-ignored",
        nodeId: "cell-break",
      }),
    ])
  })

  it("blocks export when table rows still overflow after measured pagination", () => {
    const pagination = paginateVNextDocument(tableDoc(false), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 20, lineHeightPt: 30 }),
    })
    const readiness = assessVNextMeasuredPaginationExportReadiness(pagination)

    expect(readiness.status).toBe("blocked")
    expect(readiness.blockingIssues).toEqual([
      expect.objectContaining({
        severity: "blocking",
        code: "table-row-forced-overflow",
        nodeId: "row",
      }),
    ])
  })

  it("allows export when a breakable over-tall text row is split", () => {
    const pagination = paginateVNextDocument(tableDoc(true), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 20, lineHeightPt: 30 }),
    })
    const readiness = assessVNextMeasuredPaginationExportReadiness(pagination)

    expect(readiness.status).toBe("ready")
    expect(readiness.blockingIssues).toEqual([])
  })

  it("blocks export when measured table fragments are not renderer-consumable", () => {
    const pagination = paginateVNextDocument(tableDoc(true), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 20, lineHeightPt: 30 }),
    })
    const broken = clonePagination(pagination)
    const cellFragment = broken.pages
      .flatMap((page) => page.fragments)
      .find((fragment) => fragment.nodeId === "cell")

    if (cellFragment?.metadata == null) {
      throw new Error("Expected table cell metadata in test setup.")
    }

    delete cellFragment.metadata.tableId

    const readiness = assessVNextMeasuredPaginationExportReadiness(broken)

    expect(readiness.status).toBe("blocked")
    expect(readiness.rendererConsumption).toMatchObject({
      status: "blocked",
      blockingIssueCount: expect.any(Number),
    })
    expect(readiness.blockingIssues).toContainEqual(expect.objectContaining({
      severity: "blocking",
      code: "table-fragment-missing-metadata",
      nodeId: "cell",
    }))
  })
})
