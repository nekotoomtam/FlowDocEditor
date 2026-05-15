import { describe, expect, it } from "vitest"
import type { DocumentNode, ParagraphNode } from "@/schema"
import type { PaginatedDocument, PageFragment } from "@/pagination"
import { isParagraphInsideFlowStack, isWysiwygTextEngineFragmentEligible } from "../wysiwygTextEligibility"

const paragraph: ParagraphNode = {
  id: "p1",
  type: "paragraph",
  props: {
    align: "left",
    fontSize: { value: 12, unit: "pt" },
    fontFamilyKey: "default",
    lineHeight: 1,
    spacingBefore: { value: 0, unit: "pt" },
    spacingAfter: { value: 0, unit: "pt" },
    textIndent: { value: 0, unit: "pt" },
    indentLeft: { value: 0, unit: "pt" },
    indentRight: { value: 0, unit: "pt" },
  },
  children: [{ id: "t1", type: "text", text: "Hello" }],
}

function makeDoc(nodes: Record<string, unknown> = { body: { id: "body", type: "body", props: {}, childIds: ["p1"] }, p1: paragraph }): DocumentNode {
  return {
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
            top: { value: 72, unit: "pt" },
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes,
      }],
    },
  } as unknown as DocumentNode
}

function makePaginated(fragment: Partial<PageFragment> = {}): PaginatedDocument {
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
        fragments: [{
          nodeId: "p1",
          nodeType: "paragraph",
          pageIndex: 0,
          x: 10,
          y: 20,
          width: 100,
          height: 12,
          ...fragment,
        }],
      }],
    }],
  }
}

describe("isWysiwygTextEngineFragmentEligible", () => {
  it("allows plain body paragraphs with a single unsplit fragment", () => {
    expect(isWysiwygTextEngineFragmentEligible({
      doc: makeDoc(),
      paginated: makePaginated(),
      nodeId: "p1",
      pageIndex: 0,
    })).toBe(true)
  })

  it("allows the first fragment of a split body paragraph", () => {
    expect(isWysiwygTextEngineFragmentEligible({
      doc: makeDoc(),
      paginated: makePaginated({ isContinued: true }),
      nodeId: "p1",
      pageIndex: 0,
    })).toBe(true)
  })

  it("allows continuation fragments of split body paragraphs", () => {
    expect(isWysiwygTextEngineFragmentEligible({
      doc: makeDoc(),
      paginated: makePaginated({ continuesFrom: true, pageIndex: 1 }),
      nodeId: "p1",
      pageIndex: 1,
    })).toBe(true)
  })

  it("rejects table-cell paragraphs", () => {
    const tableParagraph = { ...paragraph, id: "p1" }
    const table = {
      id: "tbl",
      type: "table",
      props: {},
      nodes: {
        c1: { id: "c1", type: "table-cell", props: {}, childIds: ["p1"] },
        p1: tableParagraph,
      },
    }

    expect(isWysiwygTextEngineFragmentEligible({
      doc: makeDoc({ body: { id: "body", type: "body", props: {}, childIds: ["tbl"] }, tbl: table }),
      paginated: makePaginated({ parentNodeId: "c1" }),
      nodeId: "p1",
      pageIndex: 0,
    })).toBe(false)
  })
})

describe("isParagraphInsideFlowStack", () => {
  it("detects paragraph ownership from a flow-stack parent id or authored children", () => {
    const doc = makeDoc({
      body: { id: "body", type: "body", props: {}, childIds: ["fr1"] },
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1: paragraph,
    })

    expect(isParagraphInsideFlowStack(doc, "p1", "fs1")).toBe(true)
    expect(isParagraphInsideFlowStack(doc, "p1")).toBe(true)
    expect(isParagraphInsideFlowStack(makeDoc(), "p1")).toBe(false)
  })
})
