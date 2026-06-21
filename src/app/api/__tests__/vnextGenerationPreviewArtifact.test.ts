import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { POST as vnextGenerationPreviewPost } from "../vnext/generation/preview/route"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

function fixtureValue(name: string): unknown {
  const fixtureUrl = new URL("../../../../vnext-workspace/fixtures/" + name, import.meta.url)
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function rawRequest(url: string, body: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
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

describe("vNext generation preview artifact route", () => {
  it("returns a bounded measured preview artifact from a canonical vNext package", async () => {
    const response = await vnextGenerationPreviewPost(jsonRequest("http://localhost/api/vnext/generation/preview", {
      requestId: "preview-artifact-test",
      template: {
        package: fixtureValue("product-report-vnext.flowdoc.json"),
      },
      data: {
        "customer.name": "Acme Corp",
        "report.period": "Q2 2026",
      },
      output: {
        kind: "preview",
        measurementProfileId: "vnext-preview-artifact-test",
        maxCommands: 100,
      },
    }) as never)

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toMatchObject({
      source: "vnext-preview-artifact-api",
      mode: "measured-preview-artifact",
      requestId: "preview-artifact-test",
      template: {
        input: "canonical-vnext-package",
        documentId: "product-report-vnext",
        packageVersion: 2,
        documentVersion: 3,
      },
      artifact: {
        kind: "preview",
        format: "measured-render-commands",
        generatedDocumentReturned: false,
        paginatedDocumentReturned: false,
        pdfRendered: false,
        docxRendered: false,
      },
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
      },
    })
    expect(body.status).not.toBe("blocked")
    expect(body.pages.length).toBeGreaterThanOrEqual(3)
    expect(body.artifact.commandCount).toBeGreaterThan(0)
    expect(body.artifact.returnedCommandCount).toBe(body.commands.length)
    expect(body.commands.some((command: { text?: string }) => command.text?.includes("Acme Corp"))).toBe(true)
    expect("document" in body).toBe(false)
    expect("runtime" in body).toBe(false)
    expect("pagination" in body).toBe(false)
    expect("paginated" in body).toBe(false)
    expect("pdf" in body).toBe(false)
    expect("docx" in body).toBe(false)
  })

  it("bounds command output and reports truncation", async () => {
    const response = await vnextGenerationPreviewPost(jsonRequest("http://localhost/api/vnext/generation/preview", {
      template: {
        package: fixtureValue("product-report-vnext.flowdoc.json"),
      },
      output: {
        kind: "preview",
        maxCommands: 2,
      },
    }) as never)

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.artifact.returnedCommandCount).toBe(2)
    expect(body.commands).toHaveLength(2)
    expect(body.artifact.commandCount).toBeGreaterThan(2)
    expect(body.artifact.truncated).toBe(true)
  })

  it("rejects raw document-shaped packages and non-primitive request data", async () => {
    const rawDocResponse = await vnextGenerationPreviewPost(jsonRequest("http://localhost/api/vnext/generation/preview", {
      template: {
        package: {
          version: 3,
          document: {
            id: "raw-doc",
            meta: { title: "Raw Doc" },
            sections: [],
          },
        },
      },
    }) as never)

    expect(rawDocResponse.status).toBe(400)
    await expect(rawDocResponse.json()).resolves.toMatchObject({
      error: "vNext preview artifact blocked",
      code: "VNEXT_PREVIEW_ARTIFACT_BLOCKED",
      reason: "unsupported-version",
      status: "blocked",
    })

    const invalidDataResponse = await vnextGenerationPreviewPost(jsonRequest("http://localhost/api/vnext/generation/preview", {
      template: {
        package: fixtureValue("product-report-vnext.flowdoc.json"),
      },
      data: {
        nested: { value: "not-supported" },
      },
    }) as never)

    expect(invalidDataResponse.status).toBe(400)
    await expect(invalidDataResponse.json()).resolves.toMatchObject({
      error: "Invalid vNext preview artifact data",
      code: "VNEXT_PRIMITIVE_DATA_REQUIRED",
    })
  })

  it("rejects invalid JSON, missing package, and non-preview output kind", async () => {
    const invalidJson = await vnextGenerationPreviewPost(
      rawRequest("http://localhost/api/vnext/generation/preview", "{") as never,
    )
    expect(invalidJson.status).toBe(400)
    await expect(invalidJson.json()).resolves.toMatchObject({ error: "Invalid JSON body" })

    const missingPackage = await vnextGenerationPreviewPost(jsonRequest(
      "http://localhost/api/vnext/generation/preview",
      { template: {} },
    ) as never)
    expect(missingPackage.status).toBe(400)
    await expect(missingPackage.json()).resolves.toMatchObject({
      error: "Invalid vNext preview artifact request",
      code: "VNEXT_TEMPLATE_PACKAGE_REQUIRED",
    })

    const pdfOutput = await vnextGenerationPreviewPost(jsonRequest("http://localhost/api/vnext/generation/preview", {
      template: {
        package: fixtureValue("product-report-vnext.flowdoc.json"),
      },
      output: {
        kind: "pdf",
      },
    }) as never)
    expect(pdfOutput.status).toBe(400)
    await expect(pdfOutput.json()).resolves.toMatchObject({
      error: "Invalid vNext preview artifact output kind",
      code: "VNEXT_PREVIEW_OUTPUT_KIND_REQUIRED",
    })
  })

  it("keeps vNext source imports isolated to the bridge host", () => {
    const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url))
    const imports = collectSourceFiles(sourceRoot)
      .filter((file) => readFileSync(file, "utf8").includes("vnext-workspace/src"))
      .map((file) => relative(repoRoot, file).split(sep).join("/"))

    expect(imports).toEqual([
      "app/editor/_components/vnextBridge/editorVNextBridgeHost.ts",
    ])
  }, 20_000)
})
