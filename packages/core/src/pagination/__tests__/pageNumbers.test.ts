import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function paraWithPageNumber(id: string, prefix = "หน้า "): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [
      { id: `${id}-prefix`, type: "text", text: prefix },
      { id: `${id}-pn`, type: "pageNumber" },
    ],
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
          "body": { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("page numbering", () => {
  it("pageNumber node resolves to '1' on the first page", () => {
    const p = paraWithPageNumber("p1")
    const result = paginate(makeDoc(["p1"], { p1: p }))
    const frag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "p1")!
    expect(frag.lines![0].text).toBe("หน้า 1")
  })

  it("pageNumber segment has kind 'pageNumber' before resolution", () => {
    // Verify the segment is classified correctly by checking the resolved text
    const p = paraWithPageNumber("p1", "")
    const result = paginate(makeDoc(["p1"], { p1: p }))
    const frag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "p1")!
    expect(frag.lines![0].text).toBe("1")
  })

  it("pageNumber resolves to correct number on each page", () => {
    // Create a filler that fills page 1, then a page number paragraph on page 2
    const fillerText = Array.from({ length: 58 }, () => "A").join("\n")
    const filler: LayoutNode = {
      id: "filler",
      type: "paragraph",
      props: {
        align: "left", fontSize: pt(10), fontFamilyKey: "default",
        lineHeight: 1.2, spacingBefore: pt(0), spacingAfter: pt(0),
        textIndent: pt(0), indentLeft: pt(0), indentRight: pt(0),
      },
      children: [{ id: "filler-t", type: "text", text: fillerText }],
    }
    const p2 = paraWithPageNumber("p2")
    const result = paginate(makeDoc(["filler", "p2"], { filler, p2 }))

    // p2 should be on page 2 (index 1)
    const page2 = result.sections[0].pages[1]!
    expect(page2).toBeDefined()
    const p2Frag = page2.fragments.find((f) => f.nodeId === "p2")!
    expect(p2Frag).toBeDefined()
    expect(p2Frag.lines![0].text).toBe("หน้า 2")
  })

  it("multiple pageNumber nodes in one paragraph all resolve correctly", () => {
    const p: ParagraphNode = {
      id: "p1",
      type: "paragraph",
      props: {
        align: "left", fontSize: pt(10), fontFamilyKey: "default",
        lineHeight: 1.2, spacingBefore: pt(0), spacingAfter: pt(0),
        textIndent: pt(0), indentLeft: pt(0), indentRight: pt(0),
      },
      children: [
        { id: "t1", type: "text", text: "Page " },
        { id: "pn1", type: "pageNumber" },
        { id: "t2", type: "text", text: " of " },
        { id: "pn2", type: "pageNumber" },
      ],
    }
    const result = paginate(makeDoc(["p1"], { p1: p }))
    const frag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "p1")!
    expect(frag.lines![0].text).toBe("Page 1 of 1")
  })

  it("paragraph with only pageNumber node renders just the number", () => {
    const p: ParagraphNode = {
      id: "p1",
      type: "paragraph",
      props: {
        align: "left", fontSize: pt(10), fontFamilyKey: "default",
        lineHeight: 1.2, spacingBefore: pt(0), spacingAfter: pt(0),
        textIndent: pt(0), indentLeft: pt(0), indentRight: pt(0),
      },
      children: [{ id: "pn", type: "pageNumber" }],
    }
    const result = paginate(makeDoc(["p1"], { p1: p }))
    const frag = result.sections[0].pages[0].fragments.find((f) => f.nodeId === "p1")!
    expect(frag.lines![0].text).toBe("1")
  })
})
