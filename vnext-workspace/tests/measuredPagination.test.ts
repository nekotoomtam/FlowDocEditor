import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { AuthoredNode, DocumentNode, InlineNode, TextBlockRole } from "../src/schema/document.js"
import { parseFlowDocPackageV2DocumentVNext } from "../src/persistence/package.js"
import {
  createApproximateVNextTextMeasurer,
  paginateVNextDocument,
} from "../src/pagination/measuredPagination.js"

function pt(value: number) {
  return { value, unit: "pt" as const }
}

function textBlock(id: string, children: InlineNode[], role?: TextBlockRole): AuthoredNode
function textBlock(id: string, text: string, role?: TextBlockRole): AuthoredNode
function textBlock(id: string, content: string | InlineNode[], role: TextBlockRole = { role: "paragraph" }): AuthoredNode {
  return {
    id,
    type: "text-block",
    role,
    props: {},
    children: typeof content === "string"
      ? [{ id: `${id}-text`, type: "text", text: content }]
      : content,
  }
}

function pageBreakDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "measured-page-break-doc",
      meta: { title: "Measured Page Break" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          pageNumberStart: 7,
          margin: {
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
          footerReserved: 36,
          headerFooterHorizontalMode: "body",
        },
        zoneIds: ["body-zone", "footer-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["before", "break", "after"] },
          "footer-zone": { id: "footer-zone", type: "zone", role: "footer", childIds: ["footer-page"] },
          before: textBlock("before", "Before the break"),
          break: { id: "break", type: "page-break", props: {} },
          after: textBlock("after", [
            { id: "after-prefix", type: "text", text: "Current page " },
            { id: "after-page", type: "page-number" },
          ]),
          "footer-page": textBlock("footer-page", [
            { id: "footer-label", type: "text", text: "Page " },
            { id: "footer-number", type: "page-number" },
          ], { role: "label" }),
        },
      }],
    },
  }
}

function longTextDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "measured-long-text-doc",
      meta: { title: "Measured Long Text" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: pt(360),
            right: pt(72),
            bottom: pt(360),
            left: pt(72),
          },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["long"] },
          long: textBlock("long", "x".repeat(1000)),
        },
      }],
    },
  }
}

function parseFixture(name: string) {
  const fixtureUrl = new URL(`../fixtures/${name}`, import.meta.url)
  const raw = readFileSync(fixtureUrl, "utf8")
  return parseFlowDocPackageV2DocumentVNext(JSON.parse(raw))
}

describe("vNext measured pagination skeleton", () => {
  it("forces a new page for page-break and resolves page-number fragments", () => {
    const pagination = paginateVNextDocument(pageBreakDoc())

    expect(pagination).toMatchObject({
      documentId: "measured-page-break-doc",
      source: "vnext-pagination-plan",
      status: "measured-skeleton",
      measurementStatus: "measured",
      pageCount: 2,
    })

    const afterFragment = pagination.pages[1]?.fragments.find((fragment) => fragment.nodeId === "after")
    const footerTexts = pagination.pages.map((page) => (
      page.fragments.find((fragment) => fragment.nodeId === "footer-page")?.text
    ))

    expect(afterFragment).toMatchObject({
      nodeType: "text-block",
      kind: "text",
      pageIndex: 1,
      pageNumber: 8,
      text: "Current page 8",
    })
    expect(footerTexts).toEqual(["Page 7", "Page 8"])
    expect(pagination.pages[0]?.fragments.some((fragment) => fragment.nodeId === "break" && fragment.kind === "forced-break")).toBe(true)
  })

  it("splits long text-block output into page fragments instead of relayouting in a renderer", () => {
    const pagination = paginateVNextDocument(longTextDoc(), {
      textMeasurer: createApproximateVNextTextMeasurer({ charWidthPt: 5, lineHeightPt: 50 }),
    })
    const fragments = pagination.pages.flatMap((page) => page.fragments).filter((fragment) => fragment.nodeId === "long")

    expect(pagination.pageCount).toBeGreaterThan(1)
    expect(fragments.length).toBeGreaterThan(1)
    expect(fragments[0]).toMatchObject({
      lineStart: 0,
      continuesFromPreviousPage: false,
      continuesOnNextPage: true,
    })
    expect(fragments.at(-1)).toMatchObject({
      continuesFromPreviousPage: true,
      continuesOnNextPage: false,
    })
    expect(fragments.every((fragment) => fragment.splitPolicy === "line")).toBe(true)
  })

  it("measures the product-shaped vNext fixture with canonical nodes only", () => {
    const pack = parseFixture("product-report-vnext.flowdoc.json")
    const pagination = paginateVNextDocument(pack.document, { data: pack.data?.values })
    const nodeTypes = pagination.pages.flatMap((page) => page.fragments.map((fragment) => fragment.nodeType))

    expect(pagination.pageCount).toBeGreaterThanOrEqual(3)
    expect(nodeTypes).toContain("text-block")
    expect(nodeTypes).not.toContain("paragraph")
    expect(nodeTypes).not.toContain("flow-row")
    expect(pagination.pages.some((page) => (
      page.fragments.some((fragment) => fragment.nodeId.endsWith("footer-page") && fragment.text?.startsWith("Page "))
    ))).toBe(true)
  })

  it("keeps measured pagination independent from the parent runtime and old names", () => {
    const sourceUrl = new URL("../src/pagination/measuredPagination.ts", import.meta.url)
    const source = readFileSync(sourceUrl, "utf8")

    expect(source).not.toMatch(/\.\.\/\.\.\/packages/)
    expect(source).not.toMatch(/\.\.\/\.\.\/src\/app/)
    expect(source).not.toContain("flow-row")
    expect(source).not.toContain("flow-stack")
    expect(source).not.toContain("paragraph.split")
  })
})
