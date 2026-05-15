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
      target: { kind: "node", nodeId: "fs1", nodeType: "flow-stack" },
    })
  })
})
