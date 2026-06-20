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
  nodeCount: number
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
    headerRow?: string
    primaryCell?: string
    primaryRow?: string
    bodyCell?: string
    spanCell?: string
    longTextCell?: string
    resizeTarget?: string
  }
  field?: Record<string, string | undefined>
  history?: Record<string, string | undefined>
  export?: Record<string, string | undefined>
}

function flattenTargetGroup(value: Record<string, string | undefined> | undefined): string[] {
  if (value == null) return []
  return Object.values(value).filter((item): item is string => typeof item === "string")
}

function flattenNodeTargets(targets: FixtureTargets): string[] {
  return [
    targets.typing,
    targets.node,
    targets.flowRow,
    targets.table,
    targets.history,
    targets.export,
  ].flatMap((value) => {
    if (typeof value === "string") return [value]
    if (value == null) return []
    return Object.values(value).filter((item): item is string => typeof item === "string")
  })
}

function flattenFieldTargets(targets: FixtureTargets): string[] {
  return flattenTargetGroup(targets.field)
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
      "stress-long-v2",
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
    expect(targets.typing?.pageBoundary).toBeTruthy()
    expect(targets.typing?.deepDocument).toBeTruthy()
    expect(targets.node?.delete).toBeTruthy()
    expect(targets.node?.duplicate).toBeTruthy()
    expect(targets.node?.split).toBeTruthy()
    expect(targets.node?.merge).toBeTruthy()
    expect(targets.flowRow?.resizeTarget).toBeTruthy()
    expect(targets.flowRow?.addColumnTarget).toBeTruthy()
    expect(flattenNodeTargets(targets).every((nodeId) => index.nodeById.has(nodeId))).toBe(true)
    const fieldKeys = new Set((pack.fields?.fields ?? []).map((field: { key: string }) => field.key))
    expect(flattenFieldTargets(targets).every((fieldKey) => fieldKeys.has(fieldKey))).toBe(true)
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

  it("publishes a long v2 fixture with legacy-scale document pressure", () => {
    const variant = manifest.variants.find((item) => item.id === "stress-long-v2")
    expect(variant).toBeTruthy()
    if (!variant) return

    const raw = readFixture(variant.filename)
    const pack = JSON.parse(raw)
    const section = pack.document.document.sections[0]
    const body = section.nodes[section.roots.body]

    expect(variant.nodeCount).toBeGreaterThanOrEqual(1400)
    expect(Object.keys(section.nodes).length).toBeGreaterThanOrEqual(1400)
    expect(body.childIds.length).toBeGreaterThanOrEqual(1200)
    expect(pack.mockData?.workflow).toBe("long")
    expect(pack.mockData?.targets?.typing?.pageBoundary).toBeTruthy()
    expect(pack.mockData?.targets?.typing?.deepDocument).toBeTruthy()
    expect(pack.mockData?.targets?.node?.split).toBeTruthy()
    expect(pack.mockData?.targets?.node?.merge).toBeTruthy()
  })

  it("publishes a product report v2 anchor with fields and workflow aliases", () => {
    const variant = manifest.variants.find((item) => item.id === "product-report-v2")
    expect(variant).toBeTruthy()
    if (!variant) return

    const raw = readFixture(variant.filename)
    const pack = JSON.parse(raw)
    const sectionCount = pack.document.document.sections.length
    const targets = pack.mockData?.targets as FixtureTargets
    const fieldKeys = new Set(pack.fields.fields.map((field: { key: string }) => field.key))

    expect(sectionCount).toBeGreaterThanOrEqual(3)
    expect(pack.mockData?.workflow).toBe("product-report")
    expect(pack.data?.values?.[targets.field?.reportTitle ?? ""]).toBeTruthy()
    expect(pack.data?.values?.[targets.field?.totalAmount ?? ""]).toEqual(expect.any(Number))
    expect(targets.node?.addAfter).toBeTruthy()
    expect(targets.flowRow?.summaryRow).toBe(targets.flowRow?.resizeTarget)
    expect(targets.table?.headerRow).toBeTruthy()
    expect(targets.table?.longTextCell).toBeTruthy()
    expect(targets.table?.resizeTarget).toBe(targets.table?.primaryTable)
    expect(targets.history?.primaryEdit).toBeTruthy()
    expect(targets.export?.readinessTarget).toBeTruthy()
    expect(flattenFieldTargets(targets).every((fieldKey) => fieldKeys.has(fieldKey))).toBe(true)
  })
})
