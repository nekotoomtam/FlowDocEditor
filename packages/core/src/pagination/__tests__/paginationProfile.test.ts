import { describe, expect, it } from "vitest"
import { defaultTextMeasurer, defaultWordBreaker, type TextMeasurer, type WordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, FlowTableCellNode, FlowTableNode, FlowTableRowNode, LayoutNode, ParagraphNode } from "../../schema"
import type { PaginatedDocument } from "../types"
import { paginateDocument, paginateDocumentWithProfile } from "../paginator"

const PAGE_SETTINGS = {
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
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeDoc(): DocumentNode {
  const nodes: Record<string, LayoutNode> = {
    body: { id: "body", type: "body", props: {}, childIds: ["p1", "p2"] },
    p1: makePara("p1", "A short paragraph"),
    p2: makePara("p2", Array.from({ length: 120 }, (_, index) => `line ${index + 1}`).join("\n")),
  }
  return {
    version: 1,
    document: {
      id: "profile-test-doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE_SETTINGS,
        bodyRootId: "body",
        nodes,
      }],
    },
  }
}

function makeRepeatedParagraphDoc(count: number): DocumentNode {
  const childIds = Array.from({ length: count }, (_, index) => `p${index + 1}`)
  const nodes: Record<string, LayoutNode> = {
    body: { id: "body", type: "body", props: {}, childIds },
  }
  for (const id of childIds) {
    nodes[id] = makePara(id, "Repeated layout cache sample")
  }
  return {
    version: 1,
    document: {
      id: "profile-cache-test-doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE_SETTINGS,
        bodyRootId: "body",
        nodes,
      }],
    },
  }
}

function makeFlowTableCacheDoc(): DocumentNode {
  const paragraph = makePara("cell-p1", "Flow table cell measurement cache sample")
  const cell: FlowTableCellNode = {
    id: "cell-1",
    type: "flow-table-cell",
    props: {},
    childIds: [paragraph.id],
  }
  const row: FlowTableRowNode = {
    id: "row-1",
    type: "flow-table-row",
    props: {},
    cellIds: [cell.id],
  }
  const table: FlowTableNode = {
    id: "table-1",
    type: "flow-table",
    props: { headerRowCount: 0, repeatHeaderRows: false },
    columns: [{ width: pt(180) }],
    rowIds: [row.id],
    nodes: {
      [row.id]: row,
      [cell.id]: cell,
      [paragraph.id]: paragraph,
    },
  }
  const nodes: Record<string, LayoutNode> = {
    body: { id: "body", type: "body", props: {}, childIds: [table.id] },
    [table.id]: table as unknown as LayoutNode,
  }
  return {
    version: 1,
    document: {
      id: "profile-flow-table-cache-test-doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE_SETTINGS,
        bodyRootId: "body",
        nodes,
      }],
    },
  }
}

function fragmentSignature(paginated: PaginatedDocument) {
  return paginated.sections.flatMap((section) =>
    section.pages.flatMap((page) =>
      page.fragments.map((fragment) => ({
        pageIndex: page.index,
        nodeId: fragment.nodeId,
        nodeType: fragment.nodeType,
        lineStart: fragment.lineStart,
        lineEnd: fragment.lineEnd,
        continuesFrom: fragment.continuesFrom,
        isContinued: fragment.isContinued,
      })),
    ),
  )
}

describe("pagination profiling", () => {
  it("does not change paginated output", () => {
    const doc = makeDoc()
    const plain = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    const profiled = paginateDocumentWithProfile(doc, defaultTextMeasurer, defaultWordBreaker, undefined, {
      paginationProfileSource: "server",
    })

    expect(profiled.paginated.sections.map((section) => section.pages.length)).toEqual(
      plain.sections.map((section) => section.pages.length),
    )
    expect(fragmentSignature(profiled.paginated)).toEqual(fragmentSignature(plain))
    expect(profiled.paginationProfile.stages.map((stage) => stage.name)).toContain("total")
    expect(profiled.paginationProfile.topStages?.length).toBeGreaterThan(0)
  })

  it("reuses repeated word segmentation inside a pagination run", () => {
    const doc = makeRepeatedParagraphDoc(8)
    const splitOnSpaces: WordBreaker = {
      segment(text) {
        return text.split(/(\s+)/).filter((part) => part.length > 0)
      },
    }
    const expected = paginateDocument(doc, defaultTextMeasurer, splitOnSpaces)
    let segmentCalls = 0
    const wordBreaker: WordBreaker = {
      segment(text) {
        segmentCalls += 1
        return splitOnSpaces.segment(text)
      },
    }

    const paginated = paginateDocument(doc, defaultTextMeasurer, wordBreaker)

    expect(fragmentSignature(paginated)).toEqual(fragmentSignature(expected))
    expect(segmentCalls).toBe(1)

    const profiled = paginateDocumentWithProfile(doc, defaultTextMeasurer, splitOnSpaces, undefined, {
      paginationProfileSource: "server",
    })
    expect(profiled.paginationProfile.counters?.cacheHits?.["text-segmentation"]).toBeGreaterThan(0)
    expect(profiled.paginationProfile.counters?.cacheMisses?.["text-segmentation"]).toBeGreaterThan(0)
  })

  it("reuses paragraph measurements between flow layout and page packing", () => {
    const doc = makeRepeatedParagraphDoc(1)
    const expected = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    let lineHeightCalls = 0
    const measurer: TextMeasurer = {
      measureText(text, fontFamilyKey, fontSize, fontVariant) {
        return defaultTextMeasurer.measureText(text, fontFamilyKey, fontSize, fontVariant)
      },
      measureLineHeight(fontFamilyKey, fontSize, lineHeightRatio) {
        lineHeightCalls += 1
        return defaultTextMeasurer.measureLineHeight(fontFamilyKey, fontSize, lineHeightRatio)
      },
    }

    const paginated = paginateDocument(doc, measurer, defaultWordBreaker)

    expect(fragmentSignature(paginated)).toEqual(fragmentSignature(expected))
    expect(lineHeightCalls).toBe(3)

    const profiled = paginateDocumentWithProfile(doc, defaultTextMeasurer, defaultWordBreaker, undefined, {
      paginationProfileSource: "server",
    })
    expect(profiled.paginationProfile.counters?.cacheHits?.["paragraph-measure"]).toBeGreaterThan(0)
  })

  it("reuses flow-table cell paragraph measurements during table placement", () => {
    const doc = makeFlowTableCacheDoc()
    const expected = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    let lineHeightCalls = 0
    const measurer: TextMeasurer = {
      measureText(text, fontFamilyKey, fontSize, fontVariant) {
        return defaultTextMeasurer.measureText(text, fontFamilyKey, fontSize, fontVariant)
      },
      measureLineHeight(fontFamilyKey, fontSize, lineHeightRatio) {
        lineHeightCalls += 1
        return defaultTextMeasurer.measureLineHeight(fontFamilyKey, fontSize, lineHeightRatio)
      },
    }

    const paginated = paginateDocument(doc, measurer, defaultWordBreaker)

    expect(fragmentSignature(paginated)).toEqual(fragmentSignature(expected))
    expect(lineHeightCalls).toBe(3)
  })
})
