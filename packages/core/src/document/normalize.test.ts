import { describe, expect, it } from "vitest"
import type { DocumentNode, LayoutNode } from "../schema"
import { pt } from "../schema"
import { normalizeDocument } from "./normalize"

function makeDoc(nodes: Record<string, LayoutNode>, childIds: string[]): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      meta: { title: "Normalize props" },
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

describe("normalizeDocument", () => {
  it("preserves paragraph heading and keep-with-next props", () => {
    const doc = makeDoc({
      p1: {
        id: "p1",
        type: "paragraph",
        props: {
          align: "left",
          fontSize: pt(12),
          lineHeight: 1.5,
          spacingBefore: pt(0),
          spacingAfter: pt(8),
          textIndent: pt(0),
          indentLeft: pt(0),
          indentRight: pt(0),
          headingLevel: 2,
          keepWithNext: true,
        },
        children: [{ id: "t1", type: "text", text: "Heading" }],
      },
    }, ["p1"])

    const paragraph = normalizeDocument(doc).document.sections[0].nodes.p1
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.props.headingLevel).toBe(2)
    expect(paragraph.props.keepWithNext).toBe(true)
  })

  it("preserves row minHeight", () => {
    const doc = makeDoc({
      row1: { id: "row1", type: "row", props: { minHeight: 96 }, childIds: ["st1"] },
      st1: { id: "st1", type: "stack", props: { widthShare: 100, minHeight: 24 }, childIds: [] },
    }, ["row1"])

    const row = normalizeDocument(doc).document.sections[0].nodes.row1
    expect(row.type).toBe("row")
    if (row.type !== "row") return
    expect(row.props.minHeight).toBe(96)
  })
})
