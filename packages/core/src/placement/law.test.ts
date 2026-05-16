import { describe, expect, it } from "vitest"
import type { DocumentNode, LayoutNode } from "../schema"
import { pt } from "../schema"
import { resolvePlacementLaw } from "./law"

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

describe("placement law flow-row / flow-stack sources", () => {
  it("allows flow-columns palette insertion into the body", () => {
    const doc = makeDoc({}, [])
    const result = resolvePlacementLaw(
      doc,
      {
        zone: "center",
        intent: "insertInside",
        target: { kind: "node", nodeId: "body", nodeType: "body" },
      },
      { source: "palette", blockType: "flow-columns" },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.operation).toEqual({
      kind: "insert-into-container",
      containerId: "body",
      containerType: "body",
      index: 0,
    })
  })

  it("rejects flow-columns inside old stack containers", () => {
    const doc = makeDoc({
      row1: { id: "row1", type: "row", props: {}, childIds: ["stack1"] },
      stack1: { id: "stack1", type: "stack", props: { widthShare: 100 }, childIds: [] },
    }, ["row1"])

    const result = resolvePlacementLaw(
      doc,
      {
        zone: "center",
        intent: "insertInside",
        target: { kind: "node", nodeId: "stack1", nodeType: "stack" },
      },
      { source: "palette", blockType: "flow-columns" },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("invalid-parent")
  })

  it("does not expand an old row with a flow-row source", () => {
    const doc = makeDoc({
      row1: { id: "row1", type: "row", props: {}, childIds: ["stack1"] },
      stack1: { id: "stack1", type: "stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1: {
        id: "p1",
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
        children: [{ id: "t1", type: "text", text: "inside" }],
      },
    }, ["row1"])

    const result = resolvePlacementLaw(
      doc,
      {
        zone: "left",
        intent: "insertLeft",
        target: { kind: "node", nodeId: "p1", nodeType: "paragraph" },
      },
      { source: "palette", blockType: "flow-columns" },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("invalid-zone")
  })

  it("treats the Columns palette block as flow-backed instead of expanding old rows", () => {
    const doc = makeDoc({
      row1: { id: "row1", type: "row", props: {}, childIds: ["stack1"] },
      stack1: { id: "stack1", type: "stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1: makeParagraph("p1", "inside"),
    }, ["row1"])

    const result = resolvePlacementLaw(
      doc,
      {
        zone: "left",
        intent: "insertLeft",
        target: { kind: "node", nodeId: "p1", nodeType: "paragraph" },
      },
      { source: "palette", blockType: "columns" },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("invalid-zone")
  })

  it("treats flow-stack nodes as structural drag sources", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: [] },
    }, ["fr1"])

    const result = resolvePlacementLaw(
      doc,
      {
        zone: "center",
        intent: "insertInside",
        target: { kind: "node", nodeId: "body", nodeType: "body" },
      },
      { source: "document", nodeId: "fs1" },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("invalid-source")
  })

  it("allows paragraph insertion into a flow-stack center", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: [] },
    }, ["fr1"])

    const result = resolvePlacementLaw(
      doc,
      {
        zone: "center",
        intent: "insertInside",
        target: { kind: "node", nodeId: "fs1", nodeType: "flow-stack" },
      },
      { source: "palette", blockType: "paragraph" },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.operation).toEqual({
      kind: "insert-into-container",
      containerId: "fs1",
      containerType: "flow-stack",
      index: 0,
    })
  })

  it("rejects non-content blocks inside a flow-stack", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: [] },
    }, ["fr1"])

    const result = resolvePlacementLaw(
      doc,
      {
        zone: "center",
        intent: "insertInside",
        target: { kind: "node", nodeId: "fs1", nodeType: "flow-stack" },
      },
      { source: "palette", blockType: "table" },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("invalid-parent")
  })

  it("allows paragraph insertion into a flow-stack through a flow-row column target", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
      p1: makeParagraph("p1", "Left"),
    }, ["fr1"])

    const result = resolvePlacementLaw(
      doc,
      {
        zone: "center",
        intent: "insertInside",
        target: { kind: "row-stack-inner", rowId: "fr1", stackId: "fs2" },
      },
      { source: "palette", blockType: "paragraph" },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.operation).toEqual({
      kind: "insert-into-container",
      containerId: "fs2",
      containerType: "flow-stack",
      index: 0,
    })
  })

  it("does not expand a flow-row from a paragraph drag on a column edge", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
    }, ["fr1"])

    const result = resolvePlacementLaw(
      doc,
      {
        zone: "right",
        intent: "insertRight",
        target: { kind: "row-stack-inner", rowId: "fr1", stackId: "fs1" },
      },
      { source: "palette", blockType: "paragraph" },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("invalid-zone")
  })
})
