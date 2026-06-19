import { readFileSync } from "node:fs"
import { join } from "node:path"
import { assertDocumentV2, buildDocumentGraphIndexV2 } from "@/document"
import { describe, expect, it } from "vitest"
import { CURRENT_DOCUMENT_VERSION, CURRENT_PACKAGE_VERSION, parsePersistedDocument } from "../documentPersistence"

const MANIFEST_PATH = join(process.cwd(), "public/mock/flowdoc-v2-mock-manifest.json")

interface FixtureVariant {
  id: string
  filename: string
  workflow: string
  targets: FixtureTargets
}

interface FixtureManifest {
  variants: FixtureVariant[]
}

interface FixtureTargets {
  typing?: Record<string, string | undefined>
  node?: Record<string, string | undefined>
  flowRow?: Record<string, string | undefined>
  table?: {
    primaryTable?: string
    primaryCell?: string
    primaryRow?: string
    bodyCell?: string
    spanCell?: string
  }
}

function flattenTargets(targets: FixtureTargets): string[] {
  return Object.values(targets).flatMap((value) => {
    if (typeof value === "string") return [value]
    if (value == null) return []
    return Object.values(value).filter((item): item is string => typeof item === "string")
  })
}

function readManifest(): FixtureManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as FixtureManifest
}

function readFixture(filename: string): string {
  return readFileSync(join(process.cwd(), "public/mock", filename), "utf8")
}

const manifest = readManifest()

describe("DocumentNode v2 stress fixtures", () => {
  it("publishes dedicated v2 workflow variants", () => {
    expect(manifest.variants.map((variant) => variant.id)).toEqual(expect.arrayContaining([
      "stress-typing-v2",
      "stress-node-mutations-v2",
      "stress-flow-row-v2",
      "stress-table-v2",
    ]))
  })

  it.each(manifest.variants)("uses the v2 graph contract with semantic target aliases for $id", (variant) => {
    const raw = readFixture(variant.filename)
    const pack = JSON.parse(raw)
    const document = pack.document

    expect(pack.packageVersion).toBe(CURRENT_PACKAGE_VERSION)
    expect(pack.mockData?.workflow).toBe(variant.workflow)
    expect(document.version).toBe(2)
    expect(() => assertDocumentV2(document)).not.toThrow()

    const section = document.document.sections[0]
    const nodes = Object.values(section.nodes) as Array<{ type: string; nodes?: unknown }>
    expect(nodes.some((node) => node.type === "row" || node.type === "stack")).toBe(false)
    expect(nodes.some((node) => node.type === "flow-table" && "nodes" in node)).toBe(false)

    const index = buildDocumentGraphIndexV2(document)
    const targets = pack.mockData?.targets as FixtureTargets
    expect(targets.typing?.primary).toBeTruthy()
    expect(targets.typing?.boundary).toBeTruthy()
    expect(targets.node?.delete).toBeTruthy()
    expect(targets.node?.duplicate).toBeTruthy()
    expect(targets.flowRow?.resizeTarget).toBeTruthy()
    expect(targets.flowRow?.addColumnTarget).toBeTruthy()
    expect(flattenTargets(targets).every((nodeId) => index.nodeById.has(nodeId))).toBe(true)
    expect(targets.table?.primaryCell).toBeTruthy()
    expect(index.tableByDescendantId.get(targets.table?.primaryCell ?? "")).toBe(targets.table?.primaryTable)
  })

  it.each(manifest.variants)("imports $id through the current editor runtime adapter", (variant) => {
    const raw = readFixture(variant.filename)
    const result = parsePersistedDocument(raw)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.doc.version).toBe(CURRENT_DOCUMENT_VERSION)
    expect(result.package?.packageVersion).toBe(CURRENT_PACKAGE_VERSION)
    expect(result.source).toBe("package")
  })
})
