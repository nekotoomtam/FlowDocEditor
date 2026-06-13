import { describe, expect, it } from "vitest"
import {
  resolveOutlineBodyChildReorderDrop,
  resolveOutlineBodyChildReorderRequest,
  type OutlineReorderItem,
} from "../OutlinePanel"
import type { DocumentNode } from "@/schema"

function item(overrides: Partial<OutlineReorderItem> = {}): OutlineReorderItem {
  return {
    sectionId: "section",
    bodyId: "body",
    nodeId: "source",
    ...overrides,
  }
}

function listParagraph(id: string, level: number) {
  return {
    id,
    type: "paragraph",
    props: {
      list: { instanceId: "list", level, itemId: `${id}-item` },
    },
    children: [{ id: `${id}-text`, type: "text", text: id }],
  }
}

function listDoc(childIds: string[]): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds },
          p0: listParagraph("p0", 0),
          p1: listParagraph("p1", 1),
          p2: listParagraph("p2", 2),
          q0: listParagraph("q0", 0),
          q1: listParagraph("q1", 1),
          q2: listParagraph("q2", 2),
        },
      }],
    },
  } as DocumentNode
}

describe("outline panel reorder request", () => {
  it("creates a body-child reorder request for matching section and body", () => {
    expect(resolveOutlineBodyChildReorderRequest(
      item({ nodeId: "source" }),
      item({ nodeId: "target" }),
      "before",
    )).toEqual({
      sectionId: "section",
      sourceNodeId: "source",
      targetNodeId: "target",
      position: "before",
    })
  })

  it("ignores self-drops and missing drop positions", () => {
    expect(resolveOutlineBodyChildReorderRequest(
      item({ nodeId: "source" }),
      item({ nodeId: "source" }),
      "after",
    )).toBeNull()
    expect(resolveOutlineBodyChildReorderRequest(
      item({ nodeId: "source" }),
      item({ nodeId: "target" }),
      null,
    )).toBeNull()
  })

  it("ignores drops across different sections or bodies", () => {
    expect(resolveOutlineBodyChildReorderRequest(
      item({ sectionId: "section-a", nodeId: "source" }),
      item({ sectionId: "section-b", nodeId: "target" }),
      "after",
    )).toBeNull()
    expect(resolveOutlineBodyChildReorderRequest(
      item({ bodyId: "body-a", nodeId: "source" }),
      item({ bodyId: "body-b", nodeId: "target" }),
      "after",
    )).toBeNull()
  })

  it("marks list hierarchy jumps as blocked before dispatch", () => {
    const drop = resolveOutlineBodyChildReorderDrop(
      listDoc(["p0", "p1", "p2"]),
      item({ nodeId: "p1" }),
      item({ nodeId: "p2" }),
      "after",
    )

    expect(drop.request).toEqual({
      sectionId: "section",
      sourceNodeId: "p1",
      targetNodeId: "p2",
      position: "after",
    })
    expect(drop.blockedReason).toBe("invalid-list-hierarchy")
  })

  it("allows list hierarchy preserving drops", () => {
    const drop = resolveOutlineBodyChildReorderDrop(
      listDoc(["p0", "p1", "p2", "q0", "q1", "q2"]),
      item({ nodeId: "p2" }),
      item({ nodeId: "q2" }),
      "after",
    )

    expect(drop.request).toEqual({
      sectionId: "section",
      sourceNodeId: "p2",
      targetNodeId: "q2",
      position: "after",
    })
    expect(drop.blockedReason).toBeNull()
  })

  it("checks list hierarchy through nested body-child containers", () => {
    const doc = listDoc(["p0", "row"])
    const section = doc.document.sections[0]
    section.nodes.row = { id: "row", type: "flow-row", props: {}, childIds: ["stack"] }
    section.nodes.stack = { id: "stack", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] }
    delete section.nodes.p2
    delete section.nodes.q0
    delete section.nodes.q1
    delete section.nodes.q2

    const drop = resolveOutlineBodyChildReorderDrop(
      doc,
      item({ nodeId: "row" }),
      item({ nodeId: "p0" }),
      "before",
    )

    expect(drop.blockedReason).toBe("invalid-list-hierarchy")
  })
})
