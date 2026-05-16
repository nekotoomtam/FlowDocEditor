import { describe, expect, it } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, PageSettings, ParagraphNode } from "../../schema"
import type { PageFragment } from "../types"

const CX = 72
const CW = 451
const FS = 10

const PAGE: PageSettings = {
  size: "A4",
  orientation: "portrait",
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePara(id: string, text: string, fontSize = FS): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(fontSize),
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

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>, page: PageSettings = PAGE): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "sec",
        type: "section",
        page,
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

function allFragments(doc: DocumentNode) {
  return paginate(doc).sections[0].pages.flatMap((page) => page.fragments)
}

function structuralSignature(doc: DocumentNode): string {
  const result = paginate(doc)
  return JSON.stringify(result.sections[0].pages.map((page) => ({
    index: page.index,
    fragments: page.fragments.map((fragment) => ({
      id: fragment.nodeId,
      type: fragment.nodeType,
      parent: fragment.parentNodeId,
      x: Math.round(fragment.x * 100) / 100,
      y: Math.round(fragment.y * 100) / 100,
      w: Math.round(fragment.width * 100) / 100,
      h: Math.round(fragment.height * 100) / 100,
      lineStart: fragment.lineStart,
      lineEnd: fragment.lineEnd,
      text: fragment.lines?.map((line) => line.text),
    })),
  })))
}

function paragraphLineTexts(fragments: PageFragment[], nodeId: string): string[] {
  return fragments
    .filter((fragment) => fragment.nodeId === nodeId && fragment.nodeType === "paragraph")
    .flatMap((fragment) => fragment.lines?.map((line) => line.text) ?? [])
}

describe("flow-row / flow-stack pagination", () => {
  it("emits one-page flow-row, flow-stack, and child fragments", () => {
    const p1 = makePara("p1", "Left")
    const p2 = makePara("p2", "Right")
    const result = paginate(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }))

    expect(() => assertPaginatedDocument(result)).not.toThrow()
    const fragments = result.sections[0].pages[0].fragments
    expect(fragments.some((f) => f.nodeId === "fr1" && f.nodeType === "flow-row")).toBe(true)
    expect(fragments.some((f) => f.nodeId === "fs1" && f.nodeType === "flow-stack" && f.parentNodeId === "fr1")).toBe(true)
    expect(fragments.some((f) => f.nodeId === "p1" && f.nodeType === "paragraph" && f.parentNodeId === "fs1")).toBe(true)
  })

  it("carries flow-stack box render props and insets child paragraph geometry", () => {
    const p1 = makePara("p1", "Inset stack")
    const result = paginate(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: {
        id: "fs1",
        type: "flow-stack",
        props: {
          widthShare: 100,
          box: {
            fill: "F8FAFC",
            padding: { top: pt(3), right: pt(5), bottom: pt(7), left: pt(11) },
            border: {
              top: { style: "solid", width: pt(1), color: "111111" },
              left: { style: "solid", width: pt(2), color: "222222" },
            },
          },
        },
        childIds: ["p1"],
      },
      p1,
    }))

    expect(() => assertPaginatedDocument(result)).not.toThrow()
    const fragments = result.sections[0].pages[0].fragments
    const stack = fragments.find((f) => f.nodeId === "fs1" && f.nodeType === "flow-stack")
    const paragraph = fragments.find((f) => f.nodeId === "p1" && f.nodeType === "paragraph")
    expect(stack?.boxRenderProps).toMatchObject({
      fill: "F8FAFC",
      padding: { top: 3, right: 5, bottom: 7, left: 11 },
    })
    expect(stack?.boxRenderProps?.border.left).toMatchObject({ style: "solid", width: 2, color: "222222" })
    expect(paragraph?.x).toBeCloseTo((stack?.x ?? 0) + 13, 2)
    expect(paragraph?.y).toBeCloseTo((stack?.y ?? 0) + 4, 2)
    expect(paragraph?.width).toBeCloseTo((stack?.width ?? 0) - 18, 2)
  })

  it("emits placeholder fragments for an empty inserted flow-row", () => {
    const result = paginate(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50, minHeight: 24 }, childIds: [] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50, minHeight: 24 }, childIds: [] },
    }))

    expect(() => assertPaginatedDocument(result)).not.toThrow()
    const fragments = result.sections[0].pages[0].fragments
    const row = fragments.find((f) => f.nodeId === "fr1" && f.nodeType === "flow-row")
    const stacks = fragments.filter((f) => f.parentNodeId === "fr1" && f.nodeType === "flow-stack")
    expect(row?.height).toBe(24)
    expect(stacks).toHaveLength(2)
    expect(stacks.map((f) => f.height)).toEqual([24, 24])
    expect(stacks.reduce((sum, fragment) => sum + fragment.width, 0)).toBeCloseTo(CW, 0)
  })

  it("keeps empty authored flow-stack chrome visible beside active content", () => {
    const p1 = makePara("p1", "Left only")
    const fragments = allFragments(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2", "fs3", "fs4"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 25 }, childIds: [] },
      fs3: { id: "fs3", type: "flow-stack", props: { widthShare: 12.5 }, childIds: [] },
      fs4: { id: "fs4", type: "flow-stack", props: { widthShare: 12.5 }, childIds: [] },
      p1,
    }))

    const stacks = fragments.filter((fragment) => fragment.parentNodeId === "fr1" && fragment.nodeType === "flow-stack")
    expect(stacks.map((fragment) => fragment.nodeId)).toEqual(["fs1", "fs2", "fs3", "fs4"])
    expect(stacks.reduce((sum, fragment) => sum + fragment.width, 0)).toBeCloseTo(CW, 0)
    expect(fragments.filter((fragment) => fragment.nodeType === "paragraph")).toHaveLength(1)
  })

  it("keeps three-stack width math general", () => {
    const p1 = makePara("p1", "A")
    const p2 = makePara("p2", "B")
    const p3 = makePara("p3", "C")
    const fragments = allFragments(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2", "fs3"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p2"] },
      fs3: { id: "fs3", type: "flow-stack", props: { widthShare: 33.34 }, childIds: ["p3"] },
      p1,
      p2,
      p3,
    }))

    const stacks = ["fs1", "fs2", "fs3"].map((id) => fragments.find((f) => f.nodeId === id && f.nodeType === "flow-stack")!)
    expect(stacks).toHaveLength(3)
    expect(stacks.reduce((sum, fragment) => sum + fragment.width, 0)).toBeCloseTo(CW, 0)
    expect(stacks[0].x).toBe(CX)
  })

  it("continues one stack for multiple pages while the sibling ends early", () => {
    const longText = Array.from({ length: 150 }, (_, index) => `L${index}`).join("\n")
    const p1 = makePara("p1", longText)
    const p2 = makePara("p2", "Short")
    const result = paginate(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }))

    expect(() => assertPaginatedDocument(result)).not.toThrow()
    const fragments = result.sections[0].pages.flatMap((page) => page.fragments)
    const rowFragments = fragments.filter((f) => f.nodeId === "fr1" && f.nodeType === "flow-row")
    const shortFragments = fragments.filter((f) => f.nodeId === "p2")
    const longFragments = fragments.filter((f) => f.nodeId === "p1")
    expect(rowFragments.length).toBeGreaterThanOrEqual(3)
    expect(shortFragments).toHaveLength(1)
    expect(longFragments.length).toBe(rowFragments.length)
    expect(rowFragments[0].isContinued).toBe(true)
    expect(rowFragments.at(-1)?.isContinued).toBe(false)
  })

  it("pulls following body blocks upward when a split flow-row shrinks", () => {
    const below = makePara("below", "Below the flow row")
    const makeFlowDoc = (lineCount: number) => makeDoc(["fr1", "below"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1: makePara("p1", Array.from({ length: lineCount }, (_, index) => `line-${index}`).join("\n")),
      below,
    })

    const tallBelow = allFragments(makeFlowDoc(100)).find((fragment) =>
      fragment.nodeId === "below" && fragment.nodeType === "paragraph"
    )
    const shorterBelow = allFragments(makeFlowDoc(70)).find((fragment) =>
      fragment.nodeId === "below" && fragment.nodeType === "paragraph"
    )

    expect(tallBelow).toBeTruthy()
    expect(shorterBelow).toBeTruthy()
    expect(shorterBelow!.pageIndex).toBe(tallBelow!.pageIndex)
    expect(shorterBelow!.y).toBeLessThan(tallBelow!.y)
  })

  it("does not emit flow-row continuation slices without content progress", () => {
    const longText = Array.from({ length: 130 }, (_, index) => `L${index}`).join("\n")
    const p1 = makePara("p1", longText)
    const result = paginate(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }))

    const pages = result.sections[0].pages
    const rowFragments = pages.flatMap((page) => page.fragments.filter((f) => f.nodeId === "fr1" && f.nodeType === "flow-row"))
    for (const rowFragment of rowFragments) {
      const page = pages.find((candidate) => candidate.index === rowFragment.pageIndex)!
      const hasChildProgress = page.fragments.some((fragment) =>
        fragment.parentNodeId === "fs1" &&
        (fragment.nodeType === "paragraph" || fragment.nodeType === "spacer") &&
        fragment.pageIndex === rowFragment.pageIndex,
      )
      expect(hasChildProgress).toBe(true)
    }
  })

  it("forces one content unit with an explicit warning when a clean page cannot fit normal progress", () => {
    const hugeLine = makePara("p1", "Too tall", 900)
    const result = paginate(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1: hugeLine,
    }))

    expect(() => assertPaginatedDocument(result)).not.toThrow()
    const fragments = result.sections[0].pages.flatMap((page) => page.fragments)
    const row = fragments.find((fragment) => fragment.nodeId === "fr1" && fragment.nodeType === "flow-row")
    const stack = fragments.find((fragment) => fragment.nodeId === "fs1" && fragment.nodeType === "flow-stack")
    expect(row?.warnings?.[0]?.code).toBe("forced-flow-row-split-overflow")
    expect(stack?.warnings?.[0]?.code).toBe("forced-flow-row-split-overflow")
    expect(fragments.find((fragment) => fragment.nodeId === "p1")?.lineEnd).toBe(1)
  })
})

describe("flow-row / flow-stack long document hardening", () => {
  it("keeps a long two-stack fixture stable across repeated pagination runs without duplicating lines", () => {
    const leftLines = Array.from({ length: 220 }, (_, index) => `left-${index}`)
    const rightLines = Array.from({ length: 160 }, (_, index) => `right-${index}`)
    const p1 = makePara("p1", leftLines.join("\n"))
    const p2 = makePara("p2", rightLines.join("\n"))
    const doc = makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: { gap: 12 }, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    })

    const result = paginate(doc)
    expect(() => assertPaginatedDocument(result)).not.toThrow()
    expect(result.sections[0].pages.length).toBeGreaterThanOrEqual(4)

    const fragments = result.sections[0].pages.flatMap((page) => page.fragments)
    expect(paragraphLineTexts(fragments, "p1")).toEqual(leftLines)
    expect(paragraphLineTexts(fragments, "p2")).toEqual(rightLines)

    const firstSignature = structuralSignature(doc)
    expect(structuralSignature(doc)).toBe(firstSignature)
    expect(structuralSignature(doc)).toBe(firstSignature)
  }, 15000)

  it("keeps a long three-stack fixture valid with one row and active stacks per page slice", () => {
    const aLines = Array.from({ length: 120 }, (_, index) => `a-${index}`)
    const bLines = Array.from({ length: 95 }, (_, index) => `b-${index}`)
    const cLines = Array.from({ length: 80 }, (_, index) => `c-${index}`)
    const p1 = makePara("p1", aLines.join("\n"))
    const p2 = makePara("p2", bLines.join("\n"))
    const p3 = makePara("p3", cLines.join("\n"))
    const result = paginate(makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: { gap: 8 }, childIds: ["fs1", "fs2", "fs3"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 33.33 }, childIds: ["p2"] },
      fs3: { id: "fs3", type: "flow-stack", props: { widthShare: 33.34 }, childIds: ["p3"] },
      p1,
      p2,
      p3,
    }))

    expect(() => assertPaginatedDocument(result)).not.toThrow()
    expect(result.sections[0].pages.length).toBeGreaterThanOrEqual(2)

    for (const page of result.sections[0].pages) {
      const rowFragments = page.fragments.filter((fragment) => fragment.nodeId === "fr1" && fragment.nodeType === "flow-row")
      const stackFragments = page.fragments.filter((fragment) => fragment.parentNodeId === "fr1" && fragment.nodeType === "flow-stack")
      expect(rowFragments).toHaveLength(1)
      expect(stackFragments.map((fragment) => fragment.nodeId)).toEqual(["fs1", "fs2", "fs3"])
      expect(stackFragments.reduce((sum, fragment) => sum + fragment.width, 0)).toBeCloseTo(CW - 16, 0)
    }

    const fragments = result.sections[0].pages.flatMap((page) => page.fragments)
    expect(paragraphLineTexts(fragments, "p1")).toEqual(aLines)
    expect(paragraphLineTexts(fragments, "p2")).toEqual(bLines)
    expect(paragraphLineTexts(fragments, "p3")).toEqual(cLines)
  })

  it("repaginates widthShare changes without invalid flow-row fragments", () => {
    const leftLines = Array.from({ length: 110 }, (_, index) => `wide-left-${index}`)
    const rightLines = Array.from({ length: 110 }, (_, index) => `narrow-right-${index}`)
    const p1 = makePara("p1", leftLines.join("\n"))
    const p2 = makePara("p2", rightLines.join("\n"))
    const makeFlowDoc = (leftShare: number, rightShare: number) => makeDoc(["fr1"], {
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: leftShare }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: rightShare }, childIds: ["p2"] },
      p1,
      p2,
    })

    const even = paginate(makeFlowDoc(50, 50))
    const uneven = paginate(makeFlowDoc(65, 35))
    expect(() => assertPaginatedDocument(even)).not.toThrow()
    expect(() => assertPaginatedDocument(uneven)).not.toThrow()

    const evenStacks = even.sections[0].pages[0].fragments.filter((fragment) => fragment.nodeType === "flow-stack")
    const unevenStacks = uneven.sections[0].pages[0].fragments.filter((fragment) => fragment.nodeType === "flow-stack")
    expect(unevenStacks[0].width).toBeGreaterThan(evenStacks[0].width)
    expect(unevenStacks[1].width).toBeLessThan(evenStacks[1].width)

    const fragments = uneven.sections[0].pages.flatMap((page) => page.fragments)
    expect(paragraphLineTexts(fragments, "p1")).toEqual(leftLines)
    expect(paragraphLineTexts(fragments, "p2")).toEqual(rightLines)
  })
})
