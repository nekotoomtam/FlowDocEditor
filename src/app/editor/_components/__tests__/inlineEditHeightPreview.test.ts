import { describe, expect, it } from "vitest"
import type { DocumentNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import { resizeFragmentHeightAndShift } from "../inlineEditHeightPreview"

const doc = {
  version: 1,
  document: { id: "doc", sections: [] },
} as unknown as DocumentNode

const flowDoc = {
  version: 1,
  document: {
    id: "doc",
    sections: [{
      id: "s1",
      type: "section",
      bodyRootId: "body",
      page: {
        size: "A4",
        orientation: "portrait",
        margin: {
          top: { value: 10, unit: "pt" },
          right: { value: 10, unit: "pt" },
          bottom: { value: 10, unit: "pt" },
          left: { value: 10, unit: "pt" },
        },
      },
      nodes: {
        body: { id: "body", type: "body", props: {}, childIds: ["fr1", "below"] },
        fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
        fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1", "p3"] },
        fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
        p1: { id: "p1", type: "paragraph", props: {}, children: [] },
        p2: { id: "p2", type: "paragraph", props: {}, children: [] },
        p3: { id: "p3", type: "paragraph", props: {}, children: [] },
        below: { id: "below", type: "paragraph", props: {}, children: [] },
      },
    }],
  },
} as unknown as DocumentNode

function makePaginated(): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [{
      sectionId: "s1",
      pages: [{
        index: 0,
        width: 200,
        height: 300,
        contentBox: { x: 10, y: 10, width: 180, height: 280 },
        headerFragments: [],
        footerFragments: [],
        fragments: [
          {
            nodeId: "p1",
            nodeType: "paragraph",
            pageIndex: 0,
            x: 10,
            y: 20,
            width: 100,
            height: 20,
            lines: [{ text: "A", x: 10, y: 20, width: 10, height: 20 }],
          },
          {
            nodeId: "p2",
            nodeType: "paragraph",
            pageIndex: 0,
            x: 10,
            y: 50,
            width: 100,
            height: 20,
            lines: [{ text: "B", x: 10, y: 50, width: 10, height: 20 }],
          },
        ],
      }],
    }],
  }
}

function flowParagraph(nodeId: string, parentNodeId: string, y: number, height: number, x = 10) {
  return {
    nodeId,
    nodeType: "paragraph" as const,
    parentNodeId,
    pageIndex: 0,
    x,
    y,
    width: 80,
    height,
    lines: [{ text: nodeId, x, y, width: 10, height }],
  }
}

function makeFlowPaginated(): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [{
      sectionId: "s1",
      pages: [{
        index: 0,
        width: 220,
        height: 300,
        contentBox: { x: 10, y: 10, width: 200, height: 280 },
        headerFragments: [],
        footerFragments: [],
        fragments: [
          {
            nodeId: "fr1",
            nodeType: "flow-row",
            pageIndex: 0,
            x: 10,
            y: 10,
            width: 180,
            height: 35,
            fragmentIndex: 0,
          },
          {
            nodeId: "fs1",
            nodeType: "flow-stack",
            parentNodeId: "fr1",
            pageIndex: 0,
            x: 10,
            y: 10,
            width: 85,
            height: 35,
            fragmentIndex: 0,
          },
          {
            nodeId: "fs2",
            nodeType: "flow-stack",
            parentNodeId: "fr1",
            pageIndex: 0,
            x: 105,
            y: 10,
            width: 85,
            height: 35,
            fragmentIndex: 0,
          },
          flowParagraph("p1", "fs1", 10, 20),
          flowParagraph("p2", "fs2", 10, 30, 105),
          flowParagraph("p3", "fs1", 35, 10),
          flowParagraph("below", "body", 60, 10),
        ],
      }],
    }],
  }
}

describe("resizeFragmentHeightAndShift", () => {
  it("patches the active paragraph height and shifts following same-page fragments", () => {
    const next = resizeFragmentHeightAndShift(makePaginated(), doc, "p1", 32, 0)
    const fragments = next.sections[0].pages[0].fragments

    expect(fragments[0].height).toBe(32)
    expect(fragments[1].y).toBe(62)
    expect(fragments[1].lines?.[0].y).toBe(62)
  })

  it("does not shift when the active fragment height is unchanged", () => {
    const original = makePaginated()
    const next = resizeFragmentHeightAndShift(original, doc, "p1", 20.25, 0)

    expect(next).toBe(original)
  })

  it("patches flow-row and sibling flow-stack heights during same-page inline growth", () => {
    const next = resizeFragmentHeightAndShift(makeFlowPaginated(), flowDoc, "p1", 40, 0)
    const fragments = next.sections[0].pages[0].fragments
    const byId = new Map(fragments.map((fragment) => [fragment.nodeId, fragment]))

    expect(byId.get("p1")?.height).toBe(40)
    expect(byId.get("fr1")?.height).toBe(55)
    expect(byId.get("fs1")?.height).toBe(55)
    expect(byId.get("fs2")?.height).toBe(55)
    expect(byId.get("p3")?.y).toBe(55)
    expect(byId.get("p3")?.lines?.[0].y).toBe(55)
    expect(byId.get("below")?.y).toBe(80)
    expect(byId.get("below")?.lines?.[0].y).toBe(80)
  })

  it("shrinks flow-row and sibling flow-stack heights during same-page inline deletion", () => {
    const next = resizeFragmentHeightAndShift(makeFlowPaginated(), flowDoc, "p1", 12, 0)
    const fragments = next.sections[0].pages[0].fragments
    const byId = new Map(fragments.map((fragment) => [fragment.nodeId, fragment]))

    expect(byId.get("p1")?.height).toBe(12)
    expect(byId.get("fr1")?.height).toBe(30)
    expect(byId.get("fs1")?.height).toBe(30)
    expect(byId.get("fs2")?.height).toBe(30)
    expect(byId.get("p3")?.y).toBe(27)
    expect(byId.get("p3")?.lines?.[0].y).toBe(27)
    expect(byId.get("below")?.y).toBe(55)
    expect(byId.get("below")?.lines?.[0].y).toBe(55)
  })
})
