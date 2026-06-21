import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { POST as vnextGenerationReadinessPost } from "../vnext/generation/readiness/route"

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

describe("vNext generation readiness route", () => {
  it("returns readiness diagnostics for a canonical vNext package request", async () => {
    const response = await vnextGenerationReadinessPost(jsonRequest("http://localhost/api/vnext/generation/readiness", {
      requestId: "generation-readiness-test",
      template: {
        package: fixtureValue("product-report-vnext.flowdoc.json"),
      },
      data: {
        customer: "Acme",
      },
      output: {
        kind: "pdf",
        measurementProfileId: "vnext-generation-readiness-test",
      },
    }) as never)

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toMatchObject({
      source: "vnext-generation-readiness-api",
      mode: "readiness-diagnostic",
      requestId: "generation-readiness-test",
      output: {
        kind: "pdf",
        artifactRendered: false,
      },
      template: {
        input: "canonical-vnext-package",
        documentId: "product-report-vnext",
        packageVersion: 2,
        documentVersion: 3,
      },
      generation: {
        requestData: "provided-not-consumed",
        requestDataConsumed: false,
        bindingRuntimeView: "not-materialized",
        outputArtifact: "not-rendered",
        currentApiRoutes: "not-replaced",
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
    expect(body.bridge.pageCount).toBeGreaterThanOrEqual(3)
    expect(body.bridge.graphNodeCount).toBeGreaterThan(0)
    expect("document" in body).toBe(false)
    expect("runtime" in body).toBe(false)
    expect("pagination" in body).toBe(false)
    expect("paginated" in body).toBe(false)
  })

  it("rejects raw document-shaped requests instead of treating them as vNext packages", async () => {
    const response = await vnextGenerationReadinessPost(jsonRequest("http://localhost/api/vnext/generation/readiness", {
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

    expect(response.status).toBe(400)
    const body = await response.json()

    expect(body).toMatchObject({
      error: "vNext generation readiness blocked",
      code: "VNEXT_GENERATION_READINESS_BLOCKED",
      reason: "unsupported-version",
      status: "blocked",
      template: {
        documentId: null,
        packageVersion: null,
        documentVersion: null,
      },
      generation: {
        requestData: "not-provided",
        requestDataConsumed: false,
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
    expect(body.issues.length).toBeGreaterThan(0)
  })

  it("rejects invalid JSON and missing template package requests", async () => {
    const invalidJson = await vnextGenerationReadinessPost(
      rawRequest("http://localhost/api/vnext/generation/readiness", "{") as never,
    )
    expect(invalidJson.status).toBe(400)
    await expect(invalidJson.json()).resolves.toMatchObject({ error: "Invalid JSON body" })

    const missingPackage = await vnextGenerationReadinessPost(jsonRequest(
      "http://localhost/api/vnext/generation/readiness",
      { template: {} },
    ) as never)
    expect(missingPackage.status).toBe(400)
    await expect(missingPackage.json()).resolves.toMatchObject({
      error: "Invalid vNext generation request",
      code: "VNEXT_TEMPLATE_PACKAGE_REQUIRED",
    })
  })
})
