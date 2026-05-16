import { describe, expect, it } from "vitest"
import { flowSection } from "../flow"
import { defaultTextMeasurer, defaultWordBreaker } from "../types"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

const CX = 72
const CW = 451
const FS = 10

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePara(id: string, text: string): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(FS),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE,
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function measureFlowRow(doc: DocumentNode) {
  const section = doc.document.sections[0]
  const body = flowSection(section, CX, CW, defaultTextMeasurer, defaultWordBreaker)
  const row = body.children.find((child) => child.nodeType === "flow-row")
  if (!row) throw new Error("flow-row not found")
  return row
}

describe("flow-row / flow-stack measurement", () => {
  it("distributes two flow-stack widths across the content box", () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const row = measureFlowRow(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }))

    const [left, right] = row.children
    expect(left.nodeType).toBe("flow-stack")
    expect(right.nodeType).toBe("flow-stack")
    expect(left.width + right.width).toBeCloseTo(CW, 0)
  })

  it("distributes three flow-stacks without assuming left/right only", () => {
    const p1 = makePara("p1", "A")
    const p2 = makePara("p2", "B")
    const p3 = makePara("p3", "C")
    const row = measureFlowRow(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2", "fs3"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p2"] },
      fs3: { id: "fs3", type: "flow-stack", props: { widthShare: 33.34 }, childIds: ["p3"] },
      p1,
      p2,
      p3,
    }))

    const widthSum = row.children.reduce((sum, child) => sum + child.width, 0)
    expect(row.children).toHaveLength(3)
    expect(widthSum).toBeCloseTo(CW, 0)
  })

  it("applies flow-row gap between adjacent flow-stacks", () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const row = measureFlowRow(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: { gap: 12 }, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }))

    const [left, right] = row.children
    expect(left.width + right.width).toBeCloseTo(CW - 12, 0)
    expect(right.x).toBeCloseTo(left.x + left.width + 12, 0)
  })

  it("aligns sibling flow-stack heights to the flow-row height", () => {
    const p1 = makePara("p1", "Short")
    const p2 = makePara("p2", "A\nB\nC\nD")
    const row = measureFlowRow(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }))

    expect(row.height).toBeGreaterThan(row.children[0].children[0].height)
    expect(row.children[0].height).toBe(row.height)
    expect(row.children[1].height).toBe(row.height)
  })

  it("insets flow-stack children by authored box padding and borders", () => {
    const p1 = makePara("p1", "Inset")
    const row = measureFlowRow(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: {
        id: "fs1",
        type: "flow-stack",
        props: {
          widthShare: 100,
          box: {
            padding: { top: pt(4), right: pt(6), bottom: pt(8), left: pt(10) },
            border: {
              top: { style: "solid", width: pt(1), color: "111111" },
              right: { style: "solid", width: pt(2), color: "222222" },
              bottom: { style: "solid", width: pt(3), color: "333333" },
              left: { style: "solid", width: pt(4), color: "444444" },
            },
          },
        },
        childIds: ["p1"],
      },
      p1,
    }))

    const stack = row.children[0]
    const child = stack.children[0]
    expect(child.x).toBeCloseTo(stack.x + 14, 2)
    expect(child.y).toBeCloseTo(stack.y + 5, 2)
    expect(child.width).toBeCloseTo(stack.width - 22, 2)
    expect(stack.height).toBeCloseTo(child.height + 16, 2)
  })
})
