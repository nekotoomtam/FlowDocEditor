import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  createVNextEditorBridgeRuntime,
  safeCreateVNextEditorBridgeRuntime,
} from "../src/index.js"

function fixtureValue(name: string): unknown {
  const fixtureUrl = new URL(`../fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown
}

describe("vNext editor bridge runtime", () => {
  it("creates a read-only bridge runtime from a canonical vNext package", () => {
    const runtime = createVNextEditorBridgeRuntime(
      fixtureValue("product-report-vnext.flowdoc.json"),
      {
        source: "fixture",
        measurementProfileId: "editor-bridge-test",
      },
    )

    expect(runtime).toMatchObject({
      source: "vnext-editor-bridge-runtime",
      sourceKind: "fixture",
      packageVersion: 2,
      documentVersion: 3,
    })
    expect(runtime.status).toBe(runtime.exportReadiness.status)
    expect(runtime.package.id).toBe(runtime.package.document.document.id)
    expect(runtime.graph.nodesById.size).toBeGreaterThan(0)
    expect(runtime.pagination.pageCount).toBeGreaterThanOrEqual(3)
    expect(runtime.rendererConsumption.rendererContract).toMatchObject({
      consumes: "measured-pagination-fragments",
      requiresAuthoredDocumentForLayout: false,
      mayRelayout: false,
    })
    expect(runtime.diagnostics.supportedOperationKinds).toEqual(expect.arrayContaining([
      "node.delete",
      "text-block.text.replace",
      "table.row.insert",
      "table.column.delete",
    ]))
  })

  it("rejects non-package input instead of accepting current runtime documents", () => {
    const result = safeCreateVNextEditorBridgeRuntime({
      version: 3,
      document: {
        id: "raw-doc",
        meta: { title: "Raw Doc" },
        sections: [],
      },
    })

    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported-version",
    })
  })

  it("rejects package v2 when the document is not canonical document v3", () => {
    const pack = fixtureValue("product-report-vnext-minimal.flowdoc.json") as {
      document?: { version?: number }
    }
    if (pack.document == null) throw new Error("Expected fixture document.")
    pack.document.version = 2

    const result = safeCreateVNextEditorBridgeRuntime(pack)

    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported-version",
    })
  })

  it("keeps the bridge runtime independent from parent runtime and old names", () => {
    const sourceUrl = new URL("../src/editorBridge/runtime.ts", import.meta.url)
    const source = readFileSync(sourceUrl, "utf8")

    expect(source).not.toMatch(/\.\.\/\.\.\/packages/)
    expect(source).not.toMatch(/\.\.\/\.\.\/src\/app/)
    expect(source).not.toContain("flow-row")
    expect(source).not.toContain("flow-stack")
    expect(source).not.toContain("paragraph.split")
  })
})
