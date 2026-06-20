import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { AuthoredNode, DocumentNode, InlineNode } from "../src/schema/document.js"
import { buildRelationshipGraph } from "../src/graph/relationshipGraph.js"
import {
  FlowDocPackageParseError,
  parseFlowDocPackageV2DocumentVNext,
  safeParseFlowDocPackageV2DocumentVNext,
  serializeFlowDocPackageV2DocumentVNext,
} from "../src/persistence/package.js"

function parseFixture(name: string) {
  const fixtureUrl = new URL(`../fixtures/${name}`, import.meta.url)
  const raw = readFileSync(fixtureUrl, "utf8")
  return parseFlowDocPackageV2DocumentVNext(JSON.parse(raw))
}

function bodyZone() {
  return {
    id: "zone-body",
    type: "zone",
    role: "body",
    childIds: [],
  }
}

function minimalPackage(options: {
  documentVersion?: number
  nodes?: Record<string, unknown>
  zoneIds?: string[]
} = {}) {
  const documentVersion = options.documentVersion ?? 3
  const nodes = options.nodes ?? { "zone-body": bodyZone() }
  const zoneIds = options.zoneIds ?? ["zone-body"]

  return {
    packageVersion: 2,
    kind: "document",
    id: "doc-cutoff",
    meta: { title: "Cutoff" },
    fields: {
      version: 1,
      fields: {},
    },
    document: {
      version: documentVersion,
      document: {
        id: "doc-cutoff",
        meta: { title: "Cutoff" },
        sections: [
          {
            id: "section-main",
            type: "section",
            page: {
              size: "A4",
              orientation: "portrait",
              margin: {
                top: { value: 20, unit: "mm" },
                right: { value: 20, unit: "mm" },
                bottom: { value: 20, unit: "mm" },
                left: { value: 20, unit: "mm" },
              },
            },
            zoneIds,
            nodes,
          },
        ],
      },
    },
  }
}

function nodesOf(doc: DocumentNode): AuthoredNode[] {
  return doc.document.sections.flatMap((section) => Object.values(section.nodes))
}

function inlineNodesOf(doc: DocumentNode): InlineNode[] {
  return nodesOf(doc).flatMap((node) => node.type === "text-block" ? node.children : [])
}

describe("vNext package fixture", () => {
  it("rejects package v2 when it carries old document versions", () => {
    const documentV1Result = safeParseFlowDocPackageV2DocumentVNext(minimalPackage({ documentVersion: 1 }))
    const documentV2Result = safeParseFlowDocPackageV2DocumentVNext(minimalPackage({ documentVersion: 2 }))

    expect(documentV1Result).toMatchObject({ ok: false, reason: "unsupported-version" })
    expect(documentV2Result).toMatchObject({ ok: false, reason: "unsupported-version" })

    if (!documentV1Result.ok) {
      expect(documentV1Result.issues.map((issue) => issue.path)).toContain("document.version")
    }
    expect(() => parseFlowDocPackageV2DocumentVNext(minimalPackage({ documentVersion: 2 }))).toThrow(FlowDocPackageParseError)
  })

  it("rejects non-canonical package versions with structured issues", () => {
    const result = safeParseFlowDocPackageV2DocumentVNext({
      ...minimalPackage(),
      packageVersion: 1,
    })

    expect(result).toMatchObject({ ok: false, reason: "unsupported-version" })
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toContain("packageVersion")
    }
  })

  it("rejects prototype node names in canonical document v3 packages", () => {
    const pack = minimalPackage({
      nodes: {
        "zone-body": bodyZone(),
        "legacy-paragraph": {
          id: "legacy-paragraph",
          type: "paragraph",
          props: {},
          children: [],
        },
      },
    })
    const result = safeParseFlowDocPackageV2DocumentVNext(pack)

    expect(result).toMatchObject({ ok: false, reason: "invalid-package" })
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path.includes("legacy-paragraph.type"))).toBe(true)
    }
    expect(() => parseFlowDocPackageV2DocumentVNext(pack)).toThrow(FlowDocPackageParseError)
  })

  it("parses package v2 containing document v3 and builds graph facts", () => {
    const pack = parseFixture("product-report-vnext-minimal.flowdoc.json")
    const graph = buildRelationshipGraph(pack.document)

    expect(pack.packageVersion).toBe(2)
    expect(pack.document.version).toBe(3)
    expect(pack.id).toBe(pack.document.document.id)
    expect(graph.zonesById.get("zone-cover-body")?.role).toBe("body")
    expect(graph.nodesById.get("summary-columns")?.type).toBe("columns")
    expect(graph.nodesById.get("detail-table")?.type).toBe("table")
    expect(graph.nearestByNodeId.get("detail-cell-a-text")).toMatchObject({
      tableId: "detail-table",
      tableRowId: "detail-header-row",
      tableCellId: "detail-cell-a",
    })
  })

  it("parses the product-shaped vNext anchor fixture", () => {
    const pack = parseFixture("product-report-vnext.flowdoc.json")
    const graph = buildRelationshipGraph(pack.document)
    const nodes = nodesOf(pack.document)
    const inlines = inlineNodesOf(pack.document)
    const roles = nodes.flatMap((node) => node.type === "text-block" ? [node.role.role] : [])
    const zoneRoles = nodes.flatMap((node) => node.type === "zone" ? [node.role] : [])

    expect(pack.packageVersion).toBe(2)
    expect(pack.document.version).toBe(3)
    expect(pack.id).toBe(pack.document.document.id)
    expect(pack.document.document.sections.map((section) => section.id)).toEqual([
      "section-cover",
      "section-toc",
      "section-body",
    ])
    expect(zoneRoles).toEqual(expect.arrayContaining([
      "body",
      "header",
      "footer",
      "first-page-header",
      "first-page-footer",
    ]))
    expect(roles).toEqual(expect.arrayContaining([
      "heading",
      "paragraph",
      "list-item",
      "label",
      "caption",
      "note",
    ]))
    expect(inlines.some((node) => node.type === "field-ref" && node.key === "customer.name")).toBe(true)
    expect(inlines.some((node) => node.type === "field-ref" && node.key === "report.total")).toBe(true)
    expect(inlines.some((node) => node.type === "page-number")).toBe(true)
    expect(inlines.some((node) => node.type === "line-break")).toBe(true)
    expect(graph.nodesById.get("cover-meta-columns")?.type).toBe("columns")
    expect(graph.nodesById.get("body-metrics-table")?.type).toBe("table")
    expect(graph.nearestByNodeId.get("metric-value-total-text")).toMatchObject({
      sectionId: "section-body",
      zoneId: "body-main",
      tableId: "body-metrics-table",
      tableRowId: "metrics-data-row",
      tableCellId: "metric-value-total",
      textBlockId: "metric-value-total-text",
    })
    expect(graph.parentByNodeId.get("cover-meta-left")).toEqual({
      kind: "columns",
      columnsId: "cover-meta-columns",
      childField: "columnIds",
      index: 0,
    })
  })

  it("serializes canonical packages after validation and strips unknown keys", () => {
    const pack = {
      ...parseFixture("product-report-vnext-minimal.flowdoc.json"),
      prototypeOnly: true,
    }

    const serialized = serializeFlowDocPackageV2DocumentVNext(pack)

    expect("prototypeOnly" in serialized).toBe(false)
    expect(parseFlowDocPackageV2DocumentVNext(serialized)).toEqual(serialized)
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized)
  })
})
