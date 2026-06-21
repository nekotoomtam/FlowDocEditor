import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { createEditorVNextHiddenRuntimeTruthSurfaceSnapshot } from "../editorVNextHiddenRuntimeSurface"

const repoRoot = fileURLToPath(new URL("../../../../../../", import.meta.url))

function fixtureValue(name: string): unknown {
  const fixtureUrl = new URL(`../../../../../../vnext-workspace/fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown
}

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      if (entry === "__tests__") return []
      return collectSourceFiles(path)
    }

    if (/\.(ts|tsx)$/.test(entry)) return [path]
    return []
  })
}

describe("editor vNext hidden runtime surface", () => {
  it("returns a hidden runtime truth snapshot from a canonical vNext package", () => {
    const result = createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(
      fixtureValue("product-report-vnext.flowdoc.json"),
      {
        measurementProfileId: "hidden-runtime-surface-test",
        data: { customer: "Acme" },
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reason)

    expect(result.snapshot).toMatchObject({
      source: "editor-vnext-hidden-runtime-truth-surface",
      milestone: "post-11",
      jobItem: "J3",
      mode: "hidden-diagnostic",
      visibility: "hidden",
      truthSource: "canonical-vnext-package",
      documentId: "product-report-vnext",
      packageVersion: 2,
      documentVersion: 3,
      runtimeTruth: {
        canonicalPackageAccepted: true,
        currentDocumentAccepted: false,
        hiddenSurfaceCanBeRuntimeTruth: true,
        editorStateSourceOfTruthChanged: false,
      },
      generation: {
        requestDataStatus: "provided-not-consumed",
        requestDataConsumed: false,
        templateReadyForMeasuredOutput: true,
        outputArtifactCreated: false,
        publicGenerationApiImplemented: false,
        currentApiRoutes: "not-replaced",
      },
      operations: {
        canReportHistoryReadyMetadata: true,
        appliesToEditorState: false,
        writesEditorHistory: false,
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        persistence: false,
        apiRoutes: false,
      },
    })
    expect(result.snapshot.bridge.pageCount).toBeGreaterThanOrEqual(3)
    expect(result.snapshot.bridge.graph.nodeCount).toBeGreaterThan(0)
    expect(result.snapshot.operations.supportedKinds).toEqual(expect.arrayContaining([
      "text-block.text.replace",
    ]))
    expect("document" in result.snapshot).toBe(false)
    expect("runtime" in result.snapshot).toBe(false)
    expect("pagination" in result.snapshot).toBe(false)
    expect("nextDocument" in result.snapshot).toBe(false)
  })

  it("blocks raw document-shaped input before it can become hidden runtime truth", () => {
    const result = createEditorVNextHiddenRuntimeTruthSurfaceSnapshot({
      version: 3,
      document: {
        id: "raw-doc",
        meta: { title: "Raw Doc" },
        sections: [],
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("Expected raw input to be blocked.")

    expect(result.reason).toBe("unsupported-version")
    expect(result.snapshot).toMatchObject({
      status: "blocked",
      documentId: null,
      packageVersion: null,
      documentVersion: null,
      runtimeTruth: {
        canonicalPackageAccepted: false,
        currentDocumentAccepted: false,
        hiddenSurfaceCanBeRuntimeTruth: false,
        editorStateSourceOfTruthChanged: false,
      },
      generation: {
        requestDataStatus: "not-provided",
        requestDataConsumed: false,
        templateReadyForMeasuredOutput: false,
      },
      operations: {
        supportedKinds: [],
        canReportHistoryReadyMetadata: false,
        appliesToEditorState: false,
        writesEditorHistory: false,
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        persistence: false,
        apiRoutes: false,
      },
    })
    expect(result.snapshot.issues.length).toBeGreaterThan(0)
  })

  it("keeps vNext source imports isolated to the bridge host", () => {
    const sourceRoot = fileURLToPath(new URL("../../../../../../src/app", import.meta.url))
    const imports = collectSourceFiles(sourceRoot)
      .filter((file) => readFileSync(file, "utf8").includes("vnext-workspace/src"))
      .map((file) => relative(repoRoot, file).split(sep).join("/"))

    expect(imports).toEqual([
      "src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts",
    ])
  }, 20_000)
})
