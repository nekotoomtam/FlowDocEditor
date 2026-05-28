import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { summarizeFlowDocStats, unwrapFlowDocDocument } from "./flowdoc-performance-stats.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function section(nodes, childIds) {
  return {
    id: "section-1",
    type: "section",
    bodyRootId: "body-1",
    nodes: {
      "body-1": { id: "body-1", type: "body", props: {}, childIds },
      ...nodes,
    },
  }
}

function docWithSections(sections) {
  return {
    version: 1,
    document: {
      id: "stats-doc",
      meta: { title: "Stats Doc" },
      sections,
    },
  }
}

describe("unwrapFlowDocDocument", () => {
  it("accepts package and legacy document shapes", () => {
    const doc = docWithSections([section({}, [])])

    expect(unwrapFlowDocDocument(doc)).toBe(doc)
    expect(unwrapFlowDocDocument({
      packageVersion: 2,
      kind: "document",
      id: "stats-doc",
      document: doc,
      fields: { version: 1, fields: [] },
    })).toBe(doc)
  })

  it("rejects empty and invalid fixture shapes", () => {
    expect(() => unwrapFlowDocDocument({})).toThrow("FlowDoc document or package")
    expect(() => unwrapFlowDocDocument({ version: 1, document: {} })).toThrow("FlowDoc document or package")
  })
})

describe("summarizeFlowDocStats", () => {
  it("counts a small fixture without launching the app", () => {
    const doc = docWithSections([
      section({
        p1: {
          id: "p1",
          type: "paragraph",
          props: {},
          children: [
            { id: "t1", type: "text", text: "Alpha " },
            { id: "f1", type: "fieldRef", key: "customer.name", fallback: "Customer" },
          ],
        },
        h1: {
          id: "h1",
          type: "paragraph",
          props: { headingLevel: 1 },
          children: [{ id: "t2", type: "text", text: "Heading" }],
        },
        toc: { id: "toc", type: "toc", props: {} },
        row: { id: "row", type: "flow-row", props: {}, childIds: ["stack"] },
        stack: { id: "stack", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      }, ["p1", "h1", "toc", "row"]),
    ])

    expect(summarizeFlowDocStats(doc)).toEqual({
      sections: 1,
      bodyChildren: 4,
      totalNodes: 6,
      paragraphs: 2,
      headings: 1,
      tocNodes: 1,
      flowRows: 1,
      flowStacks: 1,
      flowTables: 0,
      flowTableRows: 0,
      flowTableCells: 0,
      fieldRefs: 1,
      textCharacters: 21,
    })
  })

  it("counts nested flow-table row, cell, paragraph, and fieldRef content", () => {
    const doc = docWithSections([
      section({
        table: {
          id: "table",
          type: "flow-table",
          props: {},
          rowIds: ["row-1"],
          nodes: {
            "row-1": { id: "row-1", type: "flow-table-row", props: {}, cellIds: ["cell-1"] },
            "cell-1": { id: "cell-1", type: "flow-table-cell", props: {}, childIds: ["cell-p"] },
            "cell-p": {
              id: "cell-p",
              type: "paragraph",
              props: {},
              children: [
                { id: "cell-t", type: "text", text: "Cell " },
                { id: "cell-f", type: "fieldRef", key: "amount", fallback: "100" },
              ],
            },
          },
        },
      }, ["table"]),
    ])

    expect(summarizeFlowDocStats(doc)).toMatchObject({
      totalNodes: 5,
      paragraphs: 1,
      flowTables: 1,
      flowTableRows: 1,
      flowTableCells: 1,
      fieldRefs: 1,
      textCharacters: 8,
    })
  })

  it("summarizes the stress fixture shape when available", async () => {
    const fixturePath = path.join(repoRoot, "public", "mock", "flowdoc-stress-mock.flowdoc.json")
    const parsed = JSON.parse(await readFile(fixturePath, "utf8"))
    const stats = summarizeFlowDocStats(parsed)

    expect(stats.sections).toBeGreaterThan(0)
    expect(stats.paragraphs).toBeGreaterThan(1000)
    expect(stats.tocNodes).toBeGreaterThan(0)
    expect(stats.flowRows).toBeGreaterThan(0)
    expect(stats.flowStacks).toBeGreaterThan(0)
    expect(stats.flowTables).toBeGreaterThan(0)
    expect(stats.flowTableRows).toBeGreaterThan(0)
    expect(stats.flowTableCells).toBeGreaterThan(0)
    expect(stats.fieldRefs).toBeGreaterThan(0)
    expect(stats.textCharacters).toBeGreaterThan(100000)
  })
})
