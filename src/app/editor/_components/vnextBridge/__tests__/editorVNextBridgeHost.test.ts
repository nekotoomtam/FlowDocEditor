import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { createEditorVNextBridgeHostSnapshot } from "../editorVNextBridgeHost"

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

describe("editor vNext bridge host", () => {
  it("returns a bounded read-only snapshot from a canonical vNext package", () => {
    const result = createEditorVNextBridgeHostSnapshot(
      fixtureValue("product-report-vnext.flowdoc.json"),
      { measurementProfileId: "parent-host-test" },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reason)

    expect(result.snapshot).toMatchObject({
      source: "editor-vnext-bridge-host",
      input: "canonical-vnext-package",
      packageVersion: 2,
      documentVersion: 3,
      rendererConsumption: {
        mayRelayout: false,
        requiresAuthoredDocumentForLayout: false,
      },
    })
    expect(result.snapshot.documentId).toBe("product-report-vnext")
    expect(result.snapshot.pageCount).toBeGreaterThanOrEqual(3)
    expect(result.snapshot.graph.nodeCount).toBeGreaterThan(0)
    expect(result.snapshot.rendererConsumption.commandCount).toBeGreaterThan(0)
    expect(result.snapshot.supportedOperationKinds).toEqual(expect.arrayContaining([
      "node.delete",
      "text-block.text.replace",
      "table.row.insert",
    ]))
    expect("runtime" in result.snapshot).toBe(false)
    expect("pagination" in result.snapshot).toBe(false)
  })

  it("rejects raw document-shaped input instead of current runtime documents", () => {
    const result = createEditorVNextBridgeHostSnapshot({
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
      packageVersion: null,
      documentVersion: null,
      pageCount: 0,
    })
    expect(result.snapshot.issues.length).toBeGreaterThan(0)
  })

  it("keeps the parent app vNext import boundary to one host module", () => {
    const sourceRoot = fileURLToPath(new URL("../../../../../../src/app", import.meta.url))
    const imports = collectSourceFiles(sourceRoot)
      .filter((file) => readFileSync(file, "utf8").includes("vnext-workspace/src"))
      .map((file) => relative(repoRoot, file).split(sep).join("/"))

    expect(imports).toEqual([
      "src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts",
    ])
  }, 20_000)
})
