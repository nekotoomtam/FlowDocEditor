import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createEditorGenerationReadinessSnapshot } from "../editorGenerationReadiness"

function fixtureValue(name: string): unknown {
  const fixtureUrl = new URL(`../../../../../../vnext-workspace/fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown
}

describe("editor generation readiness diagnostic", () => {
  it("summarizes generation readiness from a canonical vNext package without side effects", () => {
    const result = createEditorGenerationReadinessSnapshot(
      fixtureValue("product-report-vnext.flowdoc.json"),
      { measurementProfileId: "generation-diagnostic-test" },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reason)

    expect(result.snapshot).toMatchObject({
      source: "editor-generation-readiness-diagnostic",
      phase: "11.5",
      mode: "read-only",
      input: "canonical-vnext-package",
      documentId: "product-report-vnext",
      packageVersion: 2,
      documentVersion: 3,
      generation: {
        template: "canonical-vnext-package",
        requestData: {
          status: "not-provided",
          consumed: false,
        },
        bindingRuntimeView: "not-materialized",
        outputArtifact: "not-rendered",
        currentApiRoutes: "not-replaced",
      },
      readiness: {
        bridgeRuntimeOk: true,
        templateReadyForMeasuredOutput: true,
        outputArtifactCreated: false,
        publicGenerationApiImplemented: false,
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        apiRoutes: false,
      },
    })
    expect(result.snapshot.bridge.pageCount).toBeGreaterThanOrEqual(3)
    expect(result.snapshot.bridge.graph.nodeCount).toBeGreaterThan(0)
    expect(result.snapshot.bridge.rendererConsumption.mayRelayout).toBe(false)
    expect(result.snapshot.bridge.rendererConsumption.requiresAuthoredDocumentForLayout).toBe(false)
    expect(result.snapshot.bridge.supportedOperationKinds).toEqual(expect.arrayContaining([
      "node.delete",
      "text-block.text.replace",
      "table.row.insert",
    ]))
    expect("runtime" in result.snapshot).toBe(false)
    expect("pagination" in result.snapshot).toBe(false)
  })

  it("records request data as provided but not consumed in the read-only diagnostic", () => {
    const result = createEditorGenerationReadinessSnapshot(
      fixtureValue("product-report-vnext.flowdoc.json"),
      {
        data: {
          reportDate: "2026-06-21",
          customerName: "Example Customer",
        },
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reason)

    expect(result.snapshot.generation.requestData).toEqual({
      status: "provided-not-consumed",
      consumed: false,
    })
    expect(result.snapshot.generation.bindingRuntimeView).toBe("not-materialized")
    expect(result.snapshot.readiness.outputArtifactCreated).toBe(false)
  })

  it("returns a blocked read-only diagnostic for raw document-shaped input", () => {
    const result = createEditorGenerationReadinessSnapshot({
      version: 3,
      document: {
        id: "raw-doc",
        meta: { title: "Raw Doc" },
        sections: [],
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("Expected raw input to be rejected.")

    expect(result.reason).toBe("unsupported-version")
    expect(result.snapshot).toMatchObject({
      status: "blocked",
      documentId: null,
      packageVersion: null,
      documentVersion: null,
      readiness: {
        bridgeRuntimeOk: false,
        templateReadyForMeasuredOutput: false,
        outputArtifactCreated: false,
        publicGenerationApiImplemented: false,
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        apiRoutes: false,
      },
    })
    expect(result.snapshot.issues.length).toBeGreaterThan(0)
  })
})
