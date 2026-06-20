import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { AuthoredNode, DocumentNode, TextBlockRole } from "../src/schema/document.js"
import { runVNextOperation } from "../src/operations/documentOperations.js"
import { parseFlowDocPackageV2DocumentVNext } from "../src/persistence/package.js"
import {
  buildVNextExportPlan,
  buildVNextPaginationPlan,
  resolveVNextPaginationInvalidation,
} from "../src/pagination/paginationPlan.js"

function pt(value: number) {
  return { value, unit: "pt" as const }
}

function textBlock(id: string, text: string, role: TextBlockRole = { role: "paragraph" }): AuthoredNode {
  return {
    id,
    type: "text-block",
    role,
    props: {},
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function minimalDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "pagination-doc",
      meta: { title: "Pagination Plan" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 10, unit: "mm" },
            right: { value: 20, unit: "mm" },
            bottom: { value: 30, unit: "mm" },
            left: { value: 40, unit: "mm" },
          },
          headerReserved: 24,
          footerReserved: 30,
          headerFooterHorizontalMode: "body",
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["title", "columns", "table"] },
          title: textBlock("title", "Title", { role: "heading", level: 1 }),
          columns: { id: "columns", type: "columns", props: {}, columnIds: ["left", "right"] },
          left: { id: "left", type: "column", props: { widthShare: 50 }, childIds: ["left-text"] },
          right: { id: "right", type: "column", props: { widthShare: 50 }, childIds: ["right-text"] },
          "left-text": textBlock("left-text", "Left"),
          "right-text": textBlock("right-text", "Right"),
          table: {
            id: "table",
            type: "table",
            props: { headerRowCount: 1 },
            columns: [{ width: pt(100) }],
            rowIds: ["row"],
          },
          row: { id: "row", type: "table-row", props: {}, cellIds: ["cell"] },
          cell: { id: "cell", type: "table-cell", props: {}, childIds: ["cell-text"] },
          "cell-text": textBlock("cell-text", "Cell"),
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

describe("vNext pagination/export planning", () => {
  it("builds page boxes and source order from canonical vNext structure", () => {
    const plan = buildVNextPaginationPlan(minimalDoc())
    const section = plan.sections[0]

    expect(plan).toMatchObject({
      documentId: "pagination-doc",
      source: "vnext-document",
      status: "planning-only",
      measurementStatus: "not-measured",
      minimumPageCount: 1,
    })
    expect(section.pageBox).toMatchObject({
      size: "A4",
      orientation: "portrait",
      widthPt: 595.28,
      heightPt: 841.89,
      marginPt: { top: 28.35, right: 56.69, bottom: 85.04, left: 113.39 },
      headerReservedPt: 24,
      footerReservedPt: 30,
      contentXPt: 113.39,
      contentYPt: 52.35,
      contentWidthPt: 425.2,
      contentHeightPt: 674.5,
    })
    expect(section.zones).toEqual([{
      zoneId: "body-zone",
      role: "body",
      sourceItemIds: plan.sourceItems.map((item) => item.id),
    }])
    expect(plan.sourceItems.map((item) => [item.nodeId, item.nodeType, item.splitPolicy])).toEqual([
      ["body-zone", "zone", "container"],
      ["title", "text-block", "line"],
      ["columns", "columns", "columns"],
      ["left", "column", "container"],
      ["left-text", "text-block", "line"],
      ["right", "column", "container"],
      ["right-text", "text-block", "line"],
      ["table", "table", "table"],
      ["row", "table-row", "table-row"],
      ["cell", "table-cell", "table-cell"],
      ["cell-text", "text-block", "line"],
    ])
  })

  it("builds a planning-only export contract that forbids renderer relayout", () => {
    const exportPlan = buildVNextExportPlan(minimalDoc())

    expect(exportPlan).toMatchObject({
      documentId: "pagination-doc",
      source: "vnext-pagination-plan",
      status: "requires-measured-pagination",
      rendererContract: {
        pdf: { consumes: "measured-pagination-output", mayRelayout: false },
        docx: {
          consumes: "measured-pagination-output",
          mayRelayout: false,
          mayUseSourceDocumentForStructure: true,
        },
      },
    })
    expect(exportPlan.paginationPlan.sourceItems.some((item) => item.nodeType === "table")).toBe(true)
  })

  it("covers the product-shaped vNext fixture without prototype node names", () => {
    const pack = parseFixture("product-report-vnext.flowdoc.json")
    const plan = buildVNextPaginationPlan(pack.document)

    expect(plan.sections.map((section) => section.sectionId)).toEqual([
      "section-cover",
      "section-toc",
      "section-body",
    ])
    expect(plan.sourceItems.some((item) => item.nodeId === "body-metrics-table" && item.splitPolicy === "table")).toBe(true)
    expect(plan.sourceItems.some((item) => item.nodeId === "cover-meta-columns" && item.splitPolicy === "columns")).toBe(true)
    expect(plan.sourceItems.map((item) => item.nodeType)).not.toContain("paragraph")
    expect(plan.sourceItems.map((item) => item.nodeType)).not.toContain("flow-row")
  })

  it("resolves pagination and export invalidation from vNext operation results", () => {
    const doc = minimalDoc()
    const committed = runVNextOperation(doc, {
      kind: "columns.layout.patch",
      columnsId: "columns",
      widthShares: [30, 70],
    })
    const rejected = runVNextOperation(doc, {
      kind: "table.row.delete",
      rowId: "row",
    })

    const stale = resolveVNextPaginationInvalidation(committed)
    const unchanged = resolveVNextPaginationInvalidation(rejected)

    expect(stale).toMatchObject({
      status: "stale",
      sourceOperationKind: "columns.layout.patch",
      affectedSectionIds: ["section-main"],
      affectedNodeIds: ["columns", "left", "right"],
      exportReadiness: "stale",
      reason: "node-layout",
    })
    expect(unchanged).toMatchObject({
      status: "unchanged",
      sourceOperationKind: "table.row.delete",
      exportReadiness: "unchanged",
      reason: "invalid-command",
    })
  })

  it("keeps the vNext planning module independent from parent runtime and old names", () => {
    const sourceUrl = new URL("../src/pagination/paginationPlan.ts", import.meta.url)
    const source = readFileSync(sourceUrl, "utf8")

    expect(source).not.toMatch(/\.\.\/\.\.\/packages/)
    expect(source).not.toMatch(/\.\.\/\.\.\/src\/app/)
    expect(source).not.toContain("flow-row")
    expect(source).not.toContain("flow-stack")
    expect(source).not.toContain("paragraph.split")
  })
})
