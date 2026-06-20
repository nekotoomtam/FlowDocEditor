import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildRelationshipGraph } from "../src/graph/relationshipGraph.js"
import { parseFlowDocPackageV2DocumentVNext } from "../src/persistence/package.js"

describe("vNext package fixture", () => {
  it("parses package v2 containing document v3 and builds graph facts", () => {
    const fixtureUrl = new URL("../fixtures/product-report-vnext-minimal.flowdoc.json", import.meta.url)
    const raw = readFileSync(fixtureUrl, "utf8")
    const pack = parseFlowDocPackageV2DocumentVNext(JSON.parse(raw))
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
})
