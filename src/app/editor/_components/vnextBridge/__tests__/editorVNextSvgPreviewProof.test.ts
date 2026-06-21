import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createEditorVNextPreviewArtifactSnapshot } from "../editorVNextBridgeHost"
import { createEditorVNextSvgPreviewProofSnapshot } from "../editorVNextSvgPreviewProof"

function fixtureValue(name: string): unknown {
  const fixtureUrl = new URL(`../../../../../../vnext-workspace/fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown
}

function previewArtifact(maxCommands = 1000) {
  const result = createEditorVNextPreviewArtifactSnapshot(
    fixtureValue("product-report-vnext.flowdoc.json"),
    {
      data: {
        "customer.name": "Acme Corp",
        "report.period": "Q2 2026",
      },
      measurementProfileId: "svg-preview-proof-test",
      maxCommands,
    },
  )

  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return result.snapshot
}

describe("editor vNext SVG preview proof", () => {
  it("renders a bounded SVG proof from measured preview artifact commands", () => {
    const artifact = previewArtifact()
    const result = createEditorVNextSvgPreviewProofSnapshot(artifact, {
      pageStart: 0,
      pageCount: artifact.pages.length,
      maxPages: 50,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reason)

    expect(result.snapshot).toMatchObject({
      source: "editor-vnext-svg-preview-proof",
      mode: "svg-preview-proof",
      input: "editor-vnext-preview-artifact",
      documentId: "product-report-vnext",
      packageVersion: 2,
      documentVersion: 3,
      rendererContract: {
        consumes: "measured-pagination-fragments",
        mayRelayout: false,
        requiresAuthoredDocumentForLayout: false,
      },
      sideEffects: {
        editorState: false,
        history: false,
        selection: false,
        paginatedPreview: false,
        canvasRendering: false,
        persistence: false,
        apiRoutesReplaced: false,
        pdfRendered: false,
        docxRendered: false,
      },
    })
    expect(result.snapshot.pageWindow.renderedPageCount).toBeGreaterThan(0)
    expect(result.snapshot.status).not.toBe("blocked")
    expect(result.snapshot.metrics.renderedCommandCount).toBeGreaterThan(0)
    expect(result.snapshot.metrics.totalSvgBytes).toBeGreaterThan(0)
    expect(result.snapshot.pages.every((page) => page.svg.startsWith("<svg"))).toBe(true)
    expect(result.snapshot.pages.some((page) => page.svg.includes("Acme Corp"))).toBe(true)
    expect("runtime" in result.snapshot).toBe(false)
    expect("pagination" in result.snapshot).toBe(false)
    expect("document" in result.snapshot).toBe(false)
    expect("pdf" in result.snapshot).toBe(false)
    expect("docx" in result.snapshot).toBe(false)
  })

  it("reports page byte budget pressure as risk instead of a silent pass", () => {
    const artifact = previewArtifact()
    const result = createEditorVNextSvgPreviewProofSnapshot(artifact, {
      pageStart: 0,
      pageCount: 1,
      maxPageSvgBytes: 1,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reason)

    expect(result.snapshot.status).toBe("risk")
    expect(result.snapshot.pages[0]?.status).toBe("risk")
    expect(result.snapshot.issues).toContainEqual(expect.objectContaining({
      severity: "risk",
      code: "page-svg-budget-exceeded",
      pageIndex: 0,
    }))
  })

  it("surfaces upstream command truncation as risk", () => {
    const artifact = previewArtifact(1)
    expect(artifact.artifact.truncated).toBe(true)

    const result = createEditorVNextSvgPreviewProofSnapshot(artifact, {
      pageStart: 0,
      pageCount: 1,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reason)

    expect(result.snapshot.status).toBe("risk")
    expect(result.snapshot.artifact.truncated).toBe(true)
    expect(result.snapshot.issues).toContainEqual(expect.objectContaining({
      severity: "risk",
      code: "source-artifact-truncated",
    }))
  })

  it("blocks when the source preview artifact is blocked", () => {
    const artifact = createEditorVNextPreviewArtifactSnapshot({
      version: 3,
      document: {
        id: "raw-doc",
        meta: { title: "Raw Doc" },
        sections: [],
      },
    })

    expect(artifact.ok).toBe(false)
    if (artifact.ok) throw new Error("Expected raw document input to be blocked.")

    const result = createEditorVNextSvgPreviewProofSnapshot(artifact.snapshot)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("Expected SVG proof to be blocked.")

    expect(result.reason).toBe("source-artifact-blocked")
    expect(result.snapshot).toMatchObject({
      status: "blocked",
      pages: [],
      metrics: {
        renderedCommandCount: 0,
        totalSvgBytes: 0,
      },
    })
    expect(result.snapshot.issues).toContainEqual(expect.objectContaining({
      severity: "blocking",
      code: "source-artifact-blocked",
    }))
  })
})
