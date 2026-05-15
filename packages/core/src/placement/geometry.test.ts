import { describe, expect, it } from "vitest"
import type { DocumentNode, LayoutNode } from "../schema"
import { pt } from "../schema"
import { detectPlacementTarget } from "./geometry"

function makeDoc(nodes: Record<string, LayoutNode>, childIds: string[]): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds },
          ...nodes,
        },
      }],
    },
  }
}

function makeParagraph(id: string, text: string): LayoutNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "default",
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

describe("placement geometry flow-stack targets", () => {
  it("treats the center of a flow-stack as an insertable container target", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: [] },
    }, ["fr1"])

    const target = detectPlacementTarget({
      document: doc,
      hoveredNodeId: "fs1",
      hoveredNodeType: "flow-stack",
      localX: 50,
      localY: 12,
      width: 100,
      height: 24,
      source: { source: "palette", blockType: "paragraph" },
    })

    expect(target).toEqual({
      zone: "center",
      target: { kind: "row-stack-inner", rowId: "fr1", stackId: "fs1" },
    })
  })

  it("maps a flow-row hit to the hovered flow-stack column", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
      p1: makeParagraph("p1", "Left"),
    }, ["fr1"])

    const target = detectPlacementTarget({
      document: doc,
      hoveredNodeId: "fr1",
      hoveredNodeType: "flow-row",
      localX: 75,
      localY: 12,
      width: 100,
      height: 24,
      source: { source: "palette", blockType: "paragraph" },
    })

    expect(target).toEqual({
      zone: "center",
      target: { kind: "row-stack-inner", rowId: "fr1", stackId: "fs2" },
    })
  })

  it("keeps paragraph hits inside a flow-stack available for vertical insertion", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p2: makeParagraph("p2", "Right"),
    }, ["fr1"])

    const target = detectPlacementTarget({
      document: doc,
      hoveredNodeId: "p2",
      hoveredNodeType: "paragraph",
      localX: 50,
      localY: 12,
      width: 100,
      height: 24,
      source: { source: "palette", blockType: "paragraph" },
    })

    expect(target).toEqual({
      zone: "bottom",
      target: { kind: "node", nodeId: "p2", nodeType: "paragraph" },
    })
  })
})
